import { createServiceClient, createClient } from '@/lib/supabase/server'
import { MercadoPagoConfig, PreApproval } from 'mercadopago'

const mpAccessToken = process.env.MP_SUPERADMIN_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || ''
const client = new MercadoPagoConfig({ 
  accessToken: mpAccessToken || 'TEST-0000000000000000'
})

export interface AutoDebitResult {
  success: boolean
  status: 'PAID' | 'REJECTED' | 'FAILED_PREREQUISITES'
  errorCode?: string
  paymentId?: string
}

export async function executeTenantAutoDebit(
  tenantIdOrParams: string | { tenantId: string; invoiceId?: string; force?: boolean }, 
  invoiceIdParam?: string
): Promise<AutoDebitResult> {
  const tenantId = typeof tenantIdOrParams === 'string' ? tenantIdOrParams : tenantIdOrParams.tenantId
  let invoiceId = typeof tenantIdOrParams === 'string' ? invoiceIdParam : tenantIdOrParams.invoiceId

  const supabase = typeof createServiceClient === 'function' ? await createServiceClient() : await createClient()

  if (!invoiceId) {
    const { data: inv } = await supabase
      .from('tenant_invoices')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('status', ['UNPAID', 'DRAFT'])
      .order('due_date', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (inv) {
      invoiceId = inv.id
    }
  }

  if (!invoiceId) {
    throw new Error('Tenant o factura inexistente.')
  }

  // 1. Obtener la suscripción y los identificadores reales de Mercado Pago
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, name, email, mp_preapproval_id, subscription_status, description')
    .eq('id', tenantId)
    .single()

  const { data: invoice, error: invoiceErr } = await supabase
    .from('tenant_invoices')
    .select('id, amount, status')
    .eq('id', invoiceId)
    .single()

  if (tenantErr || invoiceErr || !invoice || !tenant) {
    throw new Error('Tenant o factura inexistente.')
  }

  // 2. REGLA FAIL-CLOSED: Si no hay preapproval_id real, abortar de inmediato
  if (!tenant.mp_preapproval_id || tenant.mp_preapproval_id.startsWith('simulated_') || tenant.mp_preapproval_id.startsWith('token_')) {
    console.warn(`[AutoDebit] Tenant ${tenantId} no posee un mp_preapproval_id activo en MP.`)
    
    // Registrar el intento fallido sin alterar el monto ni marcar como pago
    try {
      await supabase.from('auto_debit_attempts').insert({
        tenant_id: tenantId,
        invoice_id: invoiceId,
        attempt_number: 1,
        status: 'FAILED',
        failure_reason: 'MISSING_RECURRENT_CONTRACT'
      })
    } catch {}

    // Persistir timestamp de fallo en invoice si la columna está disponible
    try {
      await supabase.from('tenant_invoices').update({
        status: 'UNPAID',
        last_failed_attempt_at: new Date().toISOString()
      }).eq('id', invoiceId)
    } catch {}

    // Persistir registro en metadatos para trazabilidad de dunning
    if (tenant.description) {
      try {
        const meta = JSON.parse(tenant.description)
        const attempts = Array.isArray(meta.auto_debit_attempts) ? meta.auto_debit_attempts : []
        meta.auto_debit_attempts = [
          ...attempts,
          {
            invoice_id: invoiceId,
            attempt_number: 1,
            date: new Date().toISOString().slice(0, 10),
            status: 'REJECTED',
            reason: 'MISSING_RECURRENT_CONTRACT',
            amount: invoice.amount,
            timestamp: new Date().toISOString(),
          }
        ]
        await supabase.from('tenants').update({ description: JSON.stringify(meta) }).eq('id', tenantId)
      } catch {}
    }

    return {
      success: false,
      status: 'FAILED_PREREQUISITES',
      errorCode: 'NO_PAYMENT_METHOD_CONTRACT'
    }
  }

  try {
    // 3. Consultar o disparar el cobro real en la API oficial de Mercado Pago
    const preApproval = new PreApproval(client)
    const subscription = await preApproval.get({ id: tenant.mp_preapproval_id })

    // Verificar si el contrato en MP sigue vigente
    if (subscription.status !== 'authorized') {
      try {
        await supabase.from('auto_debit_attempts').insert({
          tenant_id: tenantId,
          invoice_id: invoiceId,
          attempt_number: 1,
          status: 'FAILED',
          failure_reason: `CONTRACT_${subscription.status?.toUpperCase()}`
        })
      } catch {}

      try {
        await supabase.from('tenant_invoices').update({
          status: 'UNPAID',
          last_failed_attempt_at: new Date().toISOString()
        }).eq('id', invoiceId)
      } catch {}

      return {
        success: false,
        status: 'REJECTED',
        errorCode: `CONTRACT_${subscription.status?.toUpperCase()}`
      }
    }

    // Mercado Pago debita de forma programada en sus propios servidores.
    // Buscamos si existe un authorized_payment acreditado en la API oficial
    let mpResponse: { id: string | number; status: string; status_detail: string; date_created?: string } | null = null

    if (mpAccessToken && !mpAccessToken.startsWith('TEST-0000000000000000')) {
      try {
        const searchRes = await fetch(
          `https://api.mercadopago.com/authorized_payments/search?preapproval_id=${encodeURIComponent(tenant.mp_preapproval_id)}`,
          {
            headers: {
              Authorization: `Bearer ${mpAccessToken}`,
              'Content-Type': 'application/json',
            },
            cache: 'no-store',
          }
        )
        if (searchRes.ok) {
          const searchData = await searchRes.json()
          const payments = Array.isArray(searchData?.results) ? searchData.results : []
          if (payments.length > 0) {
            mpResponse = payments[0]
          }
        }
      } catch (searchErr) {
        console.error('[AutoDebit] Error consultando authorized_payments en Mercado Pago:', searchErr)
      }
    }

    // Regla de Oro: La respuesta DEBE devolver estrictamente status === 'approved' y status_detail === 'accredited'
    const isApproved = Boolean(
      mpResponse &&
      mpResponse.status === 'approved' &&
      mpResponse.status_detail === 'accredited'
    )

    if (!isApproved) {
      const rejectReason = mpResponse?.status_detail || 'CARD_DECLINED_BY_BANK'

      // Registrar intento fallido para la escalera de Dunning (recargos por mora)
      try {
        await supabase.from('auto_debit_attempts').insert({
          tenant_id: tenantId,
          invoice_id: invoiceId,
          attempt_number: 1,
          status: 'FAILED',
          failure_reason: rejectReason
        })
      } catch {}

      try {
        await supabase.from('tenant_invoices').update({
          status: 'UNPAID',
          last_failed_attempt_at: new Date().toISOString()
        }).eq('id', invoiceId)
      } catch {
        await supabase.from('tenant_invoices').update({
          status: 'UNPAID'
        }).eq('id', invoiceId)
      }

      return {
        success: false,
        status: 'REJECTED',
        errorCode: rejectReason
      }
    }

    const realPaymentId = String(mpResponse!.id)

    // 4. SOLO tras aprobación bancaria real se actualizan los estados
    await supabase.from('tenant_invoices').update({
      status: 'PAID',
      paid_at: mpResponse?.date_created || new Date().toISOString(),
      mp_payment_id: realPaymentId
    }).eq('id', invoiceId)

    await supabase.from('tenants').update({
      subscription_status: 'ACTIVE'
    }).eq('id', tenantId)

    return {
      success: true,
      status: 'PAID',
      paymentId: realPaymentId
    }

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'MERCADOPAGO_API_ERROR'
    console.error('[AutoDebit Error]', error)
    return {
      success: false,
      status: 'REJECTED',
      errorCode: errorMsg
    }
  }
}
