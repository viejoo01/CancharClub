'use client'

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { 
  Clock, 
  CheckCircle2, 
  Zap, 
  Coffee, 
  Search, 
  Maximize2, 
  Minimize2, 
  ArrowLeft, 
  ShieldCheck, 
  Plus, 
  Minus, 
  ShoppingCart, 
  QrCode, 
  Check, 
  Layers, 
  UserCheck, 
  Volume2,
  Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatARS, formatTime } from '@/lib/utils'
import { toast } from 'sonner'
import { useTenantId } from '@/hooks/use-tenant-id'
import { createClient } from '@/lib/supabase/client'
import { getCantinaProducts, createCourtOrder } from '@/actions/cantina.actions'

interface CourtStatus {
  id: string
  name: string
  sport: string
  surface?: string | null
  status: 'PLAYING' | 'NEXT_UP' | 'AVAILABLE' | 'MAINTENANCE'
  currentPlayers?: string
  startsAt?: string
  endsAt?: string
  minutesRemaining?: number
  lightingOn: boolean
}

interface KioskProduct {
  id: string
  name: string
  category: 'BEBIDAS' | 'SNACKS' | 'EQUIPAMIENTO'
  price: number
  emoji: string
}

// Productos neutrales genéricos para clubes de cualquier deporte si aún no cargaron catálogo propio
const DEFAULT_KIOSK_PRODUCTS: KioskProduct[] = [
  { id: 'def-1', name: 'Gatorade Manzana 500ml', category: 'BEBIDAS', price: 2500, emoji: '⚡' },
  { id: 'def-2', name: 'Gatorade Blue Cool 500ml', category: 'BEBIDAS', price: 2500, emoji: '❄️' },
  { id: 'def-3', name: 'Agua Mineral Glaciar 500ml', category: 'BEBIDAS', price: 1500, emoji: '💧' },
  { id: 'def-4', name: 'Cerveza Quilmes Clásica 330ml', category: 'BEBIDAS', price: 3000, emoji: '🍺' },
  { id: 'def-5', name: 'Barra Proteica Ena', category: 'SNACKS', price: 1800, emoji: '🍫' },
  { id: 'def-6', name: 'Alfajor Havanna 70% Cacao', category: 'SNACKS', price: 2200, emoji: '🍪' }
]

function getSportEmoji(sport?: string | null): string {
  if (!sport) return '🏆'
  const s = sport.toUpperCase()
  if (s.includes('FUTBOL') || s.includes('SOCCER')) return '⚽'
  if (s.includes('PADEL')) return '🎾'
  if (s.includes('TENIS')) return '🎾'
  if (s.includes('BASQUET') || s.includes('BASKET')) return '🏀'
  if (s.includes('VOLEY') || s.includes('VOLLEY')) return '🏐'
  return '🏆'
}

interface BookingRow {
  id: string
  tenant_id: string
  court_id: string
  customer_name: string
  customer_phone?: string | null
  starts_at: string
  ends_at: string
  status: string
  total_amount_ars?: number
  deposit_amount_ars?: number
  balance_due_ars?: number | null
  courts?: { name?: string; sport?: string } | null
}

function TotemContent() {
  const searchParams = useSearchParams()
  const contextTenantId = useTenantId()
  const queryTenantId = searchParams.get('tenantId')
  const querySlug = searchParams.get('slug')

  const [slugTenantId, setSlugTenantId] = useState<string | null>(null)
  const activeTenantId = queryTenantId || slugTenantId || contextTenantId

  const [clubName, setClubName] = useState<string>('Mi Club')
  const [clubSport, setClubSport] = useState<string>('FUTBOL')
  const [loading, setLoading] = useState(true)

  const [activeTab, setActiveTab] = useState<'CHECKIN' | 'COURTS' | 'BAR'>('CHECKIN')
  const [currentTime, setCurrentTime] = useState('')
  const [currentDate, setCurrentDate] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  const [courts, setCourts] = useState<CourtStatus[]>([])
  const [kioskProducts, setKioskProducts] = useState<KioskProduct[]>(DEFAULT_KIOSK_PRODUCTS)
  const [todayBookings, setTodayBookings] = useState<BookingRow[]>([])

  // Estados de Auto Check-in
  const [searchCode, setSearchCode] = useState('')
  const [searchingCheckin, setSearchingCheckin] = useState(false)
  const [checkedBooking, setCheckedBooking] = useState<{
    found: boolean
    customerName: string
    courtName: string
    time: string
    paidDeposit: number
    pendingBalance: number
    checkedIn: boolean
    courtId?: string
    bookingId?: string
    sport?: string
  } | null>(null)

  // Estados de Kiosco / Bar
  const [cart, setCart] = useState<Record<string, number>>({})
  const [targetCourtForOrder, setTargetCourtForOrder] = useState<string>('counter')
  const [orderConfirmed, setOrderConfirmed] = useState(false)
  const [submittingOrder, setSubmittingOrder] = useState(false)

  // Reloj en tiempo real
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(
        now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      )
      setCurrentDate(
        now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      )
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  // Resolver tenant ID por slug si viene en URL
  useEffect(() => {
    if (!querySlug) return
    let isMounted = true
    const supabase = createClient()
    supabase
      .from('tenants')
      .select('id')
      .eq('slug', querySlug)
      .maybeSingle()
      .then(({ data }) => {
        if (isMounted && data?.id) setSlugTenantId(data.id)
      })
    return () => { isMounted = false }
  }, [querySlug])

  // Sonido de bienvenida / confirmación usando Web Audio API
  const playChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15) // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.36)
    } catch {}
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }

  // Carga reactiva de datos reales del club desde Supabase
  const loadClubData = useCallback(async () => {
    if (!activeTenantId) return
    const supabase = createClient()

    try {
      // 1. Datos del club
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id, name, sport, slug')
        .eq('id', activeTenantId)
        .maybeSingle()

      if (tenant) {
        setClubName(tenant.name || 'Mi Club')
        if (tenant.sport) setClubSport(tenant.sport)
      }

      // 2. Canchas reales activas del club
      const { data: dbCourts } = await supabase
        .from('courts')
        .select('*')
        .eq('tenant_id', activeTenantId)
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      // 3. Reservas del día para estado en vivo de las canchas
      const now = new Date()
      const todayIso = now.toISOString().split('T')[0]
      const startOfDay = `${todayIso}T00:00:00`
      const endOfDay = `${todayIso}T23:59:59`

      const { data: bookings } = await supabase
        .from('bookings')
        .select('*, courts(name, sport)')
        .eq('tenant_id', activeTenantId)
        .neq('status', 'CANCELLED')
        .gte('starts_at', startOfDay)
        .lte('starts_at', endOfDay)
        .order('starts_at', { ascending: true })

      setTodayBookings(bookings || [])

      // Mapear estado en vivo de cada cancha
      const courtsList = dbCourts || []
      const mappedCourts: CourtStatus[] = courtsList.map((c) => {
        // Buscar reserva en curso ahora
        const activeBooking = (bookings || []).find((b: BookingRow) => {
          if (b.court_id !== c.id) return false
          const start = new Date(b.starts_at).getTime()
          const end = new Date(b.ends_at).getTime()
          const current = now.getTime()
          return current >= start && current < end
        })

        // Buscar próximo turno en los próximos 90 minutos
        const nextBooking = (bookings || []).find((b: BookingRow) => {
          if (b.court_id !== c.id) return false
          const start = new Date(b.starts_at).getTime()
          const current = now.getTime()
          return start > current && (start - current) <= 90 * 60 * 1000
        })

        if (activeBooking) {
          const endMs = new Date(activeBooking.ends_at).getTime()
          const remainingMin = Math.max(1, Math.round((endMs - now.getTime()) / 60000))
          return {
            id: c.id,
            name: c.name,
            sport: c.sport || 'FUTBOL5',
            surface: c.surface,
            status: 'PLAYING',
            currentPlayers: activeBooking.customer_name,
            startsAt: activeBooking.starts_at,
            endsAt: activeBooking.ends_at,
            minutesRemaining: remainingMin,
            lightingOn: true
          }
        }

        if (nextBooking) {
          return {
            id: c.id,
            name: c.name,
            sport: c.sport || 'FUTBOL5',
            surface: c.surface,
            status: 'NEXT_UP',
            currentPlayers: `Próximo: ${nextBooking.customer_name} (${formatTime(nextBooking.starts_at)} hs)`,
            startsAt: nextBooking.starts_at,
            endsAt: nextBooking.ends_at,
            lightingOn: false
          }
        }

        return {
          id: c.id,
          name: c.name,
          sport: c.sport || 'FUTBOL5',
          surface: c.surface,
          status: 'AVAILABLE',
          lightingOn: false
        }
      })

      setCourts(mappedCourts)

      // Ajustar destino por defecto de consumos si no está seteado
      if (mappedCourts.length > 0 && targetCourtForOrder === 'counter') {
        setTargetCourtForOrder(mappedCourts[0].name)
      }

      // 4. Catálogo de productos de cantina reales del club
      const catalog = await getCantinaProducts(activeTenantId)
      if (catalog && catalog.length > 0) {
        setKioskProducts(catalog.map(p => ({
          id: p.id,
          name: p.name,
          category: (p.category === 'BEBIDAS' || p.category === 'SNACKS') ? p.category : 'SNACKS',
          price: p.price,
          emoji: p.emoji || '🍽️'
        })))
      } else {
        setKioskProducts(DEFAULT_KIOSK_PRODUCTS)
      }
    } catch (err) {
      console.warn('[loadClubData] Error:', err)
    } finally {
      setLoading(false)
    }
  }, [activeTenantId, targetCourtForOrder])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadClubData()
    }, 0)
    // Refresco periódico cada 20s para mantener sincronizado el estado en vivo de las canchas
    const interval = setInterval(loadClubData, 20000)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [loadClubData])

  // Manejo de búsqueda de Check-in con los datos reales
  const handleSearchCheckIn = (codeOverride?: string) => {
    const code = (codeOverride || searchCode).trim().toLowerCase()
    if (!code) {
      toast.error('Ingresá tu celular, apellido o código de reserva')
      return
    }

    setSearchingCheckin(true)
    try {
      const cleanDigits = code.replace(/\D/g, '')

      // Buscar en las reservas cargadas de hoy
      const match = todayBookings.find((b: BookingRow) => {
        const phone = (b.customer_phone || '').replace(/\D/g, '')
        const name = (b.customer_name || '').toLowerCase()
        const id = (b.id || '').toLowerCase()

        if (cleanDigits.length >= 4 && phone.includes(cleanDigits)) return true
        if (name.includes(code)) return true
        if (id.includes(code) || id.slice(-6) === code) return true
        return false
      })

      if (match) {
        const court = courts.find(c => c.id === match.court_id) || {
          name: match.courts?.name || 'Cancha',
          sport: match.courts?.sport || clubSport
        }
        const deposit = match.deposit_amount_ars || 0
        const total = match.total_amount_ars || 0
        const balance = match.balance_due_ars !== undefined && match.balance_due_ars !== null
          ? match.balance_due_ars
          : Math.max(0, total - deposit)

        setCheckedBooking({
          found: true,
          customerName: match.customer_name,
          courtName: court.name,
          time: `${formatTime(match.starts_at)} a ${formatTime(match.ends_at)} hs`,
          paidDeposit: deposit,
          pendingBalance: balance,
          checkedIn: match.status === 'IN_PROGRESS' || match.status === 'COMPLETED',
          courtId: match.court_id,
          bookingId: match.id,
          sport: court.sport
        })
        playChime()
        toast.success('¡Reserva localizada con éxito!')
      } else {
        setCheckedBooking(null)
        toast.error('No se encontró ninguna reserva agendada para hoy con esos datos.', {
          description: 'Verificá el número de celular o acercate a la administración.'
        })
      }
    } finally {
      setSearchingCheckin(false)
    }
  }

  const handleConfirmEntry = async () => {
    if (!checkedBooking) return
    playChime()
    
    // Marcar localmente y encender luces de la cancha
    setCheckedBooking(prev => prev ? { ...prev, checkedIn: true } : null)
    if (checkedBooking.courtId) {
      setCourts(prev => prev.map(c => 
        c.id === checkedBooking.courtId 
          ? { ...c, lightingOn: true, status: 'PLAYING', currentPlayers: checkedBooking.customerName } 
          : c
      ))
    }

    // Actualizar estado en Supabase si es una reserva real
    if (checkedBooking.bookingId) {
      const supabase = createClient()
      await supabase
        .from('bookings')
        .update({ status: 'IN_PROGRESS' })
        .eq('id', checkedBooking.bookingId)
    }

    toast.success(`¡Ingreso confirmado! Las luces de ${checkedBooking.courtName} han sido encendidas.`)
  }

  // Manejo de Carrito de Kiosco
  const addToCart = (productId: string) => {
    setCart(prev => ({
      ...prev,
      [productId]: (prev[productId] || 0) + 1
    }))
  }

  const removeFromCart = (productId: string) => {
    setCart(prev => {
      const next = { ...prev }
      if (next[productId] > 1) {
        next[productId] -= 1
      } else {
        delete next[productId]
      }
      return next
    })
  }

  const cartTotal = useMemo(() => {
    return Object.entries(cart).reduce((sum, [pId, qty]) => {
      const product = kioskProducts.find(p => p.id === pId)
      return sum + (product ? product.price * qty : 0)
    }, 0)
  }, [cart, kioskProducts])

  const cartCount = useMemo(() => {
    return Object.values(cart).reduce((sum, qty) => sum + qty, 0)
  }, [cart])

  const handleConfirmOrder = async () => {
    if (cartCount === 0 || !activeTenantId) return
    setSubmittingOrder(true)
    try {
      playChime()
      const orderItems = Object.entries(cart).map(([pId, qty]) => {
        const prod = kioskProducts.find(p => p.id === pId)!
        return {
          product_id: pId,
          name: prod.name,
          quantity: qty,
          unit_price: prod.price,
          subtotal: prod.price * qty
        }
      })

      const courtNameLabel = targetCourtForOrder === 'counter' 
        ? 'Venta Mostrador' 
        : targetCourtForOrder

      const res = await createCourtOrder({
        tenant_id: activeTenantId,
        court_name: courtNameLabel,
        customer_name: 'Cliente Tótem Autoservicio',
        items: orderItems,
        total_ars: cartTotal,
        payment_method: 'CASH',
        payment_status: 'PENDING'
      })

      if (res.success) {
        setOrderConfirmed(true)
        toast.success(`¡Pedido enviado a cantina y cargado a ${courtNameLabel}!`)
        
        // Notificar en tiempo real a la pantalla del mostrador
        try {
          const bc = new BroadcastChannel('canchar_cantina_orders')
          bc.postMessage({ type: 'NEW_ORDER', order: res.order })
          bc.close()
        } catch {}

        setTimeout(() => {
          setCart({})
          setOrderConfirmed(false)
        }, 4000)
      } else {
        toast.error('Error al registrar pedido: ' + (res.error || 'intente nuevamente'))
      }
    } catch {
      toast.error('Error de conexión al cargar comanda')
    } finally {
      setSubmittingOrder(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none overflow-x-hidden font-sans">
      {/* Barra Superior del Tótem Mostrador */}
      <header className="h-20 px-6 sm:px-10 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-xl flex items-center justify-between shrink-0 sticky top-0 z-30 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-950/60 text-2xl">
            {getSportEmoji(clubSport)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight leading-none">
                {clubName}
              </h1>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] font-extrabold uppercase px-2 py-0.5">
                Tótem Autoservicio
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-1 capitalize flex items-center gap-2">
              <span>{currentDate}</span>
              <span>•</span>
              <span className="text-emerald-400 font-bold">Mostrador Activo</span>
            </p>
          </div>
        </div>

        {/* Reloj Grande en Vivo y Controles de Pantalla */}
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <span className="font-mono text-2xl font-black text-white tracking-widest block leading-none">
              {currentTime || '00:00:00'}
            </span>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Hora Local (Argentina)
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={toggleFullscreen}
            className="h-10 px-3 rounded-xl border-slate-700 bg-slate-800/60 hover:bg-slate-700 text-slate-200 gap-1.5 hidden md:flex"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="text-xs font-bold">{isFullscreen ? 'Salir' : 'Pantalla Completa'}</span>
          </Button>

          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-10 px-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-xs gap-1"
          >
            <Link href="/dashboard">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Panel Admin</span>
            </Link>
          </Button>
        </div>
      </header>

      {/* Selector de Modos / Pestañas de Autoservicio */}
      <div className="px-6 sm:px-10 py-4 bg-slate-900/40 border-b border-slate-800/60 flex items-center justify-between gap-2 overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('CHECKIN')}
            className={`h-12 px-5 rounded-2xl font-extrabold text-sm flex items-center gap-2.5 transition-all cursor-pointer ${
              activeTab === 'CHECKIN'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/60 scale-102 ring-2 ring-emerald-400/40'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <UserCheck className="w-5 h-5" />
            <span>Auto Check-in Rápido</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('COURTS')}
            className={`h-12 px-5 rounded-2xl font-extrabold text-sm flex items-center gap-2.5 transition-all cursor-pointer ${
              activeTab === 'COURTS'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/60 scale-102 ring-2 ring-emerald-400/40'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-5 h-5" />
            <span>Tablero de Canchas en Vivo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('BAR')}
            className={`h-12 px-5 rounded-2xl font-extrabold text-sm flex items-center gap-2.5 transition-all cursor-pointer ${
              activeTab === 'BAR'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/60 scale-102 ring-2 ring-emerald-400/40'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Coffee className="w-5 h-5" />
            <span>Kiosco & Bebidas Express</span>
            {cartCount > 0 && (
              <Badge className="bg-amber-500 text-slate-950 font-black text-xs px-2 py-0">
                {cartCount}
              </Badge>
            )}
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Terminal táctil protegida</span>
        </div>
      </div>

      {/* Contenido Principal según Pestaña */}
      <main className="flex-1 p-6 sm:p-10 max-w-7xl w-full mx-auto flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-400" />
            <p className="text-sm font-semibold">Sincronizando información de {clubName}...</p>
          </div>
        ) : (
          <>
            {/* PESTAÑA 1: AUTO CHECK-IN RÁPIDO */}
            {activeTab === 'CHECKIN' && (
              <div className="max-w-3xl w-full mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    ¡Bienvenido a {clubName}! Hacé tu Check-in
                  </h2>
                  <p className="text-sm text-slate-400 max-w-md mx-auto">
                    Ingresá tu número de celular, apellido o código de turno para confirmar ingreso y encender tu cancha.
                  </p>
                </div>

                {/* Input de Búsqueda Táctil */}
                <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <Search className="w-6 h-6 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Ej. Celular, Apellido o Código"
                        value={searchCode}
                        onChange={(e) => setSearchCode(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearchCheckIn()}
                        className="w-full h-14 pl-13 pr-4 rounded-2xl bg-slate-950 border border-slate-800 text-lg font-bold text-white focus:border-emerald-500 focus:outline-none placeholder:text-slate-500 font-mono tracking-wide"
                      />
                    </div>
                    <Button
                      type="button"
                      disabled={searchingCheckin}
                      onClick={() => handleSearchCheckIn()}
                      className="h-14 px-8 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-base shadow-lg shadow-emerald-950/60 cursor-pointer"
                    >
                      {searchingCheckin ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Buscar'}
                    </Button>
                  </div>
                </div>

                {/* Resultado de la Reserva Localizada */}
                {checkedBooking && (
                  <div className="p-6 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-emerald-500/40 shadow-2xl space-y-6 animate-in slide-in-from-bottom-3 duration-200">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-black text-3xl">
                          {getSportEmoji(checkedBooking.sport || clubSport)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-emerald-500 text-slate-950 font-black text-xs px-2 py-0.5">
                              TURNO ENCONTRADO
                            </Badge>
                            <span className="text-xs text-slate-400 font-mono">
                              {checkedBooking.sport ? checkedBooking.sport.toUpperCase() : 'CANCHA'}
                            </span>
                          </div>
                          <h3 className="text-2xl font-black text-white mt-1">
                            ¡Hola, {checkedBooking.customerName}!
                          </h3>
                          <p className="text-sm font-bold text-emerald-400 mt-0.5">
                            {checkedBooking.courtName} • {checkedBooking.time}
                          </p>
                        </div>
                      </div>

                      {checkedBooking.checkedIn ? (
                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/50 text-xs font-black px-3 py-1 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Ingreso Registrado</span>
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400 px-3 py-1 font-bold">
                          Listo para Ingresar
                        </Badge>
                      )}
                    </div>

                    {/* Desglose de Estado Financiero */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-sm">
                      <div className="flex justify-between items-center p-2 rounded-xl bg-slate-900/50">
                        <span className="text-slate-400">Seña online abonada:</span>
                        <span className="text-emerald-400 font-mono font-bold">{formatARS(checkedBooking.paidDeposit)}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 rounded-xl bg-slate-900/50">
                        <span className="text-slate-400">Saldo a abonar en caja:</span>
                        <span className={`font-mono font-bold ${checkedBooking.pendingBalance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {checkedBooking.pendingBalance > 0 ? formatARS(checkedBooking.pendingBalance) : '¡100% Pagado!'}
                        </span>
                      </div>
                    </div>

                    {/* Acción de Entrada y Luces */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span>La iluminación de {checkedBooking.courtName} se activará al confirmar.</span>
                      </div>

                      {checkedBooking.checkedIn ? (
                        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm bg-emerald-950/60 px-5 py-3 rounded-2xl border border-emerald-500/30">
                          <Check className="w-5 h-5 text-emerald-400" />
                          <span>¡Tu cancha está encendida! Podés ingresar a jugar.</span>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="lg"
                          onClick={handleConfirmEntry}
                          className="w-full sm:w-auto h-14 px-8 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold text-base shadow-xl shadow-emerald-950/80 gap-2 active:scale-95 transition-transform cursor-pointer"
                        >
                          <Volume2 className="w-5 h-5" />
                          <span>¡Confirmar Ingreso a Cancha!</span>
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PESTAÑA 2: TABLERO DE CANCHAS EN VIVO */}
            {activeTab === 'COURTS' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-white">
                      Estado de Canchas en Vivo • {clubName}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400">
                      Monitoreo en tiempo real de turnos, jugadores e iluminación automática
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold text-emerald-400">Sincronización activa</span>
                  </div>
                </div>

                {courts.length === 0 ? (
                  <div className="p-12 text-center rounded-3xl bg-slate-900 border border-slate-800 text-slate-400">
                    <p className="text-base font-bold text-white">No hay canchas configuradas todavía en este club.</p>
                    <p className="text-xs mt-1">Podés crearlas desde el menú de Administración &gt; Canchas.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {courts.map((court, index) => (
                      <div
                        key={court.id}
                        className={`p-5 rounded-3xl border transition-all flex flex-col justify-between ${
                          court.status === 'PLAYING'
                            ? 'bg-slate-900/90 border-emerald-500/40 ring-1 ring-emerald-500/20 shadow-lg'
                            : court.status === 'NEXT_UP'
                            ? 'bg-slate-900/80 border-amber-500/40 ring-1 ring-amber-500/20'
                            : 'bg-slate-900/50 border-slate-800'
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Badge className="bg-slate-800 text-slate-300 text-[10px] uppercase font-black flex items-center gap-1">
                                  <span>{getSportEmoji(court.sport)}</span>
                                  <span>{court.sport}</span>
                                </Badge>
                                <span className="text-xs font-bold text-slate-400">Pista #{index + 1}</span>
                                {court.surface && (
                                  <Badge variant="outline" className="text-[10px] border-slate-800 text-slate-400">
                                    {court.surface}
                                  </Badge>
                                )}
                              </div>
                              <h3 className="text-lg font-black text-white">{court.name}</h3>
                            </div>

                            {court.status === 'PLAYING' ? (
                              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs font-black px-2.5 py-1 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                                <span>EN JUEGO</span>
                              </Badge>
                            ) : court.status === 'NEXT_UP' ? (
                              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs font-black px-2.5 py-1">
                                PRÓXIMO TURNO
                              </Badge>
                            ) : (
                              <Badge className="bg-slate-800 text-slate-400 text-xs font-bold px-2.5 py-1">
                                DISPONIBLE
                              </Badge>
                            )}
                          </div>

                          {court.currentPlayers && (
                            <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80">
                              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                                Jugadores en cancha:
                              </span>
                              <p className="text-xs font-bold text-white mt-0.5">{court.currentPlayers}</p>
                            </div>
                          )}
                        </div>

                        <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${court.lightingOn ? 'bg-amber-400 shadow-md shadow-amber-400/50 animate-pulse' : 'bg-slate-700'}`} />
                            <span className="text-xs text-slate-300 font-semibold">
                              {court.lightingOn ? 'Iluminación Encendida' : 'Luces Apagadas'}
                            </span>
                          </div>

                          {court.minutesRemaining !== undefined && (
                            <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-300">
                              <Clock className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Quedan <strong>{court.minutesRemaining} min</strong></span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* PESTAÑA 3: KIOSCO & CANTINA EXPRESS */}
            {activeTab === 'BAR' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
                {/* Catálogo de Productos */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-white">
                        Cantina & Kiosco Express
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400">
                        Tocá un producto para sumar al pedido de mostrador o cargar a una cancha
                      </p>
                    </div>
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-xs">
                      Autoservicio Rápido
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {kioskProducts.map((product) => {
                      const qtyInCart = cart[product.id] || 0
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => addToCart(product.id)}
                          className={`p-4 rounded-2xl text-left border transition-all flex flex-col justify-between active:scale-95 cursor-pointer relative overflow-hidden ${
                            qtyInCart > 0
                              ? 'bg-emerald-950/30 border-emerald-500/50 shadow-md shadow-emerald-950/40'
                              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <span className="text-3xl">{product.emoji}</span>
                            {qtyInCart > 0 && (
                              <Badge className="bg-emerald-500 text-slate-950 font-black text-xs px-2 py-0">
                                {qtyInCart}x
                              </Badge>
                            )}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-white line-clamp-2 leading-tight">
                              {product.name}
                            </h4>
                            <span className="text-sm font-mono font-black text-emerald-400 mt-1 block">
                              {formatARS(product.price)}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Resumen de Pedido y Destino */}
                <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col justify-between space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5 text-emerald-400" />
                        <h3 className="text-base font-extrabold text-white">Tu Pedido</h3>
                      </div>
                      <Badge className="bg-slate-800 text-slate-300 text-xs font-mono font-bold">
                        {cartCount} ítems
                      </Badge>
                    </div>

                    {/* Destino del Consumo */}
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                        Cargar a:
                      </label>
                      <select
                        value={targetCourtForOrder}
                        onChange={(e) => setTargetCourtForOrder(e.target.value)}
                        className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-white focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="counter">Cobro Directo en Mostrador (Efectivo/MP)</option>
                        {courts.map((court) => (
                          <option key={court.id} value={court.name}>
                            {court.name} {court.currentPlayers ? `(${court.currentPlayers})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Lista de Ítems en Carrito */}
                    <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                      {Object.keys(cart).length === 0 ? (
                        <div className="text-center py-8 text-slate-500 text-xs">
                          Seleccioná productos del catálogo para armar tu pedido
                        </div>
                      ) : (
                        Object.entries(cart).map(([pId, qty]) => {
                          const product = kioskProducts.find(p => p.id === pId)
                          if (!product) return null
                          return (
                            <div
                              key={pId}
                              className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800/80 text-xs"
                            >
                              <div className="flex items-center gap-2 overflow-hidden mr-2">
                                <span>{product.emoji}</span>
                                <span className="font-semibold text-slate-200 truncate">{product.name}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-mono font-bold text-white">{formatARS(product.price * qty)}</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => removeFromCart(pId)}
                                    className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="w-4 text-center font-bold text-xs">{qty}</span>
                                  <button
                                    type="button"
                                    onClick={() => addToCart(pId)}
                                    className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* Total y Botón de Confirmación */}
                  <div className="pt-4 border-t border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-400">Total a Pagar:</span>
                      <span className="text-2xl font-black font-mono text-emerald-400">
                        {formatARS(cartTotal)}
                      </span>
                    </div>

                    {orderConfirmed ? (
                      <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-center space-y-1 animate-in zoom-in-95">
                        <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                        <span className="text-xs font-black text-emerald-300 block">
                          ¡Consumo Registrado con Éxito!
                        </span>
                        <span className="text-[10px] text-slate-400">Retirá tus productos en la barra.</span>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        disabled={cartCount === 0 || submittingOrder}
                        onClick={handleConfirmOrder}
                        className="w-full h-14 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold text-sm shadow-xl shadow-emerald-950/80 gap-2 active:scale-95 transition-transform cursor-pointer"
                      >
                        {submittingOrder ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            <QrCode className="w-5 h-5" />
                            <span>Confirmar y Enviar Pedido</span>
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default function TotemKioskPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-400" />
      </div>
    }>
      <TotemContent />
    </Suspense>
  )
}

