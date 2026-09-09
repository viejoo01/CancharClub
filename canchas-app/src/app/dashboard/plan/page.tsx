'use client'

import { useState, useEffect, useTransition } from 'react'
import { 
  CreditCard, 
  CheckCircle2, 
  Calendar, 
  Building2, 
  Calculator, 
  Download,
  Copy,
  Check,
  ShieldAlert,
  AlertTriangle,
  Lock,
  RefreshCw
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatARS } from '@/lib/utils'
import { calculateClubSaaSFee } from '@/lib/saas-pricing'
import { 
  createTenantInvoicePreference, 
  recordTenantInvoicePayment, 
  updateTenantSubscriptionStatus,
  setupMonthlySubscriptionPreapproval
} from '@/actions/saas-billing.actions'
import { 
  getTenantMpMarketplaceStatus, 
  disconnectTenantMpMarketplace, 
  simulateMpConnectionForDemo,
  getMpOAuthConnectUrl,
  type MpMarketplaceStatus 
} from '@/actions/mp-marketplace.actions'
import type { TenantSubscriptionStatus } from '@/types/database'
import { toast } from 'sonner'
import { siteConfig } from '@/config/site'
import { SAAS_PLANS_LIST, getPlanByCourtsCount } from '@/config/saas-plans'
import { Sparkles } from 'lucide-react'

export default function ClubPlanPage() {
  // Canchas activas del club (interactivo para ver cómo escala el plan)
  const [courtsCount, setCourtsCount] = useState(2)
  const highestSlotPrice = 30000
  const pricing = calculateClubSaaSFee(courtsCount, highestSlotPrice)
  const activePlan = getPlanByCourtsCount(courtsCount)

  const [copied, setCopied] = useState(false)
  const [isPaid, setIsPaid] = useState(false)
  const [paying, setPaying] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [hasAutoDebit, setHasAutoDebit] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [simulatedStatus, setSimulatedStatus] = useState<TenantSubscriptionStatus>(() => {
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split('; ')
      const statusCookie = cookies.find(c => c.startsWith('demo_subscription_status='))
      if (statusCookie) {
        return statusCookie.split('=')[1] as TenantSubscriptionStatus
      }
    }
    return 'ACTIVE'
  })

  // Mercado Pago Marketplace State
  const [mpStatus, setMpStatus] = useState<MpMarketplaceStatus>({
    isConnected: true,
    collectorId: 'MP_COLLECTOR_492810',
    connectedAt: '2026-09-01T12:00:00Z',
    feePct: 5,
  })
  const [mpLoading, setMpLoading] = useState(false)

  useEffect(() => {
    getTenantMpMarketplaceStatus('00000000-0000-0000-0000-000000000001')
      .then((res) => {
        if (res && res.collectorId) {
          setMpStatus(res)
        }
      })
      .catch(() => {})
  }, [])

  const handleConnectMp = async () => {
    setMpLoading(true)
    try {
      const url = await getMpOAuthConnectUrl('00000000-0000-0000-0000-000000000001')
      window.location.href = url
    } catch {
      toast.error('Error al generar enlace de autorización')
    } finally {
      setMpLoading(false)
    }
  }

  const handleSimulateMpConnect = async () => {
    setMpLoading(true)
    try {
      const res = await simulateMpConnectionForDemo('00000000-0000-0000-0000-000000000001')
      if (res.success) {
        setMpStatus({
          isConnected: true,
          collectorId: `MP_COLLECTOR_${Math.floor(100000 + Math.random() * 900000)}`,
          connectedAt: new Date().toISOString(),
          feePct: 5,
        })
        toast.success('¡Cuenta de Mercado Pago vinculada exitosamente con Split de Señas!')
      }
    } catch {
      toast.error('Error al simular conexión')
    } finally {
      setMpLoading(false)
    }
  }

  const handleDisconnectMp = async () => {
    setMpLoading(true)
    try {
      await disconnectTenantMpMarketplace('00000000-0000-0000-0000-000000000001')
      setMpStatus({
        isConnected: false,
        feePct: 5,
      })
      toast.success('Cuenta de Mercado Pago desvinculada')
    } catch {
      toast.error('Error al desvincular cuenta')
    } finally {
      setMpLoading(false)
    }
  }

  const handleCopyAlias = () => {
    navigator.clipboard.writeText(siteConfig.billing.aliasCbu)
    setCopied(true)
    toast.success(`Alias copiado: ${siteConfig.billing.aliasCbu}`)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePayWithMercadoPago = async () => {
    setPaying(true)
    try {
      const res = await createTenantInvoicePreference('00000000-0000-0000-0000-000000000001')
      if (res.initPoint) {
        if (res.isSimulated) {
          await recordTenantInvoicePayment('00000000-0000-0000-0000-000000000001')
          setIsPaid(true)
          setSimulatedStatus('ACTIVE')
          toast.success('Pago Aprobado con Mercado Pago', {
            description: `Se acreditó el abono mensual de ${formatARS(pricing.monthlyFeeArs)}. ¡Tu club está al día!`
          })
        } else {
          window.location.assign(res.initPoint)
        }
      }
    } catch {
      toast.error('Error al generar checkout de Mercado Pago')
    } finally {
      setPaying(false)
    }
  }

  const handleSetupAutoDebit = async () => {
    setSubscribing(true)
    try {
      const res = await setupMonthlySubscriptionPreapproval('00000000-0000-0000-0000-000000000001')
      if (res.success) {
        if (res.isSimulated) {
          setHasAutoDebit(true)
          toast.success('¡Débito Automático Activado!', {
            description: `Tu abono de ${formatARS(pricing.monthlyFeeArs)} se debitará automáticamente el día 1 de cada mes.`
          })
        } else if (res.initPoint) {
          window.location.assign(res.initPoint)
        }
      }
    } catch {
      toast.error('Error al configurar débito automático')
    } finally {
      setSubscribing(false)
    }
  }

  const handleToggleStatus = (newStatus: TenantSubscriptionStatus) => {
    startTransition(async () => {
      await updateTenantSubscriptionStatus('00000000-0000-0000-0000-000000000001', newStatus)
      setSimulatedStatus(newStatus)
      if (newStatus === 'ACTIVE') setIsPaid(true)
      else setIsPaid(false)
      toast.info(`Estado del club actualizado a: ${newStatus}`, {
        description: 'Observa cómo reacciona el banner, el portal público y el middleware.'
      })
    })
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs tracking-wider uppercase mb-1">
          <Building2 className="w-4 h-4" />
          Suscripción & Facturación del Club
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Mi Plan y Abono SaaS
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Tarifa fija mensual calculada en base a la infraestructura del club.
        </p>
      </div>

      {/* Tarjeta Principal de Cuota Mensual */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-indigo-950/40 border-slate-800 rounded-3xl p-6 relative overflow-hidden backdrop-blur-md">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-xs px-3 py-1 font-bold">
                  {activePlan.name} ({activePlan.courtsLabel})
                </Badge>
                {activePlan.isPopular && (
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] px-2 py-0.5 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    Más popular
                  </Badge>
                )}
              </div>
              <h2 className="text-xl font-bold text-white">
                Club Pádel Central Tucumán
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Modelo adaptado automáticamente a la infraestructura de tu complejo.
              </p>
            </div>
            {isPaid ? (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs px-3 py-1 shrink-0 self-start">
                Al Día (Pagado)
              </Badge>
            ) : (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs px-3 py-1 shrink-0 self-start">
                Vence a Fin de Mes
              </Badge>
            )}
          </div>

          {/* Selector de Canchas para simulación de crecimiento */}
          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-slate-400 font-semibold">Simular canchas de tu predio:</span>
            {[1, 2, 3, 4, 6].map((num) => (
              <button
                key={num}
                onClick={() => setCourtsCount(num)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  courtsCount === num
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {num >= 5 ? '5+ Canchas' : `${num} Cancha${num > 1 ? 's' : ''}`}
              </button>
            ))}
          </div>

          <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Cuota Mensual Final
              </span>
              <div className="text-3xl font-extrabold text-emerald-400 font-mono mt-1">
                {formatARS(pricing.monthlyFeeArs)}
              </div>
              <span className="text-[11px] text-slate-400">{activePlan.priceTurnosLabel}</span>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Multiplicador Aplicado
              </span>
              <div className="text-xl font-bold text-white font-mono mt-1 flex items-center gap-1.5">
                <span className="text-indigo-400">{pricing.multiplier}x</span> turnos
              </div>
              <span className="text-[11px] text-slate-400">{pricing.courtsCount} canchas activas</span>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Próximo Vencimiento
              </span>
              <div className="text-base font-bold text-slate-200 mt-1 flex items-center gap-1.5 font-mono">
                <Calendar className="w-4 h-4 text-slate-400" />
                {pricing.nextDueDate}
              </div>
              <span className="text-[11px] text-slate-400">Cierre del período</span>
            </div>
          </div>

          {/* Prestaciones activas del plan */}
          <div className="mt-6 p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Prestaciones de tu Plan ({activePlan.name}):
              </div>
              <span className="text-[10px] text-emerald-400 font-mono">{activePlan.priceSubtext}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              {activePlan.features.map((feat, i) => (
                <div key={i} className="flex items-start gap-2 text-slate-300 text-[11px]">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Canales de Pago */}
        <Card className="bg-slate-900/60 border-slate-800 rounded-3xl p-6 flex flex-col justify-between backdrop-blur-md">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-400" />
              Abonar Suscripción
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              El abono se paga a fin de mes. Puedes abonar mediante Mercado Pago o transferencia bancaria directa.
            </p>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
              <div className="text-slate-400 text-[11px]">Alias para transferencias ({siteConfig.name}):</div>
              <div className="flex items-center justify-between font-mono font-semibold text-white">
                <span>{siteConfig.billing.aliasCbu}</span>
                <button 
                  onClick={handleCopyAlias}
                  className="p-1 hover:text-emerald-400 transition-colors"
                  title="Copiar alias"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="text-[10px] text-slate-500">{siteConfig.billing.accountHolder}</div>
            </div>
          </div>

          <div className="pt-4 space-y-2">
            {!isPaid && simulatedStatus !== 'ACTIVE' ? (
              <Button
                onClick={handlePayWithMercadoPago}
                disabled={paying}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 py-5"
              >
                {paying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin mr-1.5" />
                    Conectando con Mercado Pago...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-1.5" />
                    Pagar {formatARS(pricing.monthlyFeeArs)} con Mercado Pago
                  </>
                )}
              </Button>
            ) : (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center text-xs text-emerald-400 font-semibold flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Abono mensual saldado • Club al día
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Mejora 3A: Débito Automático Recurrente (Mercado Pago Subscriptions) */}
      <Card className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2">
              <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/40 text-xs font-bold px-2.5 py-0.5">
                Recomendado • Evitá Bloqueos
              </Badge>
              <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Débito Automático Oficial
              </span>
            </div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              Adherí tu Club al Débito Automático Mensual
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Vinculá tu tarjeta de débito o crédito con Mercado Pago Subscriptions. El día 1 de cada mes se procesará automáticamente la tarifa de <strong>{formatARS(pricing.monthlyFeeArs)}</strong>, manteniendo tus reservas públicas y panel siempre operativos sin interrupciones.
            </p>
          </div>

          <div className="shrink-0 w-full md:w-auto">
            {hasAutoDebit ? (
              <div className="px-5 py-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Débito Automático Activo ({formatARS(pricing.monthlyFeeArs)}/mes)</span>
              </div>
            ) : (
              <Button
                onClick={handleSetupAutoDebit}
                disabled={subscribing}
                className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl px-6 py-6 text-xs shadow-lg shadow-indigo-950/50 gap-2"
              >
                {subscribing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Conectando con Mercado Pago...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>Adherir a Débito Automático</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Mejora 3A: Mercado Pago Marketplace (Split de Pagos y Comisiones) */}
      <Card className="bg-gradient-to-r from-slate-900 via-teal-950/30 to-slate-900 border border-teal-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2">
              <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/40 text-xs font-bold px-2.5 py-0.5">
                Marketplace Split
              </Badge>
              <span className="text-[11px] text-teal-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Cobro Directo en tu Billetera
              </span>
            </div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              Mercado Pago Marketplace (Split de Señas y Comisiones)
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Las señas pagadas por los jugadores en el portal público van <strong>directo a tu cuenta de Mercado Pago</strong> en tiempo real. La plataforma CancharClub retiene automáticamente el {mpStatus.feePct}% de comisión por procesamiento, sin liquidaciones manuales ni retrasos.
            </p>
            {mpStatus.isConnected && (
              <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1 font-mono">
                <span>Collector ID: <strong className="text-teal-300">{mpStatus.collectorId}</strong></span>
                <span>•</span>
                <span>Comisión de Servicio: <strong className="text-teal-300">{mpStatus.feePct}%</strong></span>
              </div>
            )}
          </div>

          <div className="shrink-0 w-full md:w-auto flex flex-col sm:flex-row gap-2">
            {mpStatus.isConnected ? (
              <div className="flex flex-col gap-2">
                <div className="px-5 py-3 rounded-2xl bg-teal-500/20 border border-teal-500/40 text-teal-300 font-bold text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400" />
                  <span>Billetera Vinculada</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDisconnectMp}
                  disabled={mpLoading}
                  className="border-slate-800 text-slate-400 hover:text-rose-400 text-xs"
                >
                  Desvincular
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <Button
                  onClick={handleConnectMp}
                  disabled={mpLoading}
                  className="w-full sm:w-auto bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-2xl px-5 py-5 text-xs shadow-lg shadow-teal-950/50 gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Vincular con Mercado Pago</span>
                </Button>
                <Button
                  onClick={handleSimulateMpConnect}
                  disabled={mpLoading}
                  variant="outline"
                  className="w-full sm:w-auto border-teal-600/40 text-teal-300 hover:bg-teal-950/40 text-xs py-5 rounded-2xl"
                >
                  Simular Vinculación (Demo)
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Comparativa de Modelos de Planes SaaS por Tamaño de Predio */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs tracking-wider uppercase mb-0.5">
              <Calculator className="w-4 h-4" />
              Modelos Comerciales Disponibles
            </div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              Comparativa de Planes y Prestaciones
            </h3>
            <p className="text-xs text-slate-400">
              Cada modelo está diseñado a la medida de la infraestructura de tu predio.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {SAAS_PLANS_LIST.map((plan) => {
            const isCurrent = activePlan.id === plan.id
            return (
              <Card
                key={plan.id}
                className={`p-5 rounded-2xl flex flex-col justify-between transition-all ${
                  isCurrent
                    ? 'bg-slate-900 border-2 border-emerald-500/70 shadow-lg shadow-emerald-950/20 relative'
                    : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isCurrent
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {isCurrent ? 'Tu Plan Activo' : plan.courtsLabel}
                    </span>
                    {plan.isPopular && !isCurrent && (
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                        Popular
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-black text-white">{plan.name}</h4>
                    <div className="text-base font-extrabold text-emerald-400 font-mono mt-1">
                      {plan.priceTurnosLabel}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {plan.priceSubtext}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Incluye:
                    </span>
                    <ul className="space-y-1.5">
                      {plan.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-300 leading-tight">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-4 mt-3 border-t border-slate-800/60">
                  {isCurrent ? (
                    <div className="w-full py-2 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center text-xs text-emerald-400 font-bold flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Plan Activo
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCourtsCount(plan.minCourts)
                        toast.info(`Simulando cambio al plan ${plan.name} (${plan.courtsLabel})`)
                      }}
                      className="w-full text-xs font-semibold border-slate-700 bg-slate-800/60 text-slate-300 hover:text-white hover:bg-slate-700 rounded-xl"
                    >
                      Probar {plan.courtsLabel}
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Simulador Dunning y Estados de Suspensión Progresiva */}
      <Card className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">
                Simulador del Ciclo de Cobranzas y Suspensión (Dunning)
              </h3>
              <Badge className="text-[10px] font-mono uppercase bg-indigo-500/20 text-indigo-300 border-indigo-500/30">
                Estado Actual: {simulatedStatus}
              </Badge>
            </div>
            <p className="text-xs text-slate-400">
              Prueba en tiempo real cómo responde la plataforma (banners en dashboard, portal público y middleware).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleToggleStatus('ACTIVE')}
              disabled={isPending}
              className={`h-8 text-xs font-medium rounded-xl border ${
                simulatedStatus === 'ACTIVE'
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-400" />
              1. Activo (Días 1-7)
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleToggleStatus('GRACE_PERIOD')}
              disabled={isPending}
              className={`h-8 text-xs font-medium rounded-xl border ${
                simulatedStatus === 'GRACE_PERIOD'
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-400" />
              2. Gracia (Días 8-12)
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleToggleStatus('PARTIALLY_SUSPENDED')}
              disabled={isPending}
              className={`h-8 text-xs font-medium rounded-xl border ${
                simulatedStatus === 'PARTIALLY_SUSPENDED'
                  ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 mr-1 text-rose-400" />
              3. Pausa Web (Días 13-14)
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleToggleStatus('LOCKED')}
              disabled={isPending}
              className={`h-8 text-xs font-medium rounded-xl border ${
                simulatedStatus === 'LOCKED'
                  ? 'bg-red-500/20 border-red-500 text-red-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Lock className="w-3.5 h-3.5 mr-1 text-red-400" />
              4. Bloqueo Total (Día 15+)
            </Button>
          </div>
        </div>
      </Card>

      {/* Historial de Comprobantes Emitidos */}
      <Card className="bg-slate-900/60 border-slate-800 rounded-2xl backdrop-blur-md overflow-hidden">
        <CardHeader className="p-5 border-b border-slate-800">
          <CardTitle className="text-sm font-bold text-white">
            Historial de Facturas y Liquidaciones
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Descarga los recibos oficiales correspondientes a tus períodos mensuales.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-800/60 text-xs">
            <div className="p-4 flex items-center justify-between hover:bg-slate-800/20 transition-colors">
              <div>
                <div className="font-semibold text-white">Período Agosto 2026</div>
                <div className="text-[11px] text-slate-400">Abono mensual: 2 canchas (1.5 turnos)</div>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono font-bold text-slate-200">{formatARS(45000)}</span>
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">
                  Pagado
                </Badge>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => toast.info('Descargando comprobante fiscal PDF...')}
                  className="h-8 text-xs text-slate-400 hover:text-white"
                >
                  <Download className="w-3.5 h-3.5 mr-1" /> PDF
                </Button>
              </div>
            </div>

            <div className="p-4 flex items-center justify-between hover:bg-slate-800/20 transition-colors">
              <div>
                <div className="font-semibold text-white">Período Julio 2026</div>
                <div className="text-[11px] text-slate-400">Abono mensual: 2 canchas (1.5 turnos)</div>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono font-bold text-slate-200">{formatARS(45000)}</span>
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">
                  Pagado
                </Badge>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => toast.info('Descargando comprobante fiscal PDF...')}
                  className="h-8 text-xs text-slate-400 hover:text-white"
                >
                  <Download className="w-3.5 h-3.5 mr-1" /> PDF
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
