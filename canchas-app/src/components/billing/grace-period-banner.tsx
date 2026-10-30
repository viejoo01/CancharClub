'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CreditCard, X, ArrowRight, ShieldAlert, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { TenantSubscriptionStatus } from '@/types/database'

import { calculateReactivationFee } from '@/lib/saas-pricing'
import { getArgentinaTodayIso, formatARS } from '@/lib/utils'
import { createTenantInvoicePreference } from '@/actions/saas-billing.actions'
import { toast } from 'sonner'

interface GracePeriodBannerProps {
  initialStatus?: TenantSubscriptionStatus
  amountArs?: number
  dueDate?: string
  tenantId?: string | null
  invoiceId?: string
  hasCard?: boolean
}

function getDefaultDueDate(): string {
  const today = getArgentinaTodayIso()
  const [y, m] = today.split('-')
  return `${y}-${m}-10`
}

export function GracePeriodBanner({
  initialStatus = 'ACTIVE',
  amountArs = 45000,
  dueDate,
  tenantId,
  invoiceId,
  hasCard = false,
}: GracePeriodBannerProps) {
  const router = useRouter()
  const effectiveDueDate = dueDate || getDefaultDueDate()
  const [prevInitialStatus, setPrevInitialStatus] = useState(initialStatus)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [status, setStatus] = useState<TenantSubscriptionStatus>(() => {
    if (initialStatus) return initialStatus
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split('; ')
      const statusCookie = cookies.find(c => c.startsWith('demo_subscription_status='))
      if (statusCookie) {
        return statusCookie.split('=')[1] as TenantSubscriptionStatus
      }
    }
    return 'ACTIVE'
  })

  if (prevInitialStatus !== initialStatus) {
    setPrevInitialStatus(initialStatus)
    setStatus(initialStatus || 'ACTIVE')
  }
  const [isDismissed, setIsDismissed] = useState(false)

  // En ACTIVE, TRIAL o descartado no se muestra banner
  if (status === 'ACTIVE' || status === 'TRIAL' || isDismissed) {
    return null
  }

  const isPaymentPending = status === 'PAYMENT_PENDING'
  const isPartiallySuspended = status === 'PARTIALLY_SUSPENDED' || status === 'PAUSED' || status === 'LOCKED'
  const isGrace = status === 'GRACE_PERIOD' || isPaymentPending
  const reactivation = calculateReactivationFee(amountArs, effectiveDueDate, new Date(), undefined, { isLinkedCard: hasCard })

  const handlePayMonthlyInvoice = async () => {
    if (!tenantId) {
      router.push('/dashboard/plan')
      return
    }

    setIsRedirecting(true)
    try {
      toast.info(reactivation.daysOverdue > 0 
        ? 'Conectando con Mercado Pago para abonar cuota con mora...' 
        : 'Conectando con Mercado Pago para abonar cuota mensual...')
      const res = await createTenantInvoicePreference(tenantId, invoiceId)
      if (res.success && res.initPoint) {
        window.location.assign(res.initPoint)
      } else {
        toast.error(res.error || 'No se pudo generar la pasarela de pago')
        router.push('/dashboard/plan')
      }
    } catch (err) {
      console.error('Error al conectar con Mercado Pago:', err)
      toast.error('Ocurrió un error al iniciar el checkout')
      router.push('/dashboard/plan')
    } finally {
      setIsRedirecting(false)
    }
  }

  return (
    <div className={`w-full transition-all animate-in slide-in-from-top duration-300 mb-4 p-3.5 sm:px-5 sm:py-3.5 rounded-2xl border shadow-sm relative z-10 backdrop-blur-md ${
      isPartiallySuspended
        ? 'bg-rose-50/90 border-rose-200 text-rose-950 dark:bg-rose-950/40 dark:border-rose-500/30 dark:text-rose-100'
        : 'bg-amber-50/90 border-amber-200 text-amber-950 dark:bg-amber-950/40 dark:border-amber-500/30 dark:text-amber-100'
    }`}>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl border flex-shrink-0 ${
            isPartiallySuspended
              ? 'bg-rose-100 border-rose-300 text-rose-700 dark:bg-rose-500/20 dark:border-rose-500/40 dark:text-rose-400'
              : 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-500/20 dark:border-amber-500/40 dark:text-amber-400'
          }`}>
            {isPartiallySuspended ? (
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                {isPartiallySuspended
                  ? 'Club en Pausa por Falta de Pago: Reservas Públicas Deshabilitadas'
                  : isPaymentPending
                  ? 'Abono Mensual Impago — Pago Pendiente de Suscripción'
                  : 'Aviso de Pago Pendiente (Período de Gracia)'}
              </span>
              <Badge className={`text-[10px] uppercase font-mono px-2 py-0.5 font-bold ${
                isPartiallySuspended
                  ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40'
                  : isPaymentPending
                  ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40'
                  : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40'
              }`}>
                {isPartiallySuspended ? 'EN PAUSA' : isPaymentPending ? 'PAGO PENDIENTE' : status}
              </Badge>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
              {isPartiallySuspended ? (
                <>
                  Las reservas online para clientes están <strong className="text-rose-700 dark:text-rose-300 font-bold">en pausa por no abonar la suscripción a tiempo</strong>. Podés regularizarla ahora para reactivarlas inmediatamente. Saldo para reactivar: <strong className="font-mono">${reactivation.totalAmount.toLocaleString('es-AR')}</strong> (cuota base + 3% diario por mora).
                </>
              ) : isPaymentPending ? (
                reactivation.daysOverdue > 0 ? (
                  <>
                    Tu abono mensual venció el <strong className="text-slate-900 dark:text-white">{reactivation.dueDate || effectiveDueDate}</strong>. Saldo a regularizar con mora: <strong className="text-amber-800 dark:text-amber-300 font-mono font-bold">${reactivation.totalAmount.toLocaleString('es-AR')}</strong> (${amountArs.toLocaleString('es-AR')} cuota + {reactivation.daysOverdue}d de mora al 3%/día: +${reactivation.surchargeAmount.toLocaleString('es-AR')}). Regularizá tu abono para evitar la suspensión.
                  </>
                ) : (
                  <>
                    Tu abono mensual venció el <strong className="text-slate-900 dark:text-white">{reactivation.dueDate || effectiveDueDate}</strong>. Saldo a abonar: <strong className="text-amber-800 dark:text-amber-300 font-mono font-bold">${reactivation.totalAmount.toLocaleString('es-AR')}</strong> (Período de tolerancia sin recargo hasta el <strong className="text-slate-900 dark:text-white">{reactivation.toleranceEndDate}</strong>). A partir del día 8 se aplicará mora del 3% diario.
                  </>
                )
              ) : (
                <>
                  Tu factura mensual vence el <strong className="text-slate-900 dark:text-white">{effectiveDueDate}</strong>. Aboná a tiempo para evitar la pausa de reservas web el día 13.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
          <Button
            size="sm"
            onClick={handlePayMonthlyInvoice}
            disabled={isRedirecting}
            className={`rounded-xl text-xs font-bold shadow-sm cursor-pointer transition-all ${
              isPartiallySuspended
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
            }`}
          >
            {isRedirecting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                <span>Conectando con Mercado Pago...</span>
              </>
            ) : (
              <>
                <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                <span>
                  {isPartiallySuspended 
                    ? `Abonar y Reactivar Club (${formatARS(reactivation.totalAmount)})` 
                    : reactivation.daysOverdue > 0
                    ? `Pagar Cuota con Mora (${formatARS(reactivation.totalAmount)})`
                    : `Pagar Cuota Mensual (${formatARS(reactivation.totalAmount)})`}
                </span>
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </>
            )}
          </Button>

          {isGrace && (
            <button
              onClick={() => setIsDismissed(true)}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Cerrar aviso temporalmente"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
