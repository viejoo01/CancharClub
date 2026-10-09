'use server'
// src/actions/club.actions.ts
// ==============================================================================
// SERVER ACTIONS — Gestión del Club: Canchas, Precios, Calendario y Caja
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { resolveEffectiveTenantId, assertTenantAdmin, assertTenantMember } from '@/lib/auth-security'
import type { SportType, SlotDuration, CourtSurface } from '@/types/database'
import { 
  getClubBySlug, 
  type ClubData, 
  type CourtDefinition, 
  type SportCategory, 
  type PriceRuleDefinition, 
  normalizeToSportCategory, 
  type ClubSocialLinks, 
  normalizeSocialUrl,
  type ClubServicesConfig,
  type ClubLocationConfig,
  type ClubServicesAndLocationData
} from '@/config/clubs-catalog'
import { DEFAULT_CLUB_SCHEDULE, type ClubScheduleConfig, formatScheduleHours } from '@/lib/time-slots'
import { getArgentinaTimeStr, parseArgentinaDate, cleanNoteForDisplay } from '@/lib/utils'
import { getVenueBookings } from '@/config/venues-data'
import { getPlanByCourtsCount } from '@/config/saas-plans'

// ─── NORMALIZADORES DE ENUMS POSTGRESQL ───────────────────────────────────────

function normalizeSportEnum(sport?: string | null): 'PADEL' | 'FUTBOL5' | 'FUTBOL7' | 'FUTBOL11' | 'TENIS' | 'BASQUET' {
  const s = (sport || 'PADEL').toUpperCase().replace(/[\s_-]/g, '')
  if (s.includes('11')) return 'FUTBOL11'
  if (s.includes('7')) return 'FUTBOL7'
  if (s.includes('FUTBOL') || s.includes('5') || s.includes('SOCCER')) return 'FUTBOL5'
  if (s.includes('TENIS') || s.includes('TENNIS')) return 'TENIS'
  if (s.includes('BASQUET') || s.includes('BASKET')) return 'BASQUET'
  return 'PADEL'
}

function normalizeSurfaceEnum(surface?: string | null): 'CESPED_SINTETICO' | 'PASTO_NATURAL' | 'CEMENTO' | 'POLVO_LADRILLO' | 'CRISTAL' {
  const s = (surface || '').toUpperCase().replace(/[\s-]/g, '_')
  if (s.includes('CRISTAL') || s.includes('VIDRIO') || s.includes('BLINDEX') || s.includes('PANORAMIC')) return 'CRISTAL'
  if (s.includes('NATURAL') || s.includes('PASTO_NATURAL') || s.includes('GRASS')) return 'PASTO_NATURAL'
  if (s.includes('CEMENTO') || s.includes('QUICK') || s.includes('HARD') || s.includes('HORMIGON')) return 'CEMENTO'
  if (s.includes('LADRILLO') || s.includes('CLAY') || s.includes('POLVO')) return 'POLVO_LADRILLO'
  return 'CESPED_SINTETICO'
}

// ─── CANCHAS ──────────────────────────────────────────────────────────────────

export async function getClubCourts(tenantId?: string | null) {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) return []

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from('courts')
      .select('id, name, sport, slot_duration_minutes, surface, has_lights, is_indoor, is_active, display_order')
      .eq('tenant_id', effectiveTenantId)
      .order('display_order', { ascending: true })

    if (error) {
      console.warn('[getClubCourts] Error fetching courts:', error.message)
      return []
    }
    return (data ?? []).map(c => ({
      ...c,
      slot_duration: (c.slot_duration_minutes === 60 ? 'MIN_60' : c.slot_duration_minutes === 120 ? 'MIN_120' : 'MIN_90') as SlotDuration,
      surface: (c.surface || 'CESPED_SINTETICO') as CourtSurface,
      has_lighting: Boolean(c.has_lights),
    }))
  } catch (err) {
    console.warn('[getClubCourts] Fallback por excepción:', err)
    return []
  }
}

export async function createCourt(payload: {
  tenant_id?: string | null
  name: string
  sport: SportType
  slot_duration?: SlotDuration
  slot_duration_minutes?: number
  surface?: CourtSurface | null
  has_lighting?: boolean
  has_lights?: boolean
  is_indoor?: boolean
  is_active?: boolean
}) {
  const effectiveTenantId = await resolveEffectiveTenantId(payload.tenant_id)
  if (!effectiveTenantId) {
    return { success: false, error: 'No se pudo determinar el club' }
  }

  const auth = await assertTenantAdmin(effectiveTenantId)
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Requiere permisos de Administrador del Club.' }
  }

  const supabase = await createServiceClient()
  const durationMinutes = payload.slot_duration_minutes || (payload.slot_duration === 'MIN_60' ? 60 : payload.slot_duration === 'MIN_120' ? 120 : 90)
  const hasLights = payload.has_lights !== undefined ? payload.has_lights : (payload.has_lighting !== undefined ? payload.has_lighting : true)
  const sportEnum = normalizeSportEnum(payload.sport)
  const surfaceEnum = normalizeSurfaceEnum(payload.surface)

  const insertData = {
    tenant_id: effectiveTenantId,
    name: payload.name.trim(),
    sport: sportEnum,
    slot_duration_minutes: durationMinutes,
    surface: surfaceEnum,
    has_lights: hasLights,
    is_indoor: Boolean(payload.is_indoor),
    is_active: payload.is_active !== false,
  }

  const { data, error } = await supabase
    .from('courts')
    .insert(insertData)
    .select()
    .single()

  if (error) {
    console.error('[createCourt] Error inserting court:', error.message)
    return { success: false, error: error.message }
  }

  // Sincronizar automáticamente el plan y base_slots_plan en la tabla tenants
  try {
    const { data: allCourts } = await supabase
      .from('courts')
      .select('id')
      .eq('tenant_id', effectiveTenantId)
      .eq('is_active', true)
    
    const activeCount = allCourts?.length || 1
    const newPlan = getPlanByCourtsCount(activeCount)
    await supabase
      .from('tenants')
      .update({
        plan_id: newPlan.id,
        base_slots_plan: activeCount,
      })
      .eq('id', effectiveTenantId)
  } catch (syncErr) {
    console.warn('[createCourt] Error auto-syncing tenant plan:', syncErr)
  }

  revalidatePath('/dashboard/canchas')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/plan')
  return { success: true, court: data }
}

export async function updateCourt(courtId: string, payload: Partial<{
  name: string
  sport: SportType
  slot_duration: SlotDuration
  slot_duration_minutes: number
  surface: CourtSurface | null
  has_lighting: boolean
  has_lights: boolean
  is_indoor: boolean
  is_active: boolean
}>) {
  const supabase = await createServiceClient()

  // 1. Obtener la cancha y su tenant_id real de la base de datos
  const { data: court, error: courtFetchErr } = await supabase
    .from('courts')
    .select('id, tenant_id')
    .eq('id', courtId)
    .maybeSingle()

  if (courtFetchErr || !court) {
    return { success: false, error: 'Cancha no encontrada.' }
  }

  // 2. Validar que el usuario tenga permisos sobre este club específico
  const auth = await assertTenantMember(court.tenant_id)
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Sin permisos para editar canchas de este club.' }
  }
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  }
  if (payload.name !== undefined) updateData.name = payload.name.trim()
  if (payload.sport !== undefined) {
    updateData.sport = normalizeSportEnum(payload.sport)
  }
  if (payload.surface !== undefined) {
    updateData.surface = normalizeSurfaceEnum(payload.surface)
  }
  if (payload.is_indoor !== undefined) updateData.is_indoor = payload.is_indoor
  if (payload.is_active !== undefined) updateData.is_active = payload.is_active
  if (payload.slot_duration_minutes !== undefined) {
    updateData.slot_duration_minutes = payload.slot_duration_minutes
  } else if (payload.slot_duration !== undefined) {
    updateData.slot_duration_minutes = payload.slot_duration === 'MIN_60' ? 60 : payload.slot_duration === 'MIN_120' ? 120 : 90
  }
  if (payload.has_lights !== undefined) {
    updateData.has_lights = payload.has_lights
  } else if (payload.has_lighting !== undefined) {
    updateData.has_lights = payload.has_lighting
  }

  const { error } = await supabase
    .from('courts')
    .update(updateData)
    .eq('id', courtId)

  if (error) {
    console.error('[updateCourt] Error updating court:', error.message)
    return { success: false, error: error.message }
  }

  if (payload.is_active !== undefined) {
    try {
      const { data: courtRow } = await supabase.from('courts').select('tenant_id').eq('id', courtId).maybeSingle()
      if (courtRow?.tenant_id) {
        const { data: allCourts } = await supabase
          .from('courts')
          .select('id')
          .eq('tenant_id', courtRow.tenant_id)
          .eq('is_active', true)
        const activeCount = allCourts?.length || 1
        const newPlan = getPlanByCourtsCount(activeCount)
        await supabase
          .from('tenants')
          .update({
            plan_id: newPlan.id,
            base_slots_plan: activeCount,
          })
          .eq('id', courtRow.tenant_id)
      }
    } catch (syncErr) {
      console.warn('[updateCourt] Error auto-syncing tenant plan:', syncErr)
    }
  }

  revalidatePath('/dashboard/canchas')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/plan')
  return { success: true }
}

export async function deleteCourt(
  courtId: string, 
  tenantId: string,
  options?: { force?: boolean }
): Promise<{ success: boolean; hasActiveBookings?: boolean; activeCount?: number; error?: string }> {
  const supabase = await createServiceClient()

  // 1. Validar que la cancha exista y pertenezca efectivamente a tenantId (anti-BOLA)
  const { data: court, error: courtErr } = await supabase
    .from('courts')
    .select('id, tenant_id')
    .eq('id', courtId)
    .maybeSingle()

  if (courtErr || !court) {
    return { success: false, error: 'Cancha no encontrada.' }
  }

  if (court.tenant_id !== tenantId) {
    return { success: false, error: 'Acceso denegado: la cancha no pertenece al club indicado.' }
  }

  const auth = await assertTenantAdmin(court.tenant_id)
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Requiere permisos de Administrador del Club.' }
  }

  try {
    // 1. Validar si existen reservas activas (no canceladas / no finalizadas)
    const { count: activeCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('court_id', courtId)
      .in('status', ['confirmed', 'confirmed_cash', 'pending_deposit', 'in_process'])

    if (!options?.force && activeCount && activeCount > 0) {
      return { 
        success: false, 
        hasActiveBookings: true,
        activeCount,
        error: `Esta cancha tiene ${activeCount} turno(s) activo(s) confirmado(s). Para darla de baja sin perder las reservas de los clientes, podés marcarla como "Inactiva". Si deseás eliminarla de todos modos junto con sus turnos, confirmá la eliminación.` 
      }
    }

    // 2. Desvincular pedidos de cantina asociados a la cancha si existen
    try {
      await supabase
        .from('court_orders')
        .update({ court_id: null })
        .eq('court_id', courtId)
    } catch {}

    // 3. Eliminar bloqueos de cancha (court_blocks) si existen
    try {
      await supabase
        .from('court_blocks')
        .delete()
        .eq('court_id', courtId)
    } catch {}

    // 4. Eliminar turnos fijos (recurring_slots) si existen
    try {
      await supabase
        .from('recurring_slots')
        .delete()
        .eq('court_id', courtId)
    } catch {}

    // 5. Eliminar listas de espera (waitlists) si existen
    try {
      await supabase
        .from('waitlists')
        .delete()
        .eq('court_id', courtId)
    } catch {}

    // 6. Eliminar reglas de precio asociadas a esta cancha
    try {
      await supabase
        .from('price_rules')
        .delete()
        .eq('court_id', courtId)
    } catch (prErr: unknown) {
      console.warn('[deleteCourt] Warning deleting price rules:', prErr)
    }

    // 7. Eliminar TODAS las reservas asociadas a esta cancha
    // (Crucial: evita la violación de FK "bookings_court_id_fkey" en PostgreSQL)
    const { error: bookingsErr } = await supabase
      .from('bookings')
      .delete()
      .eq('court_id', courtId)

    if (bookingsErr) {
      console.error('[deleteCourt] Error deleting bookings:', bookingsErr.message)
      return { success: false, error: 'No se pudieron limpiar las reservas asociadas a la cancha: ' + bookingsErr.message }
    }

    // 8. Eliminar la cancha de la tabla courts
    const { error: courtErr } = await supabase
      .from('courts')
      .delete()
      .eq('id', courtId)
      .eq('tenant_id', tenantId)

    if (courtErr) {
      console.error('[deleteCourt] Error deleting court:', courtErr.message)
      return { success: false, error: courtErr.message }
    }

    // Sincronizar automáticamente el plan y base_slots_plan tras eliminar una cancha
    try {
      const { data: allCourts } = await supabase
        .from('courts')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)

      const activeCount = allCourts?.length || 1
      const newPlan = getPlanByCourtsCount(activeCount)
      await supabase
        .from('tenants')
        .update({
          plan_id: newPlan.id,
          base_slots_plan: activeCount,
        })
        .eq('id', tenantId)
    } catch (syncErr) {
      console.warn('[deleteCourt] Error auto-syncing tenant plan:', syncErr)
    }

    revalidatePath('/dashboard/canchas')
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/precios')
    revalidatePath('/dashboard/fijos')
    revalidatePath('/dashboard/plan')
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al eliminar la cancha'
    console.error('[deleteCourt] Exception:', err)
    return { success: false, error: msg }
  }
}

// ─── CALENDARIO & TURNOS DEL DÍA ──────────────────────────────────────────────

export async function getCalendarBookings(tenantId: string | null | undefined, dateIso: string) {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) return []

    const auth = await assertTenantMember(effectiveTenantId)
    if (!auth.authorized) return []

    const supabase = await createServiceClient()
    const startOfDay = new Date(`${dateIso}T00:00:00-03:00`).toISOString()
    const endOfDay = new Date(`${dateIso}T23:59:59.999-03:00`).toISOString()

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        court_id,
        customer_name,
        customer_phone,
        customer_email,
        booked_at,
        status,
        price_total_cents,
        deposit_cents,
        staff_notes,
        payment_method,
        courts (id, name, sport, slot_duration_minutes)
      `)
      .eq('tenant_id', effectiveTenantId)
      .filter('booked_at', 'ov', `[${startOfDay},${endOfDay}]`)
      .not('status', 'in', '("cancelled")')
      .order('created_at', { ascending: true })

    if (error) {
      console.warn('[getCalendarBookings] Fallback a datos locales/demo:', error.message || error)
      return []
    }

    interface RawDbBooking {
      id: string
      court_id: string
      customer_name?: string | null
      customer_phone?: string | null
      customer_email?: string | null
      booked_at?: string | null
      status?: string | null
      price_total_cents?: number | null
      deposit_cents?: number | null
      staff_notes?: string | null
      payment_method?: string | null
      courts?: { id?: string; name?: string; sport?: string; slot_duration_minutes?: number } | null
    }

    // Parsear booked_at (tstzrange) para la grilla de turnos
    return ((data || []) as unknown as RawDbBooking[]).map((b) => {
      let start = ''
      let end = ''
      if (b.booked_at) {
        const match = b.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
        if (match) {
          start = match[1]
          end = match[2]
        }
      }

      if (start && start.includes(' ') && !start.includes('T')) {
        start = start.replace(' ', 'T')
      }
      if (start && start.endsWith('+00')) {
        start = start.replace('+00', 'Z')
      }
      if (end && end.includes(' ') && !end.includes('T')) {
        end = end.replace(' ', 'T')
      }
      if (end && end.endsWith('+00')) {
        end = end.replace('+00', 'Z')
      }

      const courtObj = b.courts
      const courtName = courtObj?.name || 'Cancha'
      const courtSport = courtObj?.sport || 'PADEL'
      const courtDuration = courtObj?.slot_duration_minutes === 60 ? 'MIN_60' : (courtObj?.slot_duration_minutes === 120 ? 'MIN_120' : 'MIN_90')

      if (!end || end === start) {
        const durationMins = courtObj?.slot_duration_minutes || (courtSport.includes('FUTBOL') ? 60 : 90)
        try {
          const startDate = new Date(start)
          end = new Date(startDate.getTime() + durationMins * 60 * 1000).toISOString()
        } catch {}
      }

      const totalArs = (b.price_total_cents !== null && b.price_total_cents !== undefined)
        ? Math.round(Number(b.price_total_cents) / 100)
        : 0
      let depositArs = (b.deposit_cents !== null && b.deposit_cents !== undefined)
        ? Math.round(Number(b.deposit_cents) / 100)
        : 0

      // Auto-detección y corrección de registro inconsistente en turnos manuales antiguos:
      // Solo en caso de que sea un turno manual sin seña previa donde la nota indique explícitamente "Seña inicial"
      // y NO se haya cobrado el saldo restante, ni provenga de reserva online.
      const hasSaldoRestante = Boolean(b.staff_notes?.toLowerCase().includes('saldo restante'))
      const hasOnlineBooking = Boolean(b.staff_notes?.toLowerCase().includes('reserva online') || b.staff_notes?.toLowerCase().includes('seña verificada'))
      const cobroMatches = [...(b.staff_notes || '').matchAll(/Cobro\s+\$?([\d\.,]+)\s*\(([^)]+)\)/gi)]

      if (!hasSaldoRestante && !hasOnlineBooking && cobroMatches.length > 0) {
        const isOnlyInitialDeposit = Boolean(b.staff_notes?.toLowerCase().includes('seña inicial'))
        if (isOnlyInitialDeposit) {
          const sumCobros = cobroMatches.reduce((acc, m) => {
            const clean = m[1].replace(/\./g, '').replace(/,/g, '.')
            return acc + (Math.round(Number(clean)) || 0)
          }, 0)
          if (sumCobros > 0 && sumCobros < totalArs && depositArs >= totalArs) {
            depositArs = sumCobros
          }
        }
      }

      const isConfirmedCash = b.status === 'confirmed_cash' && depositArs >= totalArs
      const isPendingDeposit = (b.status === 'pending_deposit' || b.status === 'pending') && depositArs < totalArs
      const isFullyPaid = isConfirmedCash || (depositArs >= totalArs && totalArs > 0)
      const totalPaid = isFullyPaid ? totalArs : depositArs
      const balanceDue = Math.max(0, totalArs - totalPaid)

      const statusFormatted = isFullyPaid
        ? 'FULLY_PAID'
        : isPendingDeposit
        ? 'PENDING_DEPOSIT'
        : 'CONFIRMED'

      const isManual = Boolean(
        b.staff_notes?.includes('[ABONO') ||
        b.staff_notes?.includes('mostrador') ||
        b.staff_notes?.includes('manual') ||
        b.payment_method === 'cash'
      )

      return {
        id: b.id,
        court_id: b.court_id,
        customer_name: b.customer_name || 'Jugador',
        customer_phone: b.customer_phone,
        customer_email: b.customer_email,
        starts_at: start,
        ends_at: end,
        status: statusFormatted,
        origin: isManual ? 'PHONE' : 'ONLINE_PORTAL',
        total_amount_ars: totalArs,
        deposit_amount_ars: depositArs,
        total_paid: totalPaid,
        balance_due: balanceDue,
        internal_notes: cleanNoteForDisplay(b.staff_notes) || null,
        courts: {
          name: courtName,
          sport: courtSport,
          slot_duration: courtDuration,
        },
      }
    })
  } catch (err) {
    console.warn('[getCalendarBookings] Fallback por excepción:', err)
    return []
  }
}

// ─── REGLAS DE PRECIOS ────────────────────────────────────────────────────────

export async function getClubPriceRules(tenantId?: string | null) {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) return []

    const auth = await assertTenantMember(effectiveTenantId)
    if (!auth.authorized) return []

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from('price_rules')
      .select(`
        id,
        tenant_id,
        court_id,
        name,
        day_of_week,
        time_from,
        time_to,
        price_cents,
        priority,
        is_active,
        courts(name, sport)
      `)
      .eq('tenant_id', effectiveTenantId)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('[getClubPriceRules] Error fetching price rules:', error.message)
      return []
    }
    return (data ?? []).map(r => ({
      ...r,
      days_of_week: (r.day_of_week || []).map((d: number) => d === 7 ? 0 : d),
      price_ars: Math.round(Number(r.price_cents) / 100),
      time_from: r.time_from ? r.time_from.substring(0, 5) : '18:00',
      time_to: r.time_to ? (r.time_to.startsWith('24:00') ? '00:00' : r.time_to.substring(0, 5)) : '23:00',
    }))
  } catch (err) {
    console.warn('[getClubPriceRules] Exception:', err)
    return []
  }
}

export async function createPriceRule(payload: {
  tenant_id?: string | null
  court_id?: string | null
  name: string
  days_of_week?: number[]
  day_of_week?: number[]
  time_from: string
  time_to: string
  price_ars: number
  deposit_pct?: number
}) {
  const effectiveTenantId = await resolveEffectiveTenantId(payload.tenant_id)
  if (!effectiveTenantId) {
    return { success: false, error: 'No se pudo determinar el club' }
  }

  // Protección antifraude: Solo el dueño del club puede crear nuevas tarifas de canchas
  const auth = await assertTenantAdmin(effectiveTenantId)
  if (!auth.authorized) {
    return {
      success: false,
      error: auth.error || 'Solo el dueño del club tiene permisos para crear tarifas de canchas.',
    }
  }

  const supabase = await createServiceClient()
  const rawDays = (payload.days_of_week && payload.days_of_week.length > 0)
    ? payload.days_of_week
    : (payload.day_of_week && payload.day_of_week.length > 0)
      ? payload.day_of_week
      : [1, 2, 3, 4, 5, 6, 7]

  // En PostgreSQL el check constraint de price_rules es ARRAY[1,2,3,4,5,6,7] (donde 7 = Domingo según ISO).
  // En JavaScript / Frontend se usa 0 = Domingo. Normalizamos 0 -> 7 para la BD:
  const days = Array.from(new Set(rawDays.map(d => d === 0 ? 7 : d))).sort((a, b) => a - b)
  if (days.length === 0) {
    return { success: false, error: 'Debes seleccionar al menos un día de la semana.' }
  }

  const priceCents = Math.round(Number(payload.price_ars) * 100)
  if (isNaN(priceCents) || priceCents < 0) {
    return { success: false, error: 'El precio debe ser un número válido mayor o igual a 0.' }
  }

  const timeFromFormatted = payload.time_from.length === 5 ? `${payload.time_from}:00` : payload.time_from
  let timeToFormatted = payload.time_to.length === 5 ? `${payload.time_to}:00` : payload.time_to

  // Si la hora de fin es 00:00 (medianoche), normalizar a 24:00:00 para la BD (donde 24:00 > time_from)
  if (timeToFormatted === '00:00' || timeToFormatted === '00:00:00') {
    timeToFormatted = '24:00:00'
  }

  if (timeFromFormatted >= timeToFormatted) {
    return {
      success: false,
      error: 'La hora de fin debe ser posterior a la de inicio (ej: de 18:00 a 23:00, o 00:00 para medianoche). Si el turno pasa de la medianoche (ej: hasta las 02:00 am), creá dos tarifas: una hasta medianoche y otra desde las 00:00.',
    }
  }

  // Si no se especifica court_id, asignar a todas las canchas activas del club
  let targetCourtIds: string[] = []
  if (payload.court_id) {
    targetCourtIds = [payload.court_id]
  } else {
    const { data: clubCourts } = await supabase
      .from('courts')
      .select('id')
      .eq('tenant_id', effectiveTenantId)
      .eq('is_active', true)

    if (clubCourts && clubCourts.length > 0) {
      targetCourtIds = clubCourts.map(c => c.id)
    }
  }

  if (targetCourtIds.length === 0) {
    return {
      success: false,
      error: 'Debes registrar al menos una cancha activa antes de definir tarifas.',
    }
  }

  const rowsToInsert = targetCourtIds.map(cid => ({
    tenant_id: effectiveTenantId,
    court_id: cid,
    name: payload.name.trim(),
    day_of_week: days,
    time_from: timeFromFormatted,
    time_to: timeToFormatted,
    price_cents: priceCents,
    priority: 1,
    is_active: true,
  }))

  const { data, error } = await supabase
    .from('price_rules')
    .insert(rowsToInsert)
    .select()

  if (error) {
    console.error('[createPriceRule] Error inserting price rule:', error.message)
    return { success: false, error: error.message }
  }

  // Antifraude High-Water Mark: registrar el precio pico alcanzado en el ciclo
  try {
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('description')
      .eq('id', effectiveTenantId)
      .single()

    let descObj: Record<string, unknown> = {}
    try {
      descObj = JSON.parse(tenantData?.description || '{}')
    } catch {}

    const currentMax = Number(descObj.billing_cycle_max_price_cents) || 0
    const newMax = Math.max(currentMax, priceCents)
    descObj.billing_cycle_max_price_cents = newMax
    descObj.last_price_rule_modified_at = new Date().toISOString()

    await supabase
      .from('tenants')
      .update({ description: JSON.stringify(descObj) })
      .eq('id', effectiveTenantId)

    await supabase.from('audit_log').insert({
      tenant_id: effectiveTenantId,
      action: 'PRICE_RULE_CREATE',
      table_name: 'price_rules',
      record_id: data?.[0]?.id || crypto.randomUUID(),
      new_data: {
        name: payload.name,
        price_cents: priceCents,
        high_water_mark_cents: newMax,
        created_at: new Date().toISOString(),
      }
    })
  } catch (hwmErr) {
    console.warn('[createPriceRule] High-water mark notice:', hwmErr)
  }

  revalidatePath('/dashboard/precios')
  revalidatePath('/dashboard/plan')
  revalidatePath('/dashboard')
  return { success: true, rule: data?.[0] }
}

export async function updatePriceRule(payload: {
  id: string
  tenant_id?: string | null
  court_id?: string | null
  name: string
  days_of_week?: number[]
  day_of_week?: number[]
  time_from: string
  time_to: string
  price_ars: number
  deposit_pct?: number
}) {
  const effectiveTenantId = await resolveEffectiveTenantId(payload.tenant_id)
  if (!effectiveTenantId) {
    return { success: false, error: 'No se pudo determinar el club' }
  }

  // Protección antifraude: Solo el dueño del club puede modificar tarifas de canchas existentes
  const auth = await assertTenantAdmin(effectiveTenantId)
  if (!auth.authorized) {
    return {
      success: false,
      error: auth.error || 'Solo el dueño del club tiene permisos para modificar tarifas de canchas.',
    }
  }

  const supabase = await createServiceClient()
  const rawDays = (payload.days_of_week && payload.days_of_week.length > 0)
    ? payload.days_of_week
    : (payload.day_of_week && payload.day_of_week.length > 0)
      ? payload.day_of_week
      : [1, 2, 3, 4, 5, 6, 7]

  // En PostgreSQL el check constraint de price_rules es ARRAY[1,2,3,4,5,6,7] (donde 7 = Domingo según ISO).
  // En JavaScript / Frontend se usa 0 = Domingo. Normalizamos 0 -> 7 para la BD:
  const days = Array.from(new Set(rawDays.map(d => d === 0 ? 7 : d))).sort((a, b) => a - b)
  if (days.length === 0) {
    return { success: false, error: 'Debes seleccionar al menos un día de la semana.' }
  }

  const priceCents = Math.round(Number(payload.price_ars) * 100)
  if (isNaN(priceCents) || priceCents < 0) {
    return { success: false, error: 'El precio debe ser un número válido mayor o igual a 0.' }
  }

  const timeFromFormatted = payload.time_from.length === 5 ? `${payload.time_from}:00` : payload.time_from
  let timeToFormatted = payload.time_to.length === 5 ? `${payload.time_to}:00` : payload.time_to

  // Si la hora de fin es 00:00 (medianoche), normalizar a 24:00:00 para la BD (donde 24:00 > time_from)
  if (timeToFormatted === '00:00' || timeToFormatted === '00:00:00') {
    timeToFormatted = '24:00:00'
  }

  if (timeFromFormatted >= timeToFormatted) {
    return {
      success: false,
      error: 'La hora de fin debe ser posterior a la de inicio (ej: de 18:00 a 23:00, o 00:00 para medianoche). Si el turno pasa de la medianoche (ej: hasta las 02:00 am), creá dos tarifas: una hasta medianoche y otra desde las 00:00.',
    }
  }

  const updateData: Record<string, unknown> = {
    name: payload.name.trim(),
    day_of_week: days,
    time_from: timeFromFormatted,
    time_to: timeToFormatted,
    price_cents: priceCents,
  }
  if (payload.court_id) {
    updateData.court_id = payload.court_id
  }

  const { data, error } = await supabase
    .from('price_rules')
    .update(updateData)
    .eq('id', payload.id)
    .eq('tenant_id', effectiveTenantId)
    .select()

  if (error) {
    console.error('[updatePriceRule] Error updating price rule:', error.message)
    return { success: false, error: error.message }
  }

  // Antifraude High-Water Mark: registrar el precio pico alcanzado en el ciclo
  try {
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('description')
      .eq('id', effectiveTenantId)
      .single()

    let descObj: Record<string, unknown> = {}
    try {
      descObj = JSON.parse(tenantData?.description || '{}')
    } catch {}

    const currentMax = Number(descObj.billing_cycle_max_price_cents) || 0
    const newMax = Math.max(currentMax, priceCents)
    descObj.billing_cycle_max_price_cents = newMax
    descObj.last_price_rule_modified_at = new Date().toISOString()

    await supabase
      .from('tenants')
      .update({ description: JSON.stringify(descObj) })
      .eq('id', effectiveTenantId)

    await supabase.from('audit_log').insert({
      tenant_id: effectiveTenantId,
      action: 'PRICE_RULE_UPDATE',
      table_name: 'price_rules',
      record_id: payload.id,
      new_data: {
        name: payload.name,
        new_price_cents: priceCents,
        high_water_mark_cents: newMax,
        updated_at: new Date().toISOString(),
      }
    })
  } catch (hwmErr) {
    console.warn('[updatePriceRule] High-water mark notice:', hwmErr)
  }

  revalidatePath('/dashboard/precios')
  revalidatePath('/dashboard/plan')
  revalidatePath('/dashboard')
  return { success: true, rule: data?.[0] }
}

export async function deletePriceRule(ruleId: string, tenantId?: string | null) {
  const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
  if (!effectiveTenantId) {
    return { success: false, error: 'No se pudo determinar el club' }
  }

  // Protección antifraude: Solo el dueño del club puede eliminar tarifas de canchas
  const auth = await assertTenantAdmin(effectiveTenantId)
  if (!auth.authorized) {
    return {
      success: false,
      error: auth.error || 'Solo el dueño del club tiene permisos para eliminar tarifas de canchas.',
    }
  }

  const supabase = await createServiceClient()
  try {
    // Desvincular de bookings si alguna reserva apunta a esta regla de precios
    try {
      await supabase
        .from('bookings')
        .update({ price_rule_id: null })
        .eq('price_rule_id', ruleId)
    } catch {}

    const { error } = await supabase
      .from('price_rules')
      .delete()
      .eq('id', ruleId)
      .eq('tenant_id', effectiveTenantId)

    if (error) {
      return { success: false, error: error.message }
    }
    revalidatePath('/dashboard/precios')
    revalidatePath('/dashboard/plan')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al eliminar tarifa'
    return { success: false, error: msg }
  }
}

// ─── CAJA DIARIA & ARQUEO ─────────────────────────────────────────────────────

export async function getDailyCashSummary(tenantId: string | null | undefined, dateStr: string) {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) return null

    const authCheck = await assertTenantMember(effectiveTenantId)
    if (!authCheck.authorized) return null

    const supabase = await createServiceClient()

    const startOfDay = new Date(`${dateStr}T00:00:00-03:00`).toISOString()
    const endOfDay = new Date(`${dateStr}T23:59:59-03:00`).toISOString()

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        id,
        price_total_cents,
        deposit_cents,
        staff_deposit_amount_cents,
        payment_method,
        paid_at,
        created_at,
        staff_notes,
        customer_name,
        courts (name)
      `)
      .eq('tenant_id', effectiveTenantId)
      .filter('booked_at', 'ov', `[${startOfDay},${endOfDay}]`)
      .not('status', 'in', '("cancelled")')

    if (error) {
      console.warn('[getDailyCashSummary] Error querying bookings:', error.message)
      return {
        totalCollected: 0,
        breakdown: { CASH: 0, TRANSFER: 0, MERCADOPAGO: 0, OTHER: 0 },
        payments: [],
        bookingsCount: 0,
      }
    }

    const breakdown = {
      CASH: 0,
      TRANSFER: 0,
      MERCADOPAGO: 0,
      OTHER: 0,
    }

    let totalCollected = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payments = (bookings || []).map((b: any) => {
      const depCents = Number(b.staff_deposit_amount_cents || b.deposit_cents || 0)
      const amt = depCents / 100
      totalCollected += amt

      const method = String(b.payment_method || '').toLowerCase()
      if (method.includes('cash')) breakdown.CASH += amt
      else if (method.includes('transfer') || method.includes('bank')) breakdown.TRANSFER += amt
      else if (method.includes('mercadopago') || method.includes('mp')) breakdown.MERCADOPAGO += amt
      else breakdown.OTHER += amt

      const courtObj = Array.isArray(b.courts) ? b.courts[0] : b.courts
      return {
        id: b.id,
        amount_ars: amt,
        payment_method: method.toUpperCase() || 'CASH',
        payment_date: dateStr,
        created_at: b.paid_at || b.created_at,
        reference_number: undefined,
        notes: cleanNoteForDisplay(b.staff_notes) || undefined,
        booking_id: b.id,
        bookings: {
          customer_name: b.customer_name || 'Cliente',
          courts: { name: (courtObj as { name?: string } | null)?.name || 'Cancha' }
        }
      }
    })

    return {
      totalCollected,
      breakdown,
      payments,
      bookingsCount: payments.length,
    }
  } catch (err) {
    console.warn('[getDailyCashSummary] Fallback por excepción:', err)
    return {
      totalCollected: 0,
      breakdown: { CASH: 0, TRANSFER: 0, MERCADOPAGO: 0, OTHER: 0 },
      payments: [],
      bookingsCount: 0,
    }
  }
}

// ─── TURNOS FIJOS / ABONADOS (Mejora 2A) ──────────────────────────────────────

export async function getRecurringBookings(tenantId?: string | null) {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) return []

    const { getRecurringSlots } = await import('@/actions/recurring-slots.actions')
    const slots = await getRecurringSlots(effectiveTenantId)
    return slots
  } catch {
    return []
  }
}

export async function createRecurringBooking(payload: {
  tenant_id?: string | null
  court_id: string
  day_of_week: number
  start_time: string
  end_time: string
  customer_name: string
  customer_phone: string
  total_amount_ars: number
  deposit_amount_ars: number
  notes?: string
}) {
  const effectiveTenantId = await resolveEffectiveTenantId(payload.tenant_id)
  if (!effectiveTenantId) {
    return { success: false, error: 'No se pudo determinar el club' }
  }

  const { createRecurringSlot } = await import('@/actions/recurring-slots.actions')
  const res = await createRecurringSlot({
    tenant_id: effectiveTenantId,
    court_id: payload.court_id,
    day_of_week: payload.day_of_week,
    start_time: payload.start_time,
    end_time: payload.end_time,
    customer_name: payload.customer_name,
    customer_phone: payload.customer_phone,
    monthly_price: payload.total_amount_ars || payload.deposit_amount_ars || 0,
    payment_due_day: 10,
    notes: payload.notes,
  })

  return { success: res.success, booking: res.slot, error: res.error }
}

export async function toggleRecurringBookingStatus(id: string, currentStatus: boolean) {
  const { updateRecurringSlotStatus } = await import('@/actions/recurring-slots.actions')
  const newStatus = currentStatus ? 'PAUSED' : 'ACTIVE'
  const res = await updateRecurringSlotStatus(id, newStatus)
  return res
}

// ─── AJUSTE MASIVO POR INFLACIÓN (Mejora 3C) ──────────────────────────────────

export async function applyBulkInflationPriceAdjustment(
  tenantId: string,
  percentage: number,
  roundingStep: number = 500
) {
  // Protección antifraude: Solo el dueño del club puede aplicar ajustes masivos de precios
  const auth = await assertTenantAdmin(tenantId)
  if (!auth.authorized) {
    return {
      success: false,
      error: auth.error || 'Solo el dueño del club tiene permisos para aplicar ajustes de precios por inflación.',
    }
  }

  const supabase = await createServiceClient()

  // 1. Obtener reglas de precios actuales desde la columna price_cents real
  const { data: currentRules, error } = await supabase
    .from('price_rules')
    .select('id, name, price_cents')
    .eq('tenant_id', tenantId)

  if (error || !currentRules || currentRules.length === 0) {
    return {
      success: true,
      updatedCount: 0,
      message: `No se encontraron tarifas activas para ajustar`,
    }
  }

  const multiplier = 1 + (percentage / 100)
  let updatedCount = 0

  for (const rule of currentRules) {
    const currentPriceArs = Math.round((Number(rule.price_cents) || 0) / 100)
    const rawPrice = currentPriceArs * multiplier
    const roundedPriceArs = Math.round(rawPrice / roundingStep) * roundingStep
    const newPriceCents = Math.round(roundedPriceArs * 100)

    const { error: updateErr } = await supabase
      .from('price_rules')
      .update({ price_cents: newPriceCents })
      .eq('id', rule.id)

    if (!updateErr) updatedCount++
  }

  revalidatePath('/dashboard/precios')
  revalidatePath('/dashboard/plan')
  revalidatePath('/dashboard')
  revalidatePath('/club/[slug]', 'page')
  return {
    success: true,
    updatedCount,
    message: `Se actualizaron ${updatedCount} tarifas con un aumento del ${percentage}%`,
  }
}

// ─── HORARIOS DE APERTURA Y CIERRE DEL CLUB ─────────────────────────────────

export async function getClubSchedule(tenantId?: string | null): Promise<ClubScheduleConfig> {
  const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
  if (!effectiveTenantId) return DEFAULT_CLUB_SCHEDULE

  try {
    const supabase = await createServiceClient()
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('description')
      .eq('id', effectiveTenantId)
      .maybeSingle()

    if (error || !tenant || !tenant.description) {
      return DEFAULT_CLUB_SCHEDULE
    }

    try {
      const parsed = JSON.parse(tenant.description)
      return {
        opening_time: parsed.opening_time || DEFAULT_CLUB_SCHEDULE.opening_time,
        closing_time: parsed.closing_time || DEFAULT_CLUB_SCHEDULE.closing_time,
      }
    } catch {
      return DEFAULT_CLUB_SCHEDULE
    }
  } catch (err) {
    console.error('[getClubSchedule] Exception:', err)
    return DEFAULT_CLUB_SCHEDULE
  }
}

export async function updateClubSchedule(
  tenantId: string | null | undefined,
  schedule: { opening_time: string; closing_time: string }
): Promise<{ success: boolean; schedule?: ClubScheduleConfig; error?: string }> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) {
      return { success: false, error: 'Identificador de club requerido' }
    }

    const auth = await assertTenantAdmin(effectiveTenantId)
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Sin permisos de administrador sobre este club' }
    }

    const supabase = await createServiceClient()

    const { data: tenant, error: fetchErr } = await supabase
      .from('tenants')
      .select('description, slug')
      .eq('id', effectiveTenantId)
      .single()

    if (fetchErr || !tenant) {
      return { success: false, error: fetchErr?.message || 'Club no encontrado' }
    }

    let meta: Record<string, unknown> = {}
    if (tenant.description) {
      try {
        meta = JSON.parse(tenant.description)
      } catch {
        meta = {}
      }
    }

    meta.opening_time = schedule.opening_time || DEFAULT_CLUB_SCHEDULE.opening_time
    meta.closing_time = schedule.closing_time || DEFAULT_CLUB_SCHEDULE.closing_time

    const { error: updateErr } = await supabase
      .from('tenants')
      .update({
        description: JSON.stringify(meta),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)

    if (updateErr) {
      console.error('[updateClubSchedule] Error updating tenants:', updateErr.message)
      return { success: false, error: updateErr.message }
    }

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/canchas')
    if (tenant.slug) {
      revalidatePath(`/club/${tenant.slug}`)
    }

    return {
      success: true,
      schedule: {
        opening_time: meta.opening_time as string,
        closing_time: meta.closing_time as string,
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al guardar horario'
    console.error('[updateClubSchedule] Exception:', err)
    return { success: false, error: msg }
  }
}

// ─── ANUNCIO / INFORMACIÓN DESTACADA DEL CLUB PARA JUGADORES ──────────────────

export interface ClubHighlightInfo {
  highlightText: string
  highlightBadge: string
  isHighlightActive: boolean
}

export async function getClubHighlightInfo(
  tenantId?: string | null
): Promise<ClubHighlightInfo> {
  const defaultInfo: ClubHighlightInfo = {
    highlightText: '',
    highlightBadge: '🔥 Promoción Especial',
    isHighlightActive: false,
  }

  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) return defaultInfo

    const supabase = await createServiceClient()
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('description')
      .eq('id', effectiveTenantId)
      .maybeSingle()

    if (error || !tenant || !tenant.description) {
      return defaultInfo
    }

    try {
      const parsed = JSON.parse(tenant.description)
      return {
        highlightText: typeof parsed.highlight_text === 'string' ? parsed.highlight_text : '',
        highlightBadge: typeof parsed.highlight_badge === 'string' ? parsed.highlight_badge : '🔥 Promoción Especial',
        isHighlightActive: Boolean(parsed.highlight_active && parsed.highlight_text),
      }
    } catch {
      return defaultInfo
    }
  } catch (err) {
    console.error('[getClubHighlightInfo] Exception:', err)
    return defaultInfo
  }
}

export async function updateClubHighlightInfo(
  tenantId: string | null | undefined,
  payload: {
    highlightText: string
    highlightBadge?: string
    isHighlightActive?: boolean
  }
): Promise<{ success: boolean; data?: ClubHighlightInfo; error?: string }> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) {
      return { success: false, error: 'Identificador de club requerido' }
    }

    const auth = await assertTenantAdmin(effectiveTenantId)
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Sin permisos de administrador sobre este club' }
    }

    const supabase = await createServiceClient()

    const { data: tenant, error: fetchErr } = await supabase
      .from('tenants')
      .select('description, slug')
      .eq('id', effectiveTenantId)
      .single()

    if (fetchErr || !tenant) {
      return { success: false, error: fetchErr?.message || 'Club no encontrado' }
    }

    let meta: Record<string, unknown> = {}
    if (tenant.description) {
      try {
        meta = JSON.parse(tenant.description)
      } catch {
        meta = {}
      }
    }

    const trimmedText = (payload.highlightText || '').trim()
    const trimmedBadge = (payload.highlightBadge || '🔥 Promoción Especial').trim()
    const isActive = payload.isHighlightActive !== false && Boolean(trimmedText)

    meta.highlight_text = trimmedText
    meta.highlight_badge = trimmedBadge
    meta.highlight_active = isActive

    const { error: updateErr } = await supabase
      .from('tenants')
      .update({
        description: JSON.stringify(meta),
        updated_at: new Date().toISOString(),
      })
      .eq('id', effectiveTenantId)

    if (updateErr) {
      console.error('[updateClubHighlightInfo] Error updating tenants:', updateErr.message)
      return { success: false, error: updateErr.message }
    }

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/canchas')
    if (tenant.slug) {
      revalidatePath(`/club/${tenant.slug}`)
    }

    return {
      success: true,
      data: {
        highlightText: trimmedText,
        highlightBadge: trimmedBadge,
        isHighlightActive: isActive,
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al guardar información destacada'
    console.error('[updateClubHighlightInfo] Exception:', err)
    return { success: false, error: msg }
  }
}

// ─── REDES SOCIALES DEL CLUB (INSTAGRAM, FACEBOOK, TIKTOK) ────────────────────

export async function getClubSocialLinks(
  tenantId?: string | null
): Promise<ClubSocialLinks> {
  const defaultLinks: ClubSocialLinks = {
    instagram: '',
    facebook: '',
    tiktok: '',
  }

  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) return defaultLinks

    const supabase = await createServiceClient()
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('description, instagram_handle')
      .eq('id', effectiveTenantId)
      .maybeSingle()

    if (error || !tenant) {
      return defaultLinks
    }

    let meta: Record<string, unknown> = {}
    if (tenant.description) {
      try {
        meta = JSON.parse(tenant.description)
      } catch {
        meta = {}
      }
    }

    const socialLinks = (meta.social_links as Record<string, string> | undefined) || {}

    return {
      instagram: typeof socialLinks.instagram === 'string' && socialLinks.instagram.trim()
        ? socialLinks.instagram.trim()
        : (tenant.instagram_handle || ''),
      facebook: typeof socialLinks.facebook === 'string' ? socialLinks.facebook.trim() : '',
      tiktok: typeof socialLinks.tiktok === 'string' ? socialLinks.tiktok.trim() : '',
    }
  } catch (err) {
    console.error('[getClubSocialLinks] Exception:', err)
    return defaultLinks
  }
}

export async function updateClubSocialLinks(
  tenantId: string | null | undefined,
  links: ClubSocialLinks
): Promise<{ success: boolean; data?: ClubSocialLinks; error?: string }> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) {
      return { success: false, error: 'Identificador de club requerido' }
    }

    const auth = await assertTenantAdmin(effectiveTenantId)
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Sin permisos de administrador sobre este club' }
    }

    const supabase = await createServiceClient()

    const { data: tenant, error: fetchErr } = await supabase
      .from('tenants')
      .select('description, slug')
      .eq('id', effectiveTenantId)
      .single()

    if (fetchErr || !tenant) {
      return { success: false, error: fetchErr?.message || 'Club no encontrado' }
    }

    let meta: Record<string, unknown> = {}
    if (tenant.description) {
      try {
        meta = JSON.parse(tenant.description)
      } catch {
        meta = {}
      }
    }

    const rawInstagram = (links.instagram || '').trim()
    const rawFacebook = (links.facebook || '').trim()
    const rawTiktok = (links.tiktok || '').trim()

    const normalizedLinks: ClubSocialLinks = {
      instagram: rawInstagram ? normalizeSocialUrl('instagram', rawInstagram) : '',
      facebook: rawFacebook ? normalizeSocialUrl('facebook', rawFacebook) : '',
      tiktok: rawTiktok ? normalizeSocialUrl('tiktok', rawTiktok) : '',
    }

    meta.social_links = {
      instagram: normalizedLinks.instagram || '',
      facebook: normalizedLinks.facebook || '',
      tiktok: normalizedLinks.tiktok || '',
    }

    const updatePayload: Record<string, unknown> = {
      description: JSON.stringify(meta),
      updated_at: new Date().toISOString(),
    }

    if (normalizedLinks.instagram) {
      updatePayload.instagram_handle = normalizedLinks.instagram
    } else {
      updatePayload.instagram_handle = null
    }

    const { error: updateErr } = await supabase
      .from('tenants')
      .update(updatePayload)
      .eq('id', effectiveTenantId)

    if (updateErr) {
      console.error('[updateClubSocialLinks] Error updating tenants:', updateErr.message)
      return { success: false, error: updateErr.message }
    }

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/canchas')
    if (tenant.slug) {
      revalidatePath(`/club/${tenant.slug}`)
    }

    return {
      success: true,
      data: normalizedLinks,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al guardar redes sociales'
    console.error('[updateClubSocialLinks] Exception:', err)
    return { success: false, error: msg }
  }
}

// ─── SERVICIOS Y UBICACIÓN DEL CLUB (ESTACIONAMIENTO, CANTINA, DUCHAS, CÁMARAS, GOOGLE MAPS) ─────

export async function getClubServicesAndLocation(
  tenantId?: string | null
): Promise<ClubServicesAndLocationData> {
  const defaultData: ClubServicesAndLocationData = {
    services: {
      parking: false,
      cantina: false,
      showers: false,
      cameras: false,
      lighting: false,
      indoor: false,
      grill: false,
      wifi: false,
      equipment_rental: false,
    },
    location: {
      address: '',
      city: '',
      province: '',
      reference: '',
      google_maps_url: '',
    },
  }

  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) return defaultData

    const supabase = await createServiceClient()
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('address, city, province, google_maps_url, description')
      .eq('id', effectiveTenantId)
      .maybeSingle()

    if (error || !tenant) return defaultData

    let meta: Record<string, unknown> = {}
    if (tenant.description) {
      try {
        meta = JSON.parse(tenant.description)
      } catch {
        meta = {}
      }
    }

    const services = (meta.services as Record<string, boolean> | undefined) || {}
    const locationRef = typeof meta.location_reference === 'string' ? meta.location_reference : ''

    return {
      services: {
        parking: Boolean(services.parking),
        cantina: Boolean(services.cantina),
        showers: Boolean(services.showers),
        cameras: Boolean(services.cameras),
        lighting: Boolean(services.lighting),
        indoor: Boolean(services.indoor),
        grill: Boolean(services.grill),
        wifi: Boolean(services.wifi),
        equipment_rental: Boolean(services.equipment_rental),
      },
      location: {
        address: tenant.address || '',
        city: tenant.city || '',
        province: tenant.province || '',
        reference: locationRef,
        google_maps_url: tenant.google_maps_url || '',
      },
    }
  } catch (err) {
    console.error('[getClubServicesAndLocation] Exception:', err)
    return defaultData
  }
}

export async function updateClubServicesAndLocation(
  tenantId: string | null | undefined,
  payload: {
    services?: ClubServicesConfig
    location?: ClubLocationConfig
  }
): Promise<{ success: boolean; data?: ClubServicesAndLocationData; error?: string }> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) {
      return { success: false, error: 'Identificador de club requerido' }
    }

    const auth = await assertTenantAdmin(effectiveTenantId)
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Sin permisos de administrador sobre este club' }
    }

    const supabase = await createServiceClient()
    const { data: tenant, error: fetchErr } = await supabase
      .from('tenants')
      .select('description, slug, address, city, province, google_maps_url')
      .eq('id', effectiveTenantId)
      .single()

    if (fetchErr || !tenant) {
      return { success: false, error: fetchErr?.message || 'Club no encontrado' }
    }

    let meta: Record<string, unknown> = {}
    if (tenant.description) {
      try {
        meta = JSON.parse(tenant.description)
      } catch {
        meta = {}
      }
    }

    if (payload.services) {
      meta.services = {
        parking: Boolean(payload.services.parking),
        cantina: Boolean(payload.services.cantina),
        showers: Boolean(payload.services.showers),
        cameras: Boolean(payload.services.cameras),
        lighting: Boolean(payload.services.lighting),
        indoor: Boolean(payload.services.indoor),
        grill: Boolean(payload.services.grill),
        wifi: Boolean(payload.services.wifi),
        equipment_rental: Boolean(payload.services.equipment_rental),
      }
    }

    if (payload.location?.reference !== undefined) {
      meta.location_reference = (payload.location.reference || '').trim()
    }

    const updateTenantPayload: Record<string, unknown> = {
      description: JSON.stringify(meta),
      updated_at: new Date().toISOString(),
    }

    if (payload.location) {
      if (payload.location.address !== undefined) {
        updateTenantPayload.address = payload.location.address.trim() || null
      }
      if (payload.location.city !== undefined) {
        updateTenantPayload.city = payload.location.city.trim() || null
      }
      if (payload.location.province !== undefined) {
        updateTenantPayload.province = payload.location.province.trim() || null
      }
      if (payload.location.google_maps_url !== undefined) {
        updateTenantPayload.google_maps_url = payload.location.google_maps_url.trim() || null
      }
    }

    const { error: updateErr } = await supabase
      .from('tenants')
      .update(updateTenantPayload)
      .eq('id', effectiveTenantId)

    if (updateErr) {
      console.error('[updateClubServicesAndLocation] Error updating tenants:', updateErr.message)
      return { success: false, error: updateErr.message }
    }

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/canchas')
    if (tenant.slug) {
      revalidatePath(`/club/${tenant.slug}`)
    }

    return {
      success: true,
      data: {
        services: (meta.services as ClubServicesConfig) || {},
        location: {
          address: (updateTenantPayload.address as string) ?? tenant.address ?? '',
          city: (updateTenantPayload.city as string) ?? tenant.city ?? '',
          province: (updateTenantPayload.province as string) ?? tenant.province ?? '',
          reference: (meta.location_reference as string) ?? '',
          google_maps_url: (updateTenantPayload.google_maps_url as string) ?? tenant.google_maps_url ?? '',
        },
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al guardar servicios y ubicación'
    console.error('[updateClubServicesAndLocation] Exception:', err)
    return { success: false, error: msg }
  }
}

/**
 * Geocodifica una dirección o club a coordenadas (lat, lon) usando OpenStreetMap Nominatim.
 * Totalmente libre de API keys y cacheado por 24 horas en Next.js.
 */
export async function geocodeClubAddress(
  query: string
): Promise<{ lat: number; lon: number } | null> {
  const clean = query.trim()
  if (!clean || clean.length < 3) return null

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(clean)}&limit=1`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CancharClub/1.0 (contacto@cancharclub.com.ar)',
        'Accept-Language': 'es,es-AR;q=0.9',
      },
      next: { revalidate: 86400 },
    })

    if (!res.ok) return null
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0 && data[0]?.lat && data[0]?.lon) {
      const lat = parseFloat(data[0].lat)
      const lon = parseFloat(data[0].lon)
      if (!isNaN(lat) && !isNaN(lon)) {
        return { lat, lon }
      }
    }
  } catch (err) {
    console.warn('[geocodeClubAddress] Fallback error:', err)
  }
  return null
}

// ─── PORTAL PÚBLICO: DATOS REALES DE TENANT Y CANCHAS (Mejora 8) ───────────────

export async function getClubPublicData(slug: string): Promise<ClubData> {
  const normalizedSlug = (slug || '').trim().toLowerCase()
  const fallback = getClubBySlug(normalizedSlug)

  try {
    const supabase = await createServiceClient()

    // 1. Consultar tenant real en Supabase por slug
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select(`
        id,
        name,
        slug,
        address,
        city,
        province,
        google_maps_url,
        phone_whatsapp,
        is_active,
        bank_alias,
        bank_cbu,
        bank_account_holder,
        bank_name,
        payment_methods,
        mp_access_token,
        subscription_status,
        description,
        instagram_handle
      `)
      .eq('slug', normalizedSlug)
      .maybeSingle()

    if (tenantErr || !tenant) {
      if (tenantErr) console.warn('[getClubPublicData] tenantErr:', tenantErr.message)
      return fallback
    }

    // 2. Consultar canchas activas del tenant
    const { data: courts } = await supabase
      .from('courts')
      .select('id, name, sport, slot_duration_minutes, surface, is_indoor, has_lights, is_active, display_order')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    // 3. Consultar reglas de precios activas del tenant
    const { data: priceRules } = await supabase
      .from('price_rules')
      .select('id, court_id, name, day_of_week, time_from, time_to, price_cents, priority, is_active')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('priority', { ascending: false })

    const priceRulesMapped: PriceRuleDefinition[] = (priceRules || []).map((r) => ({
      id: r.id,
      courtId: r.court_id,
      name: r.name,
      dayOfWeek: Array.isArray(r.day_of_week) && r.day_of_week.length > 0
        ? r.day_of_week.map((d: number) => d === 7 ? 0 : d)
        : [0, 1, 2, 3, 4, 5, 6],
      timeFrom: (r.time_from || '00:00:00').substring(0, 5),
      timeTo: (r.time_to?.startsWith('24:00') ? '00:00' : (r.time_to || '23:59:59').substring(0, 5)),
      priceArs: Math.round((Number(r.price_cents) || 2000000) / 100),
      depositPct: 50,
    }))

    const courtsMapped: CourtDefinition[] = (courts && courts.length > 0)
      ? courts.map((c) => {
          const courtRules = priceRulesMapped.filter((r) => !r.courtId || r.courtId === c.id)
          const pricePerHour = courtRules.length > 0
            ? Math.min(...courtRules.map((r) => r.priceArs))
            : 20000

          const features: string[] = []
          if (c.is_indoor) features.push('Techada')
          if (c.has_lights) features.push('Iluminación LED')
          if (c.surface) features.push(c.surface)

          return {
            id: c.id,
            name: c.name,
            sport: normalizeToSportCategory(c.sport),
            surface: c.surface || 'Césped Sintético',
            isIndoor: Boolean(c.is_indoor),
            hasLighting: Boolean(c.has_lights),
            features,
            slotDurationMinutes: c.slot_duration_minutes || (c.sport?.includes('FUTBOL') ? 60 : 90),
            pricePerHour,
            depositPercentage: 0.5,
          }
        })
      : []

    // Determinar deportes únicos normalizados
    const sports = Array.from(new Set(courtsMapped.map((c) => normalizeToSportCategory(c.sport)))) as SportCategory[]

    // Calcular precio inicial más bajo
    const startingPrice = priceRulesMapped.length > 0
      ? Math.min(...priceRulesMapped.map((r) => r.priceArs))
      : (courtsMapped[0]?.pricePerHour || 20000)

    const hasMp = Boolean(tenant.mp_access_token)

    let schedule: ClubScheduleConfig = DEFAULT_CLUB_SCHEDULE
    let highlightText: string | undefined = undefined
    let highlightBadge: string | undefined = undefined
    let isHighlightActive: boolean | undefined = undefined
    let socialLinks: ClubSocialLinks | undefined = undefined
    let services: ClubServicesConfig = {
      parking: false,
      cantina: false,
      showers: false,
      cameras: false,
      lighting: false,
      indoor: false,
      grill: false,
      wifi: false,
      equipment_rental: false,
    }
    let locationReference = ''

    if (tenant.description) {
      try {
        const parsed = JSON.parse(tenant.description)
        if (parsed.opening_time || parsed.closing_time) {
          schedule = {
            opening_time: parsed.opening_time || DEFAULT_CLUB_SCHEDULE.opening_time,
            closing_time: parsed.closing_time || DEFAULT_CLUB_SCHEDULE.closing_time,
          }
        }
        if (parsed.highlight_text && parsed.highlight_active !== false) {
          highlightText = parsed.highlight_text
          highlightBadge = parsed.highlight_badge || '🔥 Promoción Especial'
          isHighlightActive = true
        }
        if (parsed.social_links) {
          socialLinks = {
            instagram: parsed.social_links.instagram || undefined,
            facebook: parsed.social_links.facebook || undefined,
            tiktok: parsed.social_links.tiktok || undefined,
          }
        }
        if (parsed.services) {
          services = {
            parking: Boolean(parsed.services.parking),
            cantina: Boolean(parsed.services.cantina),
            showers: Boolean(parsed.services.showers),
            cameras: Boolean(parsed.services.cameras),
            lighting: Boolean(parsed.services.lighting),
            indoor: Boolean(parsed.services.indoor),
            grill: Boolean(parsed.services.grill),
            wifi: Boolean(parsed.services.wifi),
            equipment_rental: Boolean(parsed.services.equipment_rental),
          }
        }
        if (typeof parsed.location_reference === 'string') {
          locationReference = parsed.location_reference
        }
      } catch {}
    }

    if (!socialLinks && tenant.instagram_handle) {
      socialLinks = {
        instagram: tenant.instagram_handle,
      }
    }

    return {
      id: tenant.id,
      name: tenant.name || fallback.name,
      slug: tenant.slug || normalizedSlug,
      address: tenant.address || fallback.address,
      city: tenant.city || fallback.city,
      province: tenant.province || 'Argentina',
      exactAddress: tenant.address || fallback.address,
      addressReference: locationReference || undefined,
      googleMapsUrl: tenant.google_maps_url || undefined,
      phone: tenant.phone_whatsapp || fallback.phone,
      whatsappPhone: tenant.phone_whatsapp ? tenant.phone_whatsapp.replace(/\D/g, '') : fallback.whatsappPhone,
      sports: sports.length > 0 ? sports : [],
      courtsCount: courtsMapped.length,
      startingPrice,
      hasLighting: services.lighting ?? courtsMapped.some((c) => c.features.includes('Iluminación LED')),
      isIndoor: services.indoor ?? courtsMapped.some((c) => c.features.includes('Techada')),
      hasCantina: services.cantina ?? fallback.hasCantina,
      hasParking: services.parking ?? fallback.hasParking,
      hasShowers: Boolean(services.showers),
      hasCameras: Boolean(services.cameras),
      hasGrill: Boolean(services.grill),
      hasWifi: Boolean(services.wifi),
      hasEquipmentRental: Boolean(services.equipment_rental),
      services,
      rating: 5.0,
      reviewsCount: 0,
      availableToday: true,
      openHours: formatScheduleHours(schedule.opening_time, schedule.closing_time),
      schedule,
      courts: courtsMapped,
      priceRules: priceRulesMapped,
      bankDetails: (tenant.bank_alias || tenant.bank_cbu)
        ? {
            bankName: tenant.bank_name || 'Transferencia Bancaria',
            accountHolder: tenant.bank_account_holder || tenant.name,
            alias: tenant.bank_alias || '',
            cbu: tenant.bank_cbu || '',
          }
        : undefined,
      paymentMethods: hasMp ? ['TRANSFER', 'MERCADOPAGO'] : ['TRANSFER'],
      mpConnected: hasMp,
      subscriptionStatus: tenant.subscription_status || undefined,
      isActive: tenant.is_active !== false,
      highlightText,
      highlightBadge,
      isHighlightActive,
      socialLinks,
    }
  } catch (err) {
    console.error('[getClubPublicData] Exception:', err)
    return fallback
  }
}

export interface OccupiedSlotInfo {
  courtId: string
  courtName?: string
  time: string
  isWaitlistPriority?: boolean
  priorityExpiresAt?: string
}

/**
 * Consulta en tiempo real los turnos ya reservados para una fecha en un club.
 * Combina reservas en memoria (0ms), base de datos PostgreSQL y prioridades de lista de espera.
 */
export async function getClubOccupiedSlots(
  tenantId: string,
  dateIso: string
): Promise<OccupiedSlotInfo[]> {
  try {
    const occupied: OccupiedSlotInfo[] = []
    const seen = new Set<string>()

    const addSlot = (
      courtId: string,
      courtName: string | undefined,
      time: string,
      isWaitlistPriority = false,
      priorityExpiresAt?: string
    ) => {
      const key = `${courtId || ''}_${courtName || ''}_${time}`
      if (!seen.has(key)) {
        seen.add(key)
        occupied.push({ courtId, courtName, time, isWaitlistPriority, priorityExpiresAt })
      }
    }

    // 1. Verificar reservas en memoria (0ms, para reservas recién hechas o manuales)
    const inMemoryBookings = getVenueBookings(tenantId, dateIso)
    for (const b of inMemoryBookings) {
      if (!String(b.status).toUpperCase().includes('CANCEL')) {
        if (b.starts_at) {
          const startD = parseArgentinaDate(b.starts_at)
          const endD = b.ends_at ? parseArgentinaDate(b.ends_at) : new Date(startD.getTime() + 60 * 60 * 1000)
          if (!isNaN(startD.getTime())) {
            const cName = Array.isArray(b.courts) ? b.courts[0]?.name : b.courts?.name
            let curr = new Date(startD.getTime())
            const limit = !isNaN(endD.getTime()) && endD.getTime() > startD.getTime() ? endD.getTime() : startD.getTime() + 30 * 60 * 1000
            while (curr.getTime() < limit) {
              const timeStr = getArgentinaTimeStr(curr)
              addSlot(b.court_id, cName, timeStr)
              curr = new Date(curr.getTime() + 30 * 60 * 1000)
            }
          }
        }
      }
    }

    // 2. Consultar PostgreSQL en Supabase si tenantId es un UUID válido
    if (tenantId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      const supabase = await createServiceClient()
      const startOfDay = new Date(`${dateIso}T00:00:00-03:00`).toISOString()
      const endOfDay = new Date(`${dateIso}T23:59:59-03:00`).toISOString()

      const { data: dbBookings } = await supabase
        .from('bookings')
        .select('court_id, booked_at, status, courts(id, name)')
        .eq('tenant_id', tenantId)
        .filter('booked_at', 'ov', `[${startOfDay},${endOfDay}]`)
        .not('status', 'in', '("cancelled")')

      if (dbBookings && dbBookings.length > 0) {
        for (const b of dbBookings) {
          if (b.booked_at) {
            const match = b.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
            if (match && match[1]) {
              const startDate = parseArgentinaDate(match[1])
              const endDate = match[2] ? parseArgentinaDate(match[2]) : new Date(startDate.getTime() + 60 * 60 * 1000)
              if (!isNaN(startDate.getTime())) {
                const courtObj = Array.isArray(b.courts) ? b.courts[0] : b.courts
                const courtName = (courtObj as { name?: string } | null)?.name
                let curr = new Date(startDate.getTime())
                const limit = !isNaN(endDate.getTime()) && endDate.getTime() > startDate.getTime() ? endDate.getTime() : startDate.getTime() + 30 * 60 * 1000
                while (curr.getTime() < limit) {
                  const timeStr = getArgentinaTimeStr(curr)
                  addSlot(b.court_id, courtName, timeStr)
                  curr = new Date(curr.getTime() + 30 * 60 * 1000)
                }
              }
            }
          }
        }
      }

      // 3. Consultar turnos con prioridad activa de Lista de Espera (10 min de exclusividad)
      const nowIso = new Date().toISOString()

      // Limpieza y auto-expiración no-bloqueante de prioridades vencidas
      try {
        await supabase
          .from('waitlists')
          .update({ status: 'EXPIRED' })
          .eq('tenant_id', tenantId)
          .eq('date', dateIso)
          .eq('status', 'NOTIFIED')
          .lte('priority_expires_at', nowIso)
      } catch {
        // Silencioso en caso de contingencia
      }

      const { data: activeWl } = await supabase
        .from('waitlists')
        .select('id, court_id, time_slot, priority_expires_at')
        .eq('tenant_id', tenantId)
        .eq('date', dateIso)
        .eq('status', 'NOTIFIED')
        .gt('priority_expires_at', nowIso)

      if (activeWl && activeWl.length > 0) {
        for (const wl of activeWl) {
          addSlot(wl.court_id || 'any', undefined, wl.time_slot, true, wl.priority_expires_at)
        }
      }
    }

    return occupied
  } catch (err) {
    console.warn('[getClubOccupiedSlots] Error:', err)
    return []
  }
}

export async function getPublicClubs(): Promise<ClubData[]> {
  try {
    const supabase = await createServiceClient()
    const { data: tenants, error } = await supabase
      .from('tenants')
      .select(`
        id,
        name,
        slug,
        address,
        city,
        province,
        google_maps_url,
        phone_whatsapp,
        is_active,
        bank_alias,
        bank_cbu,
        bank_account_holder,
        bank_name,
        mp_access_token,
        payment_methods,
        subscription_status,
        description,
        instagram_handle
      `)
      .eq('is_active', true)

    if (error || !tenants) {
      if (error) console.warn('[getPublicClubs] error:', error.message)
      return []
    }

    const clubsList: ClubData[] = []

    for (const t of tenants) {
      const { data: courts } = await supabase
        .from('courts')
        .select('id, name, sport, slot_duration_minutes, surface, is_indoor, has_lights, is_active')
        .eq('tenant_id', t.id)
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      const { data: priceRules } = await supabase
        .from('price_rules')
        .select('id, court_id, name, day_of_week, time_from, time_to, price_cents, priority, is_active')
        .eq('tenant_id', t.id)
        .eq('is_active', true)
        .order('priority', { ascending: false })

      const priceRulesMapped: PriceRuleDefinition[] = (priceRules || []).map((r) => ({
        id: r.id,
        courtId: r.court_id,
        name: r.name,
        dayOfWeek: Array.isArray(r.day_of_week) && r.day_of_week.length > 0
          ? r.day_of_week.map((d: number) => d === 7 ? 0 : d)
          : [0, 1, 2, 3, 4, 5, 6],
        timeFrom: (r.time_from || '00:00:00').substring(0, 5),
        timeTo: (r.time_to?.startsWith('24:00') ? '00:00' : (r.time_to || '23:59:59').substring(0, 5)),
        priceArs: Math.round((Number(r.price_cents) || 2000000) / 100),
        depositPct: 50,
      }))

      const courtsMapped: CourtDefinition[] = (courts && courts.length > 0)
        ? courts.map((c) => {
            const courtRules = priceRulesMapped.filter((r) => !r.courtId || r.courtId === c.id)
            const pricePerHour = courtRules.length > 0
              ? Math.min(...courtRules.map((r) => r.priceArs))
              : 20000
            const rawSport = c.sport || 'PADEL'
            const features: string[] = []
            if (rawSport === 'FUTBOL11' || rawSport === 'FUTBOL_11') features.push('Fútbol 11')
            else if (rawSport === 'FUTBOL7' || rawSport === 'FUTBOL_7') features.push('Fútbol 7')
            else if (rawSport === 'FUTBOL5' || rawSport === 'FUTBOL_5') features.push('Fútbol 5')
            if (c.is_indoor) features.push('Techada')
            if (c.has_lights) features.push('Iluminación LED')
            if (c.surface) {
              const surfLabel = c.surface === 'PASTO_NATURAL' ? 'Pasto Natural' : c.surface === 'CESPED_SINTETICO' ? 'Césped Sintético' : c.surface === 'POLVO_LADRILLO' ? 'Polvo de Ladrillo' : c.surface === 'CRISTAL' ? 'Cristal' : c.surface
              features.push(surfLabel)
            }
            return {
              id: c.id,
              name: c.name,
              sport: normalizeToSportCategory(c.sport),
              specificSport: rawSport,
              features: features.length > 0 ? features : ['Césped Sintético'],
              pricePerHour,
              depositPercentage: 0.5,
              slotDurationMinutes: c.slot_duration_minutes || (c.sport?.includes('FUTBOL') ? 60 : 90),
            }
          })
        : []

      const sports = Array.from(new Set(courtsMapped.map((c) => normalizeToSportCategory(c.sport)))) as SportCategory[]
      const startingPrice = priceRulesMapped.length > 0
        ? Math.min(...priceRulesMapped.map((r) => r.priceArs))
        : (courtsMapped[0]?.pricePerHour || 20000)

      let schedule: ClubScheduleConfig = DEFAULT_CLUB_SCHEDULE
      let highlightText: string | undefined = undefined
      let highlightBadge: string | undefined = undefined
      let isHighlightActive: boolean | undefined = undefined
      let socialLinks: ClubSocialLinks | undefined = undefined
      let services: ClubServicesConfig = {
        parking: false,
        cantina: false,
        showers: false,
        cameras: false,
        lighting: false,
        indoor: false,
        grill: false,
        wifi: false,
        equipment_rental: false,
      }
      let locationReference = ''

      if (t.description) {
        try {
          const parsed = JSON.parse(t.description)
          if (parsed.opening_time || parsed.closing_time) {
            schedule = {
              opening_time: parsed.opening_time || DEFAULT_CLUB_SCHEDULE.opening_time,
              closing_time: parsed.closing_time || DEFAULT_CLUB_SCHEDULE.closing_time,
            }
          }
          if (parsed.highlight_text && parsed.highlight_active !== false) {
            highlightText = parsed.highlight_text
            highlightBadge = parsed.highlight_badge || '🔥 Promoción Especial'
            isHighlightActive = true
          }
          if (parsed.social_links) {
            socialLinks = {
              instagram: parsed.social_links.instagram || undefined,
              facebook: parsed.social_links.facebook || undefined,
              tiktok: parsed.social_links.tiktok || undefined,
            }
          }
          if (parsed.services) {
            services = {
              parking: Boolean(parsed.services.parking),
              cantina: Boolean(parsed.services.cantina),
              showers: Boolean(parsed.services.showers),
              cameras: Boolean(parsed.services.cameras),
              lighting: Boolean(parsed.services.lighting),
              indoor: Boolean(parsed.services.indoor),
              grill: Boolean(parsed.services.grill),
              wifi: Boolean(parsed.services.wifi),
              equipment_rental: Boolean(parsed.services.equipment_rental),
            }
          }
          if (typeof parsed.location_reference === 'string') {
            locationReference = parsed.location_reference
          }
        } catch {}
      }

      if (!socialLinks && t.instagram_handle) {
        socialLinks = {
          instagram: t.instagram_handle,
        }
      }

      clubsList.push({
        id: t.id,
        name: t.name || 'Club Deportivo',
        slug: t.slug || t.id,
        address: t.address || 'Argentina',
        city: t.city || 'Argentina',
        province: t.province || 'Argentina',
        exactAddress: t.address || 'Argentina',
        addressReference: locationReference || undefined,
        googleMapsUrl: t.google_maps_url || undefined,
        phone: t.phone_whatsapp || '',
        whatsappPhone: t.phone_whatsapp ? t.phone_whatsapp.replace(/\D/g, '') : '',
        sports: sports.length > 0 ? sports : ['PADEL'],
        courtsCount: courtsMapped.length,
        startingPrice: courtsMapped.length > 0 ? startingPrice : 0,
        hasLighting: services.lighting ?? courtsMapped.some((c) => c.features.includes('Iluminación LED')),
        isIndoor: services.indoor ?? courtsMapped.some((c) => c.features.includes('Techada')),
        hasCantina: Boolean(services.cantina),
        hasParking: Boolean(services.parking),
        hasShowers: Boolean(services.showers),
        hasCameras: Boolean(services.cameras),
        hasGrill: Boolean(services.grill),
        hasWifi: Boolean(services.wifi),
        hasEquipmentRental: Boolean(services.equipment_rental),
        services,
        rating: 5.0,
        reviewsCount: 0,
        availableToday: true,
        openHours: formatScheduleHours(schedule.opening_time, schedule.closing_time),
        schedule,
        courts: courtsMapped,
        priceRules: priceRulesMapped,
        bankDetails: t.bank_alias
          ? {
              bankName: t.bank_name || 'Mercado Pago',
              accountHolder: t.bank_account_holder || t.name,
              alias: t.bank_alias,
              cbu: t.bank_cbu || '',
            }
          : undefined,
        paymentMethods: t.mp_access_token ? ['TRANSFER', 'MERCADOPAGO'] : ['TRANSFER'],
        mpConnected: Boolean(t.mp_access_token),
        highlightText,
        highlightBadge,
        isHighlightActive,
        socialLinks,
      })
    }

    return clubsList
  } catch (err) {
    console.error('[getPublicClubs] Exception:', err)
    return []
  }
}

// ─── ANALÍTICA AVANZADA Y MÉTRICAS REALES DE NEGOCIO ─────────────────────────

export interface ClubAnalyticsData {
  totalRevenue: number
  courtsRevenue: number
  cantinaRevenue: number
  revenueGrowthPct: number
  avgTicket: number
  occupancyPrimePct: number
  noShowsProtected: number
  bookingsCount: number
  courts: Array<{
    name: string
    sport: string
    occupancy: number
    revenue: number
  }>
  occupancyHeatmap: number[][]
  topPlayers: Array<{
    name: string
    bookingsCount: number
    totalSpent: number
  }>
}

const HEATMAP_HOUR_BUCKETS = [8, 10, 12, 14, 16, 18, 19.5, 21, 22.5]

export async function getClubAnalytics(tenantId: string | null | undefined): Promise<ClubAnalyticsData> {
  const defaultEmpty: ClubAnalyticsData = {
    totalRevenue: 0,
    courtsRevenue: 0,
    cantinaRevenue: 0,
    revenueGrowthPct: 0,
    avgTicket: 0,
    occupancyPrimePct: 0,
    noShowsProtected: 0,
    bookingsCount: 0,
    courts: [],
    occupancyHeatmap: Array.from({ length: 7 }, () => Array(9).fill(0)),
    topPlayers: []
  }

  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) return defaultEmpty

    const supabase = await createServiceClient()

    // 1. Obtener canchas activas
    const { data: dbCourts } = await supabase
      .from('courts')
      .select('id, name, sport')
      .eq('tenant_id', effectiveTenantId)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    const courtsList = dbCourts || []

    // 2. Traer reservas de los últimos 60 días (para comparar con mes anterior)
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString()
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000).toISOString()

    const { data: rawBookings } = await supabase
      .from('bookings')
      .select('id, court_id, customer_name, customer_phone, customer_email, booked_at, status, price_total_cents, deposit_cents, created_at')
      .eq('tenant_id', effectiveTenantId)
      .gte('created_at', sixtyDaysAgo)

    const allBookings = rawBookings || []

    // 3. Separar por períodos (actuales 30 días vs anteriores 30 días)
    const currentPeriodBookings = allBookings.filter(b => {
      const dateStr = b.created_at || (b.booked_at ? b.booked_at.slice(2, 22) : '')
      return dateStr >= thirtyDaysAgo
    })

    const prevPeriodBookings = allBookings.filter(b => {
      const dateStr = b.created_at || (b.booked_at ? b.booked_at.slice(2, 22) : '')
      return dateStr >= sixtyDaysAgo && dateStr < thirtyDaysAgo
    })

    // 4. Calcular ingresos de canchas del período actual
    const activeCurrentBookings = currentPeriodBookings.filter(b => {
      const st = String(b.status || '').toLowerCase()
      return !st.includes('cancel')
    })

    const courtsRevenue = activeCurrentBookings.reduce((sum, b) => {
      const val = (b.price_total_cents || 0) / 100
      return sum + val
    }, 0)

    const bookingsCount = activeCurrentBookings.length
    const avgTicket = bookingsCount > 0 ? Math.round(courtsRevenue / bookingsCount) : 0

    // Comparación mes anterior
    const activePrevBookings = prevPeriodBookings.filter(b => {
      const st = String(b.status || '').toLowerCase()
      return !st.includes('cancel')
    })
    const prevCourtsRevenue = activePrevBookings.reduce((sum, b) => sum + ((b.price_total_cents || 0) / 100), 0)
    const revenueGrowthPct = prevCourtsRevenue > 0
      ? Math.round(((courtsRevenue - prevCourtsRevenue) / prevCourtsRevenue) * 100)
      : (courtsRevenue > 0 ? 100 : 0)

    // Señas retenidas por no-shows o cancelaciones
    const noShowsProtected = currentPeriodBookings
      .filter(b => {
        const st = String(b.status || '').toLowerCase()
        return st.includes('cancel') || st.includes('no_show')
      })
      .reduce((sum, b) => sum + ((b.deposit_cents || 0) / 100), 0)

    // 5. Estadísticas de Cantina
    let cantinaRevenue = 0
    try {
      const { getCantinaStats } = await import('./cantina.actions')
      const cantinaStats = await getCantinaStats(effectiveTenantId)
      cantinaRevenue = cantinaStats.totalRevenue || 0
    } catch (cantinaErr) {
      console.warn('[getClubAnalytics] Cantina stats unavailable:', cantinaErr)
    }

    const totalRevenue = courtsRevenue + cantinaRevenue

    // 6. Matriz Heatmap de Ocupación (7 días x 9 horas)
    const heatmapCounts = Array.from({ length: 7 }, () => Array(9).fill(0))
    let primeSlotsBooked = 0

    for (const b of activeCurrentBookings) {
      let startTimeStr = ''
      if (b.booked_at) {
        const match = b.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
        if (match) startTimeStr = match[1]
      }
      if (!startTimeStr && b.created_at) startTimeStr = b.created_at

      if (startTimeStr) {
        try {
          const d = new Date(startTimeStr.includes(' ') ? startTimeStr.replace(' ', 'T') : startTimeStr)
          if (!isNaN(d.getTime())) {
            // Día de la semana (0 = Lunes, ..., 6 = Domingo)
            const jsDay = d.getDay() // 0 = Domingo, 1 = Lunes
            const dayIdx = (jsDay + 6) % 7

            // Hora aproximada
            const hoursDecimal = d.getHours() + d.getMinutes() / 60

            // Buscar bucket más cercano
            let bestBucketIdx = 0
            let minDiff = 999
            for (let i = 0; i < HEATMAP_HOUR_BUCKETS.length; i++) {
              const diff = Math.abs(hoursDecimal - HEATMAP_HOUR_BUCKETS[i])
              if (diff < minDiff) {
                minDiff = diff
                bestBucketIdx = i
              }
            }

            heatmapCounts[dayIdx][bestBucketIdx]++

            // Horario prime: de 18:00 a 00:00 (índices 5, 6, 7, 8)
            if (bestBucketIdx >= 5) {
              primeSlotsBooked++
            }
          }
        } catch {}
      }
    }

    const courtsCount = Math.max(1, courtsList.length)
    // En 30 días, cada día de la semana ocurre aproximadamente 4.3 veces
    const maxCapacityPerSlot = 4.3 * courtsCount

    const occupancyHeatmap = heatmapCounts.map(row => 
      row.map(count => Math.min(100, Math.round((count / maxCapacityPerSlot) * 100)))
    )

    // Ocupación prime estimada
    // 4 slots prime x 30 días = 120 slots prime por cancha en el mes
    const totalPossiblePrimeSlots = courtsCount * 120
    const occupancyPrimePct = totalPossiblePrimeSlots > 0 
      ? Math.min(100, Math.round((primeSlotsBooked / totalPossiblePrimeSlots) * 100))
      : 0

    // 7. Rendimiento por Cancha
    const courtsBreakdown = courtsList.map(court => {
      const courtBookings = activeCurrentBookings.filter(b => b.court_id === court.id)
      const courtRevenue = courtBookings.reduce((sum, b) => sum + ((b.price_total_cents || 0) / 100), 0)
      // 30 días x aprox 10 turnos disponibles por día = 300 slots mensuales
      const courtOccupancy = Math.min(100, Math.round((courtBookings.length / 300) * 100))
      const sportLabel = court.sport?.startsWith('FUTBOL') 
        ? 'Fútbol' 
        : court.sport === 'PADEL' ? 'Pádel' : court.sport === 'TENIS' ? 'Tenis' : (court.sport || 'Fútbol')

      return {
        name: court.name,
        sport: sportLabel,
        occupancy: courtOccupancy,
        revenue: courtRevenue
      }
    })

    // 8. Ranking de Jugadores Frecuentes
    const playersMap = new Map<string, { name: string; count: number; spent: number }>()
    for (const b of activeCurrentBookings) {
      const key = (b.customer_phone || b.customer_email || b.customer_name || 'Desconocido').trim()
      const current = playersMap.get(key) || { 
        name: b.customer_name || 'Jugador', 
        count: 0, 
        spent: 0 
      }
      current.count += 1
      current.spent += (b.price_total_cents || 0) / 100
      playersMap.set(key, current)
    }

    const topPlayers = Array.from(playersMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(p => ({
        name: p.name,
        bookingsCount: p.count,
        totalSpent: p.spent
      }))

    return {
      totalRevenue,
      courtsRevenue,
      cantinaRevenue,
      revenueGrowthPct,
      avgTicket,
      occupancyPrimePct,
      noShowsProtected,
      bookingsCount,
      courts: courtsBreakdown,
      occupancyHeatmap,
      topPlayers
    }
  } catch (err) {
    console.error('[getClubAnalytics] Error:', err)
    return defaultEmpty
  }
}



