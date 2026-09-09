'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CreditCard, X, ArrowRight, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { TenantSubscriptionStatus } from '@/types/database'

interface GracePeriodBannerProps {
  initialStatus?: TenantSubscriptionStatus
  amountArs?: number
  dueDate?: string
}

export function GracePeriodBanner({
  initialStatus = 'ACTIVE',
  amountArs = 45000,
  dueDate = '2026-09-30',
}: GracePeriodBannerProps) {
  const [status] = useState<TenantSubscriptionStatus>(() => {
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split('; ')
      const statusCookie = cookies.find(c => c.startsWith('demo_subscription_status='))
      if (statusCookie) {
        return statusCookie.split('=')[1] as TenantSubscriptionStatus
      }
    }
    return initialStatus
  })
  const [isDismissed, setIsDismissed] = useState(false)

  // En ACTIVE o PAYMENT_PENDING ordinario no se muestra banner invasivo
  if (status === 'ACTIVE' || status === 'PAYMENT_PENDING' || isDismissed) {
    return null
  }

  const isPartiallySuspended = status === 'PARTIALLY_SUSPENDED'
  const isGrace = status === 'GRACE_PERIOD'

  return (
    <div className={`w-full border-b transition-all animate-in slide-in-from-top duration-300 ${
      isPartiallySuspended
        ? 'bg-gradient-to-r from-red-950/90 via-amber-950/80 to-red-950/90 border-red-800/80 text-red-200'
        : 'bg-gradient-to-r from-amber-950/90 via-orange-950/80 to-amber-950/90 border-amber-800/80 text-amber-200'
    } p-3 sm:px-6 shadow-lg relative z-40 backdrop-blur-md`}>
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
                  ? '⚠️ Suspensión Parcial del Club: Reservas Públicas en Pausa'
                  : 'Aviso de Pago Pendiente (Período de Gracia)'}
              </span>
              <Badge className={`text-[10px] uppercase font-mono px-2 py-0.5 ${
                isPartiallySuspended
                  ? 'bg-red-500/30 text-red-300 border-red-500/40'
                  : 'bg-amber-500/30 text-amber-300 border-amber-500/40'
              }`}>
                {status}
              </Badge>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              {isPartiallySuspended ? (
                <>
                  Las reservas online para clientes están <strong className="text-red-300">deshabilitadas temporalmente</strong>. Puedes continuar registrando turnos en mostrador. Saldo vencido: <strong>${amountArs.toLocaleString('es-AR')}</strong>.
                </>
              ) : (
                <>
                  Tu factura mensual vence el <strong>{dueDate}</strong>. Abona a tiempo para evitar la pausa de reservas web el día 13.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Button
            asChild
            size="sm"
            className={`rounded-xl text-xs font-semibold shadow-md ${
              isPartiallySuspended
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/30'
                : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/30'
            }`}
          >
            <Link href="/dashboard/plan">
              <CreditCard className="w-3.5 h-3.5 mr-1.5" />
              Pagar Cuota Mensual
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Link>
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
