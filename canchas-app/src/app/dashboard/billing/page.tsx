import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { PayInvoiceButton } from '@/components/billing/PayInvoiceButton'
import { CheckCircle2, AlertTriangle, ArrowLeft, Receipt, ShieldCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface BillingPageProps {
  searchParams: Promise<{
    payment?: string
    invoice?: string
    status?: string
  }>
}

export default async function BillingDashboardPage({ searchParams }: BillingPageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const serviceClient = await createServiceClient()

  // Buscar tenant
  let { data: tenant } = await serviceClient
    .from('tenants')
    .select('id, name, email, subscription_status, is_active, created_at')
    .eq('email', user.email)
    .maybeSingle()

  if (!tenant) {
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.tenant_id) {
      const { data: t } = await serviceClient
        .from('tenants')
        .select('id, name, email, subscription_status, is_active, created_at')
        .eq('id', profile.tenant_id)
        .maybeSingle()
      tenant = t
    }
  }

  if (!tenant) {
    return (
      <div className="p-8 text-center text-zinc-400">
        No se encontró un club asignado a tu cuenta de usuario.
      </div>
    )
  }

  // Obtener facturas del club
  const { data: invoices } = await serviceClient
    .from('tenant_invoices')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })

  const invoiceList = (invoices || []).map(inv => {
    const monthName = inv.month 
      ? new Date(inv.year || 2026, inv.month - 1, 1).toLocaleDateString('es-AR', { month: 'long' })
      : null
    const formattedPeriod = inv.billing_period || (monthName ? `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${inv.year}` : 'Período Mensual')

    return {
      ...inv,
      billing_period: formattedPeriod,
      amount: Number(inv.amount) || 0
    }
  })

  const hasUnpaid = invoiceList.some(inv => inv.status === 'UNPAID' || inv.status === 'DRAFT')
  const isPaymentSuccess = params.payment === 'success' || params.status === 'success'
  const isPaymentFailure = params.payment === 'failure' || params.status === 'failure'
  const isPaymentPending = params.payment === 'pending' || params.status === 'pending'

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-10 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/plan"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver a Mi Abono</span>
            </Link>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mt-2 flex items-center gap-2.5">
            <Receipt className="w-7 h-7 text-sky-400" />
            <span>Panel de Facturación y Liquidaciones</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Gestión de pagos mensuales oficiales, historial de comprobantes y abono de {tenant.name}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
            tenant.subscription_status === 'ACTIVE'
              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
              : 'bg-amber-950/40 text-amber-400 border-amber-800/60'
          }`}>
            <ShieldCheck className="w-4 h-4" />
            <span>{tenant.subscription_status === 'ACTIVE' ? 'Suscripción Al Día' : 'Pago Pendiente'}</span>
          </span>
        </div>
      </div>

      {/* Alertas de Retorno de Mercado Pago */}
      {isPaymentSuccess && (
        <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/60 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-emerald-300">¡Pago procesado con éxito!</h3>
            <p className="text-xs text-emerald-400/90 mt-0.5">
              Mercado Pago acreditó tu pago. Tu factura fue cancelada y tu abono se encuentra activo sin interrupciones.
            </p>
          </div>
        </div>
      )}

      {isPaymentFailure && (
        <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/60 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-rose-300">El pago no pudo completarse</h3>
            <p className="text-xs text-rose-400/90 mt-0.5">
              Tu entidad bancaria rechazó la transacción. Por favor reintentá con otra tarjeta o medio de pago.
            </p>
          </div>
        </div>
      )}

      {isPaymentPending && (
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-amber-300">Pago en proceso de acreditación</h3>
            <p className="text-xs text-amber-400/90 mt-0.5">
              Mercado Pago está validando la operación. En cuanto se confirme, tu factura pasará automáticamente a pagada.
            </p>
          </div>
        </div>
      )}

      {/* Tabla de Facturas */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Facturas Emitidas</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Si tu débito automático no se ejecutó, podés abonar manualmente vía Checkout Pro.
            </p>
          </div>
          {hasUnpaid && (
            <span className="text-xs text-amber-400 font-medium bg-amber-950/40 border border-amber-800/60 px-2.5 py-1 rounded-md">
              Tenés facturas pendientes de cobro
            </span>
          )}
        </div>

        {invoiceList.length === 0 ? (
          <div className="p-12 text-center text-zinc-400 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <h3 className="text-sm font-semibold text-white">No hay facturas pendientes</h3>
            <p className="text-xs max-w-md mx-auto">
              Tu club no registra liquidaciones emitidas pendientes de pago.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900/80 text-zinc-400 text-xs uppercase tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Período</th>
                  <th className="py-3 px-4">Importe</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {invoiceList.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-zinc-800 hover:bg-zinc-800/20 transition-colors">
                    <td className="py-4 px-4 text-zinc-200 font-medium">
                      {invoice.billing_period}
                      {invoice.paid_at && (
                        <div className="text-[11px] text-zinc-500 font-normal">
                          Acreditado el {new Date(invoice.paid_at).toLocaleDateString('es-AR')}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4 font-mono text-zinc-100 font-semibold">
                      ${Number(invoice.amount).toLocaleString('es-AR')}
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        invoice.status === 'PAID' 
                          ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/50' 
                          : 'bg-amber-950/40 text-amber-400 border border-amber-800/50'
                      }`}>
                        {invoice.status === 'PAID' ? 'PAGADA' : 'PENDIENTE'}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <PayInvoiceButton 
                        invoiceId={invoice.id} 
                        amount={invoice.amount} 
                        dueDate={invoice.due_date || invoice.created_at}
                        status={invoice.status} 
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
