'use client'

import { MessageCircle, Building2, Clock, CheckCircle2, ArrowRight } from 'lucide-react'

interface PendingActivationScreenProps {
  tenantName: string
}

export function PendingActivationScreen({ tenantName }: PendingActivationScreenProps) {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_DEFAULT?.replace(/\D/g, '') || '5493816839320'
  const whatsappMessage = encodeURIComponent(
    `Hola quisiera agregar mi club "${tenantName}" a CancharClub, me podrias comentar un poco mas sobre como funciona el sistema?`
  )
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`

  const emailSubject = encodeURIComponent(`Consulta activación de club: ${tenantName}`)
  const emailBody = encodeURIComponent(
    `Hola me llamo ... quisiera agregar mi club "${tenantName}" a CancharClub, me podrias comentar un poco mas sobre como funciona el sistema?`
  )
  const emailUrl = `mailto:cancharclub@gmail.com?subject=${emailSubject}&body=${emailBody}`

  return (
    <div className="flex items-center justify-center h-full min-h-125 p-6">
      <div className="w-full max-w-lg">
        <div className="relative bg-slate-900 border border-slate-700/60 rounded-2xl p-8 shadow-2xl overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-br from-emerald-950/30 via-transparent to-teal-950/20 pointer-events-none" />
          <div className="absolute -top-20 -right-20 w-60 h-60 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-2xl bg-linear-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-xl shadow-emerald-900/40">
                <Building2 className="w-10 h-10 text-white" />
              </div>
            </div>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">¡Bienvenido a CancharClub! 🎉</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Tu club <span className="text-emerald-400 font-semibold">{tenantName}</span> fue registrado exitosamente.
                Estamos casi listos — comunicate con nosotros para habilitar y activar tu cuenta con el plan ideal.
              </p>
            </div>
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 bg-slate-800/60 rounded-xl px-4 py-3 border border-slate-700/40">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="text-sm text-slate-300">Cuenta creada correctamente</span>
              </div>
              <div className="flex items-center gap-3 bg-slate-800/60 rounded-xl px-4 py-3 border border-slate-700/40">
                <Clock className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
                <span className="text-sm text-slate-300">
                  Activación de club <span className="text-amber-400 font-medium">pendiente de aprobación</span>
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-center gap-3 w-full py-4 px-6 rounded-xl font-bold text-white text-base bg-linear-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 shadow-lg shadow-emerald-900/40 hover:shadow-emerald-800/60 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                <MessageCircle className="w-5 h-5" />
                Activar mi club por WhatsApp
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>

              <a
                href={emailUrl}
                className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 hover:text-white transition-colors"
              >
                Escribinos por email (cancharclub@gmail.com)
              </a>
            </div>

            <p className="text-center text-xs text-slate-500 mt-4">
              Al hacer click abrirás WhatsApp con un mensaje automático para nuestro equipo de activación.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
