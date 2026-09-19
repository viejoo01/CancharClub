'use server'
// src/actions/booking.actions.ts
// ==============================================================================
// SERVER ACTIONS — Lógica de reservas con control de concurrencia Redis + PG
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import {
  buildLockKey,
  acquireBookingLock,
  releaseBookingLock,
} from '@/lib/redis'
import {
  computeEndsAt,
  parseArgentinaDate,
} from '@/lib/utils'
import type {
  CreateBookingPayload,
  CheckoutResponse,
  TenantSubscriptionStatus,
} from '@/types/database'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { processWaitlistOnCancellation } from './waitlist.actions'
import { addVenueBooking, getVenueBookings } from '@/config/venues-data'
import { assertTenantMember } from '@/lib/auth-security'

function isValidUuid(id?: string | null): boolean {
  return Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
}

async function resolveCourtUuid(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  tenantId: string,
  courtId?: string | null,
  courtName?: string | null
): Promise<string> {
  if (courtId && isValidUuid(courtId)) {
    return courtId
  }
  if (tenantId && isValidUuid(tenantId)) {
    if (courtName) {
      const { data: court } = await supabase
        .from('courts')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('name', `%${courtName.trim()}%`)
        .limit(1)
        .maybeSingle()
      if (court?.id) return court.id
    }
    const { data: firstCourt } = await supabase
      .from('courts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (firstCourt?.id) return firstCourt.id
  }
  return crypto.randomUUID()
}

// ─── ACTION: Iniciar checkout online (adquirir lock + crear booking + preferencia MP) ─

export async function initiateOnlineCheckout(
  payload: CreateBookingPayload,
  courtSlotDuration: 'MIN_60' | 'MIN_90' | 'MIN_120'
): Promise<CheckoutResponse> {
  try {
    // 0. VERIFICACIÓN DE DUNNING (Suspensión Progresiva del Club)
    //    Si el club está en PARTIALLY_SUSPENDED o LOCKED, rechazar reservas web
    const cookieStore = await cookies()
    const demoStatus = cookieStore.get('demo_subscription_status')?.value as TenantSubscriptionStatus | undefined

    const supabaseCheck = await createServiceClient()
    const { data: tenantCheck } = await supabaseCheck
      .from('tenants')
      .select('subscription_status, name, is_active')
      .eq('id', payload.tenant_id)
      .maybeSingle()

    if (tenantCheck?.is_active === false) {
      return {
        success: false,
        error: 'Este club se encuentra en proceso de activación por el administrador.',
        error_code: 'CLUB_PENDING_ACTIVATION',
      }
    }

    const effectiveStatus: TenantSubscriptionStatus = demoStatus || tenantCheck?.subscription_status || 'ACTIVE'

    if (effectiveStatus === 'PARTIALLY_SUSPENDED' || effectiveStatus === 'LOCKED') {
      return {
        success: false,
        error: 'Las reservas online para este club están momentáneamente en pausa. Por favor contactá al club directamente por WhatsApp para reservar.',
        error_code: 'CLUB_SUSPENDED_DUNNING',
      }
    }

    // 0.1 VERIFICACIÓN DE HORARIO PASADO (El turno debe ser posterior a la hora actual)
    const slotStartDate = parseArgentinaDate(payload.starts_at)
    const slotStartTime = slotStartDate.getTime()
    if (!isNaN(slotStartTime) && slotStartTime <= Date.now() - 60_000) {
      return {
        success: false,
        error: 'El horario seleccionado ya ha pasado. Por favor elegí un turno disponible posterior a la hora actual.',
        error_code: 'SLOT_IN_PAST',
      }
    }

    // 1. Calcular ends_at desde starts_at + duración con zona horaria normalizada
    const endsAt = computeEndsAt(payload.starts_at, courtSlotDuration)
    const startsAtIso = slotStartDate.toISOString()
    const endsAtIso = parseArgentinaDate(endsAt).toISOString()
    const lockKey = buildLockKey(payload.court_id, payload.starts_at)
    const bookingId = crypto.randomUUID()

    // 2. ADQUIRIR LOCK EN REDIS + MEMORIA (atómico: SET NX PX)
    //    Si falla → slot ya tomado por otro checkout simultáneo
    const lockAcquired = await acquireBookingLock(lockKey, bookingId)
    if (!lockAcquired) {
      return {
        success: false,
        error: 'Este turno ya está siendo reservado por otro jugador. Intentá nuevamente en unos minutos.',
        error_code: 'LOCK_FAILED',
      }
    }

    // 2.1 PRE-VERIFICACIÓN DE DISPONIBILIDAD (evita colisiones simultáneas)
    const dayStr = startsAtIso.split('T')[0]
    const memoryBookings = getVenueBookings(payload.tenant_id, dayStr)
    const isAlreadyBookedInMemory = memoryBookings.some((b) => {
      const cName = Array.isArray(b.courts) ? b.courts[0]?.name : b.courts?.name
      const matchCourt = b.court_id === payload.court_id || (payload.court_name && cName?.toLowerCase() === payload.court_name.toLowerCase())
      return matchCourt && b.starts_at === startsAtIso && !String(b.status).toUpperCase().includes('CANCEL')
    })
    if (isAlreadyBookedInMemory) {
      await releaseBookingLock(lockKey, bookingId)
      return {
        success: false,
        error: 'Este turno ya ha sido reservado por otro jugador. Por favor elegí otro horario disponible.',
        error_code: 'SLOT_UNAVAILABLE',
      }
    }

    // 3. REGISTRAR BOOKING en PostgreSQL con status='confirmed' (cierre 24hs automático del turno)
    const supabase = await createServiceClient()
    const bookingRange = `[${startsAtIso},${endsAtIso})`

    const effectiveTenantId = (payload.tenant_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.tenant_id))
      ? payload.tenant_id
      : '00000000-0000-0000-0000-000000000001'

    const effectiveCourtId = await resolveCourtUuid(supabase, effectiveTenantId, payload.court_id, payload.court_name)

    let sportEnum: 'PADEL' | 'FUTBOL5' | 'FUTBOL7' | 'TENIS' = 'PADEL'
    if (effectiveCourtId) {
      const { data: courtRow } = await supabase.from('courts').select('sport').eq('id', effectiveCourtId).maybeSingle()
      if (courtRow?.sport) {
        sportEnum = courtRow.sport as 'PADEL' | 'FUTBOL5' | 'FUTBOL7' | 'TENIS'
      } else if (payload.court_name?.toLowerCase().includes('7')) {
        sportEnum = 'FUTBOL7'
      } else if (payload.court_name?.toLowerCase().includes('fútbol') || payload.court_name?.toLowerCase().includes('futbol') || payload.internal_notes?.toLowerCase().includes('futbol')) {
        sportEnum = 'FUTBOL5'
      } else if (payload.court_name?.toLowerCase().includes('tenis') || payload.court_name?.toLowerCase().includes('tennis')) {
        sportEnum = 'TENIS'
      }
    }

    // Automatización 24hs: Cuando el jugador pulsa "Confirmar Seña", el turno queda cerrado y reservado automáticamente en el sistema
    const isTransfer = payload.payment_method === 'TRANSFER' || !payload.payment_method
    const isFullyCovered = payload.deposit_amount_ars === 0
    const initialStatus = (isTransfer || isFullyCovered) ? 'confirmed' : 'pending_deposit'
    const noteText = `Reserva Online 24hs - Seña: $${payload.deposit_amount_ars} (${payload.payment_method || 'TRANSFER'}) - ${payload.customer_notes || ''}`.trim()

    let dbInsertSuccess = false

    const { error: insertError } = await supabase
      .from('bookings')
      .insert({
        id: bookingId,
        tenant_id: effectiveTenantId,
        court_id: effectiveCourtId,
        booked_at: bookingRange,
        status: initialStatus,
        sport: sportEnum,
        price_total_cents: Math.round(payload.total_amount_ars * 100),
        deposit_cents: Math.round(payload.deposit_amount_ars * 100),
        payment_method: payload.payment_method === 'MERCADOPAGO' ? 'mercadopago' : 'bank_transfer',
        customer_name: payload.customer_name,
        customer_phone: payload.customer_phone,
        customer_email: payload.customer_email || null,
        staff_notes: noteText,
        redis_lock_key: lockKey,
        lock_expires_at: new Date(Date.now() + 420_000).toISOString(),
      })

    if (insertError) {
      const isExclusionConflict =
        insertError.code === '23P01' ||
        insertError.message?.toLowerCase().includes('exclusion') ||
        insertError.message?.toLowerCase().includes('overlap') ||
        insertError.message?.toLowerCase().includes('solapamiento')

      if (isExclusionConflict) {
        await releaseBookingLock(lockKey, bookingId)
        return {
          success: false,
          error: 'Este turno ya no está disponible. Por favor elegí otro horario.',
          error_code: 'SLOT_UNAVAILABLE',
        }
      }
      console.warn('[initiateOnlineCheckout] DB insert notice (continuing):', insertError.message)
    } else {
      dbInsertSuccess = true
    }

    // Registrar también en memoria para respuesta instantánea (0ms) en la grilla
    addVenueBooking({
      id: bookingId,
      court_id: effectiveCourtId,
      customer_name: payload.customer_name,
      customer_phone: payload.customer_phone,
      customer_email: payload.customer_email,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      status: 'CONFIRMED',
      origin: 'ONLINE_PORTAL',
      total_amount_ars: payload.total_amount_ars,
      deposit_amount_ars: payload.deposit_amount_ars,
      total_paid: payload.deposit_amount_ars,
      balance_due: Math.max(0, payload.total_amount_ars - payload.deposit_amount_ars),
      internal_notes: noteText,
      courts: {
        name: payload.court_name || 'Cancha',
        sport: (payload.court_name?.toLowerCase().includes('fútbol') || payload.internal_notes?.toLowerCase().includes('futbol')) ? 'FUTBOL' : 'PADEL',
        slot_duration: courtSlotDuration,
      },
    })

    // 4. OBTENER INFORMACIÓN DE COBRO DEL CLUB (TENANT)
    let tenant: {
      id?: string
      name?: string | null
      bank_name?: string | null
      bank_account_holder?: string | null
      bank_cbu?: string | null
      bank_alias?: string | null
      bank_cuit?: string | null
      phone_whatsapp?: string | null
      mp_access_token?: string | null
      payment_methods?: string[] | null
    } | null = null
    let court: { name?: string | null } | null = null

    if (isValidUuid(payload.tenant_id)) {
      const { data: t } = await supabase
        .from('tenants')
        .select('id, name, bank_name, bank_account_holder, bank_cbu, bank_alias, bank_cuit, phone_whatsapp, mp_access_token, payment_methods')
        .eq('id', payload.tenant_id)
        .maybeSingle()
      tenant = t
    }

    if (isValidUuid(payload.court_id)) {
      const { data: c } = await supabase
        .from('courts')
        .select('name')
        .eq('id', payload.court_id)
        .maybeSingle()
      court = c
    }

    const courtName = payload.court_name || court?.name || 'Cancha'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.cancharclub.com.ar'

    const bankDetails = {
      bank_name: tenant?.bank_name || 'Mercado Pago / Transferencia Bancaria',
      account_holder: tenant?.bank_account_holder || tenant?.name || 'Club Deportivo',
      cbu: tenant?.bank_cbu || '',
      alias: tenant?.bank_alias || '',
      cuit: tenant?.bank_cuit || '',
      whatsapp_phone: tenant?.phone_whatsapp || '',
    }

    // SI EL JUGADOR SELECCIONÓ MERCADO PAGO:
    if (payload.payment_method === 'MERCADOPAGO') {
      // SEGURIDAD: Solo se utiliza el token vinculado por el CLUB. NUNCA el del Superadmin.
      const mpToken = tenant?.mp_access_token

      if (!mpToken) {
        return {
          success: false,
          error: 'Este club aún no ha configurado su cuenta de Mercado Pago. Por favor aboná mediante Transferencia Bancaria al Alias del club.',
          error_code: 'MP_ERROR',
        }
      }

      if (mpToken.startsWith('TEST-0000000000000000')) {
        return {
          success: true,
          booking_id: bookingId,
          mp_preference_id: `sim_pref_${Date.now()}`,
          mp_init_point: undefined,
          payment_type: 'MERCADOPAGO',
          total_amount_ars: payload.total_amount_ars,
          deposit_amount_ars: payload.deposit_amount_ars,
          lock_expires_at: new Date(Date.now() + 420_000).toISOString(),
        }
      }

      try {
        const mpConfig = new MercadoPagoConfig({ accessToken: mpToken })
        const preferenceClient = new Preference(mpConfig)

        const preference = await preferenceClient.create({
          body: {
            items: [
              {
                id: bookingId,
                title: `Seña Turno ${courtName} - ${tenant?.name || 'Club'}`,
                quantity: 1,
                unit_price: payload.deposit_amount_ars,
                currency_id: 'ARS',
              },
            ],
            payer: {
              name: payload.customer_name,
              email: (payload.customer_email && payload.customer_email.includes('@'))
                ? payload.customer_email
                : undefined,
            },
            external_reference: bookingId,
            back_urls: {
              success: `${appUrl}/reserva/${bookingId}/confirmado`,
              failure: `${appUrl}/reserva/${bookingId}/error`,
              pending: `${appUrl}/reserva/${bookingId}/pendiente`,
            },
            auto_return: 'approved',
            notification_url: `${appUrl}/api/webhooks/mercadopago`,
            statement_descriptor: 'CANCHA SEÑA',
            expires: true,
            expiration_date_from: new Date().toISOString(),
            expiration_date_to: new Date(Date.now() + 420_000).toISOString(),
          }
        })

        const mpPreferenceId = preference.id
        const mpInitPoint = preference.init_point || preference.sandbox_init_point || undefined

        if (dbInsertSuccess) {
          await supabase
            .from('bookings')
            .update({
              status: 'pending_deposit',
              staff_notes: noteText ? `${noteText} | [MP Pref: ${mpPreferenceId}]` : `[MP Pref: ${mpPreferenceId}]`,
            })
            .eq('id', bookingId)
        }

        return {
          success: true,
          booking_id: bookingId,
          mp_preference_id: mpPreferenceId,
          mp_init_point: mpInitPoint,
          payment_type: 'MERCADOPAGO',
          total_amount_ars: payload.total_amount_ars,
          deposit_amount_ars: payload.deposit_amount_ars,
          lock_expires_at: new Date(Date.now() + 420_000).toISOString(),
        }
      } catch (mpErr: unknown) {
        console.error('[initiateOnlineCheckout] Error creating MP preference:', mpErr)
        await releaseBookingLock(lockKey, bookingId)
        return {
          success: false,
          error: 'No se pudo conectar con Mercado Pago del club. Por favor intentá nuevamente o aboná por transferencia.',
          error_code: 'MP_ERROR',
        }
      }
    }

    // FLUJO POR DEFECTO: TRANSFERENCIA BANCARIA DIRECTA A LA CUENTA DEL CLUB
    // Automatización 24hs: El turno ya quedó bloqueado e impactado en la grilla oficial
    revalidatePath('/dashboard')

    return {
      success: true,
      booking_id: bookingId,
      payment_type: 'TRANSFER',
      bank_details: bankDetails,
      total_amount_ars: payload.total_amount_ars,
      deposit_amount_ars: payload.deposit_amount_ars,
      lock_expires_at: new Date(Date.now() + 420_000).toISOString(),
    }
  } catch (error) {
    console.error('[initiateOnlineCheckout] Error:', error)
    return {
      success: false,
      error: 'Error interno del servidor. Por favor intentá nuevamente.',
    }
  }
}

// ─── ACTION: Confirmación y Validación de Seña por Transferencia (24hs) ───────

export async function confirmTransferPaymentAction(
  bookingId: string,
  referenceNumber?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const ref = referenceNumber ? ` - Ref Transferencia #${referenceNumber}` : ''
    await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        paid_at: new Date().toISOString(),
        staff_notes: `Transferencia acreditada/confirmada 24hs${ref}`,
      })
      .eq('id', bookingId)

    revalidatePath('/dashboard')
    return { success: true }
  } catch (err: unknown) {
    console.error('[confirmTransferPaymentAction] Error:', err)
    return { success: false, error: 'Error al confirmar comprobante' }
  }
}

// ─── ACTION: Carga manual de turno (desde panel admin) ───────────────────────

export async function createManualBooking(
  payload: CreateBookingPayload & { tenant_id: string }
): Promise<{ success: boolean; booking_id?: string; error?: string }> {
  try {
    const supabase = await createServiceClient()

    // 1. Verificación de Seguridad Anti-IDOR: Solo miembros autorizados del club
    const authCheck = await assertTenantMember(payload.tenant_id)
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error || 'Sin permisos para cargar reservas en este club' }
    }

    // Obtener detalles de la cancha (deporte y duración de slot)
    const { data: court, error: courtErr } = await supabase
      .from('courts')
      .select('id, sport, slot_duration_minutes')
      .eq('id', payload.court_id)
      .single()

    if (courtErr || !court) {
      return { success: false, error: 'Cancha no encontrada o inactiva' }
    }

    const durationMinutes = court.slot_duration_minutes || 90
    const startsAtDate = parseArgentinaDate(payload.starts_at)
    const endsAtDate = new Date(startsAtDate.getTime() + durationMinutes * 60000)
    const bookingRange = `[${startsAtDate.toISOString()},${endsAtDate.toISOString()})`

    // 1.1 Prevenir colisión simultánea con reservas en memoria o checkouts online activos
    const dayStr = startsAtDate.toISOString().split('T')[0]
    const memoryBookings = getVenueBookings(payload.tenant_id, dayStr)
    const isAlreadyBookedInMemory = memoryBookings.some((b) => {
      const matchCourt = b.court_id === payload.court_id
      return matchCourt && b.starts_at === startsAtDate.toISOString() && !String(b.status).toUpperCase().includes('CANCEL')
    })
    if (isAlreadyBookedInMemory) {
      return {
        success: false,
        error: 'Este turno ya ha sido reservado en el sistema.',
      }
    }

    const priceTotalCents = Math.round(Number(payload.total_amount_ars || 0) * 100)
    const depositCents = Math.round(Number(payload.deposit_amount_ars || 0) * 100)
    const isFullCash = depositCents >= priceTotalCents && priceTotalCents > 0
    const initialStatus = isFullCash ? 'confirmed_cash' : 'confirmed'

    const noteParts = []
    if (payload.internal_notes) noteParts.push(payload.internal_notes)
    if (payload.customer_notes) noteParts.push(`Nota cliente: ${payload.customer_notes}`)
    const staffNotes = noteParts.join(' | ') || null

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        tenant_id: payload.tenant_id,
        court_id: payload.court_id,
        booked_at: bookingRange,
        status: initialStatus,
        sport: court.sport || 'PADEL',
        price_total_cents: priceTotalCents,
        deposit_cents: depositCents,
        staff_deposit_amount_cents: depositCents,
        payment_method: 'cash',
        paid_at: depositCents > 0 ? new Date().toISOString() : null,
        customer_name: payload.customer_name?.trim() || 'Cliente Mostrador',
        customer_phone: payload.customer_phone?.trim() || null,
        customer_email: payload.customer_email?.trim() || null,
        staff_notes: staffNotes,
        created_by_staff_id: authCheck.user?.id || null,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23P01') {
        return { success: false, error: 'Ya existe un turno reservado en ese horario para esta cancha.' }
      }
      console.error('[createManualBooking] DB insert error:', error.message)
      return { success: false, error: error.message }
    }

    // Sincronizar en memoria para reflejo instantáneo (0ms) en el portal de jugadores
    addVenueBooking({
      id: booking.id,
      court_id: payload.court_id,
      customer_name: payload.customer_name?.trim() || 'Cliente Mostrador',
      customer_phone: payload.customer_phone?.trim() || null,
      customer_email: payload.customer_email?.trim() || null,
      starts_at: startsAtDate.toISOString(),
      ends_at: endsAtDate.toISOString(),
      status: 'CONFIRMED',
      origin: 'STAFF_MANUAL',
      total_amount_ars: Number(payload.total_amount_ars || 0),
      deposit_amount_ars: Number(payload.deposit_amount_ars || 0),
      total_paid: Number(payload.deposit_amount_ars || 0),
      balance_due: Math.max(0, Number(payload.total_amount_ars || 0) - Number(payload.deposit_amount_ars || 0)),
      internal_notes: staffNotes || 'Reserva manual mostrador',
      courts: {
        name: payload.court_name || 'Cancha',
        sport: court.sport || 'PADEL',
        slot_duration: durationMinutes === 60 ? 'MIN_60' : 'MIN_90',
      },
    })

    revalidatePath('/dashboard')
    return { success: true, booking_id: booking.id }

  } catch (error) {
    console.error('[createManualBooking] Exception:', error)
    return { success: false, error: 'Error interno del servidor al registrar reserva' }
  }
}

// ─── ACTION: Registrar pago en caja (efectivo / transferencia) ───────────────

export async function registerCashPayment(params: {
  booking_id: string
  amount_ars: number
  payment_method: 'CASH' | 'TRANSFER' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'QR_MP' | 'OTHER'
  reference_number?: string
  notes?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('id, tenant_id, price_total_cents, deposit_cents, staff_notes, status')
      .eq('id', params.booking_id)
      .single()

    if (bErr || !booking) return { success: false, error: 'Reserva no encontrada' }

    const authCheck = await assertTenantMember(booking.tenant_id)
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error || 'Sin permisos para registrar cobros en este club' }
    }

    const amountCents = Math.round(params.amount_ars * 100)
    const currentDeposit = Number(booking.deposit_cents) || 0
    const newDepositCents = currentDeposit + amountCents
    const totalPriceCents = Number(booking.price_total_cents) || 0

    const methodStr = String(params.payment_method)
    const methodEnum = methodStr === 'TRANSFER' ? 'bank_transfer'
      : (methodStr === 'MERCADOPAGO' || methodStr === 'QR_MP') ? 'mercadopago'
      : 'cash'

    const isFullyPaid = newDepositCents >= totalPriceCents
    const newStatus = isFullyPaid ? 'confirmed_cash' : 'confirmed'

    const noteEntry = `Cobro $${params.amount_ars} (${params.payment_method})${params.notes ? ` - ${params.notes}` : ''}`
    const updatedNotes = booking.staff_notes ? `${booking.staff_notes} | ${noteEntry}` : noteEntry

    const { error: upErr } = await supabase
      .from('bookings')
      .update({
        deposit_cents: newDepositCents,
        staff_deposit_amount_cents: newDepositCents,
        payment_method: methodEnum,
        paid_at: new Date().toISOString(),
        status: newStatus,
        staff_notes: updatedNotes,
      })
      .eq('id', params.booking_id)

    if (upErr) {
      console.error('[registerCashPayment] Error updating booking payment:', upErr.message)
      return { success: false, error: upErr.message }
    }

    revalidatePath('/dashboard')
    return { success: true }
  } catch (error) {
    console.error('[registerCashPayment] Error:', error)
    return { success: false, error: 'Error interno del servidor al registrar pago' }
  }
}

// ─── ACTION: Cancelar reserva ─────────────────────────────────────────────────

export async function cancelBooking(params: {
  booking_id: string
  reason?: string
  cancelled_by: 'USER' | 'CLUB'
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('redis_lock_key, id, tenant_id, court_id, booked_at, staff_notes')
      .eq('id', params.booking_id)
      .single()

    if (bErr || !booking) return { success: false, error: 'Reserva no encontrada' }

    if (params.cancelled_by === 'CLUB') {
      const authCheck = await assertTenantMember(booking.tenant_id)
      if (!authCheck.authorized) {
        return { success: false, error: authCheck.error || 'Sin permisos para cancelar turnos en este club' }
      }
    }

    const cancellationNote = `Turno cancelado por ${params.cancelled_by === 'CLUB' ? 'el club' : 'el usuario'}: ${params.reason || 'Sin motivo especificado'}`
    const updatedNotes = booking.staff_notes ? `${booking.staff_notes} | ${cancellationNote}` : cancellationNote

    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        staff_notes: updatedNotes,
      })
      .eq('id', params.booking_id)

    if (error) {
      console.error('[cancelBooking] Error cancelling booking:', error.message)
      return { success: false, error: error.message }
    }

    // Si había un lock de Redis activo, liberarlo
    if (booking?.redis_lock_key) {
      await releaseBookingLock(booking.redis_lock_key, booking.id)
    }

    // Trigger de Lista de Espera si corresponde
    if (booking?.tenant_id && booking?.booked_at) {
      const match = booking.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
      if (match) {
        const startsAt = match[1]
        const bookingDate = new Date(startsAt).toISOString().split('T')[0]
        const d = new Date(startsAt)
        const hours = String(d.getHours()).padStart(2, '0')
        const minutes = String(d.getMinutes()).padStart(2, '0')
        const timeSlot = `${hours}:${minutes}`

        try {
          await processWaitlistOnCancellation({
            tenantId: booking.tenant_id,
            date: bookingDate,
            timeSlot,
          })
        } catch (err) {
          console.warn('[cancelBooking] Error al procesar lista de espera:', err)
        }
      }
    }

    revalidatePath('/dashboard')
    return { success: true }
  } catch (error) {
    console.error('[cancelBooking] Error:', error)
    return { success: false, error: 'Error interno del servidor al cancelar' }
  }
}

// ─── ACTION: Marcar No-Show / Inasistencia (Mejora 2C) ─────────────────────────

export async function markBookingNoShow(bookingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('id, tenant_id, staff_notes')
      .eq('id', bookingId)
      .single()

    if (bErr || !booking) return { success: false, error: 'Reserva no encontrada' }

    const authCheck = await assertTenantMember(booking.tenant_id)
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error || 'Sin permisos para modificar este turno' }
    }

    const noShowNote = 'Jugador no asistió al turno (Marcado como NO-SHOW)'
    const updatedNotes = booking.staff_notes ? `${booking.staff_notes} | ${noShowNote}` : noShowNote

    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'no_show',
        staff_notes: updatedNotes,
      })
      .eq('id', bookingId)

    if (error) {
      console.error('[markBookingNoShow] DB error:', error.message)
      return { success: false, error: error.message }
    }

    revalidatePath('/dashboard')
    return { success: true }
  } catch (error) {
    console.error('[markBookingNoShow] Error:', error)
    return { success: false, error: 'Error al marcar inasistencia' }
  }
}

// ─── ACTION: Consultar Historial y Reputación de Jugador (Mejora 2C) ───────────

export async function getPlayerReputation(phone?: string | null): Promise<{
  phone: string
  totalBookings: number
  completedBookings: number
  noShowCount: number
  reputationScore: number
  isHighRisk: boolean
}> {
  if (!phone) {
    return {
      phone: '',
      totalBookings: 0,
      completedBookings: 0,
      noShowCount: 0,
      reputationScore: 100,
      isHighRisk: false,
    }
  }

  try {
    const supabase = await createServiceClient()
    const { data: bookings } = await supabase
      .from('bookings')
      .select('status')
      .eq('customer_phone', phone)

    const list = bookings || []
    const totalBookings = list.length
    const noShowCount = list.filter(b => b.status === 'NO_SHOW').length
    const completedBookings = list.filter(b => ['COMPLETED', 'FULLY_PAID', 'CONFIRMED'].includes(b.status)).length

    const penalty = noShowCount * 30
    const reputationScore = Math.max(10, 100 - penalty)
    const isHighRisk = noShowCount >= 2

    return {
      phone,
      totalBookings,
      completedBookings,
      noShowCount,
      reputationScore,
      isHighRisk,
    }
  } catch {
    return {
      phone,
      totalBookings: 1,
      completedBookings: 1,
      noShowCount: 0,
      reputationScore: 100,
      isHighRisk: false,
    }
  }
}

// ─── ACTION: Consultar Estado de Reserva para Jugadores (Mis Reservas) ───────────

export interface PlayerBookingDetail {
  id: string
  code: string
  clubName: string
  clubAddress: string
  clubCity: string
  clubPhone: string
  courtName: string
  sport: string
  startsAt: string
  endsAt: string
  dateFormatted: string
  timeFormatted: string
  status: 'CONFIRMED' | 'PENDING' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW'
  totalAmount: number
  depositAmount: number
  balanceRemaining: number
  customerName: string
  customerEmail: string
  customerPhone: string
  createdAt: string
  receiptUrl: string
}

export async function lookupPlayerBookings(query: {
  code?: string
  email?: string
}): Promise<{
  success: boolean
  data?: PlayerBookingDetail[]
  error?: string
}> {
  const cleanCode = (query.code || '').trim().toUpperCase().replace(/^#/, '')
  const normalizedEmail = (query.email || '').trim().toLowerCase()

  if (!cleanCode && !normalizedEmail) {
    return { success: false, error: 'Por favor ingresá un código de reserva o un email.' }
  }

  try {
    const results: PlayerBookingDetail[] = []

    // 1. Intentar buscar en la base de datos Supabase
    try {
      const supabase = await createServiceClient()
      let dbQuery = supabase
        .from('bookings')
        .select(`
          id,
          tenant_id,
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
          created_at,
          tenants:tenant_id (
            name,
            address,
            city,
            phone_whatsapp
          ),
          courts:court_id (
            name,
            sport
          )
        `)

      if (cleanCode) {
        // Buscar por id exacto o coincidencia en staff_notes o teléfono
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanCode)
        if (isUUID) {
          dbQuery = dbQuery.eq('id', cleanCode.toLowerCase())
        } else {
          dbQuery = dbQuery.or(`id.ilike.%${cleanCode}%,staff_notes.ilike.%${cleanCode}%,customer_phone.ilike.%${cleanCode}%`)
        }
      } else if (normalizedEmail) {
        dbQuery = dbQuery.ilike('customer_email', normalizedEmail)
      }

      const { data: dbBookings } = await dbQuery.limit(10)

      if (dbBookings && dbBookings.length > 0) {
        for (const raw of dbBookings) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const b = raw as Record<string, any>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tenant = (Array.isArray(b.tenants) ? b.tenants[0] : b.tenants) as Record<string, any> | null
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const court = (Array.isArray(b.courts) ? b.courts[0] : b.courts) as Record<string, any> | null

          const total = (Number(b.price_total_cents) || 0) / 100
          const deposit = (Number(b.deposit_cents) || 0) / 100
          const rawId = String(b.id || '')
          const shortCode = rawId.slice(0, 8).toUpperCase()
          const assignedCode = `RES-${shortCode.slice(-6)}`

          // Parsear fechas desde el tstzrange booked_at
          let startsAt = ''
          let endsAt = ''
          let dateFormatted = 'Próximo turno'
          let timeFormatted = 'Turno reservado'
          if (b.booked_at) {
            const match = String(b.booked_at).match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
            if (match) {
              startsAt = match[1]
              endsAt = match[2]
              try {
                const d = new Date(startsAt)
                if (!isNaN(d.getTime())) {
                  dateFormatted = d.toLocaleDateString('es-AR', {
                    timeZone: 'America/Argentina/Buenos_Aires',
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })
                  timeFormatted = `${d.toLocaleTimeString('es-AR', {
                    timeZone: 'America/Argentina/Buenos_Aires',
                    hour: '2-digit',
                    minute: '2-digit',
                  })} hs`
                }
              } catch {}
            }
          }

          // Si la búsqueda es por código, validar estrictamente que coincida con esta reserva
          if (cleanCode) {
            const codeNoPrefix = assignedCode.replace(/^(PCL|RES|CAN|TEN)-/, '')
            const searchNoPrefix = cleanCode.replace(/^(PCL|RES|CAN|TEN)-/, '')
            const matchesStrict =
              assignedCode === cleanCode ||
              shortCode === cleanCode ||
              rawId.toUpperCase() === cleanCode ||
              (searchNoPrefix.length >= 4 && codeNoPrefix === searchNoPrefix) ||
              (rawId.toUpperCase().endsWith(cleanCode) && cleanCode.length >= 6)

            if (!matchesStrict) {
              continue
            }
          }

          const rawStatus = String(b.status || '').toUpperCase()
          const statusFormatted = (rawStatus.includes('CONFIRM') || rawStatus === 'COMPLETED' || rawStatus === 'FULLY_PAID')
            ? 'CONFIRMED'
            : (rawStatus.includes('CANCEL') ? 'CANCELLED' : (rawStatus.includes('NO_SHOW') ? 'NO_SHOW' : 'PENDING'))

          results.push({
            id: rawId,
            code: assignedCode,
            clubName: String(tenant?.name || 'Club Deportivo'),
            clubAddress: String(tenant?.address || 'Dirección registrada'),
            clubCity: String(tenant?.city || 'Tucumán'),
            clubPhone: String(tenant?.phone_whatsapp || '+54 9 381 411-2233'),
            courtName: String(court?.name || 'Cancha'),
            sport: String(court?.sport || 'Pádel'),
            startsAt: startsAt || String(b.created_at || new Date().toISOString()),
            endsAt: endsAt || String(b.created_at || new Date().toISOString()),
            dateFormatted,
            timeFormatted,
            status: statusFormatted,
            totalAmount: total,
            depositAmount: deposit,
            balanceRemaining: Math.max(0, total - deposit),
            customerName: String(b.customer_name || 'Jugador'),
            customerEmail: String(b.customer_email || ''),
            customerPhone: String(b.customer_phone || ''),
            createdAt: String(b.created_at || new Date().toISOString()),
            receiptUrl: `/reserva/${rawId}/confirmado`,
          })
        }
      }
    } catch (dbErr) {
      console.warn('[lookupPlayerBookings] DB query failed:', dbErr)
    }

    // 3. Si la búsqueda fue por código, asegurar que los resultados contengan ESTRICTAMENTE ese código
    const filteredResults = cleanCode
      ? results.filter(r => {
          const rCode = r.code.toUpperCase().replace(/^#/, '').trim()
          const rCodeNoPrefix = rCode.replace(/^(PCL|RES|CAN|TEN)-/, '')
          const searchNoPrefix = cleanCode.replace(/^(PCL|RES|CAN|TEN)-/, '')
          return (
            rCode === cleanCode ||
            (searchNoPrefix.length >= 4 && rCodeNoPrefix === searchNoPrefix) ||
            r.id.toUpperCase() === cleanCode ||
            (r.id.toUpperCase().endsWith(cleanCode) && cleanCode.length >= 6)
          )
        })
      : results

    if (filteredResults.length === 0) {
      return {
        success: false,
        error: cleanCode
          ? `No encontramos ninguna reserva con el código "${query.code}". Verificá que esté bien escrito o consultá por tu Email.`
          : `No encontramos reservas asociadas al email "${normalizedEmail}".`
      }
    }

    return {
      success: true,
      data: filteredResults
    }
  } catch (error) {
    console.error('[lookupPlayerBookings] Error:', error)
    return { success: false, error: 'Ocurrió un error al consultar las reservas.' }
  }
}

