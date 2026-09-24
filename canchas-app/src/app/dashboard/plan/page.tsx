'use client'

import { useState, useEffect } from 'react'
import { 
  CreditCard, 
  CheckCircle2, 
  Check,
  Calendar, 
  Building2, 
  Calculator, 
  Download,
  Lock as LockIcon,
  RefreshCw,
  X,
  ShieldCheck,
  Sparkles,
  Info,
  Scale,
  AlertTriangle,
  Undo2,
  AlertCircle,
  Clock
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { ClubTermsCard } from '@/components/dashboard/club-terms-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatARS } from '@/lib/utils'
import { calculateClubSaaSFee } from '@/lib/saas-pricing'
import { 
  setupMonthlySubscriptionPreapproval,
  confirmAndActivateSubscriptionWithCard,
  getClubPlanDetails,
  requestSubscriptionRevocationAction,
  undoSubscriptionRevocationAction,
  type ClubPlanDetails
} from '@/actions/saas-billing.actions'
import { toast } from 'sonner'
import { SAAS_PLANS_LIST, getPlanByCourtsCount } from '@/config/saas-plans'
import { useTenantId } from '@/hooks/use-tenant-id'

export default function ClubPlanPage() {
  const tenantId = useTenantId()
  const [planDetails, setPlanDetails] = useState<ClubPlanDetails | null>(null)
  const [hasAutoDebit, setHasAutoDebit] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      return params.get('subscription_active') === 'true' || params.get('auto_debit_registered') === 'true'
    }
    return false
  })

  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadPlanData = async (showToast = false) => {
    setIsRefreshing(true)
    try {
      const details = await getClubPlanDetails(tenantId || undefined)
      setPlanDetails(details)
      if (details?.hasAutoDebit) {
        setHasAutoDebit(true)
      }
      if (showToast) {
        toast.success('Estado e historial contable actualizados desde la base de datos')
      }
    } catch (err) {
      console.error('Error fetching club plan details:', err)
      if (showToast) {
        toast.error('Error al actualizar datos del club')
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  // Cargar información oficial del club y sincronización continua en tiempo real
  useEffect(() => {
    let isMounted = true
    async function fetchInitial() {
      try {
        const details = await getClubPlanDetails(tenantId || undefined)
        if (isMounted) {
          setPlanDetails(details)
          if (details?.hasAutoDebit) {
            setHasAutoDebit(true)
          }
        }
      } catch (err) {
        console.error('Error fetching club plan details:', err)
      }
    }
    void fetchInitial()

    // Sondeo periódico continuo cada 5s para consultar la base de datos en tiempo real
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void fetchInitial()
    }, 5000)

    // Revalidar inmediatamente cuando el usuario vuelve o cambia de pestaña
    const handleSync = () => void fetchInitial()
    window.addEventListener('focus', handleSync)
    document.addEventListener('visibilitychange', handleSync)

    return () => { 
      isMounted = false 
      clearInterval(interval)
      window.removeEventListener('focus', handleSync)
      document.removeEventListener('visibilitychange', handleSync)
    }
  }, [tenantId])

  const isAutoDebitActive = hasAutoDebit || Boolean(planDetails?.hasAutoDebit) || (planDetails?.subscriptionStatus === 'ACTIVE')
  const isPaid = (planDetails?.isPaid ?? false) || isAutoDebitActive

  const clubName = planDetails?.tenantName || 'Cargando club...'
  const courtsCount = planDetails?.courtsCount || 2
  const highestSlotPrice = planDetails?.highestSlotPriceArs || 30000
  const pricing = planDetails?.pricing || calculateClubSaaSFee(courtsCount, highestSlotPrice)
  const activePlan = planDetails?.activePlan || getPlanByCourtsCount(courtsCount)
  const cancellationDate = planDetails?.cancellationEffectiveDate || pricing.nextDueDate

  const [subscribing, setSubscribing] = useState(false)

  // Modal de carga de tarjeta Mercado Pago
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
  const [cardNumber, setCardNumber] = useState('')
  const [cardHolder, setCardHolder] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [cardDni, setCardDni] = useState('')
  const [savingCard, setSavingCard] = useState(false)

  // Botón de Arrepentimiento / Revocación de Suscripción (Ley 24.240 - Res. 424/2020)
  const [showRevocationModal, setShowRevocationModal] = useState(false)
  const [revocationReason, setRevocationReason] = useState('')
  const [isRevoking, setIsRevoking] = useState(false)
  const [isUndoingRevocation, setIsUndoingRevocation] = useState(false)

  const handleRequestRevocation = async () => {
    setIsRevoking(true)
    try {
      const activeTenant = tenantId || planDetails?.tenantId
      const res = await requestSubscriptionRevocationAction(activeTenant || undefined, revocationReason)
      if (res.success) {
        toast.success(`Baja programada registrada con éxito. El servicio continuará activo hasta el ${res.effectiveDate || cancellationDate}.`)
        setShowRevocationModal(false)
        setRevocationReason('')
        await loadPlanData()
      } else {
        toast.error(res.error || 'Error al procesar el arrepentimiento')
      }
    } catch {
      toast.error('Ocurrió un error al procesar el arrepentimiento')
    } finally {
      setIsRevoking(false)
    }
  }

  const handleUndoRevocation = async () => {
    setIsUndoingRevocation(true)
    try {
      const activeTenant = tenantId || planDetails?.tenantId
      const res = await undoSubscriptionRevocationAction(activeTenant || undefined)
      if (res.success) {
        toast.success('¡Suscripción reactivada! Tu plan continuará activo y renovándose con normalidad.')
        await loadPlanData()
      } else {
        toast.error(res.error || 'Error al revertir la cancelación')
      }
    } catch {
      toast.error('Ocurrió un error al reactivar la suscripción')
    } finally {
      setIsUndoingRevocation(false)
    }
  }

  // Notificar y activar si regresa de Mercado Pago con la suscripción aprobada
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('subscription_active') === 'true' || params.get('auto_debit_registered') === 'true') {
        const activeTenant = tenantId || planDetails?.tenantId || '00000000-0000-0000-0000-000000000001'
        confirmAndActivateSubscriptionWithCard(activeTenant).catch(() => {})
        toast.success('¡Débito Automático Adherido con Éxito!', {
          description: 'Tu suscripción mensual a CancharClub está activa con tarjeta. En tu resumen bancario aparecerá bajo el concepto "CancharClub".'
        })
      }
    }
  }, [tenantId, planDetails?.tenantId])

  const handleSetupAutoDebit = async () => {
    setSubscribing(true)
    try {
      const activeTenant = tenantId || planDetails?.tenantId || '00000000-0000-0000-0000-000000000001'
      const res = await setupMonthlySubscriptionPreapproval(activeTenant)
      if (res.success) {
        if (res.initPoint) {
          toast.info('Abriendo portal oficial de Mercado Pago Subscriptions...', {
            description: 'Completá los datos de tu tarjeta para el débito automático de CancharClub.'
          })
          window.location.assign(res.initPoint)
        } else {
          setShowSubscriptionModal(true)
        }
      } else {
        toast.error('Error al generar suscripción con Mercado Pago')
      }
    } catch {
      toast.error('Error al configurar débito automático')
    } finally {
      setSubscribing(false)
    }
  }

  const handleConfirmCardSubscription = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cardNumber || !cardHolder || !cardExpiry || !cardCvv) {
      toast.error('Por favor completá los datos de la tarjeta')
      return
    }
    setSavingCard(true)
    try {
      const activeTenant = tenantId || planDetails?.tenantId || '00000000-0000-0000-0000-000000000001'
      const cleanNum = cardNumber.replace(/\D/g, '')
      const detectedBrand = cleanNum.startsWith('4')
        ? 'VISA'
        : cleanNum.startsWith('5')
        ? 'MASTERCARD'
        : cleanNum.startsWith('3')
        ? 'AMEX'
        : cleanNum.startsWith('6')
        ? 'CABAL'
        : 'TARJETA'
      const cardLast4 = cleanNum.slice(-4)

      await confirmAndActivateSubscriptionWithCard(activeTenant, {
        cardHolder: cardHolder.toUpperCase(),
        cardLast4,
        cardBrand: detectedBrand,
      })
      setHasAutoDebit(true)
      setShowSubscriptionModal(false)
      toast.success('¡Débito Automático Adherido con Éxito!', {
        description: `Tu suscripción a CancharClub (${formatARS(pricing.monthlyFeeArs)}/mes) fue vinculada con Mercado Pago. En tu resumen bancario aparecerá como "CancharClub".`
      })
      loadPlanData(false)
    } catch {
      toast.error('Error al registrar la tarjeta')
    } finally {
      setSavingCard(false)
    }
  }

  const downloadReceiptPdf = (inv: { id: string; month: number; year: number; amount: number; paid_at: string | null; status: string }) => {
    const monthName = new Date(inv.year, inv.month - 1, 1).toLocaleDateString('es-AR', { month: 'long' })
    const monthCap = monthName.charAt(0).toUpperCase() + monthName.slice(1)
    const paidDate = inv.paid_at 
      ? new Date(inv.paid_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'Pendiente'

    const receiptHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Recibo Oficial CancharClub - Período ${monthCap} ${inv.year}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1e293b; background: #fff; line-height: 1.5; }
          .header { border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-start; }
          .title { font-size: 24px; font-weight: bold; color: #0f172a; }
          .subtitle { color: #64748b; font-size: 14px; margin-top: 4px; }
          .badge { display: inline-block; padding: 4px 12px; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; border-radius: 9999px; font-size: 12px; font-weight: 600; }
          .details { margin: 24px 0; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
          .row:last-child { border-bottom: none; }
          .label { color: #64748b; }
          .val { font-weight: 600; color: #0f172a; }
          .total { margin-top: 20px; text-align: right; }
          .total-amount { font-size: 28px; font-weight: 800; color: #059669; font-family: monospace; }
          .footer { margin-top: 40px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">CancharClub Software SaaS</div>
            <div class="subtitle">Comprobante Oficial de Abono Mensual</div>
          </div>
          <div>
            <span class="badge">Estado: ${inv.status === 'PAID' ? 'PAGADO / AL DÍA' : 'PENDIENTE'}</span>
          </div>
        </div>
        <div class="details">
          <div class="row"><span class="label">Club / Inquilino:</span><span class="val">${clubName}</span></div>
          <div class="row"><span class="label">Período Fiscal:</span><span class="val">${monthCap} ${inv.year}</span></div>
          <div class="row"><span class="label">Comprobante ID:</span><span class="val">${inv.id}</span></div>
          <div class="row"><span class="label">Fecha de Pago:</span><span class="val">${paidDate}</span></div>
          <div class="row"><span class="label">Concepto:</span><span class="val">Abono mensual software de gestión deportiva (${courtsCount} canchas)</span></div>
        </div>
        <div class="total">
          <div class="label">Total Liquidado:</div>
          <div class="total-amount">${formatARS(Number(inv.amount))}</div>
        </div>
        <div class="footer">
          CancharClub • Plataforma de Gestión de Canchas y Clubes Deportivos • www.cancharclub.com.ar
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(receiptHtml)
      printWindow.document.close()
    } else {
      toast.info('Recibo generado para visualización.')
    }
  }

  const isTermsAccepted = Boolean(
    planDetails?.termsAcceptedAt ||
    (typeof window !== 'undefined' ? localStorage.getItem('canchar_terms_accepted_at') : null)
  )

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
        <Button
          size="sm"
          variant="outline"
          onClick={() => void loadPlanData(true)}
          disabled={isRefreshing}
          className="self-start sm:self-auto h-9 text-xs border-slate-800 bg-slate-900/90 text-slate-300 hover:text-white rounded-xl cursor-pointer shrink-0"
          title="Consultar base de datos para información actualizada"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
          Actualizar Estado
        </Button>
      </div>

      {/* Simulador interactivo de Alertas Progresivas Emergentes */}
      <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <Clock className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-white">Alertas Progresivas de Vencimiento:</span>
          <span className="text-slate-400 hidden sm:inline">Probar alertas emergentes en pantalla</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('test-plan-expiration-alert', { detail: { days: 3, dueDate: cancellationDate } }))
            }}
            className="h-7 text-[11px] border-amber-500/30 text-amber-300 hover:bg-amber-500/10 rounded-lg cursor-pointer"
          >
            3 días
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('test-plan-expiration-alert', { detail: { days: 2, dueDate: cancellationDate } }))
            }}
            className="h-7 text-[11px] border-orange-500/30 text-orange-300 hover:bg-orange-500/10 rounded-lg cursor-pointer"
          >
            2 días
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('test-plan-expiration-alert', { detail: { days: 1, dueDate: cancellationDate } }))
            }}
            className="h-7 text-[11px] border-rose-500/30 text-rose-300 hover:bg-rose-500/10 rounded-lg cursor-pointer"
          >
            1 día
          </Button>
        </div>
      </div>

      {/* Banner de Baja Programada por Arrepentimiento */}
      {planDetails?.cancelAtPeriodEnd && (
        <div className="p-4 sm:p-5 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl shadow-amber-950/20 backdrop-blur-md">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-bold text-white">
                  Baja por Arrepentimiento Programada
                </h4>
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] px-2 py-0.5 font-bold">
                  Baja efectiva al fin del ciclo ({cancellationDate})
                </Badge>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Ejerciste tu derecho de revocación. El club continúa con <strong>acceso total y operativo al 100%</strong> hasta el <strong>{cancellationDate}</strong>. Luego de esa fecha la suscripción finalizará definitivamente y <strong>no se realizarán nuevos cobros ni débitos automáticos</strong>.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleUndoRevocation}
            disabled={isUndoingRevocation}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-9 px-4 rounded-xl shrink-0 cursor-pointer shadow-md flex items-center gap-1.5 self-start md:self-auto"
          >
            {isUndoingRevocation ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Reactivando...</span>
              </>
            ) : (
              <>
                <Undo2 className="w-3.5 h-3.5" />
                <span>Deshacer y Mantener Plan</span>
              </>
            )}
          </Button>
        </div>
      )}

      {/* Aviso de Aceptación Obligatoria Pendiente */}
      {!isTermsAccepted && (
        <div className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-amber-950/20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white">
                  Aceptación de Términos y Condiciones
                </h4>
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] px-2 py-0.5 font-bold">
                  Requerido
                </Badge>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Para operar tu club bajo las normas oficiales de CancharClub, debés confirmar la lectura y conformidad de los términos del servicio.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => {
              const el = document.getElementById('terminos-y-condiciones')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs h-9 px-4 rounded-xl shrink-0 cursor-pointer shadow-md"
          >
            Leer y Aceptar Términos
          </Button>
        </div>
      )}

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
              <h2 className="text-2xl font-bold text-white tracking-tight">
                {clubName}
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

          {/* Canchas en tu predio — Fijado y Administrado por Superadmin */}
          <div className="mt-5 pt-4 border-t border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Canchas en tu predio:
              </span>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold shadow-sm ring-1 ring-emerald-400/30">
                <Check className="w-3.5 h-3.5 text-emerald-400 stroke-3" />
                <span>{courtsCount >= 5 ? '5+ Canchas' : `${courtsCount} Cancha${courtsCount > 1 ? 's' : ''}`}</span>
                <span className="text-[10px] text-emerald-400/80 font-mono font-normal">({activePlan.name})</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-950/70 border border-slate-800 px-3 py-1.5 rounded-xl">
              <LockIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Plan fijado por la administración central</span>
            </div>
          </div>

          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>
              La cantidad de canchas y el plan mensual son administrados exclusivamente por el Superadmin. Para ampliar canchas o modificar tu plan, comunicate con soporte.
            </span>
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
              <span className="text-[11px] text-slate-400">
                {pricing.courtsCount} cancha{pricing.courtsCount > 1 ? 's' : ''} activa{pricing.courtsCount > 1 ? 's' : ''}
              </span>
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

        {/* Medio de Pago Único Oficial: Tarjeta de Débito o Crédito */}
        <Card className="bg-slate-900/60 border-slate-800 rounded-3xl p-6 flex flex-col justify-between backdrop-blur-md">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                Medio de Pago Único Oficial
              </h3>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] uppercase font-bold">
                Débito Automático
              </Badge>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed">
              El abono mensual se gestiona <strong>exclusivamente por débito automático con tarjeta de débito o crédito</strong> mediante Mercado Pago Subscriptions. No se aceptan transferencias ni otros medios.
            </p>

            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Estado de medio de pago:</span>
                {isAutoDebitActive ? (
                  <span className="font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 
                    {planDetails?.cardInfo?.last4 
                      ? `${planDetails.cardInfo.brand || 'Tarjeta'} •••• ${planDetails.cardInfo.last4}` 
                      : 'Tarjeta Vinculada (Débito Automático)'}
                  </span>
                ) : (
                  <span className="font-bold text-amber-400 flex items-center gap-1">
                    <LockIcon className="w-3.5 h-3.5" /> Pendiente de Carga
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Concepto en resumen bancario:</span>
                <span className="font-mono font-bold text-white">CancharClub</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Próximo vencimiento:</span>
                <span className="font-semibold text-white">{pricing.nextDueDate}</span>
              </div>
              <div className="flex items-center justify-between text-slate-300 pt-1.5 border-t border-slate-800/80">
                <span className="text-slate-400">Términos y Condiciones:</span>
                {isTermsAccepted ? (
                  <span className="font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Estado: Aceptado
                  </span>
                ) : (
                  <span className="font-bold text-amber-400 flex items-center gap-1 animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5" /> Estado: Pendiente
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 space-y-2">
            {!isAutoDebitActive ? (
              <Button
                onClick={handleSetupAutoDebit}
                disabled={subscribing}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 py-5 cursor-pointer"
              >
                {subscribing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin mr-1.5" />
                    Conectando con Mercado Pago...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-1.5" />
                    Cargar Tarjeta de Débito / Crédito ($0 hoy)
                  </>
                )}
              </Button>
            ) : (
              <div className="space-y-2">
                {planDetails?.cancelAtPeriodEnd ? (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center text-xs text-amber-400 font-semibold flex items-center justify-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Baja programada: Activo hasta {cancellationDate}</span>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center text-xs text-emerald-400 font-semibold flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Suscripción activa con Débito Automático Oficial</span>
                  </div>
                )}
                <Button
                  variant="outline"
                  onClick={() => setShowSubscriptionModal(true)}
                  className="w-full border-slate-700 hover:bg-slate-800 text-slate-300 text-xs py-2 cursor-pointer"
                >
                  Actualizar datos de tarjeta
                </Button>
                {planDetails?.cancelAtPeriodEnd ? (
                  <Button
                    variant="ghost"
                    onClick={handleUndoRevocation}
                    disabled={isUndoingRevocation}
                    className="w-full text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 py-1.5 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Mantener plan activo (Deshacer)
                  </Button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowRevocationModal(true)}
                    className="w-full text-center text-[11px] text-slate-400 hover:text-rose-400 underline decoration-slate-600 hover:decoration-rose-400 transition-colors py-1 cursor-pointer"
                  >
                    Botón de Arrepentimiento (Baja al fin del ciclo)
                  </button>
                )}
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
              Disfrutá de <strong>15 días de prueba 100% gratuitos</strong>. Vinculá tu tarjeta de débito o crédito con Mercado Pago Subscriptions: <strong>hoy se cobra $0</strong>. La primera cuota de <strong>{formatARS(pricing.monthlyFeeArs)}</strong> se debitará recién al cumplirse los 15 días ({pricing.nextDueDate}), y luego continuará de forma automática en esa misma fecha cada mes.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 pt-1 font-mono">
              <span className="flex items-center gap-1 text-emerald-300 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Prueba: <strong className="text-white">15 días gratis ($0 hoy)</strong>
              </span>
              <span className="text-slate-600">•</span>
              <span className="flex items-center gap-1 text-emerald-300 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Resumen de tarjeta: <strong className="text-white bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">CancharClub</strong>
              </span>
              <span className="text-slate-600">•</span>
              <span>Procesado por Mercado Pago Subscriptions</span>
            </div>
          </div>

          <div className="shrink-0 w-full md:w-auto">
            {isAutoDebitActive ? (
              <div className="flex flex-col gap-1.5 items-end">
                <div className="px-5 py-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Débito Automático Activo ({formatARS(pricing.monthlyFeeArs)}/mes)</span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  Concepto: <strong className="text-white">CancharClub</strong>
                </span>
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
                className={`p-5 rounded-2xl flex flex-col transition-all ${
                  isCurrent
                    ? 'bg-slate-900 border-2 border-emerald-500/70 shadow-lg shadow-emerald-950/20 relative'
                    : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isCurrent
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {plan.courtsLabel}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Tu Plan Activo
                      </span>
                    )}
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
              </Card>
            )
          })}
        </div>
      </div>



      {/* Historial de Comprobantes Emitidos */}
      <Card className="bg-slate-900/60 border-slate-800 rounded-2xl backdrop-blur-md overflow-hidden">
        <CardHeader className="p-5 border-b border-slate-800 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-white">
              Historial de Facturas y Liquidaciones
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Descarga los recibos oficiales correspondientes a tus períodos mensuales.
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400 font-mono">
            {planDetails?.invoices?.length || 0} comprobantes
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {(!planDetails?.invoices || planDetails.invoices.length === 0) ? (
            <div className="p-8 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center border border-emerald-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">
                  Período de prueba bonificado en curso
                </h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
                  Tu club se encuentra disfrutando de los <strong>15 días de prueba gratuita</strong>. No registrás cobros anteriores ni pagos pendientes. Tu primera liquidación oficial se emitirá el <strong>{pricing.nextDueDate}</strong>.
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Cuenta 100% Bonificada ($0)</span>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60 text-xs">
              {planDetails.invoices.map((inv) => {
                const monthName = new Date(inv.year, inv.month - 1, 1).toLocaleDateString('es-AR', { month: 'long' })
                const formattedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1)
                const isPaidInvoice = inv.status === 'PAID'
                const paidDateStr = inv.paid_at 
                  ? new Date(inv.paid_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : null

                return (
                  <div key={inv.id} className="p-4 flex items-center justify-between hover:bg-slate-800/20 transition-colors">
                    <div>
                      <div className="font-semibold text-white">
                        Período {formattedMonth} {inv.year}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Abono mensual: {courtsCount} {courtsCount === 1 ? 'cancha' : 'canchas'} ({inv.slots_multiplier || pricing.multiplier} turnos)
                        {paidDateStr && (
                          <span className="text-slate-500 ml-2">• Pagado el {paidDateStr}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono font-bold text-slate-200">
                        {formatARS(Number(inv.amount))}
                      </span>
                      {isPaidInvoice ? (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">
                          Pagado
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">
                          Pendiente
                        </Badge>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => downloadReceiptPdf(inv)}
                        className="h-8 text-xs text-slate-400 hover:text-white cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 mr-1" /> PDF
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Botón de Arrepentimiento Oficial (Ley 24.240 - Res. 424/2020) */}
      <Card className="bg-linear-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden backdrop-blur-md">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[11px] font-semibold">
                Defensa de las y los Consumidores
              </Badge>
              <Badge variant="outline" className="text-slate-400 border-slate-800 text-[10px]">
                Ley 24.240 • Res. 424/2020
              </Badge>
              {planDetails?.cancelAtPeriodEnd && (
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] font-bold">
                  Baja en curso
                </Badge>
              )}
            </div>
            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <Scale className="w-5 h-5 text-indigo-400" />
              Botón de Arrepentimiento y Revocación de Suscripción
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Conforme a la normativa legal vigente, tenés la facultad de revocar o dar de baja la contratación del abono del club en cualquier momento. 
              La baja <strong>se hace efectiva al terminar el período vigente actual ({cancellationDate})</strong>. Durante todo el ciclo restante, tu club seguirá contando con el servicio activo y no se generarán cobros ni renovaciones posteriores.
            </p>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> Sin cortes abruptos ni pérdida de reservas
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> 0 cargos adicionales
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> Trámite 100% digital
              </span>
            </div>
          </div>

          <div className="shrink-0 w-full md:w-auto flex flex-col items-stretch sm:items-end gap-2">
            {planDetails?.cancelAtPeriodEnd ? (
              <div className="space-y-2 text-right">
                <div className="px-4 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold text-center md:text-right">
                  Baja programada: finaliza el {cancellationDate}
                </div>
                <Button
                  onClick={handleUndoRevocation}
                  disabled={isUndoingRevocation}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl h-10 px-5 shadow-lg shadow-emerald-950/40 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Deshacer y continuar suscripción</span>
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => setShowRevocationModal(true)}
                className="w-full md:w-auto border-rose-500/40 hover:border-rose-500 text-rose-300 hover:text-white hover:bg-rose-500/20 font-semibold text-xs rounded-xl h-11 px-5 transition-colors cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <span>Botón de Arrepentimiento</span>
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Apartado: Estado de Términos y Condiciones */}
      <Card className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-indigo-950/30 border-slate-800 rounded-3xl p-5 sm:p-6 backdrop-blur-md shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${isTermsAccepted ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' : 'bg-amber-500/20 border border-amber-500/30 text-amber-400 animate-pulse'}`}>
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Apartado Legal: Términos y Condiciones
                </h3>
                <Badge variant="outline" className="text-[10px] uppercase font-bold border-indigo-500/40 text-indigo-300 bg-indigo-500/10">
                  CancharClub SaaS
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isTermsAccepted 
                  ? 'Contrato de adhesión operativo registrado formalmente en la base de datos.'
                  : 'Lectura y aceptación obligatoria para la administración oficial de tu complejo deportivo.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
            <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 text-xs font-bold shadow-sm ${
              isTermsAccepted 
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' 
                : 'bg-amber-500/15 border-amber-500/40 text-amber-300 animate-pulse'
            }`}>
              {isTermsAccepted ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Estado: Aceptado</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Estado: Pendiente</span>
                </>
              )}
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const el = document.getElementById('terminos-y-condiciones')
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }}
              className="text-xs h-9 border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl cursor-pointer"
            >
              Ver Contrato
            </Button>
          </div>
        </div>
      </Card>

      {/* Apartado Oficial: Términos y Condiciones del Servicio */}
      <ClubTermsCard
        tenantId={tenantId || undefined}
        initialAcceptedAt={planDetails?.termsAcceptedAt}
        onAccepted={(ts) => {
          setPlanDetails((prev) => prev ? { ...prev, termsAcceptedAt: ts } : {
            tenantId: tenantId || '',
            tenantName: clubName,
            tenantSlug: '',
            courtsCount,
            highestSlotPriceArs: highestSlotPrice,
            pricing,
            activePlan,
            isPaid,
            subscriptionStatus: 'ACTIVE',
            nextDueDate: '',
            invoices: [],
            hasAutoDebit,
            termsAcceptedAt: ts,
          })
        }}
      />

      {/* MODAL OFICIAL: Carga de Datos de Tarjeta Mercado Pago Subscriptions */}
      {showSubscriptionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-slate-900 border border-indigo-500/40 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-7 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/30 text-xs font-bold px-2.5 py-0.5">
                    Mercado Pago Subscriptions
                  </Badge>
                  <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Pago Seguro 256-bit
                  </span>
                </div>
                <h3 className="text-xl font-extrabold text-white mt-2">
                  Adhesión a Débito Automático
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Cargá los datos de tu tarjeta para el cobro mensual recurrente del plan.
                </p>
              </div>
              <button
                onClick={() => setShowSubscriptionModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Aviso especial de concepto en resumen bancario y prueba gratis */}
            <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 15 DÍAS GRATIS — HOY SE COBRA $0
                </div>
                <span className="text-slate-400 block text-[11px]">Primer cobro recién en el día 16. Resumen bancario:</span>
                <span className="text-sm font-black text-white font-mono tracking-wider">CancharClub</span>
              </div>
              <div className="sm:text-right">
                <span className="text-slate-400 block text-[11px]">Monto mensual (desde día 16):</span>
                <span className="text-base font-extrabold text-emerald-400 font-mono">
                  {formatARS(pricing.monthlyFeeArs)}/mes
                </span>
              </div>
            </div>

            {/* Previsualización interactiva de Tarjeta */}
            <div className="relative h-44 rounded-2xl p-5 bg-linear-to-tr from-slate-950 via-indigo-950 to-blue-900 border border-indigo-500/40 shadow-xl flex flex-col justify-between text-white overflow-hidden font-mono">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-7 rounded bg-amber-400/80 border border-amber-300/40 flex items-center justify-center text-[9px] font-bold text-amber-950">
                    CHIP
                  </div>
                  <span className="text-[10px] text-slate-300 font-sans">Débito / Crédito</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black tracking-widest text-emerald-300 font-sans block">CANCHARCLUB</span>
                  <span className="text-[9px] text-slate-400 font-sans">Mercado Pago</span>
                </div>
              </div>

              <div>
                <div className="text-base sm:text-lg font-bold tracking-widest text-slate-200">
                  {cardNumber || '•••• •••• •••• ••••'}
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <div>
                  <span className="text-[9px] text-slate-400 uppercase block font-sans">Titular</span>
                  <span className="font-bold tracking-wider uppercase text-slate-200">
                    {cardHolder || 'NOMBRE Y APELLIDO'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-slate-400 uppercase block font-sans">Vence</span>
                  <span className="font-bold text-slate-200">{cardExpiry || 'MM/AA'}</span>
                </div>
              </div>
            </div>

            {/* Formulario de carga de datos de tarjeta */}
            <form onSubmit={handleConfirmCardSubscription} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Número de Tarjeta</label>
                <input
                  type="text"
                  maxLength={19}
                  placeholder="4500 0000 0000 0000"
                  value={cardNumber}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 16)
                    const formatted = v.match(/.{1,4}/g)?.join(' ') || v
                    setCardNumber(formatted)
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Nombre y Apellido (como figura en la tarjeta)</label>
                <input
                  type="text"
                  placeholder="JUAN PEREZ"
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 uppercase"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Vencimiento</label>
                  <input
                    type="text"
                    maxLength={5}
                    placeholder="MM/AA"
                    value={cardExpiry}
                    onChange={(e) => {
                      let v = e.target.value.replace(/\D/g, '').slice(0, 4)
                      if (v.length >= 3) v = `${v.slice(0, 2)}/${v.slice(2)}`
                      setCardExpiry(v)
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 font-mono text-center"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">CVV</label>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="123"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 font-mono text-center"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">DNI Titular</label>
                  <input
                    type="text"
                    maxLength={9}
                    placeholder="38123456"
                    value={cardDni}
                    onChange={(e) => setCardDni(e.target.value.replace(/\D/g, '').slice(0, 9))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 font-mono text-center"
                    required
                  />
                </div>
              </div>

              <div className="pt-2 flex flex-col-reverse sm:flex-row gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowSubscriptionModal(false)}
                  className="w-full sm:w-1/3 border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs py-5"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingCard}
                  className="w-full sm:w-2/3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs py-5 shadow-lg shadow-emerald-950/50 gap-2"
                >
                  {savingCard ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Procesando suscripción...</span>
                    </>
                  ) : (
                    <>
                      <LockIcon className="w-3.5 h-3.5" />
                      <span>Adherir a Débito Mensual</span>
                    </>
                  )}
                </Button>
              </div>

              <p className="text-[10px] text-center text-slate-400">
                La suscripción se renueva cada 30 días. Sujeto a los{' '}
                <a
                  href="#terminos-y-condiciones"
                  onClick={() => setShowSubscriptionModal(false)}
                  className="text-emerald-400 underline hover:text-emerald-300"
                >
                  Términos y Condiciones de CancharClub
                </a>
                .
              </p>
            </form>
          </div>
        </div>
      )}
      {/* MODAL OFICIAL: Confirmación de Botón de Arrepentimiento */}
      {showRevocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-slate-900 border border-rose-500/40 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-7 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 text-xs font-bold px-2.5 py-0.5">
                    Derecho de Arrepentimiento
                  </Badge>
                  <span className="text-[11px] text-slate-400 font-medium">
                    Ley 24.240 • Res. 424/2020
                  </span>
                </div>
                <h3 className="text-xl font-extrabold text-white mt-2">
                  ¿Deseás solicitar la baja de la suscripción?
                </h3>
              </div>
              <button
                onClick={() => setShowRevocationModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Explicación de vigencia hasta el fin de período */}
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs text-slate-300">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                Tu club continuará activo hasta el fin del ciclo
              </div>
              <p>
                Al confirmar el arrepentimiento, la suscripción <strong>no se cancela de inmediato</strong>:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-300">
                <li>
                  Tu club mantendrá <strong>todas sus funciones activas normalmente</strong> hasta el <strong>{cancellationDate}</strong>.
                </li>
                <li>
                  <strong>No se realizarán cobros futuros</strong> ni renovaciones en tu tarjeta después de dicha fecha.
                </li>
                <li>
                  Tus datos de reservas, canchas y clientes se conservan íntegramente. Podrás reactivar el plan cuando gustes.
                </li>
              </ul>
            </div>

            {/* Motivo Opcional */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Motivo de la baja (opcional)
              </label>
              <textarea
                value={revocationReason}
                onChange={(e) => setRevocationReason(e.target.value)}
                placeholder="Contanos brevemente el motivo para ayudarnos a mejorar el servicio..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500 resize-none"
              />
            </div>

            {/* Botones de acción */}
            <div className="pt-2 flex flex-col-reverse sm:flex-row gap-2.5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowRevocationModal(false)}
                className="w-full sm:w-1/2 border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs py-5 cursor-pointer"
              >
                Conservar mi suscripción
              </Button>
              <Button
                type="button"
                disabled={isRevoking}
                onClick={handleRequestRevocation}
                className="w-full sm:w-1/2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs py-5 shadow-lg shadow-rose-950/50 gap-2 cursor-pointer"
              >
                {isRevoking ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Registrando baja...</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    <span>Confirmar Arrepentimiento</span>
                  </>
                )}
              </Button>
            </div>

            <p className="text-[10px] text-center text-slate-500">
              Podrás deshacer esta solicitud en cualquier momento antes del {cancellationDate} desde este mismo panel.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
