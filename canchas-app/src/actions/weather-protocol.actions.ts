'use server'
// src/actions/weather-protocol.actions.ts
// ==============================================================================
// SERVER ACTIONS — Protocolo Climático, Reagenda Inteligente y Mensajería WhatsApp
// ==============================================================================

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { formatTime, getArgentinaTodayIso } from '@/lib/utils'
import { notifyRainCancellation, buildWaMeLink, buildRainRescheduleWhatsAppMessage } from '@/lib/whatsapp'
import { assertTenantMember, resolveEffectiveTenantId } from '@/lib/auth-security'
import { format, parseISO, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  DEFAULT_CLUB_SCHEDULE,
  generateTimeSlots,
  timeStringToMinutes,
  minutesToTimeString,
  type ClubScheduleConfig,
} from '@/lib/time-slots'
import { getClubSchedule } from './club.actions'
import { getVenueBookings, addVenueBooking, cancelVenueBooking } from '@/config/venues-data'
import type { CustomerCredit } from '@/types/database'
import { recordClubNotification } from './notifications.actions'
import { forceReleaseBookingLock, buildLockKey } from '@/lib/redis'
import { resolveOfficialSlotPrice } from '@/lib/booking-pricing.server'

export interface SuggestedReschedule {
  courtId: string
  courtName: string
  courtSport: string
  date: string             // "YYYY-MM-DD"
  dateFormatted: string    // "Sábado 10 de octubre"
  startTime: string        // "18:00"
  endTime: string          // "19:00"
  durationMinutes: number
}

export interface RainAffectedBookingNotification {
  bookingId: string
  customerName: string
  customerPhone: string
  originalCourtId: string
  originalCourtName: string
  originalSport: string
  originalDate: string
  originalDateFormatted: string
  originalTime: string
  originalDurationMinutes: number
  creditedAmount: number
  suggestedReschedule: SuggestedReschedule | null
  alternativeSlots?: SuggestedReschedule[]
  whatsAppUrl: string
  messageText: string
  isRescheduled?: boolean
  rescheduledBookingId?: string
}

export interface RainCancellationResult {
  success: boolean
  cancelledBookingsCount: number
  totalCreditedArs: number
  notifications: RainAffectedBookingNotification[]
  error?: string
}

function formatArgentinaDateLabel(dateIsoOrObj: string | Date): string {
  try {
    const d = typeof dateIsoOrObj === 'string' ? parseISO(dateIsoOrObj) : dateIsoOrObj
    if (isNaN(d.getTime())) return ''
    const formatted = format(d, "EEEE d 'de' MMMM", { locale: es })
    return formatted.charAt(0).toUpperCase() + formatted.slice(1)
  } catch {
    return typeof dateIsoOrObj === 'string' ? dateIsoOrObj : ''
  }
}


/** 
 * Ejecuta la cancelación masiva por lluvia / mal tiempo
 * 1. Cancela las reservas afectadas y convierte señas en saldo a favor (customer_credits)
 * 2. Calcula automáticamente para cada reserva el próximo turno disponible más cercano (misma disciplina/cancha)
 * 3. Prepara el mensaje personalizado de WhatsApp listo para enviar
 */
export async function executeRainCancellation(params: {
  tenantId: string
  date: string             // "YYYY-MM-DD"
  timeFrom: string         // "18:00"
  timeTo: string           // "23:59"
  courtIds: string[]       // Array con IDs de canchas afectadas (descubiertas)
  reason?: string
}): Promise<RainCancellationResult> {
  try {
    const authCheck = await assertTenantMember(params.tenantId)
    if (!authCheck.authorized) {
      return {
        success: false,
        cancelledBookingsCount: 0,
        totalCreditedArs: 0,
        notifications: [],
        error: authCheck.error || 'No tienes permisos para ejecutar el protocolo climático en este club',
      }
    }

    const effectiveTenantId = (await resolveEffectiveTenantId(params.tenantId)) || params.tenantId
    const supabase = await createServiceClient()

    // Datos del club y horarios
    const [{ data: tenant }, schedule, { data: allCourtsData }] = await Promise.all([
      supabase.from('tenants').select('name').eq('id', effectiveTenantId).single(),
      getClubSchedule(effectiveTenantId).catch(() => DEFAULT_CLUB_SCHEDULE),
      supabase
        .from('courts')
        .select('id, name, sport, slot_duration_minutes, is_active, created_at')
        .eq('tenant_id', effectiveTenantId)
        .eq('is_active', true)
        .order('created_at', { ascending: true }),
    ])

    const clubName = tenant?.name || 'CancharClub'
    const clubSchedule: ClubScheduleConfig = schedule || DEFAULT_CLUB_SCHEDULE
    const activeCourts = allCourtsData || []

    // 1. Obtener reservas del día dentro de la ventana horaria afectada
    const startWindow = `${params.date}T${params.timeFrom}:00-03:00`
    const endWindow = `${params.date}T${params.timeTo}:00-03:00`

    const { data: bookings, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, customer_name, customer_phone, deposit_cents, price_total_cents, booked_at, staff_notes, court_id, redis_lock_key, courts(id, name, sport, slot_duration_minutes)')
      .eq('tenant_id', effectiveTenantId)
      .in('court_id', params.courtIds)
      .filter('booked_at', 'ov', `[${new Date(startWindow).toISOString()},${new Date(endWindow).toISOString()}]`)
      .neq('status', 'cancelled')

    if (fetchErr) {
      console.warn('[executeRainCancellation] Fetch warning:', fetchErr.message)
    }

    const targetBookings = bookings || []
    let totalCreditedArs = 0
    const notifications: RainAffectedBookingNotification[] = []

    if (targetBookings.length === 0) {
      return {
        success: true,
        cancelledBookingsCount: 0,
        totalCreditedArs: 0,
        notifications: [],
      }
    }

    // 2. Pre-cargar reservas futuras de los próximos 7 días para cálculo rápido de disponibilidad en memoria
    const baseDate = parseISO(params.date)
    const searchStartDate = addDays(baseDate, 1)
    const searchEndDate = addDays(baseDate, 8)
    const searchStartIso = `${format(searchStartDate, 'yyyy-MM-dd')}T00:00:00-03:00`
    const searchEndIso = `${format(searchEndDate, 'yyyy-MM-dd')}T23:59:59-03:00`

    const { data: futureBookingsData } = await supabase
      .from('bookings')
      .select('id, court_id, booked_at, status')
      .eq('tenant_id', effectiveTenantId)
      .filter('booked_at', 'ov', `[${new Date(searchStartIso).toISOString()},${new Date(searchEndIso).toISOString()}]`)
      .neq('status', 'cancelled')

    // Parsear rangos de reservas futuras
    interface ParsedBookingRange {
      courtId: string
      startMs: number
      endMs: number
    }

    const parsedFutureRanges: ParsedBookingRange[] = []
    ;(futureBookingsData || []).forEach((fb) => {
      if (!fb.booked_at) return
      const match = fb.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
      if (match && match[1]) {
        let s = match[1].replace(' ', 'T')
        let e = (match[2] || match[1]).replace(' ', 'T')
        if (s.endsWith('+00')) s = s.replace('+00', 'Z')
        if (e.endsWith('+00')) e = e.replace('+00', 'Z')
        const sTime = new Date(s).getTime()
        const eTime = new Date(e).getTime()
        if (!isNaN(sTime) && !isNaN(eTime)) {
          parsedFutureRanges.push({ courtId: fb.court_id, startMs: sTime, endMs: eTime })
        }
      }
    })

    // Registro de slots asignados durante este lote para no colisionar entre reservas canceladas simultáneas
    const batchReservedSlots = new Set<string>()

    // Función auxiliar para verificar si un slot candidato está ocupado
    const isCandidateSlotBusy = (courtId: string, startMs: number, endMs: number): boolean => {
      // Chequeo en lote de este protocolo
      for (let t = startMs; t < endMs; t += 30 * 60000) {
        const slotKey = `${courtId}_${t}`
        if (batchReservedSlots.has(slotKey)) return true
      }

      // Chequeo contra reservas existentes en base de datos
      const hasDbConflict = parsedFutureRanges.some((fb) => {
        if (fb.courtId !== courtId) return false
        return startMs < fb.endMs && endMs > fb.startMs
      })
      if (hasDbConflict) return true

      // Chequeo contra reservas en memoria volátil si existen
      const dayIso = getArgentinaTodayIso(new Date(startMs))
      const memoryBookings = getVenueBookings(effectiveTenantId, dayIso)
      const hasMemConflict = memoryBookings.some((mb) => {
        if (mb.court_id !== courtId) return false
        const mbStart = new Date(mb.starts_at).getTime()
        const mbEnd = new Date(mb.ends_at).getTime()
        return startMs < mbEnd && endMs > mbStart && !String(mb.status).toUpperCase().includes('CANCEL')
      })

      return hasMemConflict
    }

    // Franjas horarias operativas estándar del club (en intervalos de 30 minutos)
    const baseScheduleSlots = generateTimeSlots(clubSchedule.opening_time, clubSchedule.closing_time, 30)

    // 3. Procesar cada reserva afectada
    for (const b of targetBookings) {
      const courtObj = Array.isArray(b.courts) ? b.courts[0] : b.courts
      const courtName = courtObj?.name || 'Cancha'
      const courtSport = courtObj?.sport || 'FUTBOL_5'
      const durationMins = courtObj?.slot_duration_minutes || (courtSport.includes('FUTBOL') ? 60 : 90)

      let timeStr = '18:00'
      if (b.booked_at) {
        const match = b.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
        if (match && match[1]) {
          timeStr = formatTime(match[1])
        }
      }

      const creditedAmount = Math.round((Number(b.deposit_cents) || 0) / 100)

      // Acreditar saldo a favor en customer_credits con idempotencia estricta
      if (creditedAmount > 0) {
        const phoneForCredit = b.customer_phone?.trim() || `sin-telefono-${b.id.slice(0, 8)}`
        
        // Verificar que no se haya acreditado previamente para esta reserva
        const { data: existingCredit } = await supabase
          .from('customer_credits')
          .select('id')
          .eq('source_booking_id', b.id)
          .maybeSingle()

        if (!existingCredit) {
          await supabase
            .from('customer_credits')
            .insert({
              tenant_id: effectiveTenantId,
              customer_phone: phoneForCredit,
              customer_name: b.customer_name || 'Jugador',
              amount_ars: creditedAmount,
              status: 'AVAILABLE',
              source_booking_id: b.id,
              reason: params.reason || 'Suspensión por lluvia / mal tiempo',
              expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            })

          totalCreditedArs += creditedAmount
        }
      }

      // Actualizar estado de la reserva original
      const rainNote = `Protocolo Climático: Suspensión por lluvia (${params.reason || 'Mal tiempo'})`
      const updatedNotes = b.staff_notes ? `${b.staff_notes} | ${rainNote}` : rainNote

      // Intentar marcar con 'RAIN_CANCELLED' o fallback seguro a 'cancelled'
      const updateRes = await supabase
        .from('bookings')
        .update({
          status: 'RAIN_CANCELLED',
          staff_notes: updatedNotes,
        })
        .eq('id', b.id)

      if (updateRes.error) {
        await supabase
          .from('bookings')
          .update({
            status: 'cancelled',
            staff_notes: updatedNotes,
          })
          .eq('id', b.id)
      }

      // Liberar en memoria y candados de Redis para permitir reservas futuras inmediatas
      cancelVenueBooking(b.id)
      if (b.redis_lock_key) {
        await forceReleaseBookingLock(b.redis_lock_key)
      }
      if (b.court_id && b.booked_at) {
        const match = String(b.booked_at).match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
        if (match && match[1]) {
          const rawStart = match[1].includes(' ') ? match[1].replace(' ', 'T') : match[1]
          await forceReleaseBookingLock(buildLockKey(b.court_id, rawStart))
        }
      }

      // 4. ALGORITMO: Encontrar el próximo turno disponible más cercano
      // Orden de canchas compatibles: Misma cancha primero, luego otras canchas del mismo deporte
      const sameCourt = activeCourts.find((c) => c.id === b.court_id)
      const otherCompatibleCourts = activeCourts.filter((c) => {
        if (c.id === b.court_id) return false
        const normC = (c.sport || '').replace('_', '').toUpperCase()
        const normB = courtSport.replace('_', '').toUpperCase()
        return normC === normB
      })

      const candidateCourts = [
        ...(sameCourt ? [sameCourt] : []),
        ...otherCompatibleCourts,
      ]
      // Si no hay compatibles con el deporte, fallback a todas las activas
      if (candidateCourts.length === 0) {
        candidateCourts.push(...activeCourts)
      }

      // Ordenar horarios según cercanía al horario original (diff en minutos ascendente)
      const origMinutes = timeStringToMinutes(timeStr)
      const sortedTimeSlots = [...baseScheduleSlots].sort((a, bTime) => {
        const diffA = Math.abs(timeStringToMinutes(a) - origMinutes)
        const diffB = Math.abs(timeStringToMinutes(bTime) - origMinutes)
        return diffA - diffB
      })

      let suggestedReschedule: SuggestedReschedule | null = null
      const alternativeSlots: SuggestedReschedule[] = []

      // Buscar en los próximos 7 días (Mañana = Día + 1, ..., Día + 7)
      for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
        const candidateDateObj = addDays(baseDate, dayOffset)
        const candidateDateStr = format(candidateDateObj, 'yyyy-MM-dd')
        const candidateDateFormatted = formatArgentinaDateLabel(candidateDateObj)

        for (const courtCandidate of candidateCourts) {
          for (const candTime of sortedTimeSlots) {
            const candStartMs = new Date(`${candidateDateStr}T${candTime}:00-03:00`).getTime()
            const candEndMs = candStartMs + durationMins * 60000

            // Verificar que no se pase del horario de cierre del club
            const candCloseMs = new Date(`${candidateDateStr}T${clubSchedule.closing_time}:00-03:00`).getTime()
            if (candEndMs > candCloseMs + 30 * 60000) {
              continue
            }

            // Verificar si el slot está libre
            if (!isCandidateSlotBusy(courtCandidate.id, candStartMs, candEndMs)) {
              const reschObj: SuggestedReschedule = {
                courtId: courtCandidate.id,
                courtName: courtCandidate.name,
                courtSport: courtCandidate.sport || courtSport,
                date: candidateDateStr,
                dateFormatted: candidateDateFormatted,
                startTime: candTime,
                endTime: minutesToTimeString(timeStringToMinutes(candTime) + durationMins),
                durationMinutes: durationMins,
              }

              if (!suggestedReschedule) {
                suggestedReschedule = reschObj
                // Reservar este slot en el lote para que otra reserva no lo tome
                for (let t = candStartMs; t < candEndMs; t += 30 * 60000) {
                  batchReservedSlots.add(`${courtCandidate.id}_${t}`)
                }
              } else if (alternativeSlots.length < 3) {
                // Guardar alternativas adicionales (por ejemplo en otro horario o día)
                const alreadyHasDate = alternativeSlots.some(a => a.date === reschObj.date && a.startTime === reschObj.startTime)
                if (!alreadyHasDate) {
                  alternativeSlots.push(reschObj)
                }
              }

              if (suggestedReschedule && alternativeSlots.length >= 2) {
                break
              }
            }
          }
          if (suggestedReschedule && alternativeSlots.length >= 2) break
        }
        if (suggestedReschedule && alternativeSlots.length >= 2) break
      }

      // 5. Preparar mensaje y enlace de WhatsApp con la propuesta de reagenda
      const originalDateFormatted = formatArgentinaDateLabel(baseDate)
      const messageText = buildRainRescheduleWhatsAppMessage({
        customerName: b.customer_name,
        clubName,
        originalCourtName: courtName,
        originalSport: courtSport,
        originalDateFormatted,
        originalTime: timeStr,
        creditedAmount,
        suggestedReschedule,
      })

      const whatsAppUrl = b.customer_phone
        ? buildWaMeLink(b.customer_phone, messageText)
        : ''

      // Intentar notificación automática asíncrona si hay Meta Cloud API configurada
      if (b.customer_phone) {
        notifyRainCancellation({
          phone: b.customer_phone,
          customerName: b.customer_name,
          clubName,
          courtName,
          timeStr,
          creditAmountARS: creditedAmount,
        }).catch((err: unknown) => console.error('[RainWhatsApp Error]', err))
      }

      notifications.push({
        bookingId: b.id,
        customerName: b.customer_name,
        customerPhone: b.customer_phone || '',
        originalCourtId: b.court_id,
        originalCourtName: courtName,
        originalSport: courtSport,
        originalDate: params.date,
        originalDateFormatted,
        originalTime: timeStr,
        originalDurationMinutes: durationMins,
        creditedAmount,
        suggestedReschedule,
        alternativeSlots,
        whatsAppUrl,
        messageText,
      })
    }

    // Registrar en el historial de notificaciones y alertas
    void recordClubNotification({
      tenantId: effectiveTenantId,
      type: 'WEATHER_ALERT',
      category: 'ALERTS',
      title: 'Protocolo Climático Activado',
      message: `Se cancelaron ${targetBookings.length} turnos por lluvia para el ${params.date} (${params.timeFrom} a ${params.timeTo} hs). Se generaron avisos con propuesta de reagenda y se acreditaron $${totalCreditedArs.toLocaleString('es-AR')} en saldo a favor.`,
      metadata: {
        affected_count: targetBookings.length,
        credited_total_ars: totalCreditedArs,
        booked_date: params.date,
        reason: params.reason || 'Lluvia / Mal tiempo',
      },
    })

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/caja')
    revalidatePath('/dashboard/notificaciones')

    return {
      success: true,
      cancelledBookingsCount: targetBookings.length,
      totalCreditedArs,
      notifications,
    }
  } catch (err) {
    console.error('[executeRainCancellation] Error:', err)
    return {
      success: false,
      cancelledBookingsCount: 0,
      totalCreditedArs: 0,
      notifications: [],
      error: 'Error al ejecutar el protocolo climático',
    }
  }
}

/**
 * Confirmar Reagenda Directa:
 * Permite al club crear la nueva reserva en el slot sugerido (o alternativo) con un solo clic,
 * transfiriendo la seña del jugador y marcando el crédito como utilizado.
 */
export async function confirmRainReschedule(params: {
  tenantId: string
  originalBookingId: string
  newCourtId: string
  newDate: string          // "YYYY-MM-DD"
  newStartTime: string      // "18:00"
  durationMinutes: number
  customerName: string
  customerPhone?: string | null
  creditedAmount?: number
}): Promise<{ success: boolean; newBookingId?: string; error?: string }> {
  try {
    const authCheck = await assertTenantMember(params.tenantId)
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error || 'Sin permisos para reagendar reservas en este club' }
    }

    const effectiveTenantId = (await resolveEffectiveTenantId(params.tenantId)) || params.tenantId
    const supabase = await createServiceClient()

    // 1. Obtener detalles de la cancha de destino
    const { data: court, error: courtErr } = await supabase
      .from('courts')
      .select('id, name, sport')
      .eq('id', params.newCourtId)
      .single()

    if (courtErr || !court) {
      return { success: false, error: 'La cancha seleccionada no está disponible o fue dada de baja.' }
    }

    // 2. Construir rango horario
    const startsAtDate = new Date(`${params.newDate}T${params.newStartTime}:00-03:00`)
    const endsAtDate = new Date(startsAtDate.getTime() + (params.durationMinutes || 60) * 60000)
    const bookingRange = `[${startsAtDate.toISOString()},${endsAtDate.toISOString()})`

    // 3. Verificar si el slot no fue ocupado entremedio
    const { data: existingConflict } = await supabase
      .from('bookings')
      .select('id')
      .eq('court_id', params.newCourtId)
      .filter('booked_at', 'ov', bookingRange)
      .neq('status', 'cancelled')
      .maybeSingle()

    if (existingConflict) {
      return {
        success: false,
        error: 'El horario seleccionado acaba de ser ocupado por otra reserva. Por favor elegí una alternativa.',
      }
    }

    const depositCents = Math.round(Number(params.creditedAmount || 0) * 100)
    const shortRef = params.originalBookingId ? params.originalBookingId.slice(-8).toUpperCase() : ''
    const staffNotes = `Reagendado por protocolo de lluvia (Reserva original #${shortRef})`

    // Determinar precio total oficial de la cancha para no condonar involuntariamente el saldo restante
    let priceTotalCents = depositCents
    try {
      const pricing = await resolveOfficialSlotPrice({
        tenantId: effectiveTenantId,
        courtId: params.newCourtId,
        startsAt: startsAtDate.toISOString(),
      })
      if (pricing && pricing.totalAmountArs > 0) {
        priceTotalCents = Math.round(pricing.totalAmountArs * 100)
      }
    } catch {}
    if (priceTotalCents < depositCents) {
      priceTotalCents = depositCents
    }

    // 4. Insertar la nueva reserva reagendada
    const { data: newBooking, error: insErr } = await supabase
      .from('bookings')
      .insert({
        tenant_id: effectiveTenantId,
        court_id: params.newCourtId,
        booked_at: bookingRange,
        status: 'confirmed',
        sport: court.sport || 'FUTBOL_5',
        customer_name: params.customerName?.trim() || 'Jugador',
        customer_phone: params.customerPhone?.trim() || null,
        price_total_cents: priceTotalCents,
        deposit_cents: depositCents,
        staff_deposit_amount_cents: depositCents,
        payment_method: 'cash',
        staff_notes: staffNotes,
      })
      .select('id')
      .single()

    if (insErr || !newBooking) {
      console.error('[confirmRainReschedule] Insert error:', insErr)
      return { success: false, error: insErr?.message || 'Error al crear la nueva reserva reagendada' }
    }

    // 5. Consumir el crédito del jugador si existía
    if (depositCents > 0 && params.originalBookingId) {
      await supabase
        .from('customer_credits')
        .update({
          status: 'USED',
          used_at: new Date().toISOString(),
        })
        .eq('source_booking_id', params.originalBookingId)
        .eq('status', 'AVAILABLE')
    }

    // 6. Reflejar en memoria volátil para sincronización instantánea
    addVenueBooking({
      id: newBooking.id,
      court_id: params.newCourtId,
      customer_name: params.customerName?.trim() || 'Jugador',
      customer_phone: params.customerPhone?.trim() || null,
      starts_at: startsAtDate.toISOString(),
      ends_at: endsAtDate.toISOString(),
      status: 'CONFIRMED',
      origin: 'STAFF_MANUAL',
      total_amount_ars: Number(params.creditedAmount || 0),
      deposit_amount_ars: Number(params.creditedAmount || 0),
      total_paid: Number(params.creditedAmount || 0),
      balance_due: 0,
    })

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/caja')

    return {
      success: true,
      newBookingId: newBooking.id,
    }
  } catch (err) {
    console.error('[confirmRainReschedule] Exception:', err)
    return { success: false, error: 'Error inesperado al confirmar la reagenda' }
  }
}

/** Consultar créditos disponibles de un jugador */
export async function getCustomerCredits(
  tenantId: string,
  customerPhone: string
): Promise<CustomerCredit[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('customer_credits')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('customer_phone', customerPhone)
      .eq('status', 'AVAILABLE')
      .gt('expires_at', new Date().toISOString())

    if (error) return []
    return (data as CustomerCredit[]) || []
  } catch {
    return []
  }
}
