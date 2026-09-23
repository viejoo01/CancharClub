'use client'

import { MessageCircle, Mail, Clock, AlertTriangle, Sparkles } from 'lucide-react'
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
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_DEFAULT?.replace(/\D/g, '') || '5493816839320'
  const whatsappMessage = encodeURIComponent(
    `Hola, acabo de registrar mi club "${tenantName}" con el plan "${plan.name}" (${plan.courtsLabel}) en Canchar Club y quisiera activar mi abono.`
  )
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`

  const emailSubject = encodeURIComponent(`Solicitud de activación de club: ${tenantName} - Plan ${plan.name}`)
  const emailBody = encodeURIComponent(
    `Hola, acabo de registrar mi club "${tenantName}" con el plan "${plan.name}" (${plan.courtsLabel}) en Canchar Club y deseo activar mi cuenta para comenzar a operar el sistema.`
  )
  const emailUrl = `mailto:cancharclub@gmail.com?subject=${emailSubject}&body=${emailBody}`

  const handleOpenAlert = () => {
    if (onOpenModal) {
      onOpenModal()
    } else {
      window.dispatchEvent(new CustomEvent('open-activation-modal'))
    }
  }

  return (
    <div className="w-full mb-6 relative overflow-hidden rounded-2xl border-2 border-amber-500/40 bg-linear-to-r from-amber-950/40 via-slate-900 to-amber-950/20 p-4 sm:p-6 shadow-xl shadow-amber-950/20 backdrop-blur-md">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 shrink-0 mt-0.5 shadow-sm">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                Modo Vista Previa • Activación Pendiente
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                Plan: {plan.name} ({plan.courtsLabel})
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
              Tu club &quot;{tenantName}&quot; fue registrado con éxito
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-3xl">
              Podés navegar libremente por las diferentes opciones para conocer todo el sistema. Las acciones, botones y modificaciones están bloqueados hasta que el administrador active tu cuenta según tu plan ({plan.priceTurnosLabel}). Comunicate ahora para habilitar tu club:
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleOpenAlert}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs sm:text-sm text-amber-300 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 active:scale-95 transition-all cursor-pointer"
          >
            <span>Ver Aviso de Activación</span>
          </button>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all shadow-md shadow-emerald-950/50 cursor-pointer"
          >
            <MessageCircle className="w-4 h-4 fill-white text-transparent" />
            <span>Activar por WhatsApp</span>
          </a>
          <a
            href={emailUrl}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-slate-200 bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all border border-slate-700 hover:text-white cursor-pointer"
          >
            <Mail className="w-4 h-4 text-slate-400" />
            <span>Email</span>
          </a>
        </div>
      </div>
    </div>
  )
}
