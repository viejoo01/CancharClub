'use client'

import { useState } from 'react'
import {
  Lock,
  CreditCard,
  AlertTriangle,
  Clock,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  MessageCircle,
  Copy,
  Check,
  ShieldAlert,
  PhoneCall
} from 'lucide-react'
import { formatARS } from '@/lib/utils'
import {
  calculateReactivationFee,
  type ReactivationFeeDetails
} from '@/lib/saas-pricing'
import {
  createReactivationPreferenceAction,
  recordReactivationPaymentAction
} from '@/actions/saas-billing.actions'
import { toast } from 'sonner'
import type { TenantSubscriptionStatus } from '@/types/database'

export type PausedSubState = 'PAGO_ATRASADO' | 'ESPERANDO_ACTIVACION'

interface PausedClubScreenProps {
  tenantId?: string | null
  tenantName: string
  subscriptionStatus?: TenantSubscriptionStatus
  baseMonthlyFeeArs?: number
  dueDate?: string
  isNewClub?: boolean
  initialSubState?: PausedSubState
  onReactivateSuccess?: () => void
  /** @deprecated No longer used. The demo simulation button has been removed. */
  onToggleSimulatedActive?: () => void
}

export function PausedClubScreen({
  tenantId,
  tenantName,
  subscriptionStatus,
  baseMonthlyFeeArs = 45000,
  dueDate,
  isNewClub = false,
  initialSubState,
  onReactivateSuccess,
}: PausedClubScreenProps) {
  // Determinar sub-estado: calculado automáticamente desde props, no se puede cambiar manualmente.
  const activeSubState: PausedSubState = initialSubState
    ? initialSubState
    : isNewClub || subscriptionStatus === 'PAYMENT_PENDING'
    ? 'ESPERANDO_ACTIVACION'
    : 'PAGO_ATRASADO'

  // Cálculo automático real de reactivación y recargo por mora (+3% por día transcurrido)
  const reactivation: ReactivationFeeDetails = calculateReactivationFee(
    baseMonthlyFeeArs,
    dueDate
  )

  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [copiedMessage, setCopiedMessage] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)

  const whatsappMessage = `Hola sume mi club "${tenantName}" a cancharclub y me gustaria activar un periodo de prueba gratuito`
  const whatsappUrl = `https://wa.me/5493816839320?text=${encodeURIComponent(whatsappMessage)}`

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(whatsappMessage)
    setCopiedMessage(true)
    toast.success('Mensaje copiado al portapapeles')
    setTimeout(() => setCopiedMessage(false), 2500)
  }

  const handlePayReactivation = async () => {
    if (!tenantId) {
      toast.error('No se pudo identificar el club para la reactivacion')
      return
    }
    setIsProcessingPayment(true)
    try {
      const res = await createReactivationPreferenceAction(tenantId, reactivation.daysOverdue)
      if (res.success && res.initPoint) {
        if (res.isSimulated) {
          toast.info('Simulando acreditacion inmediata de pago...')
          const payRes = await recordReactivationPaymentAction({
            tenantId,
            totalPaid: reactivation.totalAmount,
            daysOverdue: reactivation.daysOverdue,
            surchargeAmount: reactivation.surchargeAmount,
            paymentMethod: 'SIMULADO',
            notes: `Reactivacion de club pausado (+${reactivation.surchargePercent}% recargo)`
          })
          if (payRes.success) {
            setPaymentSuccess(true)
            toast.success('!Club reactivado con exito!', {
              description: 'Se levanto la pausa y se habilitaron todas las funciones.'
            })
            setTimeout(() => {
              if (onReactivateSuccess) onReactivateSuccess()
            }, 1800)
          }
        } else {
          toast.info('Redirigiendo a Mercado Pago...')
          window.location.assign(res.initPoint)
        }
      } else {
        toast.error(res.error || 'Error al iniciar pago con Mercado Pago')
      }
    } catch (err) {
      console.error('Error al procesar reactivacion:', err)
      toast.error('Error de comunicacion con el servicio de pagos')
    } finally {
      setIsProcessingPayment(false)
    }
  }

  if (paymentSuccess) {
    return (
      <div className="max-w-2xl mx-auto my-8 p-8 bg-slate-900 border border-emerald-500/50 rounded-3xl text-center shadow-2xl shadow-emerald-950/40 animate-in zoom-in-95 duration-300">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center mb-4">
          <CheckCircle2 className="w-9 h-9" />
        </div>
        <h2 className="text-2xl font-black text-white mb-2 tracking-tight">Pago Acreditado con Exito</h2>
        <p className="text-sm text-slate-300 mb-6">
          La suscripcion del club ha sido reactivada. Se han levantado todas las restricciones.
        </p>
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 font-mono inline-block">
          Estado restaurado: <strong className="text-white">ACTIVE (Al dia)</strong>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto my-4 sm:my-8 px-3 sm:px-6">
      {/* AVISO DE MENUS BLOQUEADOS */}
      <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm text-amber-300 text-center font-medium shadow-sm">
        <Lock className="w-4 h-4 shrink-0 text-amber-400" />
        <span>
          <strong>Acceso a menus deshabilitado:</strong> Mientras el club este pausado no es posible acceder a turnos, caja, cantina ni configuraciones.
        </span>
      </div>

      {/* CUADRO PRINCIPAL */}
      <div className="relative overflow-hidden rounded-3xl border-2 border-amber-500/40 bg-gradient-to-b from-slate-900/95 via-slate-900 to-slate-950 p-5 sm:p-8 md:p-10 shadow-2xl shadow-black/80 backdrop-blur-xl">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Encabezado */}
        <div className="text-center space-y-3 mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-inner">
            <ShieldAlert className="w-10 h-10 sm:w-12 sm:h-12 animate-pulse" />
          </div>
          <div>
            <span className="inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/40 mb-2">
              Club Pausado
            </span>
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">Club Pausado</h1>
            <p className="text-sm sm:text-base font-semibold text-slate-300 mt-1">
              Club: <span className="text-white font-bold">&quot;{tenantName}&quot;</span>
            </p>
          </div>
        </div>

        {/* VISTA: PAGO ATRASADO */}
        {activeSubState === 'PAGO_ATRASADO' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/30 flex items-start gap-3.5">
              <div className="p-2 rounded-xl bg-red-500/20 text-red-400 shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-red-300 text-sm sm:text-base">Estado: Pago atrasado</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-500/20 text-red-300 border border-red-500/40">
                    Suscripcion Vencida
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  El club se encuentra pausado temporalmente debido a que no se ha registrado el pago del abono mensual.
                  Para reactivar la cuenta de inmediato, abona la cuota adeudada con tarjeta de debito o credito incluyendo el recargo por mora del <strong>+3% por cada dia transcurrido</strong> desde el vencimiento.
                </p>
              </div>
            </div>

            {/* Desglose de calculo */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs sm:text-sm font-bold text-slate-300 uppercase tracking-wide">
                  Liquidacion de Reactivacion
                </span>
                <span className="text-xs text-amber-400 font-semibold bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                  Recargo: +3% por dia
                </span>
              </div>
              <div className="space-y-2.5 text-xs sm:text-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Precio de suscripcion mensual:</span>
                  <span className="font-semibold text-white">{formatARS(reactivation.baseAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Fecha de vencimiento:</span>
                  <span className="font-mono text-slate-200">{reactivation.dueDate}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Fecha del pago:</span>
                  <span className="font-mono text-slate-200">{reactivation.paymentDate} (Hoy)</span>
                </div>
                <div className="flex items-center justify-between text-amber-300 pt-2 border-t border-slate-800/80">
                  <span>Dias de mora: <strong>{reactivation.daysOverdue} {reactivation.daysOverdue === 1 ? 'dia' : 'dias'}</strong></span>
                  <span className="font-bold">Recargo: +{reactivation.surchargePercent}%</span>
                </div>
                <div className="flex items-center justify-between text-amber-300">
                  <span>Recargo por mora:</span>
                  <span className="font-bold">+{formatARS(reactivation.surchargeAmount)}</span>
                </div>
                <div className="pt-3 border-t border-slate-800 flex items-baseline justify-between">
                  <div>
                    <span className="text-sm font-black text-white block">TOTAL A ABONAR:</span>
                    <span className="text-[11px] text-slate-400 font-mono">(Cuota mensual + 3% por cada dia de mora)</span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight">
                      {formatARS(reactivation.totalAmount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Boton de Reactivacion */}
            <div className="pt-2 space-y-3">
              <button
                type="button"
                onClick={handlePayReactivation}
                disabled={isProcessingPayment}
                className="w-full py-4 px-6 rounded-2xl font-black text-base sm:text-lg text-white bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 active:scale-[0.99] transition-all shadow-xl shadow-emerald-950/60 flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessingPayment ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Conectando con Mercado Pago...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    <span>Reactivar Cuenta con Tarjeta (Debito o Credito) - {formatARS(reactivation.totalAmount)}</span>
                  </>
                )}
              </button>
              <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400 text-center">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Acepta Tarjeta de Debito y Credito
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Acreditacion Inmediata y Automatica
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Desbloqueo de Turnos al Instante
                </span>
              </div>
            </div>
          </div>
        )}

        {/* VISTA: ESPERANDO ACTIVACION DE PRUEBA */}
        {activeSubState === 'ESPERANDO_ACTIVACION' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="p-4 rounded-2xl bg-blue-950/30 border border-blue-500/30 flex items-start gap-3.5">
              <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 shrink-0 mt-0.5">
                <Clock className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-blue-300 text-sm sm:text-base">
                    Estado: Esperando activacion de prueba
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/40">
                    Nuevo Club
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Tu club ha sido sumado a CancharClub! Para comenzar a cargar canchas, horarios y cobrar senas, el equipo administrativo de CancharClub debe habilitar tu <strong>periodo de prueba gratuito</strong> de 15 dias ($0).
                </p>
              </div>
            </div>

            {/* Cuadro resumen */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs sm:text-sm font-bold text-slate-300 uppercase tracking-wide">
                  Datos del Registro
                </span>
                <span className="text-xs text-blue-400 font-semibold bg-blue-500/10 border border-blue-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-blue-400" />
                  15 Dias Gratis ($0 Hoy)
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3">
                  <span className="text-slate-400 block text-xs mb-1">Nombre del Club:</span>
                  <strong className="text-white text-sm sm:text-base">{tenantName}</strong>
                </div>
                <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3">
                  <span className="text-slate-400 block text-xs mb-1">Beneficio de Prueba:</span>
                  <strong className="text-emerald-400 text-sm sm:text-base">15 Dias Bonificados sin costo</strong>
                </div>
              </div>

              {/* Mensaje de WhatsApp */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-semibold">
                    Mensaje pre-configurado para enviar por WhatsApp:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyMessage}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    {copiedMessage ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedMessage ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
                <div className="p-3.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-slate-200 font-mono italic">
                  &quot;{whatsappMessage}&quot;
                </div>
              </div>
            </div>

            {/* Boton WhatsApp */}
            <div className="pt-2 space-y-3">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 px-6 rounded-2xl font-black text-base sm:text-lg text-white bg-gradient-to-r from-emerald-600 via-green-600 to-emerald-500 hover:from-emerald-500 hover:to-green-500 active:scale-[0.99] transition-all shadow-xl shadow-green-950/60 flex items-center justify-center gap-3 cursor-pointer text-center"
              >
                <MessageCircle className="w-6 h-6 fill-current" />
                <span>Avisar por WhatsApp para Activar Prueba Gratuita</span>
              </a>
              <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400 text-center">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Atencion Inmediata por Soporte CancharClub
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                  Tel: +54 9 381 683-9320
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
