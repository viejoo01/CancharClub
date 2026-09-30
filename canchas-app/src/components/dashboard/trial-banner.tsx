'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Sparkles, CreditCard, CheckCircle2, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface TrialBannerProps {
  daysRemaining: number
  dueDate: string
  hasCard?: boolean
  tenantId?: string | null
}

export function TrialBanner({
  daysRemaining,
  dueDate,
  hasCard = false,
}: TrialBannerProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        return sessionStorage.getItem('canchar_trial_banner_dismissed') === 'true'
      } catch {}
    }
    return false
  })

  const handleDismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem('canchar_trial_banner_dismissed', 'true')
    } catch {}
  }

  const handleOpenCardModal = () => {
    window.dispatchEvent(new CustomEvent('open-activation-modal'))
  }

  if (dismissed) {
    return (
      <div className="mb-4 flex items-center justify-between px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>
            Prueba Gratuita Activa: <strong>{daysRemaining} días restantes</strong> (vence el {dueDate})
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setDismissed(false)
            try {
              sessionStorage.removeItem('canchar_trial_banner_dismissed')
            } catch {}
          }}
          className="text-[11px] underline hover:text-white cursor-pointer"
        >
          Expandir aviso
        </button>
      </div>
    )
  }

  return (
    <div className="mb-5 relative overflow-hidden rounded-2xl bg-linear-to-r from-emerald-950/60 via-slate-900 to-indigo-950/50 border border-emerald-500/40 p-4 sm:p-5 shadow-xl shadow-emerald-950/20 transition-all">
      {/* Luz ambiental sutil */}
      <div className="absolute top-0 right-0 w-80 h-32 bg-emerald-500/10 blur-2xl pointer-events-none" />

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
        {/* Contenido Izquierdo */}
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5 sm:mt-0">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-black text-sm sm:text-base text-white tracking-tight flex items-center gap-1.5">
                🎉 15 Días de Prueba Gratuita en Curso
              </span>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-mono text-[11px] px-2 py-0.2 font-bold">
                {daysRemaining} {daysRemaining === 1 ? 'día restante' : 'días restantes'}
              </Badge>
              <Badge variant="outline" className="text-[11px] border-emerald-500/30 text-emerald-400 bg-emerald-950/40 font-medium">
                Hoy: $0 (Bonificado)
              </Badge>
            </div>

            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Tu club cuenta con <strong>15 días de prueba 100% bonificados</strong> hasta el <strong>{dueDate}</strong>. Podés gestionar canchas, reservas, caja y turnos fijos libremente.
              {!hasCard ? (
                <> Vinculá tu tarjeta antes del vencimiento para que tu abono continúe activo sin cortes.</>
              ) : (
                <> Ya vinculaste tu tarjeta: tu primer abono mensual se procesará recién al finalizar los 15 días.</>
              )}
            </p>
          </div>
        </div>

        {/* Acciones Derecha */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto shrink-0 pt-1 sm:pt-0">
          {!hasCard ? (
            <Button
              onClick={handleOpenCardModal}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-950/40 gap-1.5 cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Adherir Tarjeta</span>
            </Button>
          ) : (
            <div className="inline-flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-3 py-1.5 rounded-xl font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Tarjeta Adherida</span>
            </div>
          )}

          <Link href="/dashboard/plan">
            <Button
              variant="outline"
              size="sm"
              className="text-xs border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-200 rounded-xl gap-1 cursor-pointer"
            >
              <span>Ver Plan</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </Button>
          </Link>

          <button
            type="button"
            onClick={handleDismiss}
            title="Minimizar aviso"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer ml-auto md:ml-0"
            aria-label="Minimizar aviso de prueba"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
