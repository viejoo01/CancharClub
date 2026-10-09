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
import { releaseBookingLock } from '@/lib/redis'
import { sendBookingConfirmationToPlayer, sendNewBookingAlertToClub } from '@/lib/notifications/email.service'
import { sendAutomatedBookingConfirmation } from '@/actions/whatsapp-bot.actions'
import type {
  MercadoPagoWebhookNotification,
  MercadoPagoPayment,
} from '@/types/database'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

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

    // 1. ESCUDO ANTI-REPLAY: Validar que el timestamp no tenga más de 10 minutos de antigüedad
    const tsNumber = parseInt(ts, 10)
    const tsMs = ts.length === 10 ? tsNumber * 1000 : tsNumber
    if (isNaN(tsNumber) || Math.abs(Date.now() - tsMs) > 10 * 60 * 1000) {
      console.warn('[MP Webhook] ALERTA: Timestamp expirado o posible ataque de repetición (replay attack):', ts)
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
  paymentId: string,
  accessToken: string
): Promise<MercadoPagoPayment | null> {
  try {
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        // No cachear — datos frescos del pago
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      console.error('[MP Webhook] Error al consultar pago:', response.status, await response.text())
      return null
    }

    return response.json()
  } catch (err) {
    console.error('[MP Webhook] Fetch error:', err)
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

  const queryType = request.nextUrl.searchParams.get('type') || request.nextUrl.searchParams.get('topic')
  // Solo procesar notificaciones de tipo "payment"
  const isPaymentEvent =
    notification.type === 'payment' ||
    notification.action === 'payment.created' ||
    notification.action === 'payment.updated' ||
    queryType === 'payment'

  if (!isPaymentEvent) {
    return NextResponse.json({ received: true, skipped: 'not a payment event' })
  }

  const paymentId = 
    notification.data?.id || 
    request.nextUrl.searchParams.get('data.id') || 
    request.nextUrl.searchParams.get('id')

  if (!paymentId) {
    return NextResponse.json({ error: 'Missing payment id' }, { status: 400 })
  }

  // ── Verificar firma usando el secret de la plataforma (para webhooks de APP) ─
  const webhookSecret = process.env.MP_WEBHOOK_SECRET
  if (webhookSecret && webhookSecret !== 'test_webhook_secret') {
    const isValid = verifyMercadoPagoSignature(request, rawBody, webhookSecret)
    if (!isValid) {
      console.warn('[MP Webhook] Firma inválida — descartando notificación maliciosa')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  } else if (process.env.NODE_ENV === 'production' && !webhookSecret) {
    console.error('[MP Webhook] ALERTA DE SEGURIDAD: MP_WEBHOOK_SECRET no configurado en producción')
  }

  console.log(`[MP Webhook] Procesando payment_id: ${paymentId}`)

  // ── Consultar el pago en la API de MP ─────────────────────────────────────
  // Usamos el access_token de la plataforma o del club
  const platformToken = process.env.MP_SUPERADMIN_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || ''
  let payment = platformToken ? await fetchMPPayment(paymentId, platformToken) : null

  // Si falló con el token de la plataforma, intentar con tokens de clubes activos
  if (!payment) {
    const { data: clubTenants } = await supabase
      .from('tenants')
      .select('mp_access_token')
      .not('mp_access_token', 'is', null)
      .limit(10)

    for (const t of clubTenants ?? []) {
      if (t.mp_access_token && t.mp_access_token.length > 10) {
        payment = await fetchMPPayment(paymentId, t.mp_access_token)
        if (payment) break
      }
    }
  }

  if (!payment) {
    console.error('[MP Webhook] Could not fetch payment:', paymentId)
    return NextResponse.json({ error: 'Could not fetch payment' }, { status: 500 })
  }

  // ── Buscar el booking por external_reference (o id de ítem) ──────────────
  const externalRef = payment.external_reference
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
    starts_at?: string | null
    court_id?: string | null
  } | null = null

  if (bookingIdCandidate) {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingIdCandidate)
    if (isUUID) {
      const { data } = await supabase
        .from('bookings')
        .select('id, tenant_id, status, redis_lock_key, staff_notes, price_total_cents, deposit_cents, staff_deposit_amount_cents, customer_name, customer_email, starts_at, court_id')
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
  if (booking.staff_notes && booking.staff_notes.includes(`MP-ID:${paymentId}`)) {
    return NextResponse.json({ received: true, idempotent: true })
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

    console.log(`[MP Webhook] Booking ${booking.id} → ${newStatus}`)

    // ── Liberar el lock de Redis ──────────────────────────────────────────
    // Si el pago fue aprobado o rechazado, el lock ya no es necesario
    if (booking.redis_lock_key) {
      await releaseBookingLock(booking.redis_lock_key, booking.id)
    }

    // ── Despachar correos electrónicos transaccionales ────────────────────
    if (newStatus === 'confirmed') {
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
        const courtName = courtData?.name || 'Cancha'
        const timeStr = booking.starts_at
          ? new Date(booking.starts_at).toLocaleTimeString('es-AR', {
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
    }
  }

  // MP espera 200 para no reintentar
  return NextResponse.json({
    received: true,
    booking_id: booking.id,
    new_status: newStatus,
    payment_status: payment.status,
  })
}

// GET: Endpoint de verificación (MP puede hacer GET para validar el endpoint)
export async function GET() {
  return NextResponse.json({ ok: true })
}
