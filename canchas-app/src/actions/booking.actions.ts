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
  forceReleaseBookingLock,
} from '@/lib/redis'
import {
  computeEndsAt,
  parseArgentinaDate,
  getArgentinaTimeStr,
  getArgentinaDateStr,
  getArgentinaTodayIso,
  isAbonoBooking,
} from '@/lib/utils'
import type {
  CreateBookingPayload,
  CheckoutResponse,
  TenantSubscriptionStatus,
} from '@/types/database'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import {
  processWaitlistOnCancellation,
  verifyWaitlistClaim,
  markWaitlistAsClaimed,
  getWaitlistActivePriorities,
} from './waitlist.actions'
import { sendAutomatedBookingConfirmation } from './whatsapp-bot.actions'
import { addVenueBooking, getVenueBookings, cancelVenueBooking } from '@/config/venues-data'
import { applyWalletCreditAction, refundWalletCreditForBooking } from './coupons-and-wallet.actions'
import { assertTenantMember, resolveEffectiveTenantId } from '@/lib/auth-security'
import { isPlayerBlocked } from './players.actions'
import { recordClubNotification } from './notifications.actions'
import { invalidateCalendarBookingsCache } from './club.actions'
import { resolveOfficialSlotPrice } from '@/lib/booking-pricing.server'
import { getOrRefreshTenantMpToken, refreshTenantMpToken } from './mp-marketplace.actions'

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

    if (effectiveStatus === 'PARTIALLY_SUSPENDED' || effectiveStatus === 'PAUSED' || effectiveStatus === 'LOCKED') {
      return {
        success: false,
        error: 'Las reservas online para este club están momentáneamente en pausa por regularización de suscripción. Por favor contactá al club directamente por WhatsApp para reservar.',
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

    // 0.2 VERIFICACIÓN DE JUGADOR BLOQUEADO / LISTA NEGRA
    if (payload.customer_phone) {
      const blocked = await isPlayerBlocked(payload.tenant_id, payload.customer_phone)
      if (blocked) {
        return {
          success: false,
          error: 'El número de teléfono ingresado se encuentra temporalmente restringido para reservas online. Por favor contactá a la administración del club.',
          error_code: 'PLAYER_RESTRICTED',
        }
      }
    }

    // 1. Calcular ends_at desde starts_at + duración con zona horaria normalizada
    const endsAt = computeEndsAt(payload.starts_at, courtSlotDuration)
    const startsAtIso = slotStartDate.toISOString()
    const endsAtIso = parseArgentinaDate(endsAt).toISOString()
    const dayStr = getArgentinaTodayIso(slotStartDate)

    // 1.1 Resolver Court UUID y clave de bloqueo canónica
    const supabase = await createServiceClient()
    const effectiveTenantId = (payload.tenant_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.tenant_id))
      ? payload.tenant_id
      : '00000000-0000-0000-0000-000000000001'

    const effectiveCourtId = await resolveCourtUuid(supabase, effectiveTenantId, payload.court_id, payload.court_name)
    const canonicalCourtId = effectiveCourtId || payload.court_id
    const lockKey = buildLockKey(canonicalCourtId, payload.starts_at)

    // 1.5 GESTIÓN DE PRIORIDAD EXCLUSIVA DE LISTA DE ESPERA (10 MINUTOS)
    let isWaitlistClaimValid = false
    const slotHourMin = getArgentinaTimeStr(slotStartDate)

    if (payload.claim_id) {
      const waitlistCheck = await verifyWaitlistClaim(payload.claim_id)
      if (waitlistCheck.valid && waitlistCheck.entry) {
        const entry = waitlistCheck.entry
        const claimMatchesDate = !entry.date || entry.date === dayStr
        const claimMatchesTime = !entry.time_slot || entry.time_slot.startsWith(slotHourMin)
        const claimMatchesCourt = !entry.court_id || entry.court_id === payload.court_id || entry.court_id === canonicalCourtId

        if (claimMatchesDate && claimMatchesTime && claimMatchesCourt) {
          isWaitlistClaimValid = true
          // El jugador posee prioridad exclusiva legítima: liberar cualquier bloqueo remanente de la reserva previa cancelada
          await forceReleaseBookingLock(lockKey)
          if (payload.court_id && payload.court_id !== canonicalCourtId) {
            await forceReleaseBookingLock(buildLockKey(payload.court_id, payload.starts_at))
          }
        }
      }
    } else {
      // Si el checkout NO viene con reclamo de lista de espera, verificar si el slot está reservado con prioridad activa para otro jugador
      const activePriorities = await getWaitlistActivePriorities(effectiveTenantId, dayStr)
      const hasPriorityForThisSlot = activePriorities.some((p) => {
        const matchCourt = !p.court_id || p.court_id === payload.court_id || p.court_id === canonicalCourtId
        const matchTime = p.time_slot.startsWith(slotHourMin)
        return matchCourt && matchTime
      })

      if (hasPriorityForThisSlot) {
        return {
          success: false,
          error: 'Este turno se liberó recientemente y está en ventana de prioridad exclusiva (10 min) para un jugador en lista de espera. Si no lo confirma, quedará abierto al público.',
          error_code: 'WAITLIST_PRIORITY_ACTIVE',
        }
      }
    }

    const bookingId = crypto.randomUUID()

    // 2. ADQUIRIR LOCK EN REDIS + MEMORIA (atómico: SET NX PX)
    //    Si falla → slot ya tomado por otro checkout simultáneo
    let lockAcquired = await acquireBookingLock(lockKey, bookingId)
    if (!lockAcquired && isWaitlistClaimValid) {
      // Reintento forzado para jugador con prioridad legítima de lista de espera
      await forceReleaseBookingLock(lockKey)
      lockAcquired = await acquireBookingLock(lockKey, bookingId)
    }

    if (!lockAcquired) {
      return {
        success: false,
        error: 'Este turno ya está siendo reservado por otro jugador. Intentá nuevamente en unos minutos.',
        error_code: 'LOCK_FAILED',
      }
    }

    // 2.1 PRE-VERIFICACIÓN DE DISPONIBILIDAD (evita colisiones simultáneas y garantiza aislamiento multi-tenant)
    const memoryBookings = getVenueBookings(effectiveTenantId, dayStr)
    const isAlreadyBookedInMemory = memoryBookings.some((b) => {
      const cName = Array.isArray(b.courts) ? b.courts[0]?.name : b.courts?.name
      const matchCourt = b.court_id === payload.court_id || (b.tenant_id === effectiveTenantId && payload.court_name && cName?.toLowerCase() === payload.court_name.toLowerCase())
      return matchCourt && b.starts_at === startsAtIso && !String(b.status).toUpperCase().includes('CANCEL')
    })
    if (isAlreadyBookedInMemory && !isWaitlistClaimValid) {
      await releaseBookingLock(lockKey, bookingId)
      return {
        success: false,
        error: 'Este turno ya ha sido reservado por otro jugador. Por favor elegí otro horario disponible.',
        error_code: 'SLOT_UNAVAILABLE',
      }
    }

    // 3. REGISTRAR BOOKING en PostgreSQL con status='confirmed' (cierre 24hs automático del turno)
    const bookingRange = `[${startsAtIso},${endsAtIso})`

    let sportEnum: 'PADEL' | 'FUTBOL5' | 'FUTBOL7' | 'FUTBOL11' | 'TENIS' = 'PADEL'
    if (effectiveCourtId) {
      const { data: courtRow } = await supabase.from('courts').select('sport').eq('id', effectiveCourtId).maybeSingle()
      if (courtRow?.sport) {
        sportEnum = courtRow.sport as 'PADEL' | 'FUTBOL5' | 'FUTBOL7' | 'FUTBOL11' | 'TENIS'
      } else if (payload.court_name?.toLowerCase().includes('11')) {
        sportEnum = 'FUTBOL11'
      } else if (payload.court_name?.toLowerCase().includes('7')) {
        sportEnum = 'FUTBOL7'
      } else if (payload.court_name?.toLowerCase().includes('fútbol') || payload.court_name?.toLowerCase().includes('futbol') || payload.internal_notes?.toLowerCase().includes('futbol')) {
        sportEnum = 'FUTBOL5'
      } else if (payload.court_name?.toLowerCase().includes('tenis') || payload.court_name?.toLowerCase().includes('tennis')) {
        sportEnum = 'TENIS'
      }
    }

    // 2.2 RECALCULAR PRECIO OFICIAL EN EL SERVIDOR (Protección contra manipulación de precios)
    let finalTotalArs = Number(payload.total_amount_ars) || 0
    let finalDepositArs = Number(payload.deposit_amount_ars) || 0

    if (effectiveCourtId && effectiveTenantId) {
      try {
        const official = await resolveOfficialSlotPrice({
          tenantId: effectiveTenantId,
          courtId: effectiveCourtId,
          startsAt: payload.starts_at,
        })
        if (official && official.totalAmountArs > 0) {
          finalTotalArs = official.totalAmountArs
          if (payload.deposit_amount_ars <= 0) {
            finalDepositArs = 0
          } else {
            finalDepositArs = Math.min(finalTotalArs, official.depositAmountArs)
          }
        }
      } catch (priceErr) {
        console.warn('[initiateOnlineCheckout] Error recalculando precio oficial:', priceErr)
      }
    }

    // Modo de confirmación de transferencia configurable por el club:
    // 'MANUAL' -> pasa a 'pending_deposit' (requiere comprobante y aprobación del club)
    // 'AUTO'   -> pasa a 'confirmed' de inmediato
    const isTransfer = payload.payment_method === 'TRANSFER' || !payload.payment_method
    const isFullyCovered = finalDepositArs === 0

    let transferConfirmationMode: 'MANUAL' | 'AUTO' = 'MANUAL'
    if (isTransfer && effectiveTenantId) {
      try {
        const { data: tRow } = await supabase
          .from('tenants')
          .select('description')
          .eq('id', effectiveTenantId)
          .maybeSingle()
        if (tRow?.description) {
          const meta = JSON.parse(tRow.description)
          if (meta.transfer_confirmation_mode === 'AUTO') {
            transferConfirmationMode = 'AUTO'
          }
        }
      } catch (err) {
        console.warn('[initiateOnlineCheckout] Error leyendo transfer_confirmation_mode:', err)
      }
    }

    let initialStatus = 'pending_deposit'
    if (isFullyCovered) {
      initialStatus = 'confirmed'
    } else if (isTransfer) {
      initialStatus = transferConfirmationMode === 'AUTO' ? 'confirmed' : 'pending_deposit'
    }

    const paymentLabel = payload.payment_method === 'MERCADOPAGO' ? 'Mercado Pago' : 'Transferencia'
    const customerNotesPart = payload.customer_notes?.trim() ? ` - ${payload.customer_notes.trim()}` : ''
    const noteText = `Reserva Online 24hs - Seña: $${finalDepositArs} (${paymentLabel})${customerNotesPart}`

    let dbInsertSuccess = false

    // 2.3 LIMPIEZA PREVENTIVA: Si existe una reserva huérfana en 'pending_deposit' cuyo candado ya venció, cancelarla
    try {
      await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          staff_notes: 'Candado de checkout expirado — liberado para nuevo intento online'
        })
        .eq('court_id', effectiveCourtId)
        .eq('status', 'pending_deposit')
        .filter('booked_at', 'ov', bookingRange)
        .lt('lock_expires_at', new Date().toISOString())
    } catch (cleanupErr) {
      console.warn('[initiateOnlineCheckout] Limpieza preventiva notice:', cleanupErr)
    }

    const { error: insertError } = await supabase
      .from('bookings')
      .insert({
        id: bookingId,
        tenant_id: effectiveTenantId,
        court_id: effectiveCourtId,
        booked_at: bookingRange,
        status: initialStatus,
        sport: sportEnum,
        price_total_cents: Math.round(finalTotalArs * 100),
        deposit_cents: Math.round(finalDepositArs * 100),
        payment_method: payload.payment_method === 'MERCADOPAGO' ? 'mercadopago' : 'bank_transfer',
        customer_name: payload.customer_name,
        customer_phone: payload.customer_phone,
        customer_email: payload.customer_email || null,
        staff_notes: noteText,
        redis_lock_key: lockKey,
        lock_expires_at: new Date(Date.now() + 420_000).toISOString(),
      })

    if (insertError) {
      await releaseBookingLock(lockKey, bookingId)
      const isExclusionConflict =
        insertError.code === '23P01' ||
        insertError.message?.toLowerCase().includes('exclusion') ||
        insertError.message?.toLowerCase().includes('overlap') ||
        insertError.message?.toLowerCase().includes('solapamiento')

      if (isExclusionConflict) {
        return {
          success: false,
          error: 'Este turno ya no está disponible. Por favor elegí otro horario.',
          error_code: 'SLOT_UNAVAILABLE',
        }
      }
      console.error('[initiateOnlineCheckout] Error crítico al insertar booking en BD:', insertError.message)
      return {
        success: false,
        error: 'No se pudo registrar la reserva en la base de datos. Por favor reintentá.',
        error_code: 'DB_INSERT_FAILED',
      }
    }
    dbInsertSuccess = true

    if (dbInsertSuccess && payload.claim_id && isWaitlistClaimValid) {
      await markWaitlistAsClaimed(payload.claim_id)
    }

    // Débito atómico del saldo a favor de la billetera virtual si fue utilizado en el checkout
    if (dbInsertSuccess && payload.wallet_applied_ars && payload.wallet_applied_ars > 0 && payload.customer_phone) {
      try {
        await applyWalletCreditAction(
          payload.customer_phone,
          payload.wallet_applied_ars,
          effectiveTenantId,
          bookingId
        )
      } catch (walletErr) {
        console.warn('[initiateOnlineCheckout] Notice applying wallet credit:', walletErr)
      }
    }

    // Registrar también en memoria para respuesta instantánea (0ms) en la grilla con aislamiento por club
    addVenueBooking({
      id: bookingId,
      tenant_id: effectiveTenantId,
      court_id: effectiveCourtId,
      customer_name: payload.customer_name,
      customer_phone: payload.customer_phone,
      customer_email: payload.customer_email,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      status: 'CONFIRMED',
      origin: 'ONLINE_PORTAL',
      total_amount_ars: finalTotalArs,
      deposit_amount_ars: finalDepositArs,
      total_paid: finalDepositArs,
      balance_due: Math.max(0, finalTotalArs - finalDepositArs),
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
      let mpToken = await getOrRefreshTenantMpToken(effectiveTenantId)
      if (!mpToken) {
        mpToken = tenant?.mp_access_token || null
      }

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
          total_amount_ars: finalTotalArs,
          deposit_amount_ars: finalDepositArs,
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
                unit_price: finalDepositArs,
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
            notification_url: `${appUrl}/api/webhooks/mercadopago?tenant_id=${encodeURIComponent(effectiveTenantId)}&booking_id=${encodeURIComponent(bookingId)}`,
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

        // Auto-recuperación si el token expiró (401 Unauthorized / invalid_token)
        const errMsg = String(mpErr).toLowerCase()
        if (errMsg.includes('401') || errMsg.includes('unauthorized') || errMsg.includes('invalid') || errMsg.includes('token')) {
          try {
            console.log('[initiateOnlineCheckout] Intentando refresh de token ante error 401 para tenant:', effectiveTenantId)
            const refreshedToken = await refreshTenantMpToken(effectiveTenantId)
            if (refreshedToken && refreshedToken !== mpToken) {
              const retryConfig = new MercadoPagoConfig({ accessToken: refreshedToken })
              const retryClient = new Preference(retryConfig)
              const retryPref = await retryClient.create({
                body: {
                  items: [
                    {
                      id: bookingId,
                      title: `Seña Turno ${courtName} - ${tenant?.name || 'Club'}`,
                      quantity: 1,
                      unit_price: finalDepositArs,
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
                  notification_url: `${appUrl}/api/webhooks/mercadopago?tenant_id=${encodeURIComponent(effectiveTenantId)}&booking_id=${encodeURIComponent(bookingId)}`,
                  statement_descriptor: 'CANCHA SEÑA',
                  expires: true,
                  expiration_date_from: new Date().toISOString(),
                  expiration_date_to: new Date(Date.now() + 420_000).toISOString(),
                }
              })

              const retryPrefId = retryPref.id
              const retryInitPoint = retryPref.init_point || retryPref.sandbox_init_point || undefined

              if (dbInsertSuccess) {
                await supabase
                  .from('bookings')
                  .update({
                    status: 'pending_deposit',
                    staff_notes: noteText ? `${noteText} | [MP Pref: ${retryPrefId}]` : `[MP Pref: ${retryPrefId}]`,
                  })
                  .eq('id', bookingId)
              }

              return {
                success: true,
                booking_id: bookingId,
                mp_preference_id: retryPrefId,
                mp_init_point: retryInitPoint,
                payment_type: 'MERCADOPAGO',
                total_amount_ars: payload.total_amount_ars,
                deposit_amount_ars: payload.deposit_amount_ars,
                lock_expires_at: new Date(Date.now() + 420_000).toISOString(),
              }
            }
          } catch (retryErr) {
            console.error('[initiateOnlineCheckout] Reintento tras refresh falló:', retryErr)
          }
        }

        await releaseBookingLock(lockKey, bookingId)
        return {
          success: false,
          error: 'No se pudo conectar con Mercado Pago del club. Por favor intentá nuevamente o aboná por transferencia.',
          error_code: 'MP_ERROR',
        }
      }
    }

    // Despacho de WhatsApp Bot automático (confirmación inmediata de reserva online al teléfono del cliente)
    let waConfirmRes: { isSimulated?: boolean; waUrl?: string; success: boolean } | undefined
    if (payload.customer_phone && payload.customer_phone.trim().length >= 6) {
      try {
        waConfirmRes = await sendAutomatedBookingConfirmation(bookingId)
      } catch (waErr) {
        console.warn('[initiateOnlineCheckout] WhatsApp bot dispatch warning:', waErr)
      }
    }

    // Registrar en el historial de notificaciones y alertas del club
    void recordClubNotification({
      tenantId: effectiveTenantId,
      type: 'BOOKING_CREATED',
      category: 'BOOKINGS',
      title: 'Nueva Reserva Online Recibida',
      message: `${payload.customer_name || 'Jugador'} registró una reserva online para ${courtName}. Monto seña: $${payload.deposit_amount_ars.toLocaleString('es-AR')}.`,
      metadata: {
        booking_id: bookingId,
        customer_name: payload.customer_name,
        customer_phone: payload.customer_phone,
        amount_ars: payload.deposit_amount_ars,
        court_name: courtName,
      },
    })

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
      wa_url: waConfirmRes?.waUrl,
      wa_is_simulated: waConfirmRes?.isSimulated,
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
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('id, tenant_id, deposit_cents, price_total_cents')
      .eq('id', bookingId)
      .single()

    if (bErr || !booking) return { success: false, error: 'Reserva no encontrada' }

    const authCheck = await assertTenantMember(booking.tenant_id)
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error || 'Sin permisos para confirmar transferencias en este club' }
    }

    const ref = referenceNumber ? ` - Ref Transferencia #${referenceNumber}` : ''
    const now = new Date()
    const nowIso = now.toISOString()
    await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        paid_at: nowIso,
        staff_notes: `Transferencia acreditada/confirmada 24hs${ref}`,
      })
      .eq('id', bookingId)

    // Inserción relacional inmutable en booking_payments para registro en Caja Diaria
    const depCents = Number(booking.deposit_cents) || 0
    if (depCents > 0) {
      try {
        await supabase.from('booking_payments').insert({
          tenant_id: booking.tenant_id,
          booking_id: booking.id,
          amount_ars: depCents / 100,
          amount_cents: depCents,
          payment_method: 'bank_transfer',
          payment_type: 'DEPOSIT',
          payment_date: getArgentinaTodayIso(now),
          registered_at: nowIso,
          notes: `Transferencia acreditada/confirmada 24hs${ref}`,
        })
      } catch (payErr) {
        console.warn('[confirmTransferPaymentAction] Error inserting into booking_payments:', payErr)
      }
    }

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/caja')
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

    const effectiveTenantId = (isValidUuid(payload.tenant_id)
      ? payload.tenant_id
      : (authCheck.user?.tenantId || (await resolveEffectiveTenantId(payload.tenant_id)))) || payload.tenant_id

    const validStaffId = isValidUuid(authCheck.user?.id) ? authCheck.user?.id : null

    const durationMinutes = Number(payload.duration_minutes) || court.slot_duration_minutes || (court.sport?.includes('FUTBOL') ? 60 : 90)
    const startsAtDate = parseArgentinaDate(payload.starts_at)
    const endsAtDate = new Date(startsAtDate.getTime() + durationMinutes * 60000)
    const bookingRange = `[${startsAtDate.toISOString()},${endsAtDate.toISOString()})`

    // 1.05 Verificación de jugador en lista negra / bloqueo
    if (payload.customer_phone) {
      const blocked = await isPlayerBlocked(effectiveTenantId, payload.customer_phone)
      if (blocked) {
        return {
          success: false,
          error: 'Atención: Este jugador se encuentra registrado en la lista de bloqueo / restricción del club.',
        }
      }
    }

    // 1.1 Prevenir colisión simultánea con reservas en memoria o checkouts online activos
    const dayStr = getArgentinaTodayIso(startsAtDate)
    const memoryBookings = getVenueBookings(effectiveTenantId, dayStr)
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

    const isOwner = authCheck.user?.role === 'TENANT_ADMIN' || authCheck.user?.role === 'SUPERADMIN'
    let priceTotalCents = Math.round(Number(payload.total_amount_ars || 0) * 100)

    // Protección antifraude: Si el usuario es administrador de turno / canchero (TENANT_STAFF),
    // se asegura que el precio total de la cancha corresponda estrictamente a la tarifa oficial fijada por el dueño.
    if (!isOwner && authCheck.user?.role === 'TENANT_STAFF') {
      const timeStr = `${getArgentinaTimeStr(startsAtDate)}:00`
      const argIso = getArgentinaTodayIso(startsAtDate)
      const [y, m, d] = argIso.split('-').map(Number)
      const dayOfWeek = new Date(y, m - 1, d).getDay()

      const { data: priceRules } = await supabase
        .from('price_rules')
        .select('id, price_cents, day_of_week, time_from, time_to, court_id')
        .eq('tenant_id', effectiveTenantId)
        .eq('is_active', true)

      if (priceRules && priceRules.length > 0) {
        const courtRules = priceRules.filter((r) => !r.court_id || r.court_id === payload.court_id)
        const dayRules = courtRules.filter((r) => {
          if (!r.day_of_week || r.day_of_week.length === 0) return true
          return r.day_of_week.includes(dayOfWeek) || (dayOfWeek === 0 && r.day_of_week.includes(7)) || (dayOfWeek === 7 && r.day_of_week.includes(0))
        })
        const matchingRule = dayRules.find((r) => {
          const from = (r.time_from || '00:00:00').substring(0, 5)
          const toRaw = (r.time_to || '23:59:59').substring(0, 5)
          const to = (toRaw === '00:00' || toRaw === '24:00') ? '24:00' : toRaw
          const tShort = timeStr.substring(0, 5)
          return tShort >= from && tShort <= to
        }) || dayRules[0] || courtRules[0]

        if (matchingRule && Number(matchingRule.price_cents) > 0) {
          priceTotalCents = Number(matchingRule.price_cents)
        }
      }
    }

    const depositCents = Math.round(Number(payload.deposit_amount_ars || 0) * 100)
    const isFullCash = depositCents >= priceTotalCents && priceTotalCents > 0
    const initialStatus = isFullCash ? 'confirmed_cash' : 'confirmed'

    const rawMethod = String(payload.payment_method || 'cash').toLowerCase()
    const mappedPaymentMethod = rawMethod.includes('transfer') ? 'bank_transfer'
      : (rawMethod.includes('mercado') || rawMethod.includes('mp')) ? 'mercadopago'
      : 'cash'

    const noteParts = []
    if (payload.internal_notes) noteParts.push(payload.internal_notes)
    if (payload.customer_notes) noteParts.push(`Nota cliente: ${payload.customer_notes}`)

    const now = new Date()
    const nowIso = now.toISOString()
    const timeStr = getArgentinaTimeStr(now)
    const methodSpanish = mappedPaymentMethod === 'bank_transfer' ? 'Transferencia'
      : mappedPaymentMethod === 'mercadopago' ? 'Mercado Pago'
      : 'Efectivo'
    const formattedDeposit = (depositCents / 100).toLocaleString('es-AR')

    if (depositCents > 0) {
      const cobroNote = isFullCash
        ? `Cobro $${formattedDeposit} (${methodSpanish}) a las ${timeStr} hs [${nowIso}] - Pago total en mostrador (verificado)`
        : `Cobro $${formattedDeposit} (${methodSpanish}) a las ${timeStr} hs [${nowIso}] - Seña inicial verificada y cobrada en mostrador (${methodSpanish})`
      noteParts.push(cobroNote)
    }

    const staffNotes = noteParts.join(' | ') || null

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        tenant_id: effectiveTenantId,
        court_id: payload.court_id,
        booked_at: bookingRange,
        status: initialStatus,
        sport: court.sport || 'PADEL',
        price_total_cents: priceTotalCents,
        deposit_cents: depositCents,
        staff_deposit_amount_cents: depositCents,
        payment_method: mappedPaymentMethod,
        paid_at: depositCents > 0 ? nowIso : null,
        customer_name: payload.customer_name?.trim() || 'Cliente Mostrador',
        customer_phone: payload.customer_phone?.trim() || null,
        customer_email: payload.customer_email?.trim() || null,
        staff_notes: staffNotes,
        created_by_staff_id: validStaffId,
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

    // Inserción relacional inmutable en booking_payments para registro en Caja Diaria
    if (depositCents > 0) {
      try {
        await supabase.from('booking_payments').insert({
          tenant_id: effectiveTenantId,
          booking_id: booking.id,
          amount_ars: depositCents / 100,
          amount_cents: depositCents,
          payment_method: mappedPaymentMethod,
          payment_type: isFullCash ? 'FULL' : 'DEPOSIT',
          payment_date: getArgentinaTodayIso(now),
          registered_at: nowIso,
          received_by_profile_id: validStaffId,
          notes: isFullCash ? 'Pago total en mostrador' : 'Seña en mostrador',
        })
      } catch (payErr) {
        console.warn('[createManualBooking] Error inserting into booking_payments:', payErr)
      }
    }

    // Invalidar inmediatamente la caché del calendario para esta fecha
    void invalidateCalendarBookingsCache(effectiveTenantId, dayStr)
    revalidatePath('/dashboard/caja')

    // Sincronizar en memoria para reflejo instantáneo (0ms) en el portal de jugadores con aislamiento de club
    addVenueBooking({
      id: booking.id,
      tenant_id: effectiveTenantId,
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
      total_paid: isFullCash ? Number(payload.total_amount_ars || 0) : Number(payload.deposit_amount_ars || 0),
      balance_due: Math.max(0, Number(payload.total_amount_ars || 0) - (isFullCash ? Number(payload.total_amount_ars || 0) : Number(payload.deposit_amount_ars || 0))),
      internal_notes: staffNotes || 'Reserva manual mostrador',
      courts: {
        name: payload.court_name || 'Cancha',
        sport: court.sport || 'PADEL',
        slot_duration: durationMinutes === 60 ? 'MIN_60' : 'MIN_90',
      },
    })

    // Registrar en el historial de notificaciones y alertas
    void recordClubNotification({
      tenantId: effectiveTenantId,
      type: 'BOOKING_CREATED',
      category: 'BOOKINGS',
      title: '⚽ Turno Reservado en Mostrador',
      message: `${payload.customer_name?.trim() || 'Cliente'} reservó ${payload.court_name || 'Cancha'} para el ${startsAtDate.toLocaleDateString('es-AR')} a las ${startsAtDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs ($${Number(payload.total_amount_ars || 0).toLocaleString('es-AR')}).`,
      metadata: {
        booking_id: booking.id,
        customer_name: payload.customer_name?.trim() || 'Cliente Mostrador',
        customer_phone: payload.customer_phone?.trim() || undefined,
        court_name: payload.court_name || 'Cancha',
        sport: court.sport || 'PADEL',
        amount_ars: Number(payload.total_amount_ars || 0),
        payment_method: isFullCash ? 'Efectivo Total' : (depositCents > 0 ? `Seña ${methodSpanish}` : 'Sin seña'),
      },
    })

    if (depositCents > 0) {
      void recordClubNotification({
        tenantId: effectiveTenantId,
        type: 'PAYMENT_RECEIVED',
        category: 'PAYMENTS',
        title: 'Pago / Seña Recibida en Mostrador',
        message: `Se registró un cobro de $${formattedDeposit} (${methodSpanish}) de ${payload.customer_name?.trim() || 'Cliente'} a las ${timeStr} hs.`,
        metadata: {
          booking_id: booking.id,
          customer_name: payload.customer_name?.trim() || 'Cliente Mostrador',
          customer_phone: payload.customer_phone?.trim() || undefined,
          amount_ars: depositCents / 100,
          payment_method: methodSpanish,
        },
      })
    }

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/caja')
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
  payment_method: 'CASH' | 'TRANSFER' | 'MERCADOPAGO' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'QR_MP' | 'OTHER'
  reference_number?: string
  notes?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('id, tenant_id, price_total_cents, deposit_cents, payment_method, staff_notes, status, paid_at, customer_name, customer_phone, recurring_slot_id')
      .eq('id', params.booking_id)
      .single()

    if (bErr || !booking) return { success: false, error: 'Reserva no encontrada' }

    const authCheck = await assertTenantMember(booking.tenant_id)
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error || 'Sin permisos para registrar cobros en este club' }
    }

    // BLINDAJE ANTIFRAUDE: Si el turno pertenece a un abonado fijo (mensualidad recurrente),
    // prohibir el cobro individual de cancha para evitar duplicar ingresos en la caja diaria.
    const isAbonoTurn = isAbonoBooking({
      recurring_slot_id: (booking as { recurring_slot_id?: string | null }).recurring_slot_id,
      payment_method: booking.payment_method,
      staff_notes: booking.staff_notes,
    })
    if (isAbonoTurn) {
      return {
        success: false,
        error: 'Este turno corresponde a un Abonado Fijo cubierto por mensualidad. El cobro del abono se realiza de forma única desde la sección Turnos Fijos para evitar duplicar ingresos en caja.',
      }
    }

    const amountCents = Math.round(params.amount_ars * 100)
    const currentDeposit = Number(booking.deposit_cents) || 0
    const totalPriceCents = Number(booking.price_total_cents) || 0
    const pendingBalanceCents = Math.max(0, totalPriceCents - currentDeposit)

    if (pendingBalanceCents <= 0) {
      return {
        success: false,
        error: 'El turno ya se encuentra totalmente saldado ($0 pendiente).',
      }
    }

    // Topar el monto a cobrar al saldo restante pendiente
    const effectiveAmountCents = Math.min(amountCents, pendingBalanceCents)

    // Protección anti-doble clic / concurrencia: si en los últimos 45 segundos ya se registró un cobro idéntico
    const now = new Date()
    const nowIso = now.toISOString()
    const recentCobroMatches = [...(booking.staff_notes || '').matchAll(/Cobro\s+\$?([\d\.,]+)[^\[]*\[([^\]]+)\]/gi)]
    const isRecentDuplicate = recentCobroMatches.some((m) => {
      const clean = m[1].replace(/\./g, '').replace(/,/g, '.')
      const mAmountCents = Math.round(Number(clean) * 100)
      const mDate = new Date(m[2])
      const diffMs = now.getTime() - mDate.getTime()
      return mAmountCents === effectiveAmountCents && diffMs >= 0 && diffMs < 45000
    })

    if (isRecentDuplicate) {
      console.warn('[registerCashPayment] Cobro duplicado bloqueado por ventana de seguridad de 45s para booking:', params.booking_id)
      return { success: true }
    }

    const newDepositCents = currentDeposit + effectiveAmountCents

    const methodStr = String(params.payment_method).toUpperCase()
    const methodEnum = methodStr.includes('TRANSFER') ? 'bank_transfer'
      : (methodStr.includes('MERCADO') || methodStr.includes('MP') || methodStr.includes('QR')) ? 'mercadopago'
      : 'cash'

    const isFullyPaid = newDepositCents >= totalPriceCents
    const newStatus = isFullyPaid ? 'confirmed_cash' : 'confirmed'

    const timeStr = getArgentinaTimeStr(now)
    const methodSpanish = methodStr.includes('TRANSFER') ? 'Transferencia'
      : (methodStr.includes('MERCADO') || methodStr.includes('MP')) ? 'Mercado Pago'
      : 'Efectivo'
    const formattedAmount = (effectiveAmountCents / 100).toLocaleString('es-AR')
    const noteEntry = `Cobro $${formattedAmount} (${methodSpanish}) a las ${timeStr} hs [${nowIso}]${params.notes ? ` - ${params.notes}` : ''}`
    const updatedNotes = booking.staff_notes ? `${booking.staff_notes} | ${noteEntry}` : noteEntry

    // Preservar método online previo si existió seña online
    const finalPaymentMethod = (booking.payment_method && booking.payment_method !== 'cash' && currentDeposit > 0)
      ? booking.payment_method
      : methodEnum

    // Preservar paid_at original de la seña si ya existía para no alterar la hora del cobro inicial en la caja
    const finalPaidAt = booking.paid_at || nowIso

    const { error: upErr } = await supabase
      .from('bookings')
      .update({
        deposit_cents: newDepositCents,
        staff_deposit_amount_cents: newDepositCents,
        payment_method: finalPaymentMethod,
        paid_at: finalPaidAt,
        status: newStatus,
        staff_notes: updatedNotes,
        updated_at: nowIso,
      })
      .eq('id', params.booking_id)

    if (upErr) {
      console.error('[registerCashPayment] Error updating booking payment:', upErr.message)
      return { success: false, error: upErr.message }
    }

    // Inserción relacional inmutable en booking_payments
    const amountArs = Math.round(effectiveAmountCents / 100)
    const paymentType = currentDeposit === 0 ? 'DEPOSIT' : 'BALANCE'
    const todayDate = nowIso.split('T')[0]

    try {
      await supabase.from('booking_payments').insert({
        tenant_id: booking.tenant_id,
        booking_id: params.booking_id,
        amount_ars: amountArs,
        amount_cents: effectiveAmountCents,
        payment_method: methodEnum,
        payment_type: paymentType,
        payment_date: todayDate,
        registered_at: nowIso,
        notes: params.notes || null,
      })
    } catch (insertPayErr) {
      console.warn('[registerCashPayment] Notice inserting into booking_payments:', insertPayErr)
    }

    // Registrar en el historial de notificaciones y alertas
    const customerDisplayName = booking.customer_name?.trim() || 'Cliente'
    void recordClubNotification({
      tenantId: booking.tenant_id,
      type: 'PAYMENT_RECEIVED',
      category: 'PAYMENTS',
      title: 'Pago / Seña Recibida en Mostrador',
      message: `Se registró un cobro de $${(effectiveAmountCents / 100).toLocaleString('es-AR')} (${methodSpanish}) de ${customerDisplayName} a las ${timeStr} hs.`,
      metadata: {
        booking_id: booking.id,
        customer_name: customerDisplayName,
        customer_phone: booking.customer_phone?.trim() || undefined,
        amount_ars: effectiveAmountCents / 100,
        payment_method: methodSpanish,
      },
    })

    void invalidateCalendarBookingsCache(booking.tenant_id)

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/caja')
    revalidatePath('/dashboard/notificaciones')
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
}): Promise<{ 
  success: boolean
  error?: string
  waitlistNotified?: boolean
  waitlistCustomerName?: string
  waitlistCustomerPhone?: string
  waitlistWhatsAppUrl?: string
}> {
  try {
    const supabase = await createServiceClient()
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('redis_lock_key, id, tenant_id, court_id, booked_at, staff_notes, customer_name, customer_phone')
      .eq('id', params.booking_id)
      .single()

    if (bErr || !booking) return { success: false, error: 'Reserva no encontrada' }

    const authCheck = await assertTenantMember(booking.tenant_id)
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error || 'Sin permisos para cancelar turnos en este club' }
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

    // Si la reserva estaba en memoria, marcarla como cancelada para sincronización inmediata
    cancelVenueBooking(params.booking_id)

    // Reintegrar automáticamente saldo a favor si la reserva utilizó créditos de billetera virtual
    if (booking?.tenant_id) {
      void refundWalletCreditForBooking(booking.tenant_id, params.booking_id)
    }

    // Liberar candados de Redis / memoria incondicionalmente para habilitar reclamos inmediatos
    if (booking?.redis_lock_key) {
      await forceReleaseBookingLock(booking.redis_lock_key)
    }
    if (booking?.court_id && booking?.booked_at) {
      const match = booking.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
      if (match && match[1]) {
        const rawStart = match[1].includes(' ') ? match[1].replace(' ', 'T') : match[1]
        await forceReleaseBookingLock(buildLockKey(booking.court_id, rawStart))
      }
    }

    // Trigger de Lista de Espera con conversión horaria exacta a Argentina
    let waitlistInfo: {
      waitlistNotified?: boolean
      waitlistCustomerName?: string
      waitlistCustomerPhone?: string
      waitlistWhatsAppUrl?: string
    } = {}

    if (booking?.tenant_id && booking?.booked_at) {
      const match = booking.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
      if (match && match[1]) {
        const rawStart = match[1].includes(' ') ? match[1].replace(' ', 'T') : match[1]
        const isoNormalized = rawStart.endsWith('+00') ? rawStart.replace('+00', 'Z') : rawStart
        const d = new Date(isoNormalized)
        if (!isNaN(d.getTime())) {
          const bookingDate = d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
          const timeSlot = d.toLocaleTimeString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })

          try {
            const wlResult = await processWaitlistOnCancellation({
              tenantId: booking.tenant_id,
              courtId: booking.court_id,
              date: bookingDate,
              timeSlot,
            })
            if (wlResult.hasWaitlistMatch) {
              waitlistInfo = {
                waitlistNotified: true,
                waitlistCustomerName: wlResult.notifiedEntry?.customer_name,
                waitlistCustomerPhone: wlResult.notifiedEntry?.customer_phone,
                waitlistWhatsAppUrl: wlResult.whatsAppUrl,
              }
            }
          } catch (err) {
            console.warn('[cancelBooking] Error al procesar lista de espera:', err)
          }
        }
      }
    }

    // Registrar en el historial de notificaciones y alertas
    const customerName = booking?.customer_name?.trim() || 'Cliente'
    void recordClubNotification({
      tenantId: booking.tenant_id,
      type: 'BOOKING_CANCELLED',
      category: 'ALERTS',
      title: 'Turno Cancelado',
      message: `El turno de ${customerName} fue cancelado (${params.reason || 'Sin motivo'}).`,
      metadata: {
        booking_id: booking.id,
        customer_name: customerName,
        customer_phone: booking?.customer_phone?.trim() || undefined,
        reason: params.reason,
      },
    })

    if (waitlistInfo.waitlistNotified && waitlistInfo.waitlistCustomerName) {
      void recordClubNotification({
        tenantId: booking.tenant_id,
        type: 'WAITLIST_NOTIFIED',
        category: 'ALERTS',
        title: 'Alerta de Cupo Enviada a Lista de Espera',
        message: `Se notificó a ${waitlistInfo.waitlistCustomerName} con 10 min de prioridad para tomar el turno liberado.`,
        metadata: {
          customer_name: waitlistInfo.waitlistCustomerName,
          customer_phone: waitlistInfo.waitlistCustomerPhone,
          whatsapp_url: waitlistInfo.waitlistWhatsAppUrl,
        },
      })
    }

    void invalidateCalendarBookingsCache(booking.tenant_id)

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/notificaciones')
    return { success: true, ...waitlistInfo }
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

    const noShowNote = 'Jugador no asistió al turno (Inasistencia registrada)'
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

    void invalidateCalendarBookingsCache(booking.tenant_id)

    revalidatePath('/dashboard')
    return { success: true }
  } catch (error) {
    console.error('[markBookingNoShow] Error:', error)
    return { success: false, error: 'Error al marcar inasistencia' }
  }
}

// ─── ACTION: Confirmar seña / Aprobar turno transferido ─────────────────────────

export async function confirmBookingDeposit(bookingId: string): Promise<{
  success: boolean
  error?: string
  updatedNotes?: string
  waUrl?: string
  isSimulated?: boolean
  customerPhone?: string
  customerName?: string
}> {
  try {
    const supabase = await createServiceClient()
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('id, tenant_id, price_total_cents, deposit_cents, staff_notes, status, customer_name, customer_phone, recurring_slot_id')
      .eq('id', bookingId)
      .single()

    if (bErr || !booking) return { success: false, error: 'Reserva no encontrada' }

    const isAbonoTurn = isAbonoBooking({
      recurring_slot_id: (booking as { recurring_slot_id?: string | null }).recurring_slot_id,
      staff_notes: booking.staff_notes,
    })
    if (isAbonoTurn) {
      return { success: false, error: 'Este turno pertenece a un abono fijo mensual y no requiere validación de seña individual.' }
    }

    const authCheck = await assertTenantMember(booking.tenant_id)
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error || 'Sin permisos para confirmar este turno' }
    }

    const now = new Date()
    const nowIso = now.toISOString()
    const timeStr = getArgentinaTimeStr(now)
    const dateStr = getArgentinaDateStr(now)
    const noteEntry = `Seña verificada y aprobada por el club el ${dateStr} a las ${timeStr} hs [${nowIso}]`
    const updatedNotes = booking.staff_notes ? `${booking.staff_notes} | ${noteEntry}` : noteEntry
    const { error: upErr } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        paid_at: nowIso,
        staff_notes: updatedNotes,
        updated_at: nowIso,
        staff_deposit_amount_cents: booking.deposit_cents || 0,
      })
      .eq('id', bookingId)

    if (upErr) {
      console.error('[confirmBookingDeposit] Error:', upErr.message)
      return { success: false, error: upErr.message }
    }

    const depCents = Number(booking.deposit_cents || 0)
    if (depCents > 0) {
      try {
        const { data: existingBp } = await supabase
          .from('booking_payments')
          .select('id')
          .eq('booking_id', booking.id)
          .maybeSingle()

        if (!existingBp) {
          await supabase.from('booking_payments').insert({
            tenant_id: booking.tenant_id,
            booking_id: booking.id,
            amount_ars: Math.round(depCents / 100),
            amount_cents: depCents,
            payment_method: 'bank_transfer',
            payment_type: 'DEPOSIT',
            payment_date: getArgentinaTodayIso(now),
            registered_at: nowIso,
            notes: 'Seña verificada y aprobada por el club',
          })
        }
      } catch (payErr) {
        console.warn('[confirmBookingDeposit] Notice inserting into booking_payments:', payErr)
      }
    }

    // Despacho de WhatsApp Bot automático (confirmación inmediata de seña y turno)
    let waResult: {
      success: boolean
      isSimulated?: boolean
      waUrl?: string
      error?: string
      customerName?: string
      customerPhone?: string
    } | undefined

    try {
      waResult = await sendAutomatedBookingConfirmation(bookingId)
    } catch (waErr) {
      console.warn('[confirmBookingDeposit] WhatsApp bot dispatch warning:', waErr)
    }

    // Registrar en el historial de notificaciones y alertas
    const depositArs = Math.round((Number(booking.deposit_cents) || 0) / 100)
    void recordClubNotification({
      tenantId: booking.tenant_id,
      type: 'BOOKING_CONFIRMED',
      category: 'BOOKINGS',
      title: '✅ Turno y Seña Confirmados',
      message: `Se verificó la seña de $${depositArs.toLocaleString('es-AR')} para ${booking.customer_name || 'el cliente'}. Turno confirmado en el calendario.`,
      metadata: {
        booking_id: booking.id,
        customer_name: booking.customer_name || undefined,
        customer_phone: booking.customer_phone || undefined,
        amount_ars: depositArs,
      },
    })

    void invalidateCalendarBookingsCache(booking.tenant_id)

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/caja')
    revalidatePath('/dashboard/notificaciones')
    return {
      success: true,
      updatedNotes,
      waUrl: waResult?.waUrl,
      isSimulated: waResult?.isSimulated,
      customerPhone: booking.customer_phone || undefined,
      customerName: booking.customer_name || undefined,
    }
  } catch (error) {
    console.error('[confirmBookingDeposit] Error:', error)
    return { success: false, error: 'Error interno al confirmar seña' }
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
  phone?: string
}): Promise<{
  success: boolean
  data?: PlayerBookingDetail[]
  error?: string
}> {
  const cleanCode = (query.code || '').trim().toUpperCase().replace(/^#/, '')
  const normalizedEmail = (query.email || '').trim().toLowerCase()
  const cleanPhone = (query.phone || '').replace(/\D/g, '').trim()

  if (!cleanCode && !normalizedEmail && !cleanPhone) {
    return { success: false, error: 'Por favor ingresá un código de reserva, email o número de celular.' }
  }

  // Prevenir fuerza bruta y raspado de datos con entradas demasiado cortas
  if (cleanCode && cleanCode.length < 6) {
    return { success: false, error: 'El código de reserva debe tener al menos 6 caracteres.' }
  }
  if (normalizedEmail && (!normalizedEmail.includes('@') || normalizedEmail.length < 5)) {
    return { success: false, error: 'Por favor ingresá una dirección de email válida.' }
  }
  if (cleanPhone && cleanPhone.length < 6) {
    return { success: false, error: 'El número de teléfono debe tener al menos 6 dígitos.' }
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
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanCode)
        if (isUUID) {
          dbQuery = dbQuery.eq('id', cleanCode.toLowerCase())
        } else {
          // No usar ilike en columna UUID en Postgres (arroja error 42883).
          // Se consulta reservas recientes y se filtra en memoria con exactitud de código.
          dbQuery = dbQuery.order('created_at', { ascending: false }).limit(250)
        }
      } else if (normalizedEmail) {
        dbQuery = dbQuery.eq('customer_email', normalizedEmail)
      } else if (cleanPhone) {
        const digits = cleanPhone.replace(/\D/g, '')
        let national = digits
        if (national.startsWith('549')) national = national.slice(3)
        else if (national.startsWith('54')) national = national.slice(2)
        if (national.startsWith('0')) national = national.slice(1)

        const last7 = digits.length >= 7 ? digits.slice(-7) : digits
        const last8 = digits.length >= 8 ? digits.slice(-8) : digits

        dbQuery = dbQuery.or(`customer_phone.ilike.%${last7}%,customer_phone.ilike.%${last8}%,customer_phone.ilike.%${national}%`)
      }

      const { data: dbBookings } = await dbQuery.limit(50)

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
          // El shortCode en todo CancharClub son los últimos 6 caracteres del UUID (ej: 987205)
          const shortCode = rawId.slice(-6).toUpperCase()
          const assignedCode = `RES-${shortCode}`

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
            const codeCore = cleanCode.replace(/^(PCL|RES|CAN|TEN)-/i, '').replace(/^#/, '').trim().toUpperCase()
            const rawUpper = rawId.toUpperCase()
            const matchesStrict =
              shortCode === codeCore ||
              assignedCode === cleanCode ||
              rawUpper === cleanCode ||
              rawUpper.endsWith(codeCore) ||
              rawUpper.startsWith(codeCore) ||
              (b.staff_notes && String(b.staff_notes).toUpperCase().includes(codeCore))

            if (!matchesStrict) {
              continue
            }
          }

          // Si la búsqueda es por teléfono, validar coincidencia normalizada
          if (cleanPhone) {
            const phoneDigits = String(b.customer_phone || '').replace(/\D/g, '')
            const searchDigits = cleanPhone.replace(/\D/g, '')
            const searchLast7 = searchDigits.length >= 7 ? searchDigits.slice(-7) : searchDigits
            const searchLast8 = searchDigits.length >= 8 ? searchDigits.slice(-8) : searchDigits
            const matchPhone =
              phoneDigits.includes(searchDigits) ||
              searchDigits.includes(phoneDigits) ||
              (searchLast7.length >= 6 && phoneDigits.endsWith(searchLast7)) ||
              (searchLast8.length >= 7 && phoneDigits.endsWith(searchLast8))

            if (!matchPhone) {
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
          const codeCore = cleanCode.replace(/^(PCL|RES|CAN|TEN)-/i, '').replace(/^#/, '').trim().toUpperCase()
          const rCode = r.code.toUpperCase().replace(/^#/, '').trim()
          const rId = r.id.toUpperCase()
          return (
            rCode === cleanCode ||
            r.code.endsWith(codeCore) ||
            rId === cleanCode ||
            rId.endsWith(codeCore) ||
            rId.startsWith(codeCore)
          )
        })
      : results

    if (filteredResults.length === 0) {
      return {
        success: false,
        error: cleanCode
          ? `No encontramos ninguna reserva con el código "${query.code}". Verificá que esté bien escrito o consultá por tu celular o email.`
          : normalizedEmail
          ? `No encontramos reservas asociadas al email "${normalizedEmail}".`
          : `No encontramos reservas asociadas al número "${query.phone}".`
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

// ─── CONSULTA SEGURA DE COMPROBANTE PÚBLICO (MEJORA 7) ─────────────────────────

export interface PublicBookingReceipt {
  id: string
  shortCode: string
  clubName: string
  clubSlug: string
  clubPhone: string
  clubAddress: string
  googleMapsUrl?: string
  courtName: string
  sport: string
  date: string
  dateFormatted: string
  time: string
  customerName: string
  totalAmount: number
  depositAmount: number
  balanceRemaining: number
  paymentMethod: string
  bankAlias?: string
  status: string
  isAbono?: boolean
}

export async function getBookingPublicReceipt(bookingId: string): Promise<{ success: boolean; data?: PublicBookingReceipt; error?: string }> {
  try {
    const cleanId = (bookingId || '').trim()
    if (!cleanId) return { success: false, error: 'Identificador de reserva no proporcionado.' }

    const supabase = await createServiceClient()

    // 1. Consultar en base de datos Postgres
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dbQuery: any = supabase
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
        payment_method,
        staff_notes,
        recurring_slot_id,
        created_at,
        courts (
          id,
          name,
          sport
        ),
        tenants (
          id,
          name,
          address,
          city,
          province,
          phone_whatsapp,
          slug,
          bank_alias,
          bank_name,
          google_maps_url
        )
      `)

    if (isValidUuid(cleanId)) {
      dbQuery = dbQuery.eq('id', cleanId)
    } else {
      dbQuery = dbQuery.ilike('id', `%${cleanId}%`)
    }

    const { data: records, error } = await dbQuery.limit(1).maybeSingle()

    if (!error && records) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = records as Record<string, any>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tenant = (Array.isArray(b.tenants) ? b.tenants[0] : b.tenants) as Record<string, any> | null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const court = (Array.isArray(b.courts) ? b.courts[0] : b.courts) as Record<string, any> | null

      const isAbono = isAbonoBooking({
        recurring_slot_id: b.recurring_slot_id,
        payment_method: b.payment_method,
        staff_notes: b.staff_notes,
      })

      const total = (Number(b.price_total_cents) || 0) / 100
      const deposit = isAbono ? total : (Number(b.deposit_cents) || 0) / 100
      const rawId = String(b.id || '')
      const shortCode = rawId.slice(-6).toUpperCase()

      let dateIso = getArgentinaTodayIso()
      let dateFormatted = ''
      let timeFormatted = '19:00'

      if (b.booked_at) {
        const match = String(b.booked_at).match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
        if (match) {
          let startsAt = match[1].trim().replace(/^"/, '').replace(/"$/, '')
          try {
            // Normalizar offset horario para compatibilidad total con ISO-8601 en V8 (+00 -> +00:00)
            if (/[+-]\d{2}$/.test(startsAt)) {
              startsAt = startsAt + ':00'
            } else if (!startsAt.includes('Z') && !/[+-]\d{2}:\d{2}$/.test(startsAt)) {
              startsAt = startsAt + 'Z'
            }
            if (startsAt.includes(' ')) {
              startsAt = startsAt.replace(' ', 'T')
            }
            const d = new Date(startsAt)
            if (!isNaN(d.getTime())) {
              dateIso = getArgentinaTodayIso(d)
              let df = d.toLocaleDateString('es-AR', {
                timeZone: 'America/Argentina/Buenos_Aires',
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })
              if (df) {
                df = df.charAt(0).toUpperCase() + df.slice(1)
              }
              dateFormatted = df
              timeFormatted = d.toLocaleTimeString('es-AR', {
                timeZone: 'America/Argentina/Buenos_Aires',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              })
            }
          } catch {}
        }
      }

      if (!dateFormatted) {
        const now = new Date()
        const df = now.toLocaleDateString('es-AR', {
          timeZone: 'America/Argentina/Buenos_Aires',
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })
        dateFormatted = df ? df.charAt(0).toUpperCase() + df.slice(1) : 'Fecha confirmada'
      }

      // Composición limpia de dirección sin leyendas genéricas
      const addrParts: string[] = []
      if (tenant?.address && tenant.address.trim()) {
        addrParts.push(tenant.address.trim())
      }
      if (tenant?.city && tenant.city.trim()) {
        addrParts.push(tenant.city.trim())
      }
      if (tenant?.province && tenant.province.trim() && !tenant.city?.toLowerCase().includes(tenant.province.toLowerCase())) {
        addrParts.push(tenant.province.trim())
      }

      const clubAddress = addrParts.length > 0
        ? addrParts.join(', ')
        : (tenant?.name ? `${tenant.name}, Tucumán` : 'San Miguel de Tucumán')

      const googleMapsUrl = tenant?.google_maps_url || undefined

      return {
        success: true,
        data: {
          id: rawId,
          shortCode,
          clubName: String(tenant?.name || 'Club Deportivo'),
          clubSlug: String(tenant?.slug || ''),
          clubPhone: String(tenant?.phone_whatsapp || ''),
          clubAddress,
          googleMapsUrl,
          courtName: String(court?.name || 'Cancha Principal'),
          sport: String(court?.sport || 'Pádel'),
          date: dateIso,
          dateFormatted,
          time: timeFormatted,
          customerName: String(b.customer_name || 'Jugador'),
          totalAmount: total,
          depositAmount: deposit,
          balanceRemaining: isAbono ? 0 : Math.max(0, total - deposit),
          paymentMethod: isAbono ? 'abono_fijo' : String(b.payment_method || 'TRANSFER'),
          bankAlias: tenant?.bank_alias || undefined,
          status: isAbono ? 'CONFIRMED' : String(b.status || 'CONFIRMED'),
          isAbono,
        }
      }
    }

    // 2. Fallback a venues si es un demo booking
    const today = getArgentinaTodayIso()
    const venueBookings = [
      ...getVenueBookings('venue-main', today),
      ...getVenueBookings('padel-norte', today)
    ]
    const foundVenue = venueBookings.find(vb => 
      vb.id === cleanId || vb.id.toUpperCase().endsWith(cleanId.toUpperCase())
    )

    if (foundVenue) {
      const rawId = foundVenue.id
      const shortCode = rawId.slice(-6).toUpperCase()
      const total = foundVenue.total_amount_ars || 14000
      const deposit = foundVenue.deposit_amount_ars || 7000
      const courtName = Array.isArray(foundVenue.courts) 
        ? foundVenue.courts[0]?.name || 'Cancha 1'
        : foundVenue.courts?.name || 'Cancha 1'

      return {
        success: true,
        data: {
          id: rawId,
          shortCode,
          clubName: 'Padel Norte Club',
          clubSlug: 'padel-norte',
          clubPhone: '+5493814112233',
          clubAddress: 'Av. Aconquija 2100, Yerba Buena',
          googleMapsUrl: 'https://maps.google.com/?q=Av.+Aconquija+2100,+Yerba+Buena',
          courtName,
          sport: 'Pádel',
          date: foundVenue.starts_at ? getArgentinaTodayIso(new Date(foundVenue.starts_at)) : getArgentinaTodayIso(),
          dateFormatted: foundVenue.starts_at ? new Date(foundVenue.starts_at).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Hoy',
          time: foundVenue.starts_at ? getArgentinaTimeStr(new Date(foundVenue.starts_at)) : '19:00',
          customerName: foundVenue.customer_name || 'Jugador',
          totalAmount: total,
          depositAmount: deposit,
          balanceRemaining: Math.max(0, total - deposit),
          paymentMethod: 'TRANSFER',
          bankAlias: 'PADEL.NORTE.MP',
          status: foundVenue.status || 'CONFIRMED'
        }
      }
    }

    return { success: false, error: 'No encontramos el comprobante de esta reserva en el sistema.' }
  } catch (err) {
    console.error('[getBookingPublicReceipt] Error:', err)
    return { success: false, error: 'Ocurrió un error al obtener los datos del comprobante.' }
  }
}

// ─── CANCELACIÓN DE RESERVA POR EL JUGADOR (MEJORA 12) ─────────────────────────

export async function cancelBookingByPlayer(
  bookingId: string, 
  playerIdentifier: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const cleanId = (bookingId || '').trim()
    const cleanPlayer = (playerIdentifier || '').trim().toLowerCase()

    if (!cleanId) return { success: false, error: 'ID de reserva inválido.' }

    const supabase = await createServiceClient()

    // 1. Obtener la reserva actual
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, court_id, tenant_id, customer_email, customer_phone, booked_at, status, staff_notes, redis_lock_key')
      .eq('id', cleanId)
      .maybeSingle()

    if (fetchErr || !booking) {
      return { success: false, error: 'No se encontró la reserva solicitada.' }
    }

    if (booking.status?.toLowerCase().includes('cancel')) {
      return { success: false, error: 'Esta reserva ya fue cancelada previamente.' }
    }

    if (['completed', 'no_show'].includes(booking.status?.toLowerCase() || '')) {
      return { success: false, error: 'No es posible cancelar una reserva que ya fue finalizada o registrada.' }
    }

    // Verificar que el turno sea futuro y no haya comenzado
    if (booking.booked_at) {
      const match = String(booking.booked_at).match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
      if (match && match[1]) {
        const rawStart = match[1].includes(' ') ? match[1].replace(' ', 'T') : match[1]
        const isoNormalized = rawStart.endsWith('+00') ? rawStart.replace('+00', 'Z') : rawStart
        const slotStart = new Date(isoNormalized)
        if (!isNaN(slotStart.getTime()) && slotStart.getTime() <= Date.now()) {
          return {
            success: false,
            error: 'No es posible cancelar el turno porque el horario del partido ya comenzó o ha transcurrido.'
          }
        }
      }
    }

    // 2. Verificar que pertenezca al jugador de forma obligatoria y estricta
    if (!cleanPlayer || cleanPlayer.length < 6) {
      return { 
        success: false, 
        error: 'Para cancelar el turno, debés ingresar el email o número de teléfono registrado en la reserva.' 
      }
    }

    const digitsOnly = cleanPlayer.replace(/\D/g, '')
    const bookingPhoneDigits = (booking.customer_phone || '').replace(/\D/g, '')
    
    const emailMatches = Boolean(
      booking.customer_email && 
      cleanPlayer.includes('@') && 
      booking.customer_email.toLowerCase().trim() === cleanPlayer
    )
    
    const phoneMatches = Boolean(
      digitsOnly.length >= 6 &&
      bookingPhoneDigits.length >= 6 &&
      (bookingPhoneDigits === digitsOnly || bookingPhoneDigits.endsWith(digitsOnly) || digitsOnly.endsWith(bookingPhoneDigits))
    )

    if (!emailMatches && !phoneMatches) {
      return { success: false, error: 'Los datos de verificación (email o teléfono) no coinciden con el titular de la reserva.' }
    }

    // 3. Actualizar estado a 'cancelled' (enum válido en base de datos)
    const cancelNote = `Cancelado por el jugador (${cleanPlayer}) a las ${getArgentinaTimeStr()} hs`
    const updatedNotes = booking.staff_notes ? `${booking.staff_notes} | ${cancelNote}` : cancelNote

    const { error: updateErr } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        staff_notes: updatedNotes,
        updated_at: new Date().toISOString()
      })
      .eq('id', cleanId)

    if (updateErr) {
      console.error('[cancelBookingByPlayer] Update error:', updateErr.message)
      return { success: false, error: 'No se pudo cancelar la reserva en este momento.' }
    }

    // Liberar reserva de memoria en vivo para consistencia instantánea
    cancelVenueBooking(cleanId)

    // Reintegrar automáticamente saldo a favor si la reserva utilizó créditos de billetera virtual
    if (booking?.tenant_id) {
      void refundWalletCreditForBooking(booking.tenant_id, cleanId)
    }

    // Liberar candados de Redis / memoria incondicionalmente para habilitar reclamos inmediatos
    if (booking?.redis_lock_key) {
      await forceReleaseBookingLock(booking.redis_lock_key)
    }
    if (booking?.court_id && booking?.booked_at) {
      const match = String(booking.booked_at).match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
      if (match && match[1]) {
        const rawStart = match[1].includes(' ') ? match[1].replace(' ', 'T') : match[1]
        await forceReleaseBookingLock(buildLockKey(booking.court_id, rawStart))
      }
    }

    // 4. Liberar waitlist con zona horaria oficial de Argentina
    let waitlistInfo: {
      waitlistNotified?: boolean
      waitlistCustomerName?: string
      waitlistCustomerPhone?: string
      waitlistWhatsAppUrl?: string
    } = {}

    try {
      if (booking.tenant_id && booking.booked_at) {
        let date = ''
        let timeSlot = ''
        const match = String(booking.booked_at).match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
        if (match && match[1]) {
          const rawStart = match[1].includes(' ') ? match[1].replace(' ', 'T') : match[1]
          const isoNormalized = rawStart.endsWith('+00') ? rawStart.replace('+00', 'Z') : rawStart
          const d = new Date(isoNormalized)
          if (!isNaN(d.getTime())) {
            date = d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
            timeSlot = d.toLocaleTimeString('es-AR', {
              timeZone: 'America/Argentina/Buenos_Aires',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            })
          }
        }
        if (date && timeSlot) {
          const wlResult = await processWaitlistOnCancellation({
            tenantId: booking.tenant_id,
            courtId: booking.court_id,
            date,
            timeSlot
          })
          if (wlResult.hasWaitlistMatch) {
            waitlistInfo = {
              waitlistNotified: true,
              waitlistCustomerName: wlResult.notifiedEntry?.customer_name,
              waitlistCustomerPhone: wlResult.notifiedEntry?.customer_phone,
              waitlistWhatsAppUrl: wlResult.whatsAppUrl,
            }
          }
        }
      }
    } catch (waitlistErr) {
      console.warn('[cancelBookingByPlayer] Waitlist error:', waitlistErr)
    }

    revalidatePath('/mis-reservas')
    revalidatePath('/dashboard')

    return { 
      success: true, 
      message: 'Tu reserva fue cancelada con éxito. El horario quedó disponible para otros jugadores.',
      ...waitlistInfo,
    }
  } catch (err) {
    console.error('[cancelBookingByPlayer] Error:', err)
    return { success: false, error: 'Ocurrió un error al procesar la cancelación.' }
  }
}

// ─── FASE 3: DIVIDIR EL PAGO (SPLIT PAYMENT) ─────────────────────────────────

export interface MatchSplitShare {
  id: string
  playerName: string
  playerPhone?: string
  amountArs: number
  status: 'PAID' | 'PENDING'
  paidAt?: string
  paymentMethod?: string
  isOrganizer?: boolean
}

export interface MatchSplitDetails {
  bookingId: string
  shortCode: string
  clubName: string
  clubSlug: string
  clubPhone: string
  clubAddress: string
  bankAlias?: string
  bankName?: string
  courtName: string
  sport: string
  dateFormatted: string
  time: string
  totalAmount: number
  depositAmount: number
  balanceRemaining: number
  totalCollected: number
  recommendedShares: number
  organizerName: string
  organizerPhone?: string
  shares: MatchSplitShare[]
}

/**
 * Obtiene los detalles de un partido para dividir el pago entre amigos
 */
export async function getMatchSplitDetails(
  bookingId: string
): Promise<{ success: boolean; data?: MatchSplitDetails; error?: string }> {
  try {
    const cleanId = (bookingId || '').trim()
    if (!cleanId) return { success: false, error: 'Identificador no válido' }

    // Obtenemos los datos base de la reserva mediante getBookingPublicReceipt
    const receiptRes = await getBookingPublicReceipt(cleanId)
    if (!receiptRes.success || !receiptRes.data) {
      return { success: false, error: receiptRes.error || 'Reserva no encontrada' }
    }

    const r = receiptRes.data
    const isPadel = r.sport.toUpperCase().includes('PADEL')
    const isFutbol = r.sport.toUpperCase().includes('FUTBOL')
    const recommendedShares = isPadel ? 4 : isFutbol ? 10 : 2

    const supabase = await createServiceClient()
    const { data: dbPayments } = await supabase
      .from('booking_payments')
      .select('*')
      .eq('booking_id', cleanId)
      .order('registered_at', { ascending: true })

    const shares: MatchSplitShare[] = []
    let totalCollected = r.depositAmount

    // Cupo 1: Organizador (cubrió la seña)
    shares.push({
      id: 'organizer',
      playerName: r.customerName || 'Organizador',
      amountArs: r.depositAmount,
      status: 'PAID',
      paymentMethod: r.paymentMethod,
      isOrganizer: true,
    })

    // Pagos registrados de amigos
    if (dbPayments && Array.isArray(dbPayments)) {
      dbPayments.forEach((p, idx) => {
        // Ignorar la seña si ya fue computada
        if (p.notes && p.notes.includes('Split payment')) {
          const matchName = p.notes.match(/Jugador:\s*([^()]+)/)
          const name = matchName ? matchName[1].trim() : `Amigo #${idx + 1}`
          const matchPhone = p.notes.match(/\(([^)]+)\)/)
          const phone = matchPhone ? matchPhone[1].trim() : undefined
          const amount = (Number(p.amount_ars) || 0)

          totalCollected += amount
          shares.push({
            id: p.id,
            playerName: name,
            playerPhone: phone !== 'Sin tel' ? phone : undefined,
            amountArs: amount,
            status: 'PAID',
            paidAt: p.registered_at,
            paymentMethod: p.payment_method,
            isOrganizer: false,
          })
        }
      })
    }

    const balanceRemaining = Math.max(0, r.totalAmount - totalCollected)

    return {
      success: true,
      data: {
        bookingId: cleanId,
        shortCode: r.shortCode,
        clubName: r.clubName,
        clubSlug: r.clubSlug,
        clubPhone: r.clubPhone,
        clubAddress: r.clubAddress,
        bankAlias: r.bankAlias,
        courtName: r.courtName,
        sport: r.sport,
        dateFormatted: r.dateFormatted || r.date,
        time: r.time,
        totalAmount: r.totalAmount,
        depositAmount: r.depositAmount,
        balanceRemaining,
        totalCollected,
        recommendedShares,
        organizerName: r.customerName,
        shares,
      },
    }
  } catch (err) {
    console.error('[getMatchSplitDetails] Error:', err)
    return { success: false, error: 'Error al consultar detalles de la división' }
  }
}

/**
 * Registra el pago de una cuota de amigo en el partido dividido
 */
export async function recordPlayerSplitPayment(payload: {
  bookingId: string
  playerName: string
  playerPhone?: string
  amountArs: number
  paymentMethod: 'TRANSFER' | 'MERCADOPAGO'
  referenceNumber?: string
}): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const { bookingId, playerName, playerPhone, amountArs, paymentMethod, referenceNumber } = payload
    if (!bookingId || !playerName || amountArs <= 0) {
      return { success: false, error: 'Datos de pago incompletos' }
    }

    const supabase = await createServiceClient()

    // 1. Verificar existencia de la reserva
    let { data: booking } = await supabase
      .from('bookings')
      .select('id, tenant_id, total_amount_ars, deposit_amount_ars, internal_notes')
      .eq('id', bookingId)
      .maybeSingle()

    // Si no está con ID exacto (o es simulación), buscar por match
    if (!booking) {
      const { data: bMatch } = await supabase
        .from('bookings')
        .select('id, tenant_id, total_amount_ars, deposit_amount_ars, internal_notes')
        .ilike('id', `%${bookingId}%`)
        .maybeSingle()
      booking = bMatch
    }

    if (booking) {
      const cleanTenantId = booking.tenant_id
      const splitNote = `Split payment - Jugador: ${playerName.trim()} (${playerPhone?.trim() || 'Sin tel'})${referenceNumber ? ` [Ref: ${referenceNumber}]` : ''}`

      // Registrar pago
      await supabase.from('booking_payments').insert({
        tenant_id: cleanTenantId,
        booking_id: booking.id,
        amount_ars: amountArs,
        payment_method: paymentMethod,
        payment_date: getArgentinaTodayIso(),
        registered_at: new Date().toISOString(),
        notes: splitNote,
        reference_number: referenceNumber || null,
      })

      // Actualizar notas internas de la reserva
      const existingNotes = booking.internal_notes || ''
      const updatedNotes = `${existingNotes}\n[Pago Amigo]: ${playerName.trim()} $${amountArs} (${paymentMethod})`.trim()
      await supabase.from('bookings').update({ internal_notes: updatedNotes }).eq('id', booking.id)
    }

    revalidatePath(`/partido/${bookingId}`)
    revalidatePath(`/reserva/${bookingId}/confirmado`)
    revalidatePath('/dashboard')

    return {
      success: true,
      message: `¡Pago de ${playerName} ($${amountArs.toLocaleString('es-AR')}) registrado con éxito!`,
    }
  } catch (err) {
    console.error('[recordPlayerSplitPayment] Error:', err)
    return { success: false, error: 'Error al registrar el pago del amigo' }
  }
}



