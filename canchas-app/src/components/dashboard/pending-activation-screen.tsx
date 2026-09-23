'use client'

import { CreditCard, Clock, AlertTriangle, Sparkles, ShieldCheck } from 'lucide-react'
import { SAAS_PLANS, type SaaSPlanId } from '@/config/saas-plans'

interface PendingActivationScreenProps {
  tenantName: string
  planId?: SaaSPlanId
  onOpenModal?: () => void
}

export function PendingActivationScreen({
  tenantName,
  planId = 'MEDIANO_2',
  onOpenModal,
}: PendingActivationScreenProps) {
  const plan = SAAS_PLANS[planId] || SAAS_PLANS.MEDIANO_2

  const handleOpenAlert = () => {
    if (onOpenModal) {
      onOpenModal()
    } else {
      window.dispatchEvent(new CustomEvent('open-activation-modal'))
    }
  }

  return (
    <div className="w-full mb-6 relative overflow-hidden rounded-2xl border-2 border-emerald-500/40 bg-linear-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 p-4 sm:p-6 shadow-xl shadow-emerald-950/20 backdrop-blur-md">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 shrink-0 mt-0.5 shadow-sm">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                Tarjeta Requerida para Operar
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                Plan: {plan.name} ({plan.courtsLabel})
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-indigo-400" />
                15 Días Gratis ($0 Hoy)
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
              Vinculá tu tarjeta para comenzar a usar CancharClub en &quot;{tenantName}&quot;
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-3xl">
              Para habilitar la carga de turnos, caja, cobro de señas y reservas públicas, es obligatorio registrar una tarjeta de débito o crédito como único medio de pago oficial. <strong>Hoy se cobra $0</strong> y el primer débito se realizará recién al cumplirse los 15 días ({plan.priceTurnosLabel}).
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleOpenAlert}
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all shadow-lg shadow-emerald-950/60 cursor-pointer"
          >
            <CreditCard className="w-4 h-4" />
            <span>Cargar Tarjeta y Activar ($0 Hoy)</span>
          </button>
        </div>
      </div>
    </div>
  )
}
