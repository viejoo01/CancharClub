// src/app/api/webhooks/billing/mercadopago/route.ts
// ==============================================================================
// WEBHOOK HANDLER — Suscripciones y Cobranzas SaaS (Mercado Pago IPN)
// Reactiva de forma inmediata el acceso del Tenant a 'ACTIVE' al aprobarse el pago
// ==============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import type { MercadoPagoWebhookNotification, MercadoPagoPayment } from '@/types/database'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key'
  )
}

/**
 * Verifica la autenticidad del webhook de Mercado Pago mediante HMAC-SHA256
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

    let dataId: string | undefined
    try {
      const body = JSON.parse(rawBody) as MercadoPagoWebhookNotification
      dataId = body.data?.id
    } catch {
      return false
    }

    const message = `id=${dataId};request-id=${xRequestId};ts=${ts};`
    const expectedHmac = crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex')

    return crypto.timingSafeEqual(
      Buffer.from(v1),
      Buffer.from(expectedHmac)
    )
  } catch {
    return false
  }
}

/**
 * Consulta el pago en la API de Mercado Pago usando el Access Token de la plataforma SaaS
 */
async function fetchSaaSPayment(
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
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      console.error(`[Billing Webhook] Error consultando pago MP ${paymentId}: status ${response.status}`)
      return null
    }

    return (await response.json()) as MercadoPagoPayment
  } catch (err) {
    console.error(`[Billing Webhook] Excepción al consultar pago MP ${paymentId}:`, err)
    return null
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const rawBody = await request.text()
    const webhookSecret = process.env.MP_WEBHOOK_SECRET

    // 1. Verificación de Firma (si el secret está configurado y no es test mock)
    if (webhookSecret && webhookSecret !== 'test_webhook_secret') {
      const isValid = verifyMercadoPagoSignature(request, rawBody, webhookSecret)
      if (!isValid) {
        console.warn('[Billing Webhook] Firma X-Signature inválida — rechazando petición')
        return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
      }
    }

    let notification: MercadoPagoWebhookNotification
    try {
      notification = JSON.parse(rawBody) as MercadoPagoWebhookNotification
    } catch {
      return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
    }

    // Filtrar por eventos de pago
    const isPaymentEvent =
      notification.type === 'payment' ||
      notification.action === 'payment.created' ||
      notification.action === 'payment.updated'

    if (!isPaymentEvent) {
      return NextResponse.json({ received: true, ignored: true, type: notification.type })
    }

    const paymentId = notification.data?.id
    if (!paymentId) {
      return NextResponse.json({ error: 'Falta data.id en la notificación' }, { status: 400 })
    }

    // 2. Consultar el pago en Mercado Pago
    const platformAccessToken = process.env.MP_ACCESS_TOKEN
    if (!platformAccessToken || platformAccessToken.startsWith('TEST-0000000000000000')) {
      console.log(`[Billing Webhook] Modo mock/desarrollo activo para pago ${paymentId}`)
    }

    const payment = platformAccessToken && !platformAccessToken.startsWith('TEST-0000000000000000')
      ? await fetchSaaSPayment(paymentId, platformAccessToken)
      : {
          id: Number(paymentId) || 123456,
          status: 'approved',
          status_detail: 'accredited',
          external_reference: 'saas_tenant_00000000-0000-0000-0000-000000000001_inv_demo_0',
          transaction_amount: 45000,
          date_approved: new Date().toISOString(),
          payment_method_id: 'mercadopago',
          payment_type_id: 'account_money',
        } as MercadoPagoPayment

    if (!payment) {
      return NextResponse.json({ error: 'No se pudo obtener el detalle del pago' }, { status: 404 })
    }

    // 3. Procesar solo si el estado es aprobado
    if (payment.status !== 'approved') {
      console.log(`[Billing Webhook] Pago ${paymentId} en estado '${payment.status}' — sin acción requerida`)
      return NextResponse.json({ received: true, status: payment.status })
    }

    // 4. Identificar Tenant e Invoice mediante external_reference
    // Formato generado: `saas_tenant_${tenantId}_inv_${invoiceId}_${timestamp}`
    let tenantId: string | null = null
    let invoiceId: string | null = null

    if (payment.external_reference?.startsWith('saas_tenant_')) {
      const parts = payment.external_reference.split('_')
      // ['saas', 'tenant', '{tenantId}', 'inv', '{invoiceId}', '{timestamp}']
      if (parts.length >= 5) {
        tenantId = parts[2]
        invoiceId = parts[4]
      }
    }

    // Fallback a primer tenant si no vino en external_reference
    const supabase = getSupabase()
    if (!tenantId) {
      const { data: t } = await supabase
        .from('tenants')
        .select('id')
        .limit(1)
        .maybeSingle()
      tenantId = t?.id || '00000000-0000-0000-0000-000000000001'
    }

    // 5. Transacción de Reactivación Inmediata en Base de Datos
    const nowIso = new Date().toISOString()

    // A. Actualizar Factura como PAID
    if (invoiceId && !invoiceId.startsWith('demo-inv-')) {
      await supabase
        .from('tenant_invoices')
        .update({
          status: 'PAID',
          paid_at: nowIso,
          mp_preference_id: String(payment.id),
        })
        .eq('id', invoiceId)
    } else {
      // Buscar factura pendiente del tenant y marcarla
      await supabase
        .from('tenant_invoices')
        .update({
          status: 'PAID',
          paid_at: nowIso,
        })
        .eq('tenant_id', tenantId)
        .in('status', ['UNPAID', 'DRAFT'])
    }

    // B. Reactivar Inmediatamente el Tenant a 'ACTIVE'
    const { error: tenantError } = await supabase
      .from('tenants')
      .update({
        subscription_status: 'ACTIVE',
        current_balance: 0,
      })
      .eq('id', tenantId)

    if (tenantError) {
      console.error(`[Billing Webhook] Error reactivando tenant ${tenantId}:`, tenantError)
    } else {
      console.log(`[Billing Webhook] ✅ Tenant ${tenantId} REACTIVADO con éxito a estado ACTIVE`)
    }

    // C. Registrar en historial de suscripciones
    await supabase
      .from('saas_subscriptions')
      .insert({
        tenant_id: tenantId,
        plan: 'STANDARD',
        status: 'active',
        paid_at: nowIso,
        reference_slot_price_cents: Math.round((payment.transaction_amount || 45000) * 100),
        payment_notes: `Webhook MP Pago #${payment.id} - ${payment.payment_method_id} - ${payment.status_detail}`,
      })

    const duration = Date.now() - startTime
    console.log(`[Billing Webhook] Procesado con éxito en ${duration}ms para Tenant: ${tenantId}`)

    return NextResponse.json({
      received: true,
      reactivated: true,
      tenant_id: tenantId,
      status: 'ACTIVE',
      payment_id: payment.id,
      duration_ms: duration,
    })
  } catch (err: unknown) {
    console.error('[Billing Webhook] Error no controlado en webhook:', err)
    return NextResponse.json(
      { error: 'Error interno en webhook', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
