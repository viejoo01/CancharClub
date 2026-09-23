'use client'

import { useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  MessageCircle,
  Mail,
  CheckCircle2,
  Lock,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { SAAS_PLANS, type SaaSPlanId } from '@/config/saas-plans'

interface PlanActivationModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  tenantName: string
  planId?: SaaSPlanId
}

export function PlanActivationModal({
  isOpen,
  onOpenChange,
  tenantName,
  planId = 'MEDIANO_2',
}: PlanActivationModalProps) {
  const plan = SAAS_PLANS[planId] || SAAS_PLANS.MEDIANO_2

  // Escuchar eventos globales para abrir este modal desde cualquier punto de la app
  useEffect(() => {
    const handleOpenEvent = () => onOpenChange(true)
    window.addEventListener('open-activation-modal', handleOpenEvent)
    return () => {
      window.removeEventListener('open-activation-modal', handleOpenEvent)
    }
  }, [onOpenChange])

  const whatsappNumber =
    process.env.NEXT_PUBLIC_WHATSAPP_DEFAULT?.replace(/\D/g, '') || '5493816839320'
  const whatsappMessage = encodeURIComponent(
    `Hola, acabo de registrar mi club "${tenantName}" con el plan "${plan.name}" (${plan.courtsLabel}) en Canchar Club y quisiera activarlo para comenzar a operar.`
  )
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`

  const emailSubject = encodeURIComponent(
    `Activación de club: ${tenantName} - Plan ${plan.name}`
  )
  const emailBody = encodeURIComponent(
    `Hola Canchar Club,\n\nAcabo de registrar el club "${tenantName}" con el plan "${plan.name}" (${plan.courtsLabel}) y solicito la activación para empezar a cargar turnos y cobrar reservas.\n\nDatos del club:\n- Nombre: ${tenantName}\n- Plan: ${plan.name} (${plan.courtsLabel})\n\nMuchas gracias.`
  )
  const emailUrl = `mailto:cancharclub@gmail.com?subject=${emailSubject}&body=${emailBody}`

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl w-[95vw] sm:w-full bg-slate-900 border border-amber-500/40 text-slate-100 rounded-[28px] p-5 sm:p-7 shadow-2xl shadow-amber-950/40 max-h-[92dvh] overflow-y-auto custom-scrollbar">
        <DialogHeader className="space-y-2 text-left">
          {/* Badge de alerta de activación pendiente */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              Activación de Plan Pendiente
            </span>
            <span className="text-[11px] font-semibold text-slate-400">
              Modo Vista Previa
            </span>
          </div>

          <DialogTitle className="text-xl sm:text-2xl font-black text-white tracking-tight pt-1">
            ¡Bienvenido a Canchar Club!
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-300">
            Tu complejo <strong className="text-white font-bold">&quot;{tenantName}&quot;</strong> fue registrado con éxito. Para comenzar a recibir reservas online y operar el sistema, activá tu abono.
          </DialogDescription>
        </DialogHeader>

        {/* Tarjeta del Plan Seleccionado */}
        <div className="mt-3 p-4 sm:p-5 rounded-2xl bg-slate-950/80 border border-emerald-500/30 relative overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Plan Seleccionado
              </span>
            </div>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              {plan.badge}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4">
            <div>
              <h3 className="text-lg sm:text-xl font-black text-white">
                {plan.name} ({plan.courtsLabel})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {plan.priceSubtext}
              </p>
            </div>
            <div className="text-left sm:text-right shrink-0 mt-1 sm:mt-0">
              <span className="text-base sm:text-lg font-black text-emerald-400">
                {plan.priceTurnosLabel}
              </span>
            </div>
          </div>

          {/* Lista de prestaciones incluidas */}
          <div className="mt-4 pt-3 border-t border-slate-800/80">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Qué incluye tu plan:
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
              {plan.features.slice(0, 4).map((feat, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="leading-tight">{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recuadro de advertencia sobre funciones bloqueadas */}
        <div className="mt-3.5 p-3.5 sm:p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
            <Lock className="w-4 h-4" />
          </div>
          <div className="space-y-1 text-xs">
            <p className="font-bold text-amber-300">
              Funciones operativas temporalmente bloqueadas
            </p>
            <p className="text-slate-300 leading-relaxed font-normal">
              Podés navegar libremente por los menús del panel para explorar el sistema. Sin embargo, la creación de turnos reales, cobros por Mercado Pago y reservas públicas permanecerán inactivos hasta que se active tu cuenta.
            </p>
          </div>
        </div>

        {/* Botones de Acción */}
        <div className="mt-5 space-y-2.5">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-12 rounded-xl sm:rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold text-sm sm:text-base shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageCircle className="w-5 h-5 fill-white text-transparent" />
            <span>Activar mi Club por WhatsApp</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </a>

          <div className="flex flex-col sm:flex-row items-center gap-2">
            <a
              href={emailUrl}
              className="w-full sm:flex-1 h-10 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium text-xs sm:text-sm border border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Mail className="w-4 h-4 text-slate-400" />
              <span>Contactar por Email</span>
            </a>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto h-10 px-4 rounded-xl text-slate-400 hover:text-slate-200 text-xs sm:text-sm font-medium transition-colors hover:bg-slate-800/60 cursor-pointer"
            >
              Recorrer panel en modo prueba
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
