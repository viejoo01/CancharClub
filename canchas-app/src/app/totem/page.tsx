'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
  Trophy, 
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
  Volume2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatARS } from '@/lib/utils'
import { toast } from 'sonner'

interface CourtStatus {
  id: string
  name: string
  sport: 'PADEL' | 'FUTBOL'
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

const KIOSK_PRODUCTS: KioskProduct[] = [
  { id: 'p1', name: 'Gatorade Manzana 500ml', category: 'BEBIDAS', price: 2500, emoji: '⚡' },
  { id: 'p2', name: 'Gatorade Blue Cool 500ml', category: 'BEBIDAS', price: 2500, emoji: '❄️' },
  { id: 'p3', name: 'Agua Mineral Glaciar 500ml', category: 'BEBIDAS', price: 1500, emoji: '💧' },
  { id: 'p4', name: 'Cerveza Corona 330ml', category: 'BEBIDAS', price: 3500, emoji: '🍺' },
  { id: 'p5', name: 'Tubo Bullpadel Premium Pro', category: 'EQUIPAMIENTO', price: 14000, emoji: '🎾' },
  { id: 'p6', name: 'Overgrip Siux Perforado', category: 'EQUIPAMIENTO', price: 2000, emoji: '🏸' },
  { id: 'p7', name: 'Barra Proteica Ena', category: 'SNACKS', price: 1800, emoji: '🍫' },
  { id: 'p8', name: 'Alfajor Havanna 70% Cacao', category: 'SNACKS', price: 2200, emoji: '🍪' }
]

const INITIAL_COURTS: CourtStatus[] = [
  {
    id: 'c1',
    name: 'Cancha 1 (Panorámica)',
    sport: 'PADEL',
    status: 'AVAILABLE',
    lightingOn: false
  },
  {
    id: 'c2',
    name: 'Cancha 2 (Techada)',
    sport: 'PADEL',
    status: 'AVAILABLE',
    lightingOn: false
  },
  {
    id: 'c3',
    name: 'Cancha 3 (Blindex)',
    sport: 'PADEL',
    status: 'AVAILABLE',
    lightingOn: false
  }
]

export default function TotemKioskPage() {
  const [activeTab, setActiveTab] = useState<'CHECKIN' | 'COURTS' | 'BAR'>('CHECKIN')
  const [currentTime, setCurrentTime] = useState('')
  const [currentDate, setCurrentDate] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [courts, setCourts] = useState<CourtStatus[]>(INITIAL_COURTS)

  // Estados de Auto Check-in
  const [searchCode, setSearchCode] = useState('')
  const [checkedBooking, setCheckedBooking] = useState<{
    found: boolean
    customerName: string
    courtName: string
    time: string
    paidDeposit: number
    pendingBalance: number
    checkedIn: boolean
  } | null>(null)

  // Estados de Kiosco / Bar
  const [cart, setCart] = useState<Record<string, number>>({})
  const [targetCourtForOrder, setTargetCourtForOrder] = useState('c1')
  const [orderConfirmed, setOrderConfirmed] = useState(false)

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

  // Sonido de bienvenida / confirmación usando Web Audio API
  const playChime = () => {
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
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }

  // Manejo de búsqueda de Check-in
  const handleSearchCheckIn = (codeOverride?: string) => {
    const code = (codeOverride || searchCode).trim().toUpperCase()
    if (!code) {
      toast.error('Ingresá tu celular o código de reserva')
      return
    }

    if (code.includes('381') || code.includes('SILVA') || code.includes('RES-7321')) {
      setCheckedBooking({
        found: true,
        customerName: 'Matías Silva',
        courtName: 'Cancha 2 (Techada Indoor)',
        time: '19:00 a 20:30 hs',
        paidDeposit: 7000,
        pendingBalance: 7000,
        checkedIn: false
      })
      playChime()
      toast.success('¡Reserva localizada en recepción!')
    } else if (code.includes('GOMEZ') || code.includes('RES-8492')) {
      setCheckedBooking({
        found: true,
        customerName: 'Juan Gómez',
        courtName: 'Cancha 1 (Panorámica)',
        time: '18:30 a 20:00 hs',
        paidDeposit: 14000,
        pendingBalance: 0,
        checkedIn: true
      })
      toast.info('Este turno ya realizó el check-in!')
    } else {
      setCheckedBooking({
        found: true,
        customerName: 'Jugador CancharClub',
        courtName: 'Cancha 1 (Panorámica)',
        time: 'Próximo turno',
        paidDeposit: 7000,
        pendingBalance: 7000,
        checkedIn: false
      })
      playChime()
      toast.success('¡Reserva verificada con éxito!')
    }
  }

  const handleConfirmEntry = () => {
    if (!checkedBooking) return
    playChime()
    setCheckedBooking({
      ...checkedBooking,
      checkedIn: true
    })
    // Encender luces en la cancha
    setCourts(prev => prev.map(c => c.id === 'c2' ? { ...c, lightingOn: true, status: 'PLAYING' } : c))
    toast.success('¡Ingreso confirmado! Las luces de Cancha 2 han sido encendidas.')
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

  const cartTotal = Object.entries(cart).reduce((sum, [pId, qty]) => {
    const product = KIOSK_PRODUCTS.find(p => p.id === pId)
    return sum + (product ? product.price * qty : 0)
  }, 0)

  const cartCount = Object.values(cart).reduce((sum, qty) => sum + qty, 0)

  const handleConfirmOrder = () => {
    if (cartCount === 0) return
    playChime()
    setOrderConfirmed(true)
    toast.success(`Pedido cargado a ${courts.find(c => c.id === targetCourtForOrder)?.name || 'la cancha'}!`)
    setTimeout(() => {
      setCart({})
      setOrderConfirmed(false)
    }, 4000)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none overflow-x-hidden font-sans">
      {/* Barra Superior del Tótem Mostrador */}
      <header className="h-20 px-6 sm:px-10 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-xl flex items-center justify-between shrink-0 sticky top-0 z-30 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-950/60">
            <Trophy className="w-7 h-7 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight leading-none">
                Club Pádel Central
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
            className={`h-12 px-5 rounded-2xl font-extrabold text-sm flex items-center gap-2.5 transition-all ${
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
            className={`h-12 px-5 rounded-2xl font-extrabold text-sm flex items-center gap-2.5 transition-all ${
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
            className={`h-12 px-5 rounded-2xl font-extrabold text-sm flex items-center gap-2.5 transition-all ${
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
        {/* PESTAÑA 1: AUTO CHECK-IN RÁPIDO */}
        {activeTab === 'CHECKIN' && (
          <div className="max-w-3xl w-full mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center space-y-2">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                ¡Bienvenido al Club! Hacé tu Check-in
              </h2>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                Ingresá tu número de celular o código de reserva para ver tu cancha y encender las luces.
              </p>
            </div>

            {/* Input de Búsqueda Táctil */}
            <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="w-6 h-6 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Ej. 3814123456 o Silva"
                    value={searchCode}
                    onChange={(e) => setSearchCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchCheckIn()}
                    className="w-full h-14 pl-13 pr-4 rounded-2xl bg-slate-950 border border-slate-800 text-lg font-bold text-white focus:border-emerald-500 focus:outline-none placeholder:text-slate-500 font-mono tracking-wide"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => handleSearchCheckIn()}
                  className="h-14 px-8 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-base shadow-lg shadow-emerald-950/60"
                >
                  Buscar
                </Button>
              </div>
            </div>

            {/* Resultado de la Reserva Localizada */}
            {checkedBooking && (
              <div className="p-6 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-emerald-500/40 shadow-2xl space-y-6 animate-in slide-in-from-bottom-3 duration-200">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-black text-2xl">
                      🎾
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-500 text-slate-950 font-black text-xs px-2 py-0.5">
                          RESERVA CONFIRMADA
                        </Badge>
                        <span className="text-xs text-slate-400 font-mono">Turno #{searchCode || '7321'}</span>
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
                    <span className="text-slate-400">Seña online acreditada:</span>
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
                    <span>La iluminación de la cancha se activará de forma sincronizada al ingresar.</span>
                  </div>

                  {checkedBooking.checkedIn ? (
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm bg-emerald-950/60 px-5 py-3 rounded-2xl border border-emerald-500/30">
                      <Check className="w-5 h-5 text-emerald-400" />
                      <span>¡Tu cancha está encendida! Podés pasar.</span>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="lg"
                      onClick={handleConfirmEntry}
                      className="w-full sm:w-auto h-14 px-8 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold text-base shadow-xl shadow-emerald-950/80 gap-2 active:scale-95 transition-transform"
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
                  Estado de Canchas en Tiempo Real
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Pantalla de mostrador con monitoreo de turnos, jugadores e iluminación
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-bold text-emerald-400">Sincronización activa</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {courts.map((court) => (
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
                          <Badge className="bg-slate-800 text-slate-300 text-[10px] uppercase font-black">
                            {court.sport}
                          </Badge>
                          <span className="text-xs font-bold text-slate-400">Pista #{court.id.replace('c', '')}</span>
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
                    Cantina & Bebidas Express
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400">
                    Tocá un producto para sumar al pedido de mostrador o cancha
                  </p>
                </div>
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-xs">
                  Autoservicio Rápido
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {KIOSK_PRODUCTS.map((product) => {
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
                    <option value="c1">Cancha 1 (Panorámica) - Juan Gómez</option>
                    <option value="c2">Cancha 2 (Techada) - Matías Silva</option>
                    <option value="c3">Cancha 3 (Blindex Pro)</option>
                    <option value="c4">Cancha Fútbol 5 - Los Cuervos</option>
                    <option value="counter">Cobro Directo en Mostrador (Efectivo/MP)</option>
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
                      const product = KIOSK_PRODUCTS.find(p => p.id === pId)
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
                                className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-4 text-center font-bold text-xs">{qty}</span>
                              <button
                                type="button"
                                onClick={() => addToCart(pId)}
                                className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300"
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
                      ¡Consumo Acreditado al Turno!
                    </span>
                    <span className="text-[10px] text-slate-400">Retirá tus productos en la barra.</span>
                  </div>
                ) : (
                  <Button
                    type="button"
                    disabled={cartCount === 0}
                    onClick={handleConfirmOrder}
                    className="w-full h-14 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold text-sm shadow-xl shadow-emerald-950/80 gap-2 active:scale-95 transition-transform"
                  >
                    <QrCode className="w-5 h-5" />
                    <span>Confirmar y Cargar a la Cancha</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
