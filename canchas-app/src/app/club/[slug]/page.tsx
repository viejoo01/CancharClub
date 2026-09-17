'use client'

import { useState, useMemo, useEffect, use } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { 
  MapPin, 
  Phone, 
  Clock, 
  Calendar as CalendarIcon, 
  ChevronRight, 
  Sparkles,
  ShieldCheck,
  Trophy,
  Zap,
  AlertCircle,
  ArrowLeft,
  Star,
  Coffee,
  Car,
  Bell
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatARS } from '@/lib/utils'
import { WaitlistModal } from '@/components/public/waitlist-modal'
import { PlayerBookingsModal } from '@/components/public/player-bookings-modal'
import { 
  getClubBySlug, 
  generateClubSlots, 
  type SportCategory,
  type GeneratedSlot,
  type ClubData
} from '@/config/clubs-catalog'
import { getClubPublicData } from '@/actions/club.actions'

// Generador dinámico de los próximos 14 días para el carousel táctil móvil
function getNextDays(count = 14) {
  const days = []
  const today = new Date()
  const daysOfWeek = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

  for (let i = 0; i < count; i++) {
    const d = new Date()
    d.setDate(today.getDate() + i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const isoDate = `${yyyy}-${mm}-${dd}`
    
    let label = daysOfWeek[d.getDay()]
    if (i === 0) label = 'Hoy'
    else if (i === 1) label = 'Mañ'

    days.push({
      isoDate,
      dayName: label,
      dayNumber: d.getDate(),
      monthName: months[d.getMonth()],
      isWeekend: d.getDay() === 0 || d.getDay() === 6
    })
  }
  return days
}

export default function ClubPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const searchParams = useSearchParams()

  // Buscar datos del club: inicial sincronizado + carga reactiva desde Supabase
  const initialClub = useMemo(() => getClubBySlug(slug), [slug])
  const [club, setClub] = useState<ClubData>(initialClub)

  useEffect(() => {
    let active = true
    getClubPublicData(slug)
      .then((data) => {
        if (active && data) {
          setClub(data)
        }
      })
      .catch((err) => console.error('[ClubPublicPage] getClubPublicData error:', err))
    return () => {
      active = false
    }
  }, [slug])

  // Identificar deporte preseleccionado por query param (ej: ?sport=FUTBOL) o por defecto el primer deporte del club
  const urlSport = searchParams.get('sport')?.toUpperCase() as SportCategory | null

  const [userSelectedSport, setUserSelectedSport] = useState<SportCategory | null>(null)

  // Deporte activo: si el usuario lo cambió manualmente lo usamos, de lo contrario usamos el del query param o el principal del club
  const selectedSport: SportCategory = useMemo(() => {
    if (userSelectedSport && club.sports.includes(userSelectedSport)) {
      return userSelectedSport
    }
    if (urlSport && club.sports.includes(urlSport)) {
      return urlSport
    }
    return club.sports[0] || 'PADEL'
  }, [userSelectedSport, club.sports, urlSport])

  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  )
  const [timeFilter, setTimeFilter] = useState<'ALL' | 'TARDE' | 'NOCHE'>('ALL')
  const [selectedCourtFilter, setSelectedCourtFilter] = useState<string>('ALL')

  const availableDays = useMemo(() => getNextDays(14), [])

  const [subscriptionStatus] = useState<string>(() => {
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split('; ')
      const statusCookie = cookies.find(c => c.startsWith('demo_subscription_status='))
      if (statusCookie) {
        return statusCookie.split('=')[1]
      }
    }
    return 'ACTIVE'
  })

  const [waitlistSlot, setWaitlistSlot] = useState<{
    courtId: string
    courtName: string
    time: string
    sport: string
  } | null>(null)
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false)
  const [isReservasModalOpen, setIsReservasModalOpen] = useState(false)

  const isPublicPaused = subscriptionStatus === 'PARTIALLY_SUSPENDED' || subscriptionStatus === 'LOCKED'

  // Generar turnos dinámicos del club para el deporte seleccionado
  const slots: GeneratedSlot[] = useMemo(() => {
    return generateClubSlots(club, selectedSport)
  }, [club, selectedSport])

  // Filtros combinados de horario y canchas
  const filteredSlots = useMemo(() => {
    return slots.filter(slot => {
      if (selectedCourtFilter !== 'ALL' && slot.courtId !== selectedCourtFilter) return false
      
      const hour = parseInt(slot.time.split(':')[0], 10)
      if (timeFilter === 'TARDE' && (hour < 14 || hour >= 19)) return false
      if (timeFilter === 'NOCHE' && hour < 19) return false

      return true
    })
  }, [slots, selectedCourtFilter, timeFilter])

  const availableCount = filteredSlots.filter(s => s.isAvailable).length

  // Obtener lista única de canchas del club para el deporte actual
  const courtsList = useMemo(() => {
    return club.courts.filter(c => c.sport === selectedSport)
  }, [club.courts, selectedSport])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center">
      {/* Contenedor Mobile First optimizado para Smartphones (max-w-md / max-w-lg) */}
      <div className="w-full max-w-lg flex-1 flex flex-col pb-16 border-x border-slate-900 bg-slate-950">
        
        {/* Barra Superior Flotante Mobile */}
        <header className="sticky top-0 z-30 px-4 py-3 flex items-center justify-between border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-md">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Inicio</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsReservasModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 text-xs font-semibold text-slate-200 transition-colors shadow-xs"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span>Mis reservas</span>
            </button>
          </div>
        </header>

        {/* Hero Card del Club con Detalles Visuales y Datos Reales */}
        <div className="relative p-5 bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border-b border-slate-800">
          <div className="flex items-start gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-950/50 shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Trophy className="w-7 h-7 text-emerald-400" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-white tracking-tight truncate">
                  {club.name}
                </h1>
                <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] px-1.5 py-0 shrink-0">
                  ✓ Verificado
                </Badge>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">{club.address}, {club.city}</span>
              </div>

              {/* Rating y contacto rápido */}
              <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-800/80 text-xs">
                <div className="flex items-center gap-1 text-amber-400 font-bold">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>{club.rating}</span>
                  <span className="text-slate-400 font-normal text-[11px]">({club.reviewsCount} opiniones)</span>
                </div>

                <a
                  href={`https://wa.me/${club.whatsappPhone}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-bold text-xs"
                >
                  <Phone className="w-3 h-3" />
                  <span>WhatsApp Club</span>
                </a>
              </div>
            </div>
          </div>

          {/* Chips de Características del Club */}
          <div className="flex items-center gap-1.5 mt-3.5 overflow-x-auto no-scrollbar pb-0.5">
            {club.hasLighting && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 shrink-0">
                <Zap className="w-3 h-3 text-amber-400" /> Iluminación LED
              </span>
            )}
            {club.hasCantina && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 shrink-0">
                <Coffee className="w-3 h-3 text-emerald-400" /> Cantina / Bar
              </span>
            )}
            {club.hasParking && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 shrink-0">
                <Car className="w-3 h-3 text-blue-400" /> Estacionamiento
              </span>
            )}
            {club.isIndoor && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 shrink-0">
                <Sparkles className="w-3 h-3 text-teal-400" /> Canchas Techadas
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 shrink-0">
              <Clock className="w-3 h-3 text-slate-400" /> {club.openHours}
            </span>
          </div>
        </div>

        {/* ────────────────────────────────────────────────────────── */}
        {/* PASO 1: SELECCIONAR DEPORTE                               */}
        {/* ────────────────────────────────────────────────────────── */}
        <section className="px-4 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              1. Elegí tu Deporte en {club.name}
            </span>
          </div>

          <div className={`grid gap-2 ${
            club.sports.length === 1 ? 'grid-cols-1' :
            club.sports.length === 2 ? 'grid-cols-2' :
            'grid-cols-3'
          }`}>
            {club.sports.map((sp) => {
              const isSelected = selectedSport === sp
              const sportName = sp === 'FUTBOL' ? 'Fútbol' : sp === 'PADEL' ? 'Pádel' : sp === 'TENIS' ? 'Tenis' : 'Básquet'
              const sportIcon = sp === 'FUTBOL' ? '⚽' : sp === 'PADEL' ? '🎾' : sp === 'TENIS' ? '🎾' : '🏀'
              const countForSport = club.courts.filter(c => c.sport === sp).length

              return (
                <button
                  key={sp}
                  onClick={() => {
                    setUserSelectedSport(sp)
                    setSelectedCourtFilter('ALL')
                  }}
                  className={`py-3 px-2 rounded-2xl text-xs font-bold transition-all flex flex-col items-center gap-1 border active:scale-95 cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-b from-emerald-500/20 to-emerald-500/10 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/40'
                      : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="text-xl leading-none">{sportIcon}</span>
                  <span className="font-extrabold text-[13px]">{sportName}</span>
                  <span className="text-[10px] font-normal text-slate-400">
                    {countForSport} {countForSport === 1 ? 'Cancha' : 'Canchas'}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* ────────────────────────────────────────────────────────── */}
        {/* PASO 2: SELECTOR DE FECHAS ESTILO APP (CAROUSEL TÁCTIL)    */}
        {/* ────────────────────────────────────────────────────────── */}
        <section className="px-4 pt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              2. Seleccioná el Día
            </span>
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              {availableCount} turnos libres
            </span>
          </div>

          {/* Carousel Táctil de Días */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar touch-momentum pb-1">
            {availableDays.map((day) => {
              const isSelected = selectedDate === day.isoDate
              return (
                <button
                  key={day.isoDate}
                  onClick={() => setSelectedDate(day.isoDate)}
                  className={`flex flex-col items-center justify-center min-w-[62px] h-[74px] rounded-2xl border transition-all active:scale-95 shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-b from-emerald-500 to-teal-600 border-emerald-400 text-white shadow-lg shadow-emerald-950/50'
                      : 'bg-slate-900/80 border-slate-800/90 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
                    isSelected ? 'text-emerald-100' : 'text-slate-400'
                  }`}>
                    {day.dayName}
                  </span>
                  <span className="text-lg font-black leading-tight my-0.5">
                    {day.dayNumber}
                  </span>
                  <span className={`text-[10px] font-semibold ${
                    isSelected ? 'text-emerald-100' : 'text-slate-400'
                  }`}>
                    {day.monthName}
                  </span>
                </button>
              )
            })}

            {/* Input nativo de fecha para elegir cualquier día */}
            <div className="relative min-w-[50px] h-[74px] shrink-0">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                title="Elegir otra fecha"
              />
              <div className="w-full h-full rounded-2xl border border-slate-800 bg-slate-900/60 flex flex-col items-center justify-center text-slate-400 hover:text-white">
                <CalendarIcon className="w-5 h-5" />
                <span className="text-[9px] mt-1 font-semibold">Más</span>
              </div>
            </div>
          </div>
        </section>

        {/* ────────────────────────────────────────────────────────── */}
        {/* FILTROS RÁPIDOS: HORARIOS Y CANCHAS                        */}
        {/* ────────────────────────────────────────────────────────── */}
        <section className="px-4 pt-4">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => setTimeFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-colors ${
                timeFilter === 'ALL'
                  ? 'bg-slate-200 text-slate-950'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos los horarios
            </button>
            <button
              onClick={() => setTimeFilter('TARDE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-colors ${
                timeFilter === 'TARDE'
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Tarde (14 a 19 hs)
            </button>
            <button
              onClick={() => setTimeFilter('NOCHE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-colors ${
                timeFilter === 'NOCHE'
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Noche (19 a 00 hs)
            </button>
          </div>

          {/* Filtro por Cancha si hay más de una */}
          {courtsList.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar mt-2 pb-0.5">
              <span className="text-[10px] text-slate-400 font-semibold mr-0.5 shrink-0">Cancha:</span>
              <button
                onClick={() => setSelectedCourtFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 transition-colors ${
                  selectedCourtFilter === 'ALL'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'bg-slate-950 border border-slate-800 text-slate-400'
                }`}
              >
                Todas
              </button>
              {courtsList.map((court) => (
                <button
                  key={court.id}
                  onClick={() => setSelectedCourtFilter(court.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 transition-colors ${
                    selectedCourtFilter === court.id
                      ? 'bg-emerald-500/20 border border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border border-slate-800 text-slate-400'
                  }`}
                >
                  {court.name}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ────────────────────────────────────────────────────────── */}
        {/* PASO 3: LISTADO DE TURNOS DISPONIBLES                      */}
        {/* ────────────────────────────────────────────────────────── */}
        <section className="px-4 pt-5 flex-1">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              3. Turnos en {club.name}
            </span>
            <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400 bg-emerald-950/30">
              ⚡ Reserva con Seña Online
            </Badge>
          </div>

          {isPublicPaused ? (
            <div className="bg-gradient-to-b from-amber-950/40 to-slate-900 border border-amber-800/60 rounded-3xl p-6 text-center space-y-4 shadow-xl mb-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 mx-auto flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-white text-base">Reservas Online Momentáneamente en Pausa</h3>
                <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                  Las reservas automáticas por la web están pausadas momentáneamente en {club.name}. Podés consultar disponibilidad y reservar tu turno directamente con la recepción del club por WhatsApp.
                </p>
              </div>
              <Button
                asChild
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-5 rounded-2xl shadow-lg shadow-emerald-950/40"
              >
                <a
                  href={`https://wa.me/${club.whatsappPhone}?text=${encodeURIComponent(`¡Hola ${club.name}! Quisiera consultar disponibilidad y reservar una cancha para hoy.`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Consultar Turnos por WhatsApp
                </a>
              </Button>
            </div>
          ) : filteredSlots.length === 0 ? (
            <div className="p-8 text-center bg-slate-900/50 rounded-3xl border border-slate-800 space-y-3">
              <Clock className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-bold text-slate-200">No hay turnos para los filtros seleccionados</div>
              <p className="text-xs text-slate-400">Probá seleccionando otro día o quitando los filtros de horario.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setTimeFilter('ALL')
                  setSelectedCourtFilter('ALL')
                }}
                className="text-xs rounded-xl border-slate-700 text-slate-200"
              >
                Ver todos los turnos
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredSlots.map((slot, index) => (
                <Card
                  key={`${slot.courtId}-${slot.time}-${index}`}
                  className={`border-slate-800 transition-all rounded-2xl ${
                    slot.isAvailable
                      ? 'bg-slate-900/80 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-950/20 active:scale-[0.99]'
                      : 'bg-slate-950/50 opacity-50 border-dashed cursor-not-allowed'
                  }`}
                >
                  <CardContent className="p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Pill de Hora Grande */}
                      <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-black shrink-0 border ${
                        slot.isAvailable
                          ? 'bg-slate-950 border-emerald-500/30 text-slate-100 shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}>
                        <span className="text-[10px] font-bold text-emerald-400 tracking-wider">HS</span>
                        <span className="text-base font-black leading-none">{slot.time}</span>
                      </div>

                      {/* Información de la Cancha y Precios */}
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-100 truncate">
                          {slot.courtName}
                        </div>
                        
                        {/* Features chips */}
                        {slot.features && slot.features.length > 0 && (
                          <div className="flex items-center gap-1 mt-0.5">
                            {slot.features.slice(0, 2).map((feat, fIdx) => (
                              <span key={fIdx} className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800/90 text-slate-300 font-medium">
                                {feat}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="text-xs text-slate-400 mt-1">
                          Total {formatARS(slot.totalPrice)} • <span className="text-emerald-400 font-extrabold">Seña {formatARS(slot.depositPrice)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Botón de Acción Táctil */}
                    <div className="shrink-0">
                      {slot.isAvailable ? (
                        <Link
                          href={`/club/${club.slug}/checkout?tenantId=${club.id}&courtId=${slot.courtId}&courtName=${encodeURIComponent(slot.courtName)}&time=${slot.time}&date=${selectedDate}&total=${slot.totalPrice}&deposit=${slot.depositPrice}&sport=${slot.sport}&club=${encodeURIComponent(club.name)}`}
                        >
                          <Button
                            size="sm"
                            className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md shadow-emerald-950/40 gap-1 active:scale-95 transition-transform"
                          >
                            <span>Reservar</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="secondary" className="text-[10px] bg-slate-800 text-slate-400">
                            Ocupado
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setWaitlistSlot({
                                courtId: slot.courtId,
                                courtName: slot.courtName,
                                time: slot.time,
                                sport: slot.sport,
                              })
                              setIsWaitlistOpen(true)
                            }}
                            className="h-7 px-2 text-[10px] border-amber-500/40 text-amber-400 hover:bg-amber-950/40 hover:text-amber-300 font-medium rounded-lg"
                          >
                            <Bell className="w-2.5 h-2.5 mr-1" />
                            Avisarme
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Footer Seguridad y Confianza */}
        <footer className="px-4 pt-8 text-center text-xs text-slate-400 space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-emerald-400/90 font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>Pago seguro protegido mediante Mercado Pago</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Confirmación automática e inmediata con comprobante digital para WhatsApp de {club.name}.
          </p>
        </footer>

        {/* Modal de Lista de Espera Automática */}
        {waitlistSlot && (
          <WaitlistModal
            isOpen={isWaitlistOpen}
            onClose={() => {
              setIsWaitlistOpen(false)
              setWaitlistSlot(null)
            }}
            tenantId={club.id}
            courtId={waitlistSlot.courtId}
            courtName={waitlistSlot.courtName}
            date={selectedDate}
            timeSlot={waitlistSlot.time}
          />
        )}

        {/* Modal de Consulta de Reservas para Jugadores */}
        <PlayerBookingsModal
          open={isReservasModalOpen}
          onOpenChange={setIsReservasModalOpen}
        />
      </div>
    </div>
  )
}
