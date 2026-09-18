'use client'

import { useState, useEffect, Suspense, use, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { 
  Lock, 
  Clock, 
  ArrowLeft, 
  CreditCard, 
  Loader2,
  Phone,
  ShieldCheck,
  Building2,
  Copy,
  Check, 
  Smartphone, 
  Send, 
  Wallet,
  Sparkles
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatARS } from '@/lib/utils'
import { initiateOnlineCheckout } from '@/actions/booking.actions'
import { 
  getPlayerWalletBalance, 
  applyWalletCreditAction,
  type PlayerWallet
} from '@/actions/coupons-and-wallet.actions'
import { toast } from 'sonner'
import type { SportType } from '@/types/database'
import { getClubBySlug, getClubBankDetails, type ClubData } from '@/config/clubs-catalog'
import { getClubPublicData } from '@/actions/club.actions'

function CheckoutContent({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { slug } = use(params)

  const fallbackClub = useMemo(() => getClubBySlug(slug), [slug])
  const [liveClub, setLiveClub] = useState<ClubData | null>(null)
  const club = liveClub || fallbackClub
  const clubBank = useMemo(() => getClubBankDetails(club), [club])

  const courtId = searchParams.get('courtId') || 'c1'
  const courtName = searchParams.get('courtName') || 'Cancha 1'
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
  const time = searchParams.get('time') || '19:00'
  const rawTotalParam = Number(searchParams.get('total'))
  const rawDepositParam = Number(searchParams.get('deposit'))

  // Cálculo inteligente: si no viene en los parámetros URL, computar de las reglas de tarifas del club
  const calculatedPricing = useMemo(() => {
    if (rawTotalParam > 0) {
      return {
        total: rawTotalParam,
        deposit: rawDepositParam > 0 ? rawDepositParam : Math.round(rawTotalParam * 0.5),
      }
    }
    if (club.priceRules && club.priceRules.length > 0) {
      let dayOfWeek = new Date().getDay()
      if (date) {
        const parts = date.split('-').map(Number)
        if (parts.length === 3) dayOfWeek = new Date(parts[0], parts[1] - 1, parts[2]).getDay()
      }
      const matchingRule = club.priceRules.find((r) =>
        (!r.courtId || r.courtId === courtId) &&
        (!r.dayOfWeek || r.dayOfWeek.length === 0 || r.dayOfWeek.includes(dayOfWeek)) &&
        time >= r.timeFrom && time <= r.timeTo
      )
      if (matchingRule) {
        const t = matchingRule.priceArs
        const depPct = (matchingRule.depositPct || 50) / 100
        return { total: t, deposit: Math.round(t * depPct) }
      }
    }
    const defaultPrice = club.startingPrice || 25000
    return { total: defaultPrice, deposit: Math.round(defaultPrice * 0.5) }
  }, [rawTotalParam, rawDepositParam, club, date, time, courtId])

  const total = calculatedPricing.total
  const deposit = calculatedPricing.deposit
  const sport = (searchParams.get('sport') || 'PADEL') as SportType

  const paramTenant = searchParams.get('tenantId')
  const [resolvedTenantId, setResolvedTenantId] = useState<string>(
    paramTenant || (club?.id && club.id.length > 10 ? club.id : '')
  )

  useEffect(() => {
    let isMounted = true
    getClubPublicData(slug).then((data) => {
      if (isMounted && data) {
        setLiveClub(data)
        if (data.id) setResolvedTenantId(data.id)
      }
    })
    return () => {
      isMounted = false
    }
  }, [slug])

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedAlias, setCopiedAlias] = useState(false)
  const [copiedCbu, setCopiedCbu] = useState(false)

  // Mejora 18: Billetera Virtual y Saldo a Favor por Cancelaciones
  const [playerWallet, setPlayerWallet] = useState<PlayerWallet | null>(null)
  const [walletChecking, setWalletChecking] = useState(false)
  const [useWalletCredits, setUseWalletCredits] = useState(true)

  // Método de pago: Por defecto Transferencia directa a la cuenta del club
  const [paymentMethod, setPaymentMethod] = useState<'TRANSFER' | 'MERCADOPAGO'>('TRANSFER')

  const [isPublicPaused] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split('; ')
      const statusCookie = cookies.find(c => c.startsWith('demo_subscription_status='))
      if (statusCookie) {
        const val = statusCookie.split('=')[1]
        return val === 'PARTIALLY_SUSPENDED' || val === 'LOCKED'
      }
    }
    return false
  })

  // Temporizador de 7 minutos para el Redis Lock
  const [secondsLeft, setSecondsLeft] = useState(420)

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          toast.error('El tiempo de reserva expiró. Por favor seleccioná el turno nuevamente.')
          router.back()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [router])

  // Verificación reactiva de Saldo a Favor según el teléfono de WhatsApp
  useEffect(() => {
    const clean = customerPhone.replace(/\D/g, '')
    if (clean.length >= 8) {
      let isMounted = true
      const timer = setTimeout(() => {
        setWalletChecking(true)
        getPlayerWalletBalance(clean)
          .then((wallet) => {
            if (isMounted) {
              setPlayerWallet(wallet)
              if (wallet.balanceArs > 0) {
                setUseWalletCredits(true)
              }
            }
          })
          .catch(() => {})
          .finally(() => {
            if (isMounted) setWalletChecking(false)
          })
      }, 400)

      return () => {
        isMounted = false
        clearTimeout(timer)
      }
    }
  }, [customerPhone])

  // Cálculos dinámicos de montos con Billetera Virtual
  const effectiveTotal = total
  const baseDeposit = deposit

  const walletAvailable = playerWallet?.balanceArs || 0
  const walletApplied = useWalletCredits ? Math.min(walletAvailable, baseDeposit) : 0
  const payableDeposit = Math.max(0, baseDeposit - walletApplied)
  const remainingAtClub = Math.max(0, effectiveTotal - baseDeposit)

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const rem = secs % 60
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`
  }

  // Formato de fecha amigable para móviles
  const formattedDate = (() => {
    try {
      const [y, m, d] = date.split('-').map(Number)
      const dateObj = new Date(y, m - 1, d)
      return dateObj.toLocaleDateString('es-AR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    } catch {
      return date
    }
  })()

  const handleCopyAlias = () => {
    navigator.clipboard.writeText(clubBank.alias)
    setCopiedAlias(true)
    toast.success(`Alias copiado: ${clubBank.alias}`)
    setTimeout(() => setCopiedAlias(false), 2500)
  }

  const handleCopyCbu = () => {
    navigator.clipboard.writeText(clubBank.cbu)
    setCopiedCbu(true)
    toast.success(`CBU copiado: ${clubBank.cbu}`)
    setTimeout(() => setCopiedCbu(false), 2500)
  }

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error('Completá tu nombre y teléfono celular de WhatsApp')
      return
    }

    setLoading(true)
    try {
      const startsAt = `${date}T${time}:00`

      // Si se aplicó saldo a favor de la billetera virtual, debitarlo
      if (walletApplied > 0) {
        await applyWalletCreditAction(customerPhone, walletApplied)
      }

      const noteDetails = [
        notes,
        walletApplied > 0 ? `[Saldo Billetera: -${formatARS(walletApplied)}]` : '',
      ].filter(Boolean).join(' ')

      // Invocar Server Action para lock + registro de booking con el método elegido
      const res = await initiateOnlineCheckout(
        {
          tenant_id: resolvedTenantId || (club?.id && club.id.length > 10 ? club.id : '00000000-0000-0000-0000-000000000001'),
          court_id: courtId,
          court_name: courtName,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail || undefined,
          customer_notes: noteDetails || undefined,
          starts_at: startsAt,
          origin: 'ONLINE_PORTAL',
          total_amount_ars: effectiveTotal,
          deposit_amount_ars: payableDeposit,
          payment_method: payableDeposit === 0 ? 'TRANSFER' : paymentMethod,
        },
        'MIN_90'
      )

      if (!res.success) {
        toast.error(res.error || 'Error al iniciar checkout')
        setLoading(false)
        return
      }

      // Si el saldo a favor cubrió el 100% de la seña
      if (payableDeposit === 0) {
        toast.success('¡Turno confirmado 100% con tu Saldo a Favor!')
        router.push(
          `/reserva/${res.booking_id}/confirmado?club=${encodeURIComponent(club.name)}&court=${encodeURIComponent(courtName)}&date=${date}&time=${time}&name=${encodeURIComponent(customerName)}&phone=${encodeURIComponent(customerPhone)}&total=${effectiveTotal}&deposit=0&slug=${club.slug}&phoneClub=${club.whatsappPhone}&method=WALLET&alias=${encodeURIComponent(clubBank.alias)}`
        )
        return
      }

      // Si se eligió Mercado Pago y el club tiene MP configurado
      if (paymentMethod === 'MERCADOPAGO' && res.mp_init_point) {
        toast.success('Redirigiendo a Mercado Pago del club...')
        window.location.href = res.mp_init_point
        return
      }

      // Emitir en BroadcastChannel para sincronización instantánea en la grilla del club (0ms)
      try {
        const bc = new BroadcastChannel('canchar_bookings')
        bc.postMessage({
          type: 'BOOKING_CONFIRMED',
          booking: {
            id: res.booking_id,
            court_id: courtId,
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim(),
            customer_email: customerEmail.trim() || null,
            starts_at: `${date}T${time}:00`,
            ends_at: `${date}T${time}:00`,
            status: 'CONFIRMED',
            origin: 'ONLINE_PORTAL',
            total_amount_ars: effectiveTotal,
            deposit_amount_ars: payableDeposit,
            total_paid: payableDeposit,
            balance_due: Math.max(0, effectiveTotal - payableDeposit),
            internal_notes: `Reserva Online 24hs - Seña confirmada: $${payableDeposit}`,
            courts: {
              name: courtName,
              sport: 'PADEL',
              slot_duration: 'MIN_90',
            },
          },
        })
        bc.close()
      } catch {}

      // Flujo de Transferencia Bancaria Directa al Club:
      toast.success('¡Turno reservado y cerrado en el sistema!')
      router.push(
        `/reserva/${res.booking_id}/confirmado?club=${encodeURIComponent(club.name)}&court=${encodeURIComponent(courtName)}&date=${date}&time=${time}&name=${encodeURIComponent(customerName)}&phone=${encodeURIComponent(customerPhone)}&total=${effectiveTotal}&deposit=${payableDeposit}&slug=${club.slug}&phoneClub=${club.whatsappPhone}&method=TRANSFER&alias=${encodeURIComponent(clubBank.alias)}`
      )
    } catch {
      toast.error('Error inesperado al procesar la reserva')
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-lg flex-1 flex flex-col pb-36 border-x border-slate-900 bg-slate-950 min-h-screen relative">
      {/* Header Mobile con Botón Volver y Paso */}
      <header className="sticky top-0 z-30 px-4 py-3 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver</span>
        </button>

        <div className="text-center">
          <span className="text-xs font-bold text-white block">Reserva de Turno</span>
          <span className="text-[10px] text-emerald-400 font-medium">Paso 2 de 2 • Pago de Seña</span>
        </div>

        <div className="w-12 flex justify-end">
          <ShieldCheck className="w-4 h-4 text-emerald-500/80" />
        </div>
      </header>

      {/* Timer de Bloqueo Temporal (Redis Lock) */}
      <div className="mx-4 mt-3.5 p-3 rounded-2xl bg-gradient-to-r from-amber-950/50 to-amber-900/30 border border-amber-500/30 flex items-center justify-between text-amber-200 text-xs shadow-sm">
        <div className="flex items-center gap-2 font-medium">
          <Clock className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
          <span className="text-[11px] sm:text-xs">Turno reservado temporalmente para vos:</span>
        </div>
        <span className="font-mono font-black text-sm bg-amber-900/80 px-2 py-0.5 rounded-lg text-amber-300 border border-amber-500/30 shrink-0">
          {formatTimer(secondsLeft)}
        </span>
      </div>

      {/* Resumen del Turno Seleccionado en Tarjeta */}
      <div className="px-4 pt-3.5">
        <Card className="border-slate-800 bg-slate-900/90 rounded-2xl shadow-md overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] uppercase font-extrabold px-1.5 py-0">
                    {sport}
                  </Badge>
                  <span className="text-[11px] text-slate-400 font-semibold">{club.name}</span>
                </div>
                <h2 className="text-base font-extrabold text-white leading-snug">{courtName}</h2>
                <p className="text-xs text-slate-300 mt-1 flex items-center gap-2">
                  <span>📅 <strong className="text-white capitalize">{formattedDate}</strong></span>
                  <span>•</span>
                  <span>🕐 <strong className="text-emerald-400">{time} hs</strong></span>
                </p>
              </div>
            </div>

            {/* Desglose de Pago y Billetera Virtual */}
            <div className="border-t border-slate-800/90 pt-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Precio regular de la cancha:</span>
                <span className="text-slate-200 font-semibold">{formatARS(total)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Saldo restante en recepción:</span>
                <span className="text-slate-300 font-semibold">{formatARS(remainingAtClub)}</span>
              </div>
              {walletApplied > 0 && (
                <div className="flex justify-between text-teal-300 font-medium">
                  <span className="flex items-center gap-1">
                    <Wallet className="w-3 h-3" />
                    <span>Saldo a favor aplicado:</span>
                  </span>
                  <span>-{formatARS(walletApplied)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-white pt-1.5 border-t border-slate-800">
                <span className="text-emerald-400 flex items-center gap-1">
                  <span>Seña a abonar ahora:</span>
                </span>
                <span className="text-emerald-400 text-base font-black font-mono">
                  {payableDeposit === 0 ? '¡CUBIERTA (100%)!' : formatARS(payableDeposit)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Formulario de Datos del Jugador */}
      <form id="checkout-form" onSubmit={handlePay} className="px-4 pt-4 space-y-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            1. Tus datos de contacto
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="name" className="text-xs font-semibold text-slate-300">
                Nombre y Apellido *
              </Label>
              <Input
                id="name"
                autoComplete="name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-10 rounded-xl bg-slate-900 border-slate-800 text-sm focus:border-emerald-500"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="phone" className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Teléfono Celular (WhatsApp) *</span>
                <span className="text-[10px] text-emerald-400 font-normal">
                  {walletChecking ? 'Verificando saldo a favor...' : 'Para enviarte el comprobante'}
                </span>
              </Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="Ej. 3814123456"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="h-10 rounded-xl bg-slate-900 border-slate-800 text-sm focus:border-emerald-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs font-semibold text-slate-300">
                  Email (Opcional)
                </Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="tu@email.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="h-10 rounded-xl bg-slate-900 border-slate-800 text-xs focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="notes" className="text-xs font-semibold text-slate-300">
                  Notas (Opcional)
                </Label>
                <Input
                  id="notes"
                  placeholder="Ej. Pelotas"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-10 rounded-xl bg-slate-900 border-slate-800 text-xs focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Mejora 18: Billetera Virtual / Saldo a Favor por Cancelaciones Previas */}
        {walletAvailable > 0 && (
          <div className="p-3.5 rounded-2xl bg-linear-to-r from-teal-950/40 via-emerald-950/30 to-slate-900 border border-teal-500/30 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Saldo a Favor en CancharClub</span>
                  <span className="text-[10px] text-teal-300">Crédito por cancelaciones o lluvia previa</span>
                </div>
              </div>
              <span className="text-xs font-mono font-black text-teal-400 bg-teal-950/80 px-2 py-0.5 rounded-lg border border-teal-500/30">
                {formatARS(walletAvailable)}
              </span>
            </div>

            <label className="flex items-center gap-2.5 p-2 bg-slate-950/60 rounded-xl border border-teal-500/20 cursor-pointer hover:bg-slate-950 transition-colors">
              <input
                type="checkbox"
                checked={useWalletCredits}
                onChange={(e) => setUseWalletCredits(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
              />
              <div className="flex-1 text-[11px] text-slate-300">
                <span>Usar saldo a favor para cubrir la seña (<strong>-{formatARS(walletApplied)}</strong>)</span>
              </div>
            </label>
          </div>
        )}



        {/* Sección de Selección y Datos de Cobro del Club */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
            <span>2. Cuenta de Acreditación de la Seña</span>
            <span className="text-[10px] text-emerald-400 font-normal">100% Directo al Club</span>
          </div>

          {/* Opciones de Método de Pago */}
          <div className="grid grid-cols-1 gap-2 mb-3">
            <button
              type="button"
              onClick={() => setPaymentMethod('TRANSFER')}
              className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${
                paymentMethod === 'TRANSFER'
                  ? 'bg-emerald-950/40 border-emerald-500/60 ring-1 ring-emerald-500/30'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                paymentMethod === 'TRANSFER' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}>
                <Building2 className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Transferencia Bancaria / CVU Directo</span>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[9px] px-1.5 py-0">
                    Acreditación Inmediata
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Transferí directo al Alias del club y enviá el comprobante por WhatsApp.
                </p>
              </div>
            </button>

            {club.mpConnected && (
              <button
                type="button"
                onClick={() => setPaymentMethod('MERCADOPAGO')}
                className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${
                  paymentMethod === 'MERCADOPAGO'
                    ? 'bg-emerald-950/40 border-emerald-500/60 ring-1 ring-emerald-500/30'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                  paymentMethod === 'MERCADOPAGO' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                }`}>
                  <CreditCard className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <span className="text-xs font-bold text-white block">Mercado Pago del Club</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Tarjeta de débito, crédito o dinero en cuenta acreditado al club.
                  </p>
                </div>
              </button>
            )}
          </div>

          {/* Tarjeta de Datos Bancarios del Club para Transferencia */}
          {paymentMethod === 'TRANSFER' && (
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div>
                  <span className="text-[10px] text-slate-400 block font-medium">Cuenta oficial del club:</span>
                  <span className="text-xs font-bold text-white">{club.name}</span>
                </div>
                <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400">
                  {clubBank.bankName}
                </Badge>
              </div>

              <div className="space-y-2 text-xs">
                {/* Titular */}
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400 text-[11px]">Titular:</span>
                  <span className="font-semibold text-white">{clubBank.accountHolder}</span>
                </div>

                {/* Alias con Botón Copiar */}
                <div className="flex items-center justify-between bg-slate-950 p-2 rounded-xl border border-slate-800/80">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Alias para transferir:</span>
                    <span className="font-mono font-black text-sm text-emerald-400 tracking-wide">
                      {clubBank.alias}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCopyAlias}
                    className="h-8 px-2.5 text-xs rounded-lg border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/50 hover:text-emerald-200 gap-1"
                  >
                    {copiedAlias ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedAlias ? 'Copiado' : 'Copiar Alias'}</span>
                  </Button>
                </div>

                {/* CBU con Botón Copiar */}
                <div className="flex items-center justify-between bg-slate-950 p-2 rounded-xl border border-slate-800/80">
                  <div className="overflow-hidden mr-2">
                    <span className="text-[10px] text-slate-400 block">CBU / CVU:</span>
                    <span className="font-mono text-xs text-slate-300 truncate block">
                      {clubBank.cbu}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCopyCbu}
                    className="h-8 px-2 text-xs rounded-lg border-slate-700 text-slate-300 hover:bg-slate-800 gap-1 shrink-0"
                  >
                    {copiedCbu ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCbu ? 'Copiado' : 'Copiar'}</span>
                  </Button>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-[11px] text-emerald-300/90 flex items-start gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Hacé la transferencia de <strong>{formatARS(payableDeposit)}</strong> desde tu app bancaria. Al presionar el botón de abajo, tu turno se bloquea y podrás enviar el comprobante por WhatsApp al club.
                </span>
              </div>
            </div>
          )}

          {/* Información de Garantía */}
          <div className="pt-2 text-center text-[10px] text-slate-400 flex items-center justify-center gap-1.5">
            <Lock className="w-3 h-3 text-emerald-500" />
            <span>Acreditación 100% directa en la cuenta del club sin intermediación de la plataforma.</span>
          </div>
        </div>
      </form>

      {/* Barra Inferior Fija para Móviles (Sticky Bottom Bar con Safe Area) */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800/90 px-4 py-3 flex items-center justify-center"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="w-full max-w-lg flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] text-slate-400 block font-semibold">
              {payableDeposit === 0 ? 'Seña bonificada:' : 'Seña a abonar:'}
            </span>
            <span className="text-lg font-black text-emerald-400 font-mono leading-none">
              {payableDeposit === 0 ? '¡$0 (Cubierto)!' : formatARS(payableDeposit)}
            </span>
            <span className="text-[10px] text-slate-400 block">
              Saldo en recepción: {formatARS(remainingAtClub)}
            </span>
          </div>

          <div className="flex-1 max-w-[270px]">
            {isPublicPaused ? (
              <Button
                asChild
                className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-950/50 gap-1.5"
              >
                <a
                  href={`https://wa.me/${club.whatsappPhone}?text=${encodeURIComponent(`Hola! Quisiera reservar el turno de las ${time} hs en ${courtName} para la fecha ${date}.`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Phone className="w-4 h-4" />
                  <span>Pedir por WhatsApp</span>
                </a>
              </Button>
            ) : (
              <Button
                type="submit"
                form="checkout-form"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-950/50 gap-1.5 active:scale-95 transition-transform"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Registrando...</span>
                  </>
                ) : payableDeposit === 0 ? (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Confirmar Turno (100% Cubierto)</span>
                  </>
                ) : paymentMethod === 'TRANSFER' ? (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Confirmar Seña ({formatARS(payableDeposit)})</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>Pagar con MP ({formatARS(payableDeposit)})</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center">
      <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando checkout...</div>}>
        <CheckoutContent params={params} />
      </Suspense>
    </div>
  )
}
