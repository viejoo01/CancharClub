// src/app/api/webhooks/billing/mercadopago/route.ts
// ==============================================================================
// WEBHOOK HANDLER — Suscripciones y Cobranzas SaaS (Mercado Pago IPN)
// Reactiva de forma inmediata el acceso del Tenant a 'ACTIVE' al aprobarse el pago
// ==============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import type { MercadoPagoWebhookNotification, MercadoPagoPayment } from '@/types/database'
import { recordAutoDebitAlertInternal, confirmCardSetupFromMercadoPagoPayment } from '@/actions/saas-billing.actions'

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

    // 1. ESCUDO ANTI-REPLAY: Validar que el timestamp no tenga más de 10 minutos de antigüedad
    const tsNumber = parseInt(ts, 10)
    const tsMs = ts.length === 10 ? tsNumber * 1000 : tsNumber
    if (isNaN(tsNumber) || Math.abs(Date.now() - tsMs) > 10 * 60 * 1000) {
      console.warn('[Billing Webhook] ALERTA: Timestamp expirado o posible ataque de repetición (replay attack):', ts)
      return false
    }

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
    } else if (process.env.NODE_ENV === 'production') {
      console.error('[Billing Webhook] ALERTA DE SEGURIDAD: MP_WEBHOOK_SECRET no configurado en producción')
      return NextResponse.json({ error: 'Webhook secret no configurado' }, { status: 500 })
    }

    let notification: MercadoPagoWebhookNotification
    try {
      notification = JSON.parse(rawBody) as MercadoPagoWebhookNotification
    } catch {
      return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
    }

    // Filtrar por eventos de pago y cobros recurrentes de suscripción
    const isPaymentEvent =
      notification.type === 'payment' ||
      notification.type === 'subscription_authorized_payment' ||
      notification.type === 'subscription_preapproval' ||
      notification.action === 'payment.created' ||
      notification.action === 'payment.updated' ||
      notification.action === 'created' ||
      notification.action === 'updated'

    if (!isPaymentEvent) {
      return NextResponse.json({ received: true, ignored: true, type: notification.type })
    }

    const paymentId = notification.data?.id
    if (!paymentId) {
      return NextResponse.json({ error: 'Falta data.id en la notificación' }, { status: 400 })
    }

    // 2. Consultar el pago en Mercado Pago
    const platformAccessToken = process.env.MP_SUPERADMIN_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN
    let payment: MercadoPagoPayment | null = null

    if (platformAccessToken && !platformAccessToken.startsWith('TEST-0000000000000000')) {
      payment = await fetchSaaSPayment(paymentId, platformAccessToken)
    } else {
      if (process.env.NODE_ENV === 'production') {
        console.error('[Billing Webhook] MP_ACCESS_TOKEN no configurado en producción')
        return NextResponse.json({ error: 'Gateway de pago no configurado' }, { status: 500 })
      }
      console.log(`[Billing Webhook] Modo mock/desarrollo activo para pago ${paymentId}`)
      payment = {
        id: Number(paymentId) || 123456,
        status: 'approved',
        status_detail: 'accredited',
        external_reference: 'saas_tenant_00000000-0000-0000-0000-000000000001_inv_demo_0',
        transaction_amount: 45000,
        date_approved: new Date().toISOString(),
        payment_method_id: 'mercadopago',
        payment_type_id: 'account_money',
      } as MercadoPagoPayment
    }

    if (!payment) {
      return NextResponse.json({ error: 'No se pudo obtener el detalle del pago' }, { status: 404 })
    }

    // 3. Identificar Tenant e Invoice mediante external_reference
    // Formato generado: `saas_tenant_${tenantId}_inv_${invoiceId}_${timestamp}`
    // O vinculación de tarjeta: `card_link_${tenantId}_${timestamp}`
    let tenantId: string | null = null
    let invoiceId: string | null = null
    let isCardLink = false

    if (payment.external_reference?.startsWith('saas_tenant_')) {
      const parts = payment.external_reference.split('_')
      // ['saas', 'tenant', '{tenantId}', 'inv', '{invoiceId}', '{timestamp}']
      if (parts.length >= 5) {
        tenantId = parts[2]
        invoiceId = parts[4]
      }
    } else if (payment.external_reference?.startsWith('card_link_')) {
      const parts = payment.external_reference.split('_')
      // ['card', 'link', '{tenantId}', '{timestamp}']
      if (parts.length >= 3) {
        tenantId = parts[2]
        isCardLink = true
      }
    }

    const supabase = getSupabase()

    // BLINDAJE MULTI-TENANT: Validar que el tenant_id sea un UUID legítimo y exista en el sistema
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId || '')
    if (!tenantId || !isUUID) {
      console.error('[Billing Webhook] Referencia externa inválida o tenant_id no especificado:', payment.external_reference)
      return NextResponse.json({ received: true, error: 'invalid external reference or missing tenant' }, { status: 400 })
    }

    const { data: tenantRecord } = await supabase
      .from('tenants')
      .select('id, name, subscription_status')
      .eq('id', tenantId)
      .maybeSingle()

    if (!tenantRecord) {
      console.error('[Billing Webhook] Tenant ID no existe en la base de datos:', tenantId)
      return NextResponse.json({ received: true, error: 'tenant not found' }, { status: 404 })
    }

    const resolvedTenantId = tenantRecord.id

    // 3.0 Si es una vinculación de tarjeta oficial desde la App de Mercado Pago
    if (isCardLink) {
      const isCardLinkApproved =
        payment.status === 'approved' ||
        payment.status === 'refunded' ||
        payment.status_detail === 'refunded' ||
        payment.status_detail === 'accredited'

      if (isCardLinkApproved) {
        console.log(`[Billing Webhook] ✅ Vinculación de tarjeta para club ${resolvedTenantId} aprobada (Pago #${payment.id})`)
        await confirmCardSetupFromMercadoPagoPayment(resolvedTenantId, String(payment.id), { skipAuth: true })
        return NextResponse.json({ received: true, card_linked: true, tenant_id: resolvedTenantId })
      } else {
        console.log(`[Billing Webhook] Vinculación de tarjeta para club ${resolvedTenantId} en estado '${payment.status}'`)
        return NextResponse.json({ received: true, card_linked: false, status: payment.status })
      }
    }

    // 3.1 Validación antifraude de monto pagado contra la factura emitida
    if (invoiceId && !invoiceId.startsWith('demo-inv-')) {
      const { data: dbInvoice } = await supabase
        .from('tenant_invoices')
        .select('amount, status')
        .eq('id', invoiceId)
        .maybeSingle()

      if (dbInvoice) {
        const paidAmount = Number(payment.transaction_amount) || 0
        const expectedAmount = Number(dbInvoice.amount) || 0

        if (expectedAmount > 0 && paidAmount < expectedAmount * 0.99) {
          console.error(`[Billing Webhook] ALERTA DE FRAUDE: Monto abonado ($${paidAmount}) menor al de la factura ($${expectedAmount})`)
          await recordAutoDebitAlertInternal(supabase, {
            tenantId: resolvedTenantId,
            type: 'FAILED',
            timestamp: new Date().toISOString(),
            detail: `Intento de pago insuficiente: Pagó $${paidAmount} pero la factura era de $${expectedAmount}`,
          })
          return NextResponse.json({ error: 'Monto pagado insuficiente' }, { status: 400 })
        }
      }
    }

    // 4. Si el cobro no se aprobó o falló -> Registrar alerta de intento fallido con mensaje exacto requerido
    if (payment.status !== 'approved') {
      console.log(`[Billing Webhook] Pago ${paymentId} en estado '${payment.status}' — registrando alerta de cobro fallido para tenant ${resolvedTenantId}`)
      await recordAutoDebitAlertInternal(supabase, {
        tenantId: resolvedTenantId,
        type: 'FAILED',
        timestamp: payment.date_approved || new Date().toISOString(),
        detail: `Mercado Pago: Estado ${payment.status} (${payment.status_detail || 'No aprobado'})`,
      })
      return NextResponse.json({ received: true, status: payment.status, alert: 'FAILED' })
    }

    // 5. Si el débito automático fue aprobado -> Registrar alerta de pago mensual realizado
    console.log(`[Billing Webhook] Pago ${paymentId} APROBADO — registrando alerta de pago realizado para tenant ${resolvedTenantId}`)
    await recordAutoDebitAlertInternal(supabase, {
      tenantId: resolvedTenantId,
      type: 'SUCCESS',
      timestamp: payment.date_approved || new Date().toISOString(),
      detail: `Mercado Pago: Pago #${payment.id} acreditado exitosamente`,
    })

    // 6. Transacción de Reactivación Inmediata en Base de Datos
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
        is_active: true,
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
    const periodStart = nowIso.split('T')[0]
    const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
    await supabase
      .from('saas_subscriptions')
      .upsert({
        tenant_id: tenantId,
        plan: 'STANDARD',
        status: 'active',
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        reference_slot_price_cents: Math.round((payment.transaction_amount || 45000) * 100),
        plan_multiplier: 1.5,
        minimum_fee_cents: 0,
        paid_at: nowIso,
        payment_notes: `Webhook MP Pago #${payment.id} - ${payment.payment_method_id} - ${payment.status_detail}`,
      }, { onConflict: 'tenant_id,billing_period_start' })

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
