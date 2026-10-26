// src/app/api/webhooks/mercadopago/route.ts
// ==============================================================================
// WEBHOOK HANDLER — Mercado Pago IPN / Notifications
// ==============================================================================
// Flujo:
//   1. MP envía POST con { type: "payment", data: { id: "12345" } }
//   2. Verificamos la firma X-Signature
//   3. Consultamos el pago en la API de MP con el payment_id
//   4. Buscamos el booking por external_reference
//   5. Actualizamos el estado: PENDING_DEPOSIT → DEPOSIT_PAID o CANCELLED
//   6. Insertamos registro en booking_payments
//   7. Liberamos el lock de Redis si corresponde
// ==============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { releaseBookingLock } from '@/lib/redis'
import { sendBookingConfirmationToPlayer, sendNewBookingAlertToClub } from '@/lib/notifications/email.service'
import { sendAutomatedBookingConfirmation } from '@/actions/whatsapp-bot.actions'
import { recordClubNotification } from '@/actions/notifications.actions'
import { invalidateCalendarBookingsCache } from '@/actions/club.actions'
import type {
  MercadoPagoWebhookNotification,
  MercadoPagoPayment,
} from '@/types/database'
import { handleBillingWebhook } from '@/app/api/webhooks/billing/mercadopago/route'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// Candado en memoria para mitigar colisiones idénticas simultáneas de webhooks (thundering herd)
const IN_FLIGHT_WEBHOOKS = new Set<string>()

// Cliente Supabase con service_role para operaciones del webhook
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key'
  )
}

// ─── Verificación de firma de Mercado Pago ────────────────────────────────────

/**
 * Verifica la autenticidad del webhook usando el header X-Signature de MP.
 * Documentación: https://www.mercadopago.com.ar/developers/es/docs/notifications/webhooks
 *
 * La firma tiene el formato: ts=<timestamp>,v1=<hmac_sha256>
 * El mensaje a firmar es: id=<data.id>;request-id=<X-Request-Id>;ts=<ts>;
 */
function verifyMercadoPagoSignature(
  request: NextRequest,
  rawBody: string,
  secret: string
): boolean {
  try {
    const xSignature = request.headers.get('x-signature')
    const xRequestId = request.headers.get('x-request-id')

    if (!xSignature || !xRequestId) return false

    const parts = xSignature.split(',')
    const tsEntry = parts.find(p => p.startsWith('ts='))
    const v1Entry = parts.find(p => p.startsWith('v1='))

    if (!tsEntry || !v1Entry) return false

    const ts = tsEntry.split('=')[1]
    const v1 = v1Entry.split('=')[1]

    // 1. ESCUDO ANTI-REPLAY: Validar que el timestamp no tenga más de 24 horas de antigüedad (permite reintentos legítimos de MP)
    const tsNumber = parseInt(ts, 10)
    const tsMs = ts.length === 10 ? tsNumber * 1000 : tsNumber
    if (isNaN(tsNumber) || Math.abs(Date.now() - tsMs) > 24 * 60 * 60 * 1000) {
      console.warn('[MP Webhook] ALERTA: Timestamp expirado o mayor a 24 horas:', ts)
      return false
    }

    // Parsear el id del data del body
    let dataId: string | undefined
    try {
      const body = JSON.parse(rawBody) as MercadoPagoWebhookNotification
      dataId = body.data?.id
    } catch {
      return false
    }

    // Mensaje que MP firma
    const message = `id=${dataId};request-id=${xRequestId};ts=${ts};`

    const expectedHmac = crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex')

    // Comparación segura ante timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(v1),
      Buffer.from(expectedHmac)
    )
  } catch {
    return false
  }
}

// ─── Consultar pago en API de MP ──────────────────────────────────────────────

async function fetchMPPayment(
  paymentId: string | number,
  accessToken: string
): Promise<MercadoPagoPayment | null> {
  try {
    const client = new MercadoPagoConfig({ accessToken })
    const paymentApi = new Payment(client)
    const payment = await paymentApi.get({ id: String(paymentId) })
    return payment as unknown as MercadoPagoPayment
  } catch (sdkErr) {
    try {
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        }
      )

      if (response.ok) {
        return (await response.json()) as MercadoPagoPayment
      }
    } catch {}
    console.error('[MP Webhook] Error al consultar pago con SDK/fetch:', paymentId, sdkErr)
    return null
  }
}

// ─── Handler POST ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = getSupabase()
  let rawBody: string

  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  // Parsear la notificación
  let notification: Partial<MercadoPagoWebhookNotification> = {}
  try {
    if (rawBody && rawBody.trim().length > 0) {
      notification = JSON.parse(rawBody)
    }
  } catch {
    console.warn('[MP Webhook] Body no es JSON válido, verificando searchParams')
  }

  const rawNotif = notification as Record<string, unknown>
  const notifData = (notification.data || {}) as Record<string, unknown>

  // ── Detección de Simulación de Prueba del Panel de Desarrolladores de Mercado Pago ──
  const queryId = request.nextUrl.searchParams.get('id') || request.nextUrl.searchParams.get('data.id')
  const isSimulation =
    notifData.id === '123456' ||
    rawNotif.id === '123456' ||
    String(notifData.id) === '123456' ||
    String(rawNotif.id) === '123456' ||
    rawNotif.date === '2021-11-01T02:02:02Z' ||
    rawNotif.application_id === '3674151516054628' ||
    queryId === '123456' ||
    (rawBody && rawBody.includes('"123456"') && (notification.action === 'updated' || notification.action === 'created'))

  if (isSimulation) {
    console.log('[MP Webhook] Simulación de prueba de Mercado Pago detectada (ID 123456). Respondiendo HTTP 200 OK.')
    return NextResponse.json({
      received: true,
      simulated: true,
      status: 'ok',
      message: 'Webhook simulation received successfully',
      id: '123456',
    }, { status: 200 })
  }

  const queryType = request.nextUrl.searchParams.get('type') || request.nextUrl.searchParams.get('topic')

  // Si es un evento de suscripciones SaaS / abonos mensuales de clubes, enrutar directamente al motor de billing
  const isSubscriptionEvent =
    notification.type === 'subscription_authorized_payment' ||
    notification.type === 'subscription_preapproval' ||
    rawNotif.entity === 'preapproval' ||
    (typeof queryType === 'string' && (queryType.includes('subscription') || queryType.includes('preapproval')))

  if (isSubscriptionEvent) {
    console.log('[MP Webhook] Evento de suscripción SaaS detectado en webhook general. Enrutando a handleBillingWebhook...')
    return handleBillingWebhook(request, rawBody)
  }

  // Solo procesar notificaciones de tipo "payment"
  const isPaymentEvent =
    notification.type === 'payment' ||
    notification.action === 'payment.created' ||
    notification.action === 'payment.updated' ||
    queryType === 'payment'

  if (!isPaymentEvent) {
    return NextResponse.json({ received: true, skipped: 'not a payment event' }, { status: 200 })
  }

  const paymentId = 
    notification.data?.id || 
    (notification as { id?: string | number }).id ||
    request.nextUrl.searchParams.get('data.id') || 
    request.nextUrl.searchParams.get('id')

  if (!paymentId) {
    return NextResponse.json({ received: true, skipped: 'missing_payment_id' }, { status: 200 })
  }

  // ── Verificar firma usando el secret de la plataforma (para webhooks de APP con x-signature) ─
  const webhookSecret = process.env.MP_WEBHOOK_SECRET
  const xSignature = request.headers.get('x-signature')
  if (xSignature && webhookSecret && webhookSecret !== 'test_webhook_secret') {
    const isValid = verifyMercadoPagoSignature(request, rawBody, webhookSecret)
    if (!isValid) {
      console.warn('[MP Webhook] Firma inválida o no coincidente — descartando procesamiento de forma segura')
      return NextResponse.json({ received: true, ignored: true, warning: 'Invalid signature' }, { status: 200 })
    }
  } else if (process.env.NODE_ENV === 'production' && !webhookSecret) {
    console.error('[MP Webhook] ALERTA DE SEGURIDAD: MP_WEBHOOK_SECRET no configurado en producción')
  }

  const paymentIdStr = String(paymentId)

  // ── Fast-path idempotencia: Si el evento está en vuelo o ya fue asentado ─────
  if (IN_FLIGHT_WEBHOOKS.has(paymentIdStr)) {
    console.log(`[MP Webhook] Evento concurrente en vuelo para payment_id ${paymentIdStr}. Retornando 200 OK inmediatamente.`)
    return NextResponse.json({ received: true, in_flight: true })
  }

  // 1. Verificar si ya existe en booking_payments (<15ms, sin llamar a la API externa de MP)
  const { data: alreadyRecorded } = await supabase
    .from('booking_payments')
    .select('id, booking_id')
    .eq('mp_payment_id', paymentIdStr)
    .maybeSingle()

  if (alreadyRecorded) {
    console.log(`[MP Webhook] Fast-path idempotencia: payment_id ${paymentIdStr} ya asentado en booking_payments (${alreadyRecorded.id}). Descartando redundante.`)
    return NextResponse.json({ received: true, idempotent: true, note: 'already_recorded' })
  }

  // 2. Verificar si el booking ya tiene este mp_payment_id con estado confirmado
  const { data: alreadyBooked } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('mp_payment_id', paymentIdStr)
    .maybeSingle()

  if (alreadyBooked && (alreadyBooked.status === 'confirmed' || alreadyBooked.status === 'deposit_paid')) {
    console.log(`[MP Webhook] Fast-path idempotencia: booking ${alreadyBooked.id} ya confirmado con mp_payment_id ${paymentIdStr}.`)
    return NextResponse.json({ received: true, idempotent: true, note: 'booking_already_confirmed' })
  }

  IN_FLIGHT_WEBHOOKS.add(paymentIdStr)
  try {
    console.log(`[MP Webhook] Procesando payment_id: ${paymentIdStr}`)

  // ── Consultar el pago en la API de MP ─────────────────────────────────────
  let payment: MercadoPagoPayment | null = null

  // 1. Atribución directa por query params (?tenant_id=... o ?booking_id=...)
  const queryTenantId = request.nextUrl.searchParams.get('tenant_id')
  const queryBookingId = request.nextUrl.searchParams.get('booking_id')

  if (queryTenantId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(queryTenantId)) {
    const { data: tenantDirect } = await supabase
      .from('tenants')
      .select('mp_access_token')
      .eq('id', queryTenantId)
      .maybeSingle()

    if (tenantDirect?.mp_access_token && tenantDirect.mp_access_token.length > 10) {
      payment = await fetchMPPayment(paymentId, tenantDirect.mp_access_token)
    }
  }

  // 2. Si no se resolvió y vino booking_id en la URL, consultar el club de esa reserva
  if (!payment && queryBookingId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(queryBookingId)) {
    const { data: bData } = await supabase
      .from('bookings')
      .select('tenant_id')
      .eq('id', queryBookingId)
      .maybeSingle()

    if (bData?.tenant_id) {
      const { data: tFromB } = await supabase
        .from('tenants')
        .select('mp_access_token')
        .eq('id', bData.tenant_id)
        .maybeSingle()

      if (tFromB?.mp_access_token && tFromB.mp_access_token.length > 10) {
        payment = await fetchMPPayment(paymentId, tFromB.mp_access_token)
      }
    }
  }

  // 2.5 Atribución directa e instantánea mediante el user_id de Mercado Pago (collector_id del club)
  const incomingCollectorId = notification.user_id ? String(notification.user_id) : request.nextUrl.searchParams.get('user_id')
  if (!payment && incomingCollectorId) {
    const { data: tenantByCollector } = await supabase
      .from('tenants')
      .select('id, mp_access_token')
      .eq('mp_collector_id', incomingCollectorId)
      .maybeSingle()

    if (tenantByCollector?.mp_access_token && tenantByCollector.mp_access_token.length > 10) {
      payment = await fetchMPPayment(paymentId, tenantByCollector.mp_access_token)
      if (payment) {
        console.log(`[MP Webhook] Pago ${paymentId} resuelto inmediatamente por collector_id ${incomingCollectorId} (club ${tenantByCollector.id})`)
      }
    }
  }

  // 3. Si aún no se resolvió, probar con el token de la plataforma (Superadmin)
  const platformToken = process.env.MP_SUPERADMIN_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || ''
  if (!payment && platformToken && !platformToken.startsWith('TEST-0000000000000000')) {
    payment = await fetchMPPayment(paymentId, platformToken)
  }

  // 4. Fallback exhaustivo: buscar concurrentemente en bloques de 5 clubes para evitar timeout de Vercel
  if (!payment) {
    const { data: clubTenants } = await supabase
      .from('tenants')
      .select('id, mp_access_token')
      .not('mp_access_token', 'is', null)
      .limit(60)

    const validTenants = (clubTenants ?? []).filter(t => t.mp_access_token && t.mp_access_token.length > 10)
    const BATCH_SIZE = 5

    for (let i = 0; i < validTenants.length; i += BATCH_SIZE) {
      const batch = validTenants.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(t => fetchMPPayment(paymentId, t.mp_access_token!))
      )
      for (let j = 0; j < results.length; j++) {
        const res = results[j]
        if (res.status === 'fulfilled' && res.value) {
          payment = res.value
          console.log(`[MP Webhook] Pago ${paymentId} resuelto mediante token del club ${batch[j].id}`)
          break
        }
      }
      if (payment) break
    }
  }

  if (!payment) {
    console.error('[MP Webhook] Could not fetch payment:', paymentId)
    return NextResponse.json({ received: true, error: 'Could not fetch payment' }, { status: 200 })
  }

  // ── Buscar el booking por external_reference (o id de ítem) ──────────────
  const externalRef = payment.external_reference

  // ── Detección directa si external_reference es el ID de una factura (Checkout Pro manual) ─
  let invoiceMatchId: string | null = null
  if (externalRef) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(externalRef)) {
      invoiceMatchId = externalRef
    } else if (externalRef.startsWith('saas_invoice_')) {
      invoiceMatchId = externalRef.replace('saas_invoice_', '').trim()
    } else if (externalRef.includes('_inv_')) {
      const match = externalRef.match(/_inv_([0-9a-fA-F-]+)/)
      if (match) invoiceMatchId = match[1]
    }
  }

  if (invoiceMatchId) {
    const { data: invDirect } = await supabase
      .from('tenant_invoices')
      .select('id, tenant_id, status')
      .eq('id', invoiceMatchId)
      .maybeSingle()

    if (invDirect) {
      console.log(`[MP Webhook] Factura SaaS detectada directamente por external_reference: ${invDirect.id} (tenant: ${invDirect.tenant_id})`)

      if (payment.status === 'approved' && payment.status_detail === 'accredited') {
        const nowIso = new Date().toISOString()
        const paymentIdStr = String(payment.id)

        await supabase
          .from('tenant_invoices')
          .update({
            status: 'PAID',
            paid_at: nowIso,
            mp_payment_id: paymentIdStr,
            notes: `Abono mensual liquidado vía Mercado Pago (#${paymentIdStr})`
          })
          .eq('id', invDirect.id)

        await supabase
          .from('tenants')
          .update({
            subscription_status: 'ACTIVE',
            is_active: true,
            current_balance: 0,
            updated_at: nowIso
          })
          .eq('id', invDirect.tenant_id)

        await supabase
          .from('processed_payments')
          .upsert({
            payment_id: paymentIdStr,
            source: 'saas_checkout_pro',
            tenant_id: invDirect.tenant_id,
            amount_cents: Math.round((Number(payment.transaction_amount) || 0) * 100),
            processed_at: nowIso
          }, { onConflict: 'payment_id' })

        return NextResponse.json({
          received: true,
          saas_payment: true,
          invoice_id: invDirect.id,
          tenant_id: invDirect.tenant_id,
          status: 'PAID'
        }, { status: 200 })
      } else {
        console.warn(`[MP Webhook] Factura SaaS ${invDirect.id} con pago no acreditado: ${payment.status} (${payment.status_detail})`)
        return NextResponse.json({
          received: true,
          saas_payment: true,
          invoice_id: invDirect.id,
          tenant_id: invDirect.tenant_id,
          status: payment.status,
          status_detail: payment.status_detail
        }, { status: 200 })
      }
    }
  }

  // Si el pago corresponde a facturación mensual SaaS con prefijos legacy
  if (
    externalRef?.startsWith('saas_') ||
    externalRef?.startsWith('card_link_') ||
    externalRef?.startsWith('reactivation_')
  ) {
    console.log('[MP Webhook] Pago de facturación SaaS detectado por external_reference. Enrutando a handleBillingWebhook...')
    return handleBillingWebhook(request, rawBody)
  }

  // ── Detección de Cobros de Suscripción SaaS por Email de Club ─────────────
  const payerEmail = payment.payer?.email
  const isBookingExplicit = Boolean(
    externalRef?.startsWith('cancharclub_booking_') || 
    externalRef?.startsWith('booking_') ||
    externalRef?.startsWith('tournament_team_')
  )

  if (payerEmail && !isBookingExplicit) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('email', payerEmail)
      .maybeSingle()

    if (tenant) {
      console.log(`[MP Webhook] Pago mensual SaaS detectado para club ${tenant.name || tenant.id} (payer: ${payerEmail})`)
      
      // Validar aprobación bancaria estricta
      if (payment.status === 'approved' && payment.status_detail === 'accredited') {
        const nowIso = new Date().toISOString()
        const paymentIdStr = String(payment.id)

        // 1. Buscar y liquidar la factura pendiente más antigua
        const { data: unpaidInvoices } = await supabase
          .from('tenant_invoices')
          .select('id')
          .eq('tenant_id', tenant.id)
          .in('status', ['UNPAID', 'DRAFT'])
          .order('due_date', { ascending: true })
          .limit(1)

        const targetInvoiceId = unpaidInvoices?.[0]?.id

        if (targetInvoiceId) {
          await supabase
            .from('tenant_invoices')
            .update({
              status: 'PAID',
              paid_at: nowIso,
              mp_payment_id: paymentIdStr,
              notes: `Cuota mensual liquidada vía Webhook Mercado Pago (#${paymentIdStr})`
            })
            .eq('id', targetInvoiceId)
        } else {
          await supabase
            .from('tenant_invoices')
            .update({
              status: 'PAID',
              paid_at: nowIso,
              mp_payment_id: paymentIdStr
            })
            .eq('tenant_id', tenant.id)
            .eq('status', 'UNPAID')
        }

        // 2. Reactivar / Mantener el club activo
        await supabase
          .from('tenants')
          .update({ 
            subscription_status: 'ACTIVE',
            is_active: true,
            current_balance: 0,
            updated_at: nowIso
          })
          .eq('id', tenant.id)

        // 3. Registrar en processed_payments para idempotencia
        await supabase
          .from('processed_payments')
          .upsert({
            payment_id: paymentIdStr,
            source: 'saas_webhook',
            tenant_id: tenant.id,
            amount_cents: Math.round((Number(payment.transaction_amount) || 0) * 100),
            processed_at: nowIso
          }, { onConflict: 'payment_id' })

        return NextResponse.json({ 
          received: true, 
          saas_payment: true, 
          tenant_id: tenant.id, 
          status: 'PAID' 
        }, { status: 200 })
      } else {
        console.warn(`[MP Webhook] Pago mensual SaaS no acreditado para club ${tenant.name}: ${payment.status} (${payment.status_detail})`)
        return NextResponse.json({ 
          received: true, 
          saas_payment: true, 
          tenant_id: tenant.id, 
          status: payment.status,
          status_detail: payment.status_detail
        }, { status: 200 })
      }
    }
  }

  // Si el pago corresponde a una inscripción a torneo
  if (externalRef?.startsWith('tournament_team_')) {
    const teamId = externalRef.replace('tournament_team_', '').trim()
    console.log(`[MP Webhook] Pago de inscripción a torneo detectado para team_id: ${teamId}`)

    if (payment.status === 'approved') {
      const { data: updatedTeam } = await supabase
        .from('tournament_teams')
        .update({
          payment_status: 'PAID',
          mp_payment_id: String(payment.id),
          amount_paid_ars: Number(payment.transaction_amount) || 0,
        })
        .eq('id', teamId)
        .select('id, name, phone, player_1, category:tournament_categories(tournament_id, tournament:tournaments(name, tenant:tenants(name)))')
        .maybeSingle()

      if (updatedTeam) {
        const catObj = updatedTeam.category as unknown as {
          tournament_id?: string
          tournament?: { name?: string; tenant?: { name?: string } }
        } | null
        const tourName = catObj?.tournament?.name || 'Torneo'
        const clubName = catObj?.tournament?.tenant?.name || 'CancharClub'

        if (updatedTeam.phone) {
          const confirmMsg = `¡Pago confirmado con éxito! 🏆 ${updatedTeam.player_1}, el pago de inscripción del equipo "${updatedTeam.name}" para el torneo *${tourName}* en *${clubName}* fue acreditado correctamente. ¡Están 100% confirmados en el cuadro!`
          sendWhatsAppMessage(updatedTeam.phone, confirmMsg).catch((err) =>
            console.error('[Tournament MP Webhook WhatsApp Error]', err)
          )
        }
      }
    }

    return NextResponse.json({ received: true, tournament_team_id: teamId, status: payment.status })
  }

  const rawCandidate = externalRef || (payment as unknown as { additional_info?: { items?: Array<{ id?: string }> } })?.additional_info?.items?.[0]?.id
  // Extraer UUID eliminando de forma segura el prefijo oficial 'cancharclub_booking_'
  const bookingIdCandidate = rawCandidate ? rawCandidate.replace(/^cancharclub_booking_/, '').trim() : ''

  let booking: {
    id: string
    tenant_id: string
    status: string
    redis_lock_key: string | null
    staff_notes: string | null
    price_total_cents: number
    deposit_cents: number
    staff_deposit_amount_cents?: number | null
    customer_name?: string | null
    customer_email?: string | null
    booked_at?: string | null
    court_id?: string | null
    mp_payment_id?: string | null
  } | null = null

  if (bookingIdCandidate) {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingIdCandidate)
    if (isUUID) {
      const { data } = await supabase
        .from('bookings')
        .select('id, tenant_id, status, redis_lock_key, staff_notes, price_total_cents, deposit_cents, staff_deposit_amount_cents, customer_name, customer_email, booked_at, court_id, mp_payment_id')
        .eq('id', bookingIdCandidate)
        .maybeSingle()
      booking = data
    } else {
      console.warn('[MP Webhook] Candidato de booking descartado: no es un UUID válido. Búsqueda wildcard rechazada por seguridad:', rawCandidate)
    }
  }

  if (!booking) {
    console.error('[MP Webhook] Booking no encontrado para referencia:', bookingIdCandidate)
    // Retornar 200 igualmente para que MP no reintente innecesariamente
    return NextResponse.json({ received: true, warning: 'booking not found' })
  }

  // ── Idempotencia: si ya procesamos este payment_id específico, ignorar ─────
  if (
    booking.mp_payment_id === String(paymentId) ||
    (booking.staff_notes && booking.staff_notes.includes(`MP-ID:${paymentId}`))
  ) {
    return NextResponse.json({ received: true, idempotent: true })
  }

  // ── Detección de pago tardío sobre turno ya ocupado / cancelado ─────────────
  if (payment.status === 'approved' && booking.status === 'cancelled') {
    let occupantQuery = supabase
      .from('bookings')
      .select('id, customer_name')
      .eq('tenant_id', booking.tenant_id)
      .eq('court_id', booking.court_id || '')
      .in('status', ['confirmed', 'deposit_paid'])
      .neq('id', booking.id)

    if (booking.booked_at) {
      occupantQuery = occupantQuery.filter('booked_at', 'ov', booking.booked_at)
    }

    const { data: occupant } = await occupantQuery.maybeSingle()

    if (occupant) {
      console.warn(`[MP Webhook] ALERTA COLISIÓN: Turno ocupado por ${occupant.customer_name} al acreditarse pago tardío #${paymentId}`)
      await supabase
        .from('bookings')
        .update({
          mp_payment_id: String(payment.id),
          staff_notes: `${booking.staff_notes || ''} | [ALERTA PAGO TARDÍO: Seña acreditada $${payment.transaction_amount} pero el horario ya fue tomado por ${occupant.customer_name}. Requiere reprogramación o reintegro.]`,
        })
        .eq('id', booking.id)

      recordClubNotification({
        tenantId: booking.tenant_id,
        type: 'PAYMENT_RECEIVED',
        category: 'PAYMENTS',
        title: 'Pago Tardío — Turno Ya Ocupado',
        message: `El cliente ${booking.customer_name || 'Desconocido'} abonó $${payment.transaction_amount} pero el turno fue ocupado por ${occupant.customer_name}.`,
        metadata: {
          booking_id: booking.id,
          payment_id: String(payment.id),
          amount_ars: payment.transaction_amount,
        },
      }).catch(() => {})

      return NextResponse.json({
        received: true,
        warning: 'slot_already_occupied_after_timeout',
        booking_id: booking.id,
      })
    }
  }

  // ── Determinar el nuevo estado según el estado del pago en MP ─────────────
  let newStatus: string | null = null
  let depositPaidAt: string | null = null

  switch (payment.status) {
    case 'approved':
      newStatus = 'confirmed'
      depositPaidAt = payment.date_approved || new Date().toISOString()
      break
    case 'rejected':
    case 'cancelled':
      newStatus = 'cancelled'
      break
    case 'pending':
    case 'in_process':
    case 'authorized':
      // No cambiamos el estado aún, esperamos el pago confirmado
      break
    default:
      console.log(`[MP Webhook] Estado de pago ignorado: ${payment.status}`)
  }

  // ── Actualizar el booking si hay cambio de estado ─────────────────────────
  if (newStatus && newStatus !== booking.status) {
    const mpNote = `[MP-ID:${paymentId} - Estado:${payment.status.toUpperCase()} - Monto:$${payment.transaction_amount}]`
    const updatedNotes = booking.staff_notes ? `${booking.staff_notes} | ${mpNote}` : mpNote

    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      staff_notes: updatedNotes,
      mp_payment_id: String(payment.id),
    }

    if (newStatus === 'confirmed') {
      const depositCents = Math.round(Number(payment.transaction_amount || 0) * 100)
      const expectedDepositCents = Number(booking.staff_deposit_amount_cents || booking.deposit_cents || 0)

      // Verificación de integridad financiera: el monto pagado debe cubrir la seña requerida
      if (expectedDepositCents > 0 && depositCents < expectedDepositCents) {
        console.error(
          `[MP Webhook] FRAUDE O PAGO INSUFICIENTE: Pago $${payment.transaction_amount} ARS (${depositCents}¢) no cubre la seña requerida (${expectedDepositCents}¢) para booking ${booking.id}`
        )
        // No confirmar la reserva; marcarla en revisión de fraude / pago insuficiente
        newStatus = 'payment_review'
        updatePayload.status = 'payment_review'
        updatePayload.staff_notes = `${booking.staff_notes || ''} | [ALERTA FRAUDE: Pago insuficiente de $${payment.transaction_amount} vs seña requerida $${expectedDepositCents / 100}]`
      } else {
        updatePayload.deposit_cents = depositCents
        updatePayload.staff_deposit_amount_cents = depositCents
        updatePayload.paid_at = depositPaidAt
        updatePayload.payment_method = 'mercadopago'
      }
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update(updatePayload)
      .eq('id', booking.id)

    if (updateError) {
      console.error('[MP Webhook] Error actualizando booking:', updateError)
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
    }

    // Inserción relacional inmutable en booking_payments
    if (newStatus === 'confirmed') {
      try {
        const depositAmt = payment.transaction_amount || 0
        await supabase.from('booking_payments').insert({
          tenant_id: booking.tenant_id,
          booking_id: booking.id,
          amount_ars: depositAmt,
          amount_cents: Math.round(Number(depositAmt) * 100),
          payment_method: 'mercadopago',
          payment_type: 'DEPOSIT',
          payment_date: (depositPaidAt || new Date().toISOString()).split('T')[0],
          registered_at: depositPaidAt || new Date().toISOString(),
          mp_payment_id: String(payment.id),
          mp_status: payment.status,
          notes: 'Seña confirmada vía Mercado Pago',
        })
      } catch (insertPayErr) {
        console.warn('[MP Webhook] Notice inserting into booking_payments:', insertPayErr)
      }
    }

    // Registrar en audit_log para trazabilidad financiera
    try {
      await supabase.from('audit_log').insert({
        tenant_id: booking.tenant_id,
        action: 'PAYMENT_PROCESSED',
        table_name: 'bookings',
        record_id: booking.id,
        new_data: {
          payment_id: String(payment.id),
          status: payment.status,
          amount: payment.transaction_amount,
          customer_name: booking.customer_name,
        },
      })
    } catch {}

    console.log(`[MP Webhook] Booking ${booking.id} → ${newStatus}`)

    // ── Liberar el lock de Redis ──────────────────────────────────────────
    // Si el pago fue aprobado o rechazado, el lock ya no es necesario
    if (booking.redis_lock_key) {
      await releaseBookingLock(booking.redis_lock_key, booking.id)
    }

    // ── Despachar correos electrónicos transaccionales ────────────────────
    if (newStatus === 'confirmed') {
      let courtName = 'Cancha'
      try {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('name, email')
          .eq('id', booking.tenant_id)
          .maybeSingle()

        const { data: courtData } = await supabase
          .from('courts')
          .select('name')
          .eq('id', booking.court_id || '')
          .maybeSingle()

        const clubName = tenantData?.name || 'CancharClub'
        const clubEmail = tenantData?.email
        if (courtData?.name) courtName = courtData.name
        let startIso: string | undefined
        if (booking.booked_at) {
          const m = booking.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
          if (m?.[1]) startIso = m[1]
        }
        const timeStr = startIso
          ? new Date(startIso).toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Argentina/Buenos_Aires',
            })
          : ''

        if (booking.customer_email) {
          await sendBookingConfirmationToPlayer({
            playerEmail: booking.customer_email,
            playerName: booking.customer_name || 'Jugador',
            clubName,
            courtName,
            time: `${timeStr} hs`,
            bookingId: booking.id,
          })
        }

        if (clubEmail) {
          const depositCents = Math.round(Number(payment.transaction_amount || 0) * 100)
          await sendNewBookingAlertToClub({
            clubEmail,
            clubName,
            playerName: booking.customer_name || 'Jugador',
            courtName,
            time: `${timeStr} hs`,
            totalPrice: (booking.price_total_cents || 0) / 100,
            depositPaid: depositCents / 100,
          })
        }
      } catch (err) {
        console.warn('[MP Webhook] No se pudo enviar email de notificación:', err)
      }

      // Despachar confirmación automática por WhatsApp Bot (no bloqueante)
      sendAutomatedBookingConfirmation(booking.id).catch((waErr) => {
        console.warn('[MP Webhook] WhatsApp bot dispatch warning:', waErr)
      })

      // Registrar en el historial de notificaciones y alertas con el monto de seña real abonado
      const depositArs = Number(payment.transaction_amount || (updatePayload.deposit_cents ? Number(updatePayload.deposit_cents) / 100 : (booking.deposit_cents || 0) / 100))
      recordClubNotification({
        tenantId: booking.tenant_id,
        type: 'PAYMENT_RECEIVED',
        category: 'PAYMENTS',
        title: 'Seña Acreditada por Mercado Pago',
        message: `Pago de $${depositArs.toLocaleString('es-AR')} de ${booking.customer_name || 'Jugador'} acreditado automáticamente para ${courtName}.`,
        metadata: {
          booking_id: booking.id,
          customer_name: booking.customer_name || undefined,
          customer_email: booking.customer_email || undefined,
          court_name: courtName,
          amount_ars: depositArs,
          payment_method: 'Mercado Pago',
        },
      }).catch(() => {})

      // Invalidar caché en memoria del calendario para que el club vea el turno confirmado al instante
      invalidateCalendarBookingsCache(booking.tenant_id)
    }
  }

    // MP espera 200 para no reintentar
    return NextResponse.json({
      received: true,
      booking_id: booking.id,
      new_status: newStatus,
      payment_status: payment.status,
    })
  } finally {
    IN_FLIGHT_WEBHOOKS.delete(paymentIdStr)
  }
}

// GET: Endpoint de verificación (MP puede hacer GET para validar el endpoint)
export async function GET() {
  return NextResponse.json({ ok: true })
}
