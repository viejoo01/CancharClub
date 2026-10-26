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
  const reactivation = calculateReactivationFee(amountArs, effectiveDueDate)

  const handlePayMonthlyInvoice = async () => {
    if (!tenantId) {
      router.push('/dashboard/plan')
      return
    }

    setIsRedirecting(true)
    try {
      toast.info('Conectando con Mercado Pago para abonar cuota con mora...')
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
    <div className={`w-full border-b transition-all animate-in slide-in-from-top duration-300 ${
      isPartiallySuspended
        ? 'bg-gradient-to-r from-red-950/90 via-amber-950/80 to-red-950/90 border-red-800/80 text-red-200'
        : 'bg-gradient-to-r from-amber-950/90 via-orange-950/80 to-amber-950/90 border-amber-800/80 text-amber-200'
    } p-3 sm:px-6 shadow-lg relative z-10 backdrop-blur-md`}>
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl border flex-shrink-0 ${
            isPartiallySuspended
              ? 'bg-red-500/20 border-red-500/40 text-red-400'
              : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
          }`}>
            {isPartiallySuspended ? (
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs sm:text-sm text-white">
                {isPartiallySuspended
                  ? 'Club en Pausa por Falta de Pago: Reservas Públicas Deshabilitadas'
                  : isPaymentPending
                  ? 'Abono Mensual Impago — Pago Pendiente de Suscripción'
                  : 'Aviso de Pago Pendiente (Período de Gracia)'}
              </span>
              <Badge className={`text-[10px] uppercase font-mono px-2 py-0.5 ${
                isPartiallySuspended
                  ? 'bg-rose-500/30 text-rose-200 border-rose-500/40 font-bold'
                  : isPaymentPending
                  ? 'bg-amber-500/30 text-amber-300 border-amber-500/40 font-bold'
                  : 'bg-amber-500/30 text-amber-300 border-amber-500/40'
              }`}>
                {isPartiallySuspended ? 'EN PAUSA' : isPaymentPending ? 'PAGO PENDIENTE' : status}
              </Badge>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              {isPartiallySuspended ? (
                <>
                  Las reservas online para clientes están <strong className="text-rose-300">en pausa por no abonar la suscripción a tiempo</strong>. Podés regularizarla ahora para reactivarlas inmediatamente. Saldo para reactivar: <strong>${reactivation.totalAmount.toLocaleString('es-AR')}</strong> (cuota base + 3% diario por mora).
                </>
              ) : isPaymentPending ? (
                <>
                  Tu abono mensual venció el <strong>{reactivation.dueDate || effectiveDueDate}</strong>. Saldo a regularizar con mora: <strong className="text-amber-300 font-mono">${reactivation.totalAmount.toLocaleString('es-AR')}</strong> ({reactivation.daysOverdue > 0 ? `$${amountArs.toLocaleString('es-AR')} cuota + ${reactivation.daysOverdue}d de mora al 3%/día: +$${reactivation.surchargeAmount.toLocaleString('es-AR')}` : `$${amountArs.toLocaleString('es-AR')} al día`}). Regularizá tu abono para evitar la suspensión.
                </>
              ) : (
                <>
                  Tu factura mensual vence el <strong>{effectiveDueDate}</strong>. Abona a tiempo para evitar la pausa de reservas web el día 13.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Button
            size="sm"
            onClick={handlePayMonthlyInvoice}
            disabled={isRedirecting}
            className={`rounded-xl text-xs font-semibold shadow-md cursor-pointer transition-all ${
              isPartiallySuspended
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/30'
                : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/30'
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
                    : `Pagar Cuota Mensual (${formatARS(reactivation.totalAmount)})`}
                </span>
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </>
            )}
          </Button>

          {isGrace && (
            <button
              onClick={() => setIsDismissed(true)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
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
