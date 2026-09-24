'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  CreditCard, 
  ShieldAlert, 
  Clock, 
  Percent, 
  CheckCircle2, 
  RefreshCw, 
  ExternalLink, 
  PhoneCall, 
  Copy, 
  Check, 
  Sparkles
} from 'lucide-react'
import { formatARS } from '@/lib/utils'
import { siteConfig } from '@/config/site'
import { 
  calculateReactivationFee, 
  type ReactivationFeeDetails 
} from '@/lib/saas-pricing'
import { 
  recordReactivationPaymentAction, 
  createReactivationPreferenceAction 
} from '@/actions/saas-billing.actions'
import { toast } from 'sonner'

interface ClubReactivationModalProps {
  isOpen: boolean
  onClose: () => void
  tenantId: string
  clubName: string
  baseMonthlyFeeArs: number
  dueDateStr: string
  onSuccess?: () => void
}

export function ClubReactivationModal({
  isOpen,
  onClose,
  tenantId,
  clubName,
  baseMonthlyFeeArs,
  dueDateStr,
  onSuccess,
}: ClubReactivationModalProps) {
  // Inicializar cálculo automático
  const initialCalc = calculateReactivationFee(baseMonthlyFeeArs, dueDateStr)
  
  // Días de mora (por defecto toma los calculados, con mínimo de 1 si está pausado)
  const defaultDays = initialCalc.daysOverdue > 0 ? initialCalc.daysOverdue : 3
  const [daysOverdue, setDaysOverdue] = useState<number>(defaultDays)
  
  const [isProcessing, setIsProcessing] = useState(false)
  const [copiedAlias, setCopiedAlias] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'MP' | 'TRANSFER'>('MP')

  // Recalcular con los días seleccionados
  const reactivation: ReactivationFeeDetails = calculateReactivationFee(
    baseMonthlyFeeArs,
    dueDateStr,
    new Date(),
    daysOverdue
  )

  const handleCopyAlias = () => {
    navigator.clipboard.writeText(siteConfig.billing.aliasCbu)
    setCopiedAlias(true)
    toast.success('Alias copiado al portapapeles')
    setTimeout(() => setCopiedAlias(false), 2000)
  }

  // 1. Pagar con Mercado Pago Checkout Pro
  const handlePayMercadoPago = async () => {
    setIsProcessing(true)
    try {
      const res = await createReactivationPreferenceAction(tenantId, daysOverdue)
      if (res.success && res.initPoint) {
        if (res.isSimulated) {
          // Modo prueba / desarrollo
          toast.info('Modo demo detectado: Procesando acreditación simulada...')
          await handleSimulatePayment()
        } else {
          toast.info('Abriendo pasarela oficial de Mercado Pago...')
          window.location.assign(res.initPoint)
        }
      } else {
        toast.error(res.error || 'Error al iniciar pago con Mercado Pago')
      }
    } catch (err) {
      console.error('Error al conectar con Mercado Pago:', err)
      toast.error('Ocurrió un error al iniciar el checkout')
    } finally {
      setIsProcessing(false)
    }
  }

  // 2. Simular pago aprobado y reactivar club en tiempo real
  const handleSimulatePayment = async () => {
    setIsProcessing(true)
    try {
      const res = await recordReactivationPaymentAction({
        tenantId,
        totalPaid: reactivation.totalAmount,
        daysOverdue: reactivation.daysOverdue,
        surchargeAmount: reactivation.surchargeAmount,
        paymentMethod: 'SIMULADO',
        notes: `Reactivación de prueba acreditada: Cuota base ${formatARS(reactivation.baseAmount)} + ${reactivation.daysOverdue} días de mora al 3%/día (+${formatARS(reactivation.surchargeAmount)})`,
      })

      if (res.success) {
        toast.success('¡Club Reactivado con Éxito!', {
          description: `Se levantó la pausa. El portal de reservas públicas de ${clubName} ya está activo. Total saldado: ${formatARS(reactivation.totalAmount)}.`
        })
        onClose()
        if (onSuccess) onSuccess()
      } else {
        toast.error('No se pudo reactivar el club en la base de datos')
      }
    } catch {
      toast.error('Error al procesar la reactivación')
    } finally {
      setIsProcessing(false)
    }
  }

  // Mensaje predeterminado de WhatsApp para enviar comprobante
  const whatsappMessage = encodeURIComponent(
    `Hola! Envío comprobante de transferencia para reactivar el club "${clubName}". ` +
    `Monto abonado: ${formatARS(reactivation.totalAmount)} ` +
    `(Cuota base: ${formatARS(reactivation.baseAmount)} + ${reactivation.daysOverdue} días de mora al 3%/día: ${formatARS(reactivation.surchargeAmount)}).`
  )
  const whatsappUrl = `${siteConfig.links.whatsapp}?text=${whatsappMessage}`

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-xl bg-slate-900 border border-rose-500/30 text-white rounded-3xl p-6 sm:p-7 shadow-2xl overflow-hidden">
        <DialogHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] px-2.5 py-0.5 font-bold uppercase tracking-wider animate-pulse flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" />
              Suscripción Pausada
            </Badge>
            <span className="text-xs text-slate-400 font-mono">
              Club: {clubName}
            </span>
          </div>

          <DialogTitle className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Reactivación de Suscripción del Club
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-slate-300">
            Aboná la cuota adeudada con el recargo diario reglamentario para <strong>rehabilitar de inmediato las reservas online</strong> en tu portal público.
          </DialogDescription>
        </DialogHeader>

        {/* Desglose de Cálculo: Cuota + 3% diario por mora */}
        <div className="space-y-4 my-2">
          {/* Selector / Stepper de Días de Mora (Transcurridos desde el vencimiento) */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-400" />
                Días transcurridos desde el vencimiento:
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Venció: <strong className="text-white">{reactivation.dueDate}</strong>
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDaysOverdue(Math.max(0, daysOverdue - 1))}
                  className="h-8 w-8 p-0 border-slate-700 bg-slate-900 text-slate-300 hover:text-white rounded-lg text-sm font-bold cursor-pointer"
                >
                  -
                </Button>
                <div className="px-3.5 py-1 rounded-lg bg-slate-900 border border-slate-700 font-mono font-bold text-sm text-amber-400 min-w-[70px] text-center">
                  {daysOverdue} {daysOverdue === 1 ? 'día' : 'días'}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDaysOverdue(daysOverdue + 1)}
                  className="h-8 w-8 p-0 border-slate-700 bg-slate-900 text-slate-300 hover:text-white rounded-lg text-sm font-bold cursor-pointer"
                >
                  +
                </Button>
              </div>

              {/* Botones de ajuste rápido */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setDaysOverdue(1)}
                  className={`px-2 py-1 rounded-md text-[11px] font-mono border transition-all cursor-pointer ${
                    daysOverdue === 1
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  1d (+3%)
                </button>
                <button
                  type="button"
                  onClick={() => setDaysOverdue(3)}
                  className={`px-2 py-1 rounded-md text-[11px] font-mono border transition-all cursor-pointer ${
                    daysOverdue === 3
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  3d (+9%)
                </button>
                <button
                  type="button"
                  onClick={() => setDaysOverdue(5)}
                  className={`px-2 py-1 rounded-md text-[11px] font-mono border transition-all cursor-pointer ${
                    daysOverdue === 5
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  5d (+15%)
                </button>
                <button
                  type="button"
                  onClick={() => setDaysOverdue(10)}
                  className={`px-2 py-1 rounded-md text-[11px] font-mono border transition-all cursor-pointer ${
                    daysOverdue === 10
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  10d (+30%)
                </button>
              </div>
            </div>
          </div>

          {/* Tarjeta de Resumen Detallado de Cuota + Recargo */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 border border-slate-800 space-y-3 shadow-inner">
            <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800/80">
              <span className="text-slate-400">1. Cuota mensual de suscripción base:</span>
              <span className="font-mono font-semibold text-slate-200">
                {formatARS(reactivation.baseAmount)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800/80">
              <div className="space-y-0.5">
                <span className="text-amber-400 font-medium flex items-center gap-1">
                  <Percent className="w-3.5 h-3.5" />
                  2. Recargo por mora administrativo (+3% diario):
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {reactivation.daysOverdue} {reactivation.daysOverdue === 1 ? 'día' : 'días'} x 3% = +{reactivation.surchargePercent}% sobre la cuota base
                </span>
              </div>
              <span className="font-mono font-bold text-amber-400 text-sm">
                +{formatARS(reactivation.surchargeAmount)}
              </span>
            </div>

            {/* Total Liquidado a Pagar */}
            <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">
                  Total para Reactivar Club
                </span>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Habilita reservas públicas al instante
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-emerald-400">
                  {formatARS(reactivation.totalAmount)}
                </div>
                <span className="text-[10px] text-slate-500 font-mono">Pesos Argentinos (ARS)</span>
              </div>
            </div>
          </div>

          {/* Selector de Pestañas de Pago */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setPaymentMethod('MP')}
              className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                paymentMethod === 'MP'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Mercado Pago</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('TRANSFER')}
              className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                paymentMethod === 'TRANSFER'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <PhoneCall className="w-4 h-4" />
              <span>Transferencia</span>
            </button>
          </div>

          {/* Contenido según método de pago seleccionado */}
          {paymentMethod === 'MP' ? (
            <div className="space-y-3 pt-1">
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handlePayMercadoPago}
                  disabled={isProcessing}
                  className="w-full bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold h-12 rounded-xl text-xs sm:text-sm shadow-xl shadow-blue-950/50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Conectando a Mercado Pago...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      <span>Pagar {formatARS(reactivation.totalAmount)} con Mercado Pago</span>
                      <ExternalLink className="w-4 h-4 ml-1 opacity-80" />
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSimulatePayment}
                  disabled={isProcessing}
                  className="w-full border-emerald-500/40 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200 font-bold text-xs h-10 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Acreditar Pago Inmediato (Modo Prueba / Simulación)</span>
                </Button>
              </div>

              <p className="text-[10px] text-center text-slate-400">
                Acepta Tarjetas de Débito, Crédito, Dinero en cuenta y Transferencia Mercado Pago. Acreditación automática.
              </p>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">Alias CBU / CVU:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-white text-xs sm:text-sm">
                      {siteConfig.billing.aliasCbu}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyAlias}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title="Copiar Alias"
                    >
                      {copiedAlias ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-800/80 pt-1.5">
                  <span className="text-slate-400 text-[11px]">Titular:</span>
                  <span className="font-semibold text-slate-300 text-xs">
                    {siteConfig.billing.accountHolder}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-slate-800/80 pt-1.5">
                  <span className="text-slate-400 text-[11px]">Monto exacto a transferir:</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    {formatARS(reactivation.totalAmount)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-11 px-4 rounded-xl text-xs shadow-lg shadow-emerald-950/40 transition-colors"
                >
                  <PhoneCall className="w-4 h-4" />
                  <span>Enviar Comprobante por WhatsApp</span>
                </a>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSimulatePayment}
                  disabled={isProcessing}
                  className="sm:w-1/2 border-slate-700 text-slate-300 hover:text-white text-xs h-11 rounded-xl cursor-pointer"
                >
                  <span>Reactivar de prueba</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
