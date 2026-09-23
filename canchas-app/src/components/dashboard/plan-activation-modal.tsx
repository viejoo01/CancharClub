'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  CreditCard,
  CheckCircle2,
  Lock,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'
import { SAAS_PLANS, type SaaSPlanId } from '@/config/saas-plans'
import { 
  confirmAndActivateSubscriptionWithCard,
  setupMonthlySubscriptionPreapproval 
} from '@/actions/saas-billing.actions'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface PlanActivationModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  tenantName: string
  tenantId?: string | null
  planId?: SaaSPlanId
}

export function PlanActivationModal({
  isOpen,
  onOpenChange,
  tenantName,
  tenantId,
  planId = 'MEDIANO_2',
}: PlanActivationModalProps) {
  const router = useRouter()
  const plan = SAAS_PLANS[planId] || SAAS_PLANS.MEDIANO_2

  // Estados del formulario de tarjeta
  const [cardNumber, setCardNumber] = useState('')
  const [cardHolder, setCardHolder] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [cardDni, setCardDni] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isOpeningMp, setIsOpeningMp] = useState(false)

  // Escuchar eventos globales para abrir este modal si el usuario intenta interactuar con funciones bloqueadas
  useEffect(() => {
    const handleOpenEvent = () => onOpenChange(true)
    window.addEventListener('open-activation-modal', handleOpenEvent)
    return () => {
      window.removeEventListener('open-activation-modal', handleOpenEvent)
    }
  }, [onOpenChange])

  // Detección de marca de tarjeta
  const cleanCardNumber = cardNumber.replace(/\D/g, '')
  const cardBrand = cleanCardNumber.startsWith('4')
    ? 'VISA'
    : cleanCardNumber.startsWith('5')
    ? 'MASTERCARD'
    : cleanCardNumber.startsWith('3')
    ? 'AMEX'
    : cleanCardNumber.startsWith('6')
    ? 'CABAL'
    : 'TARJETA'

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 16)
    const formatted = val.replace(/(\d{4})(?=\d)/g, '$1 ')
    setCardNumber(formatted)
  }

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '').slice(0, 4)
    if (val.length >= 3) {
      val = `${val.slice(0, 2)}/${val.slice(2)}`
    }
    setCardExpiry(val)
  }

  const handleSubmitCard = async (e: React.FormEvent) => {
    e.preventDefault()

    const rawNum = cardNumber.replace(/\D/g, '')
    if (rawNum.length < 15) {
      toast.error('Número de tarjeta incompleto', {
        description: 'Por favor ingresá los 16 dígitos de tu tarjeta de crédito o débito.'
      })
      return
    }

    if (!cardHolder.trim() || cardHolder.trim().length < 4) {
      toast.error('Titular de la tarjeta requerido', {
        description: 'Ingresá el nombre y apellido tal como figura impreso en el plástico.'
      })
      return
    }

    if (cardExpiry.length < 5) {
      toast.error('Fecha de vencimiento requerida', {
        description: 'Ingresá el mes y año de vencimiento en formato MM/AA.'
      })
      return
    }

    if (cardCvv.length < 3) {
      toast.error('Código de seguridad (CVV) requerido', {
        description: 'Ingresá el código de 3 o 4 dígitos al dorso de la tarjeta.'
      })
      return
    }

    setIsSubmitting(true)
    try {
      const activeTenant = tenantId || '00000000-0000-0000-0000-000000000001'
      const cardLast4 = rawNum.slice(-4)

      const res = await confirmAndActivateSubscriptionWithCard(activeTenant, {
        cardHolder: cardHolder.trim().toUpperCase(),
        cardLast4,
        cardBrand,
      })

      if (res.success) {
        toast.success('¡Tarjeta Vinculada con Éxito!', {
          description: `Tu abono a CancharClub está activo con 15 días gratis ($0 hoy). Primer cobro automático recién en el día 16.`,
          duration: 5000,
        })
        onOpenChange(false)
        router.refresh()
        // Recargar suavemente para que todo el dashboard y los layouts reconozcan el estado activo
        setTimeout(() => {
          window.location.reload()
        }, 600)
      } else {
        toast.error('Error al procesar la vinculación de la tarjeta')
      }
    } catch (err) {
      console.error('Error activating with card:', err)
      toast.error('Ocurrió un error al vincular la tarjeta')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenMpPortal = async () => {
    setIsOpeningMp(true)
    try {
      const activeTenant = tenantId || '00000000-0000-0000-0000-000000000001'
      const res = await setupMonthlySubscriptionPreapproval(activeTenant)
      if (res.success && res.initPoint) {
        toast.info('Abriendo portal de Mercado Pago Subscriptions...', {
          description: 'Cargá tu tarjeta en la pasarela segura para activar tu prueba gratis.'
        })
        window.location.assign(res.initPoint)
      } else {
        toast.error('No se pudo conectar con Mercado Pago. Podés cargar la tarjeta directamente en el formulario superior.')
      }
    } catch {
      toast.error('Error al inicializar la pasarela de Mercado Pago')
    } finally {
      setIsOpeningMp(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        hideCloseButton={true}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="sm:max-w-xl w-[95vw] sm:w-full bg-slate-900 border-2 border-emerald-500/50 text-slate-100 rounded-[28px] p-5 sm:p-7 shadow-2xl shadow-emerald-950/60 max-h-[94dvh] overflow-y-auto custom-scrollbar"
      >
        <DialogHeader className="space-y-2 text-left">
          {/* Badge obligatorio */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              <CreditCard className="w-3.5 h-3.5" />
              Tarjeta Requerida • 15 Días Gratis ($0 Hoy)
            </span>
            <span className="text-[11px] font-semibold text-slate-400">
              Paso Obligatorio
            </span>
          </div>

          <DialogTitle className="text-xl sm:text-2xl font-black text-white tracking-tight pt-1">
            Vinculá tu Tarjeta para Activar tu Club
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Para comenzar a utilizar CancharClub y recibir reservas online en <strong className="text-white font-bold">&quot;{tenantName}&quot;</strong>, es obligatorio cargar una tarjeta de débito o crédito.
          </DialogDescription>
        </DialogHeader>

        {/* Resumen del Plan Seleccionado */}
        <div className="mt-2 p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              {plan.name} ({plan.courtsLabel})
            </div>
            <p className="text-[11px] text-slate-400">
              {plan.priceTurnosLabel} • {plan.priceSubtext}
            </p>
          </div>
          <span className="shrink-0 text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            {plan.badge}
          </span>
        </div>

        {/* Banner de Garantía y Condiciones Claras */}
        <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>HOY SE COBRA $0 — 15 DÍAS DE PRUEBA 100% BONIFICADOS</span>
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            Mercado Pago valida tu tarjeta sin costo. Tu primer débito mensual se realizará <strong>recién al cumplirse los 15 días</strong>. El débito con tarjeta es el único medio de pago oficial habilitado para el abono.
          </p>
          <div className="flex items-center gap-2 text-[10px] text-slate-400 pt-0.5 font-mono">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Débito automático oficial
            </span>
            <span>•</span>
            <span>Resumen de tarjeta: <strong>CancharClub</strong></span>
          </div>
        </div>

        {/* Previsualización visual de Tarjeta */}
        <div className="relative h-40 rounded-2xl p-4 bg-linear-to-tr from-slate-950 via-indigo-950 to-blue-900 border border-indigo-500/40 shadow-xl flex flex-col justify-between text-white overflow-hidden font-mono select-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-6 rounded bg-amber-400/80 border border-amber-300/40 flex items-center justify-center text-[8px] font-bold text-amber-950">
                CHIP
              </div>
              <span className="text-[10px] text-slate-300 font-sans font-medium">Débito / Crédito</span>
            </div>
            <div className="text-right">
              <span className="text-xs font-black tracking-wider text-emerald-400">{cardBrand}</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-base sm:text-lg font-bold tracking-widest text-slate-100">
              {cardNumber || '•••• •••• •••• ••••'}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] pt-1">
            <div>
              <span className="text-[8px] block text-slate-400 uppercase font-sans">Titular</span>
              <span className="font-bold tracking-wider truncate max-w-[200px] block">
                {cardHolder || 'NOMBRE Y APELLIDO'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[8px] block text-slate-400 uppercase font-sans">Vence</span>
              <span className="font-bold tracking-wider">{cardExpiry || 'MM/AA'}</span>
            </div>
          </div>
        </div>

        {/* Formulario de Carga de Tarjeta */}
        <form onSubmit={handleSubmitCard} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Número de Tarjeta (Débito o Crédito)
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="4500 0000 0000 0000"
                value={cardNumber}
                onChange={handleCardNumberChange}
                maxLength={19}
                required
                className="w-full h-11 px-3.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500 text-sm"
              />
              <CreditCard className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Nombre y Apellido del Titular
            </label>
            <input
              type="text"
              placeholder="Como figura en la tarjeta"
              value={cardHolder}
              onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
              required
              className="w-full h-11 px-3.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 font-sans focus:outline-none focus:border-emerald-500 text-sm uppercase"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Vencimiento
              </label>
              <input
                type="text"
                placeholder="MM/AA"
                value={cardExpiry}
                onChange={handleExpiryChange}
                maxLength={5}
                required
                className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 font-mono text-center focus:outline-none focus:border-emerald-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                CVV / Seg.
              </label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="123"
                  value={cardCvv}
                  onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  maxLength={4}
                  required
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 font-mono text-center focus:outline-none focus:border-emerald-500 text-sm"
                />
                <Lock className="w-3 h-3 text-slate-500 absolute right-2.5 top-4 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                DNI Titular
              </label>
              <input
                type="text"
                placeholder="Sin puntos"
                value={cardDni}
                onChange={(e) => setCardDni(e.target.value.replace(/\D/g, '').slice(0, 8))}
                maxLength={8}
                required
                className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 font-mono text-center focus:outline-none focus:border-emerald-500 text-sm"
              />
            </div>
          </div>

          {/* Botón Principal: Validar Tarjeta y Empezar 15 Días Gratis */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 mt-2 rounded-xl sm:rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold text-sm sm:text-base shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Validando tarjeta y activando club...</span>
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                <span>Cargar Tarjeta y Comenzar 15 Días Gratis ($0 Hoy)</span>
              </>
            )}
          </button>
        </form>

        {/* Separador o enlace alternativo a portal de Mercado Pago */}
        <div className="pt-2 border-t border-slate-800 text-center">
          <button
            type="button"
            onClick={handleOpenMpPortal}
            disabled={isOpeningMp}
            className="text-xs text-slate-400 hover:text-emerald-400 transition-colors inline-flex items-center gap-1.5 cursor-pointer py-1"
          >
            {isOpeningMp ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Conectando con Mercado Pago...</span>
              </>
            ) : (
              <>
                <span>¿Preferís cargarla en el portal oficial de Mercado Pago?</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
