'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Sparkles,
  RefreshCw,
  LogOut,
  Building2,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CancharClubIcon } from '@/components/shared/canchar-club-logo'
import {
  confirmAndActivateSubscriptionWithCard,
  setupMonthlySubscriptionPreapproval,
  getClubPlanDetails,
  type ClubPlanDetails,
} from '@/actions/saas-billing.actions'
import { logout } from '@/actions/auth.actions'
import { SAAS_PLANS } from '@/config/saas-plans'
import { formatARS } from '@/lib/utils'
import { toast } from 'sonner'

export default function OnboardingCardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
        </div>
      }
    >
      <OnboardingCardContent />
    </Suspense>
  )
}

function OnboardingCardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [mpLoading, setMpLoading] = useState(false)
  const [planDetails, setPlanDetails] = useState<ClubPlanDetails | null>(null)

  // Campos de la tarjeta
  const [cardNumber, setCardNumber] = useState('')
  const [cardHolder, setCardHolder] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [cardDni, setCardDni] = useState('')

  // Cargar datos del club
  useEffect(() => {
    let isMounted = true

    async function init() {
      try {
        const details = await getClubPlanDetails()
        if (!isMounted) return

        setPlanDetails(details)

        // Si el club ya tiene débito automático activo o tarjeta guardada, redirigir directo al dashboard
        if (details.hasAutoDebit && details.cardInfo?.last4) {
          router.replace('/dashboard')
          return
        }

        // Si viene de retorno exitoso de Mercado Pago
        const isFromMp =
          searchParams.get('subscription_active') === 'true' ||
          searchParams.get('auto_debit_registered') === 'true'

        if (isFromMp) {
          setSubmitting(true)
          const res = await confirmAndActivateSubscriptionWithCard(details.tenantId)
          if (res.success) {
            toast.success('¡Tarjeta Vinculada con Éxito!', {
              description: 'Tu abono a CancharClub está activo con 15 días gratis ($0 hoy).',
            })
            router.push('/dashboard')
            return
          }
        }
      } catch (err) {
        console.error('Error cargando datos de suscripción:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    init()

    return () => {
      isMounted = false
    }
  }, [router, searchParams])

  // Detección en vivo de la marca de tarjeta
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
        description: 'Por favor ingresá los 16 dígitos de tu tarjeta de crédito o débito.',
      })
      return
    }

    if (!cardHolder.trim() || cardHolder.trim().length < 4) {
      toast.error('Titular de la tarjeta requerido', {
        description: 'Ingresá el nombre y apellido tal como figura impreso en el plástico.',
      })
      return
    }

    if (cardExpiry.length < 5) {
      toast.error('Fecha de vencimiento requerida', {
        description: 'Ingresá el mes y año de vencimiento en formato MM/AA.',
      })
      return
    }

    if (cardCvv.length < 3) {
      toast.error('Código de seguridad (CVV) requerido', {
        description: 'Ingresá el código de 3 o 4 dígitos al dorso de la tarjeta.',
      })
      return
    }

    setSubmitting(true)
    try {
      const activeTenant = planDetails?.tenantId || undefined
      const cardLast4 = rawNum.slice(-4)

      const res = await confirmAndActivateSubscriptionWithCard(activeTenant, {
        cardHolder: cardHolder.trim().toUpperCase(),
        cardLast4,
        cardBrand,
      })

      if (res.success) {
        toast.success('¡Tarjeta Vinculada con Éxito!', {
          description:
            'Tu abono a CancharClub está activo con 15 días gratis ($0 hoy). Primer cobro automático recién en el día 16.',
          duration: 5000,
        })
        router.push('/dashboard')
      } else {
        toast.error('Error al procesar la vinculación de la tarjeta', {
          description: res.error || 'Por favor verificá los datos ingresados.',
        })
        setSubmitting(false)
      }
    } catch (err) {
      console.error('Error activating with card:', err)
      toast.error('Ocurrió un error al vincular la tarjeta')
      setSubmitting(false)
    }
  }

  const handleMercadoPagoPreapproval = async () => {
    if (!planDetails?.tenantId) return
    setMpLoading(true)
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.cancharclub.com.ar'
      const returnUrl = `${origin}/onboarding/tarjeta?subscription_active=true`
      const res = await setupMonthlySubscriptionPreapproval(planDetails.tenantId, returnUrl)
      if (res.success && res.initPoint) {
        window.location.href = res.initPoint
      } else if (res.isSimulated) {
        toast.success('¡Modo de prueba activado!', {
          description: 'Tu club fue activado con 15 días gratis.'
        })
        router.push('/dashboard')
      } else {
        toast.error('No se pudo generar el checkout de Mercado Pago', {
          description: res.error || 'Probá ingresando tu tarjeta a continuación.'
        })
        setMpLoading(false)
      }
    } catch (err) {
      console.error('Error in handleMercadoPagoPreapproval:', err)
      toast.error('Ocurrió un error al conectar con Mercado Pago')
      setMpLoading(false)
    }
  }

  const handleLogout = async () => {
    await logout()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-xs text-slate-400 font-mono">Verificando estado del club...</p>
        </div>
      </div>
    )
  }

  const tenantName = planDetails?.tenantName || 'Tu Club Deportivo'
  const courtsCount = planDetails?.courtsCount || 2
  const planInfo = planDetails?.activePlan || SAAS_PLANS.MEDIANO_2
  const hasPriceConfigured = Boolean(
    planDetails?.hasPriceConfigured &&
    planDetails?.pricing?.highestSlotPriceArs &&
    planDetails.pricing.highestSlotPriceArs > 0 &&
    planDetails?.pricing?.monthlyFeeArs &&
    planDetails.pricing.monthlyFeeArs > 0
  )
  const monthlyFeeArs = hasPriceConfigured ? (planDetails?.pricing?.monthlyFeeArs || 0) : 0
  const courtsLabel = courtsCount >= 5 ? '5+ Canchas' : `${courtsCount} Cancha${courtsCount > 1 ? 's' : ''}`

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-white relative overflow-hidden">
      {/* Fondo con efectos sutiles de luz ambiental */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-linear-to-b from-emerald-500/10 via-indigo-500/5 to-transparent blur-3xl pointer-events-none" />

      {/* ─── BARRA SUPERIOR ─── */}
      <header className="w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CancharClubIcon className="w-8 h-8" />
            <span className="font-black text-lg tracking-tight text-white">
              Canchar<span className="text-emerald-400">Club</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar sesión</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ─── CONTENIDO PRINCIPAL ─── */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 sm:py-12 flex flex-col items-center relative z-10">
        {/* Encabezado del Onboarding */}
        <div className="text-center space-y-3 mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>15 Días de Prueba Gratuita Activados Automáticamente</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            ¡Tu Club ya tiene 15 Días de Prueba Gratis!
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
            Tu complejo <strong className="text-white">&quot;{tenantName}&quot;</strong> ya cuenta con <strong className="text-emerald-400">15 días de prueba 100% bonificados</strong> hasta el <strong className="text-white">{planDetails?.nextDueDate || 'día 15'}</strong> ($0 hoy). Adherí tu tarjeta para que tu servicio continúe sin interrupciones al finalizar los 15 días, o ingresá directo al panel.
          </p>
        </div>

        {/* Resumen del Plan y Beneficio 15 Días Gratis */}
        <div className="w-full mb-6 p-4 rounded-2xl bg-linear-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border-2 border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-sm">
                  {planInfo.name} ({courtsLabel})
                </span>
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] px-2 py-0.5 font-bold">
                  15 Días Gratis
                </Badge>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {hasPriceConfigured && monthlyFeeArs > 0 ? (
                  <>
                    Cuota mensual estimada:{' '}
                    <strong className="text-emerald-400 font-mono">{formatARS(monthlyFeeArs)}/mes</strong> (se debita recién en el día 16).
                  </>
                ) : (
                  <>
                    Cuota mensual:{' '}
                    <strong className="text-emerald-400 font-semibold">
                      Equivalente a {planInfo.priceTurnosLabel}
                    </strong>{' '}
                    (el monto final se calculará según el precio de tus canchas al configurarlas en el panel).
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-3 py-1.5 rounded-xl self-start sm:self-auto font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Hoy se cobra $0</span>
          </div>
        </div>

        {/* Opción 1: Adhesión Automática con Mercado Pago Oficial */}
        <div className="w-full mb-6 p-5 sm:p-6 rounded-3xl bg-linear-to-r from-sky-950/60 via-slate-900 to-emerald-950/50 border-2 border-sky-500/40 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-300 bg-sky-500/20 border border-sky-500/40 px-2.5 py-0.5 rounded-full">
                  Recomendado
                </span>
                <span className="text-sm font-extrabold text-white">
                  Débito Automático Oficial con Mercado Pago
                </span>
              </div>
              <p className="text-xs text-slate-300 max-w-lg leading-relaxed">
                Vinculá tu tarjeta de débito o crédito directamente mediante el portal seguro de Mercado Pago MLA. <strong className="text-emerald-400">Hoy pagás $0</strong> y el primer débito se realiza recién tras tus 15 días gratis.
              </p>
            </div>

            <Button
              type="button"
              disabled={mpLoading || submitting}
              onClick={handleMercadoPagoPreapproval}
              className="h-12 px-5 sm:px-6 rounded-2xl bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 font-black text-xs sm:text-sm shadow-xl shadow-sky-950/80 shrink-0 gap-2 cursor-pointer transition-all"
            >
              {mpLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Conectando con Mercado Pago...</span>
                </>
              ) : (
                <>
                  <span>Suscribirme con Mercado Pago</span>
                  <ExternalLink className="w-4 h-4 text-slate-950" />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Separador de Opciones */}
        <div className="relative w-full my-4 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <div className="relative bg-slate-950 px-4 text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            O cargá tu tarjeta directamente abajo
          </div>
        </div>

        {/* Tarjeta Visual + Formulario */}
        <Card className="w-full bg-slate-900/90 border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl backdrop-blur-md">
          {/* Previsualización visual de Tarjeta */}
          <div className="mb-6 relative h-44 sm:h-48 w-full max-w-md mx-auto rounded-2xl p-5 bg-linear-to-tr from-slate-950 via-slate-900 to-indigo-950 border border-indigo-500/40 shadow-2xl shadow-indigo-950/50 flex flex-col justify-between text-white overflow-hidden font-mono select-none">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-7 rounded bg-amber-400/80 border border-amber-300/40 flex items-center justify-center text-[9px] font-bold text-amber-950">
                  CHIP
                </div>
                <span className="text-[11px] text-slate-300 font-sans font-medium">Débito / Crédito</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-black tracking-wider text-emerald-400">{cardBrand}</span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-lg sm:text-xl font-bold tracking-widest text-slate-100">
                {cardNumber || '•••• •••• •••• ••••'}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <div>
                <span className="text-[9px] block text-slate-400 uppercase font-sans">Titular</span>
                <span className="font-bold tracking-wider truncate max-w-55 block">
                  {cardHolder || 'NOMBRE Y APELLIDO'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[9px] block text-slate-400 uppercase font-sans">Vence</span>
                <span className="font-bold tracking-wider">{cardExpiry || 'MM/AA'}</span>
              </div>
            </div>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmitCard} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Número de Tarjeta (Débito o Crédito) *
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="4500 0000 0000 0000"
                  value={cardNumber}
                  onChange={handleCardNumberChange}
                  maxLength={19}
                  required
                  className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500 text-sm"
                />
                <CreditCard className="w-4 h-4 text-slate-400 absolute right-3.5 top-4 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Nombre y Apellido del Titular *
              </label>
              <input
                type="text"
                placeholder="Como figura impreso en el plástico"
                value={cardHolder}
                onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                required
                className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 font-sans focus:outline-none focus:border-emerald-500 text-sm uppercase"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Vencimiento *
                </label>
                <input
                  type="text"
                  placeholder="MM/AA"
                  value={cardExpiry}
                  onChange={handleExpiryChange}
                  maxLength={5}
                  required
                  className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 font-mono text-center focus:outline-none focus:border-emerald-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  CVV / Seguridad *
                </label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="123"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    maxLength={4}
                    required
                    className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 font-mono text-center focus:outline-none focus:border-emerald-500 text-sm"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-4 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  DNI del Titular *
                </label>
                <input
                  type="text"
                  placeholder="Sin puntos"
                  value={cardDni}
                  onChange={(e) => setCardDni(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  maxLength={8}
                  required
                  className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 font-mono text-center focus:outline-none focus:border-emerald-500 text-sm"
                />
              </div>
            </div>

            {/* Garantía y Transparencia */}
            <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 text-xs text-slate-300 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-emerald-400 text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Débito Automático Oficial con Protección de Prueba</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {hasPriceConfigured && monthlyFeeArs > 0 ? (
                  <>
                    Hoy se cobra <strong>$0</strong>. Tu primera cuota mensual de <strong>{formatARS(monthlyFeeArs)}</strong> se debitará de forma automática recién al cumplirse los 15 días corridos. En tu resumen bancario aparecerá bajo el concepto <strong className="text-white">CancharClub</strong>. Podés cancelar en cualquier momento desde tu panel.
                  </>
                ) : (
                  <>
                    Hoy se cobra <strong>$0</strong>. Tu primera cuota mensual equivalente a <strong>{planInfo.priceTurnosLabel}</strong> se debitará de forma automática recién al cumplirse los 15 días corridos según el valor de turnos que configures en tu club. En tu resumen bancario aparecerá bajo el concepto <strong className="text-white">CancharClub</strong>. Podés cancelar en cualquier momento desde tu panel.
                  </>
                )}
              </p>
            </div>

            {/* Botón Principal de Envío */}
            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-13 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm rounded-2xl shadow-xl shadow-emerald-950/60 cursor-pointer flex items-center justify-center gap-2 mt-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Validando tarjeta y activando club...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>Vincular Tarjeta y Acceder al Panel ($0 Hoy)</span>
                </>
              )}
            </Button>
          </form>
        </Card>
      </main>

      {/* ─── PIE DE PÁGINA ─── */}
      <footer className="w-full border-t border-slate-800/60 py-4 text-center text-xs text-slate-500 select-none">
        <p>© 2026 CancharClub. Todos los derechos reservados. Cobros gestionados de forma segura con Mercado Pago MLA.</p>
      </footer>
    </div>
  )
}
