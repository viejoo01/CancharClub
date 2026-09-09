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
import type {
  MercadoPagoWebhookNotification,
  MercadoPagoPayment,
  BookingStatus,
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
  let notification: MercadoPagoWebhookNotification
  try {
    notification = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Solo procesar notificaciones de tipo "payment"
  if (notification.type !== 'payment') {
    return NextResponse.json({ received: true, skipped: 'not a payment event' })
  }

  const paymentId = notification.data?.id
  if (!paymentId) {
    return NextResponse.json({ error: 'Missing payment id' }, { status: 400 })
  }

  // ── Verificar firma usando el secret de la plataforma (para webhooks de APP) ─
  // NOTA: En modo marketplace, el secret puede ser diferente por tenant.
  //       Para simplificar, usamos el secret global de la plataforma.
  //       En producción, implementar lookup por seller_id si se usa OAuth por club.
  const webhookSecret = process.env.MP_WEBHOOK_SECRET
  if (webhookSecret) {
    const isValid = verifyMercadoPagoSignature(request, rawBody, webhookSecret)
    if (!isValid) {
      console.warn('[MP Webhook] Firma inválida — descartando notificación')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  console.log(`[MP Webhook] Procesando payment_id: ${paymentId}`)

  // ── Consultar el pago en la API de MP ─────────────────────────────────────
  // Usamos el access_token de la plataforma (puede ser del marketplace o del club)
  const platformToken = process.env.MP_ACCESS_TOKEN!
  const payment = await fetchMPPayment(paymentId, platformToken)

  if (!payment) {
    return NextResponse.json({ error: 'Could not fetch payment' }, { status: 500 })
  }

  const externalRef = payment.external_reference

  // ── Buscar el booking por external_reference ──────────────────────────────
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, tenant_id, status, deposit_amount_ars, redis_lock_key, deposit_mp_payment_id')
    .eq('deposit_mp_external_ref', externalRef)
    .single()

  if (bookingError || !booking) {
    console.error('[MP Webhook] Booking no encontrado para external_ref:', externalRef)
    // Retornar 200 igualmente para que MP no reintente innecesariamente
    return NextResponse.json({ received: true, warning: 'booking not found' })
  }

  // ── Idempotencia: si ya procesamos este pago, ignorar ─────────────────────
  if (booking.deposit_mp_payment_id === paymentId.toString()) {
    return NextResponse.json({ received: true, idempotent: true })
  }

  // ── Determinar el nuevo estado según el estado del pago en MP ─────────────
  let newStatus: BookingStatus | null = null
  let depositPaidAt: string | null = null

  switch (payment.status) {
    case 'approved':
      newStatus = 'DEPOSIT_PAID'
      depositPaidAt = payment.date_approved || new Date().toISOString()
      break
    case 'rejected':
    case 'cancelled':
      newStatus = 'CANCELLED_USER'
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
    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      deposit_mp_payment_id: paymentId.toString(),
    }

    if (newStatus === 'DEPOSIT_PAID') {
      updatePayload.deposit_paid_at = depositPaidAt
    }

    if (newStatus === 'CANCELLED_USER') {
      updatePayload.cancelled_at = new Date().toISOString()
      updatePayload.cancellation_reason = `Pago MP ${payment.status}`
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

    // ── Insertar registro de pago en booking_payments ──────────────────────
    if (newStatus === 'DEPOSIT_PAID') {
      await supabase.from('booking_payments').insert({
        tenant_id: booking.tenant_id,
        booking_id: booking.id,
        amount_ars: payment.transaction_amount,
        payment_method: 'MERCADOPAGO',
        mp_payment_id: paymentId.toString(),
        mp_status: payment.status,
        payment_date: new Date().toISOString().split('T')[0],
        notes: `Pago online automático. MP ID: ${paymentId}. Detalle: ${payment.status_detail}`,
      })
    }

    // ── Liberar el lock de Redis ──────────────────────────────────────────
    // Si el pago fue aprobado o rechazado, el lock ya no es necesario
    if (booking.redis_lock_key) {
      await releaseBookingLock(booking.redis_lock_key, booking.id)
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
  return NextResponse.json({
    service: 'Canchar - Mercado Pago Webhook',
    status: 'active',
    timestamp: new Date().toISOString(),
  })
}
