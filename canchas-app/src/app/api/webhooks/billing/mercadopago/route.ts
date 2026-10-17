// src/app/api/webhooks/billing/mercadopago/route.ts
// ==============================================================================
// WEBHOOK HANDLER — Suscripciones y Cobranzas SaaS (Mercado Pago IPN)
// Reactiva de forma inmediata el acceso del Tenant a 'ACTIVE' al aprobarse el pago
// ==============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import type { MercadoPagoWebhookNotification, MercadoPagoPayment } from '@/types/database'
import {
  recordAutoDebitAlertInternal,
  confirmCardSetupFromMercadoPagoPayment,
  confirmPreapprovalSubscriptionFromMercadoPago,
  applyReactivationPaymentInternal,
} from '@/actions/saas-billing.actions'
import { getArgentinaTodayIso } from '@/lib/utils'

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

export async function handleBillingWebhook(request: NextRequest, preReadRawBody?: string): Promise<NextResponse> {
  const startTime = Date.now()

  try {
    const rawBody = preReadRawBody !== undefined ? preReadRawBody : await request.text()
    const webhookSecret = process.env.MP_WEBHOOK_SECRET
    const xSignature = request.headers.get('x-signature')
    const xRequestId = request.headers.get('x-request-id')
    const isProd = process.env.NODE_ENV === 'production'

    // 1. Verificación de Firma Criptográfica Estricta (Blindaje anti-spoofing)
    if (isProd) {
      if (!webhookSecret) {
        console.error('[Billing Webhook] ALERTA DE SEGURIDAD: MP_WEBHOOK_SECRET no configurado en producción')
        return NextResponse.json({ error: 'Webhook secret no configurado' }, { status: 500 })
      }
      if (!xSignature || !xRequestId) {
        console.warn('[Billing Webhook] Petición rechazada en producción: Faltan cabeceras x-signature o x-request-id')
        return NextResponse.json({ error: 'Cabeceras de firma requeridas' }, { status: 401 })
      }
      const isValid = verifyMercadoPagoSignature(request, rawBody, webhookSecret)
      if (!isValid) {
        console.warn('[Billing Webhook] Firma X-Signature inválida — rechazando petición')
        return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
      }
    } else if (xSignature && webhookSecret && webhookSecret !== 'test_webhook_secret') {
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

    const supabase = getSupabase()

    // 2. ESCUDO DE IDEMPOTENCIA: Verificar si esta transacción ya fue procesada
    const { data: alreadyProcessed } = await supabase
      .from('processed_payments')
      .select('payment_id, processed_at')
      .eq('payment_id', String(paymentId))
      .maybeSingle()

    if (alreadyProcessed) {
      console.log(`[Billing Webhook] Idempotencia: Evento ${paymentId} ya procesado (${alreadyProcessed.processed_at}). Descartando duplicado.`)
      return NextResponse.json({ received: true, already_processed: true, payment_id: paymentId })
    }

    const platformAccessToken = process.env.MP_SUPERADMIN_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN

    // ─── 3. CASO 1: SUSCRIPCIÓN PREAPPROVAL CREADA / AUTORIZADA ─────────────────
    if (notification.type === 'subscription_preapproval') {
      const preapprovalId = String(paymentId)
      if (platformAccessToken && !platformAccessToken.startsWith('TEST-0000000000000000')) {
        try {
          const preRes = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
            headers: {
              Authorization: `Bearer ${platformAccessToken}`,
              'Content-Type': 'application/json',
            },
            cache: 'no-store',
          })
          if (preRes.ok) {
            const preData = await preRes.json()
            let pTenantId: string | null = null
            if (preData?.external_reference?.startsWith('saas_preapproval_')) {
              pTenantId = preData.external_reference.replace('saas_preapproval_', '')
            }
            if (pTenantId && (preData.status === 'authorized' || preData.status === 'pending')) {
              await confirmPreapprovalSubscriptionFromMercadoPago(pTenantId, preapprovalId, { skipAuth: true })
              return NextResponse.json({ received: true, preapproval: true, tenant_id: pTenantId, status: preData.status })
            }
          }
        } catch (subErr) {
          console.error('[Billing Webhook] Error resolviendo preapproval:', subErr)
        }
      }
      return NextResponse.json({ received: true, preapproval_processed: true, id: preapprovalId })
    }

    // ─── 4. CASO 2: DÉBITO AUTOMÁTICO RECURRENTE (subscription_authorized_payment) ─
    if (notification.type === 'subscription_authorized_payment') {
      const authorizedPaymentId = String(paymentId)

      if (!platformAccessToken || platformAccessToken.startsWith('TEST-0000000000000000')) {
        console.log(`[Billing Webhook] Modo mock para authorized_payment: ${authorizedPaymentId}`)
        return NextResponse.json({ received: true, mock: true, authorized_payment_id: authorizedPaymentId })
      }

      // Consultar endpoint oficial de facturas de suscripción de Mercado Pago
      const authRes = await fetch(`https://api.mercadopago.com/authorized_payments/${authorizedPaymentId}`, {
        headers: {
          Authorization: `Bearer ${platformAccessToken}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      })

      if (!authRes.ok) {
        console.error(`[Billing Webhook] Error consultando authorized_payments/${authorizedPaymentId}: HTTP ${authRes.status}`)
        return NextResponse.json({ error: 'No se pudo obtener el detalle de la factura de suscripción' }, { status: 404 })
      }

      const authData = await authRes.json()
      const preapprovalId = authData.preapproval_id ? String(authData.preapproval_id) : null

      if (!preapprovalId) {
        console.error('[Billing Webhook] Pago recurrente sin preapproval_id:', authorizedPaymentId)
        return NextResponse.json({ error: 'Falta preapproval_id en el pago autorizado' }, { status: 400 })
      }

      // Buscar el club por mp_preapproval_id indexado
      let { data: tenantRecord } = await supabase
        .from('tenants')
        .select('id, name, slug, subscription_status, current_balance, description')
        .eq('mp_preapproval_id', preapprovalId)
        .maybeSingle()

      if (!tenantRecord) {
        // Fallback por description si fue migrado
        const { data: fallbackList } = await supabase
          .from('tenants')
          .select('id, name, slug, subscription_status, current_balance, description')
          .ilike('description', `%${preapprovalId}%`)
          .limit(1)
        if (fallbackList && fallbackList.length > 0) {
          tenantRecord = fallbackList[0]
        }
      }

      if (!tenantRecord) {
        console.error(`[Billing Webhook] Club no encontrado para preapproval_id: ${preapprovalId}`)
        return NextResponse.json({ error: 'Club no encontrado para la suscripción recurrente' }, { status: 404 })
      }

      const resolvedTenantId = tenantRecord.id
      const isApproved =
        authData.payment?.status === 'approved' ||
        authData.payment?.status_detail === 'accredited' ||
        authData.status === 'authorized' ||
        authData.status === 'approved'

      const nowIso = new Date().toISOString()
      const amountNum = Number(authData.amount) || Number(authData.transaction_amount) || 0
      const amountCents = Math.round(amountNum * 100)

      if (isApproved) {
        console.log(`[Billing Webhook] ✅ Débito automático recurrente APROBADO para ${tenantRecord.name} (#${authorizedPaymentId} - $${amountNum} ARS)`)

        // 1. Idempotencia: Guardar en processed_payments
        await supabase
          .from('processed_payments')
          .upsert({
            payment_id: authorizedPaymentId,
            source: 'saas',
            tenant_id: resolvedTenantId,
            amount_cents: amountCents,
            processed_at: nowIso,
          }, { onConflict: 'payment_id' })

        // 2. Saldar o crear la factura mensual en tenant_invoices
        const now = new Date()
        const currentMonth = now.getMonth() + 1
        const currentYear = now.getFullYear()

        const { data: unpaidInv } = await supabase
          .from('tenant_invoices')
          .select('id')
          .eq('tenant_id', resolvedTenantId)
          .in('status', ['UNPAID', 'DRAFT'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (unpaidInv) {
          await supabase
            .from('tenant_invoices')
            .update({
              status: 'PAID',
              paid_at: nowIso,
              amount: amountNum > 0 ? amountNum : undefined,
              mp_payment_id: String(authData.payment?.id || authorizedPaymentId),
              notes: `Débito mensual automático acreditado PreApproval #${preapprovalId}`,
            })
            .eq('id', unpaidInv.id)
        } else {
          await supabase
            .from('tenant_invoices')
            .insert({
              tenant_id: resolvedTenantId,
              month: currentMonth,
              year: currentYear,
              amount: amountNum,
              status: 'PAID',
              reference_slot_price: 30000,
              slots_multiplier: 1.5,
              due_date: getArgentinaTodayIso(),
              paid_at: nowIso,
              mp_payment_id: String(authData.payment?.id || authorizedPaymentId),
              notes: `Débito mensual automático recurrente PreApproval #${preapprovalId}`,
            })
        }

        // 3. Reactivar club a ACTIVE y saldo en cero
        await supabase
          .from('tenants')
          .update({
            is_active: true,
            subscription_status: 'ACTIVE',
            current_balance: 0,
            mp_preapproval_id: preapprovalId,
            updated_at: nowIso,
          })
          .eq('id', resolvedTenantId)

        // 4. Historial saas_subscriptions
        const periodStart = getArgentinaTodayIso()
        const periodEnd = getArgentinaTodayIso(new Date(Date.now() + 30 * 86400000))
        await supabase
          .from('saas_subscriptions')
          .upsert({
            tenant_id: resolvedTenantId,
            plan: 'STANDARD',
            status: 'active',
            billing_period_start: periodStart,
            billing_period_end: periodEnd,
            reference_slot_price_cents: amountCents,
            plan_multiplier: 1.5,
            minimum_fee_cents: 0,
            paid_at: nowIso,
            payment_notes: `Débito automático recurrente MP #${preapprovalId} (Factura #${authorizedPaymentId})`,
          }, { onConflict: 'tenant_id,billing_period_start' })

        // 5. Notificación formal de débito realizado
        await recordAutoDebitAlertInternal(supabase, {
          tenantId: resolvedTenantId,
          type: 'SUCCESS',
          timestamp: nowIso,
          detail: `Mercado Pago: Pago mensual debitado exitosamente ($${amountNum.toLocaleString('es-AR')}).`,
        })

        return NextResponse.json({
          received: true,
          authorized_payment: true,
          tenant_id: resolvedTenantId,
          status: 'ACTIVE',
          amount: amountNum,
        })
      } else {
        console.warn(`[Billing Webhook] Débito recurrente rechazada o pendiente para ${tenantRecord.name} (Estado: ${authData.status})`)
        await recordAutoDebitAlertInternal(supabase, {
          tenantId: resolvedTenantId,
          type: 'FAILED',
          timestamp: nowIso,
          detail: `Mercado Pago: Intento de débito mensual fallido (Estado: ${authData.status || 'rechazado'}).`,
        })

        return NextResponse.json({
          received: true,
          authorized_payment: true,
          tenant_id: resolvedTenantId,
          status: authData.status,
          alert: 'FAILED',
        })
      }
    }

    // ─── 5. CASO 3: PAGOS PUNTUALES, REACTIVACIONES O CHECKOUT PRO (type: payment) 
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

    // Identificar Tenant e Invoice mediante external_reference
    let tenantId: string | null = null
    let invoiceId: string | null = null
    let isCardLink = false
    let isReactivation = false

    const extRef = payment.external_reference || ''

    if (extRef.startsWith('reactivation_tenant_')) {
      const match = extRef.match(/^reactivation_tenant_([0-9a-fA-F-]+)(?:_(\d+))?$/)
      if (match) {
        tenantId = match[1]
        isReactivation = true
      } else {
        const parts = extRef.split('_')
        if (parts.length >= 3) {
          tenantId = parts[2]
          isReactivation = true
        }
      }
    } else if (extRef.startsWith('saas_preapproval_')) {
      tenantId = extRef.replace('saas_preapproval_', '')
    } else if (extRef.startsWith('saas_tenant_')) {
      const match = extRef.match(/^saas_tenant_([0-9a-fA-F-]+)_inv_(.+?)(?:_(\d{10,}))?$/)
      if (match) {
        tenantId = match[1]
        invoiceId = match[2]
      } else {
        const parts = extRef.split('_')
        if (parts.length >= 5) {
          tenantId = parts[2]
          invoiceId = parts.slice(4).join('_')
        }
      }
    } else if (extRef.startsWith('card_link_')) {
      const match = extRef.match(/^card_link_([0-9a-fA-F-]+)(?:_(\d+))?$/)
      if (match) {
        tenantId = match[1]
        isCardLink = true
      } else {
        const parts = extRef.split('_')
        if (parts.length >= 3) {
          tenantId = parts[2]
          isCardLink = true
        }
      }
    }

    // BLINDAJE MULTI-TENANT: Validar que el tenant_id sea un UUID legítimo y exista
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
    const nowIso = new Date().toISOString()
    const payAmountNum = Number(payment.transaction_amount) || 0
    const payAmountCents = Math.round(payAmountNum * 100)

    // Vinculación de tarjeta oficial
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
        return NextResponse.json({ received: true, card_linked: false, status: payment.status })
      }
    }

    // Pago de reactivación de club pausado con recargos por mora
    if (isReactivation) {
      if (payment.status === 'approved') {
        console.log(`[Billing Webhook] ✅ Pago de reactivación para club ${resolvedTenantId} aprobado (Pago #${payment.id})`)
        
        await supabase
          .from('processed_payments')
          .upsert({
            payment_id: String(payment.id),
            source: 'reactivation',
            tenant_id: resolvedTenantId,
            amount_cents: payAmountCents,
            processed_at: nowIso,
          }, { onConflict: 'payment_id' })

        await applyReactivationPaymentInternal({
          tenantId: resolvedTenantId,
          totalPaid: payAmountNum,
          daysOverdue: 0,
          surchargeAmount: 0,
          paymentMethod: 'MERCADO_PAGO',
          notes: `Reactivación acreditada vía Webhook MP #${payment.id}`,
        })

        return NextResponse.json({
          received: true,
          reactivated: true,
          tenant_id: resolvedTenantId,
          payment_id: payment.id,
        })
      } else {
        return NextResponse.json({ received: true, reactivated: false, status: payment.status })
      }
    }

    // Validación antifraude de monto pagado contra la factura emitida
    if (invoiceId && !invoiceId.startsWith('demo-inv-')) {
      const { data: dbInvoice } = await supabase
        .from('tenant_invoices')
        .select('amount, status')
        .eq('id', invoiceId)
        .maybeSingle()

      if (dbInvoice) {
        const expectedAmount = Number(dbInvoice.amount) || 0
        if (expectedAmount > 0 && payAmountNum < expectedAmount * 0.99) {
          console.error(`[Billing Webhook] ALERTA DE FRAUDE: Monto abonado ($${payAmountNum}) menor al de la factura ($${expectedAmount})`)
          await recordAutoDebitAlertInternal(supabase, {
            tenantId: resolvedTenantId,
            type: 'FAILED',
            timestamp: nowIso,
            detail: `Intento de pago insuficiente: Pagó $${payAmountNum} pero la factura era de $${expectedAmount}`,
          })
          return NextResponse.json({ error: 'Monto pagado insuficiente' }, { status: 400 })
        }
      }
    }

    // Si el cobro no se aprobó -> Registrar alerta de intento fallido
    if (payment.status !== 'approved') {
      console.log(`[Billing Webhook] Pago ${paymentId} en estado '${payment.status}' para tenant ${resolvedTenantId}`)
      await recordAutoDebitAlertInternal(supabase, {
        tenantId: resolvedTenantId,
        type: 'FAILED',
        timestamp: payment.date_approved || nowIso,
        detail: `Mercado Pago: Estado ${payment.status} (${payment.status_detail || 'No aprobado'})`,
      })
      return NextResponse.json({ received: true, status: payment.status, alert: 'FAILED' })
    }

    // Pago puntual aprobado: Idempotencia en processed_payments
    await supabase
      .from('processed_payments')
      .upsert({
        payment_id: String(payment.id),
        source: 'saas',
        tenant_id: resolvedTenantId,
        amount_cents: payAmountCents,
        processed_at: nowIso,
      }, { onConflict: 'payment_id' })

    // Registrar alerta de pago mensual realizado
    await recordAutoDebitAlertInternal(supabase, {
      tenantId: resolvedTenantId,
      type: 'SUCCESS',
      timestamp: payment.date_approved || nowIso,
      detail: `Mercado Pago: Pago #${payment.id} acreditado exitosamente ($${payAmountNum.toLocaleString('es-AR')})`,
    })

    // Actualizar Factura como PAID
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
      await supabase
        .from('tenant_invoices')
        .update({
          status: 'PAID',
          paid_at: nowIso,
        })
        .eq('tenant_id', resolvedTenantId)
        .in('status', ['UNPAID', 'DRAFT'])
    }

    // Reactivar Tenant a 'ACTIVE'
    await supabase
      .from('tenants')
      .update({
        is_active: true,
        subscription_status: 'ACTIVE',
        current_balance: 0,
      })
      .eq('id', resolvedTenantId)

    // Registrar en historial de suscripciones
    let currentPlan = 'STANDARD'
    try {
      const { data: existingSub } = await supabase
        .from('saas_subscriptions')
        .select('plan')
        .eq('tenant_id', resolvedTenantId)
        .order('billing_period_start', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existingSub?.plan) {
        currentPlan = existingSub.plan
      }
    } catch {}

    const periodStart = getArgentinaTodayIso()
    const periodEnd = getArgentinaTodayIso(new Date(Date.now() + 30 * 86400000))
    await supabase
      .from('saas_subscriptions')
      .upsert({
        tenant_id: resolvedTenantId,
        plan: currentPlan,
        status: 'active',
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        reference_slot_price_cents: payAmountCents,
        plan_multiplier: 1.5,
        minimum_fee_cents: 0,
        paid_at: nowIso,
        payment_notes: `Webhook MP Pago #${payment.id} - ${payment.payment_method_id} - ${payment.status_detail}`,
      }, { onConflict: 'tenant_id,billing_period_start' })

    const duration = Date.now() - startTime
    console.log(`[Billing Webhook] Procesado con éxito en ${duration}ms para Tenant: ${resolvedTenantId}`)

    return NextResponse.json({
      received: true,
      reactivated: true,
      tenant_id: resolvedTenantId,
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

export async function POST(request: NextRequest) {
  return handleBillingWebhook(request)
}
