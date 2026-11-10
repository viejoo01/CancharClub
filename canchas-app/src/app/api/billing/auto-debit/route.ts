// src/app/api/billing/auto-debit/route.ts
// ==============================================================================
// ENDPOINT: Ejecución y Reintento de Débito Automático Recurrente SaaS
// ==============================================================================
import { NextResponse, type NextRequest } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { getCurrentUserProfile } from '@/lib/auth-security'
import { executeTenantAutoDebit } from '@/actions/saas-billing.actions'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    let body: { tenantId?: string; invoiceId?: string; force?: boolean } = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    // 1. Verificar autorización (Cron Secret o Perfil Autenticado)
    const cronAuth = verifyCronRequest(request)
    const userProfile = await getCurrentUserProfile()

    const isAuthorizedCron = cronAuth.authorized
    const isAuthorizedUser = userProfile && (
      userProfile.role === 'SUPERADMIN' ||
      userProfile.role === 'TENANT_ADMIN' ||
      userProfile.role === 'TENANT_STAFF'
    )

    if (!isAuthorizedCron && !isAuthorizedUser) {
      return NextResponse.json({ error: 'No autorizado para ejecutar débitos automáticos' }, { status: 401 })
    }

    // 2. Determinar Tenant ID efectivo
    let targetTenantId = body.tenantId

    if (isAuthorizedUser && userProfile.role !== 'SUPERADMIN') {
      // Un admin o staff de club solo puede disparar cobros de su propio club
      targetTenantId = userProfile.tenantId || undefined
    }

    // 3. Caso A: Invocación dirigida para un club específico
    if (targetTenantId) {
      const result = await executeTenantAutoDebit({
        tenantId: targetTenantId,
        invoiceId: body.invoiceId,
        force: body.force ?? true,
      })

      return NextResponse.json({
        success: result.success,
        status: result.status,
        message: result.message,
        paymentId: result.paymentId,
        invoiceId: result.invoiceId,
        amount: result.amount,
        error: result.error,
      })
    }

    // 4. Caso B: Invocación batch / cron general (solo SuperAdmin o Cron)
    if (!isAuthorizedCron && userProfile?.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Falta tenantId para la ejecución' }, { status: 400 })
    }

    const serviceClient = await createServiceClient()
    
    // Buscar facturas impagas de clubes que tengan tarjeta vinculada
    const { data: unpaidInvoices, error: invErr } = await serviceClient
      .from('tenant_invoices')
      .select('id, tenant_id, amount, due_date')
      .eq('status', 'UNPAID')
      .order('due_date', { ascending: true })

    if (invErr) {
      return NextResponse.json({ error: 'Error consultando facturas', detail: invErr.message }, { status: 500 })
    }

    const results: Array<{ tenantId: string; invoiceId: string; status: string; success: boolean }> = []

    for (const inv of unpaidInvoices || []) {
      const { data: tenant } = await serviceClient
        .from('tenants')
        .select('id, mp_preapproval_id, description')
        .eq('id', inv.tenant_id)
        .maybeSingle()

      let meta: Record<string, unknown> = {}
      if (tenant?.description) {
        try { meta = JSON.parse(tenant.description) } catch {}
      }

      const hasCard = Boolean(tenant?.mp_preapproval_id) || Boolean(meta.card_linked)
      if (hasCard && tenant) {
        const debitRes = await executeTenantAutoDebit({
          tenantId: tenant.id,
          invoiceId: inv.id,
          force: body.force ?? false,
        })
        results.push({
          tenantId: tenant.id,
          invoiceId: inv.id,
          status: debitRes.status,
          success: debitRes.success,
        })
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      details: results,
    })

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error inesperado'
    console.error('[API AutoDebit] Error:', err)
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
