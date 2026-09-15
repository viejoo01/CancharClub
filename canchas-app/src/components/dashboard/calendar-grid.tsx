'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Plus, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  CloudRain
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuickBookingModal } from './quick-booking-modal'
import { BookingDetailsModal } from './booking-details-modal'
import { RainProtocolModal } from './rain-protocol-modal'
import { formatARS, formatTime } from '@/lib/utils'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { BookingStatus } from '@/types/database'
import { getVenueCourts, getVenueBookings, type VenueItem } from '@/config/venues-data'

export interface CalendarBooking {
  id: string
  court_id: string
  customer_name: string
  customer_phone?: string | null
  customer_email?: string | null
  booking_range?: string | null
  starts_at: string
  ends_at: string
  status: BookingStatus
  origin: string
  total_amount_ars: number
  deposit_amount_ars: number
  total_paid: number
  balance_due: number
  internal_notes?: string | null
  courts?: { name?: string; sport?: string; slot_duration?: string } | Array<{ name?: string; sport?: string; slot_duration?: string }> | null
  booking_payments?: Array<{ amount_ars: number; payment_method: string; created_at: string }>
}

interface CourtItem {
  id: string
  name: string
  sport: string
  slot_duration: 'MIN_60' | 'MIN_90' | 'MIN_120'
  is_active: boolean
}

interface CalendarGridProps {
  tenantId: string
  courts: CourtItem[]
  initialBookings: CalendarBooking[]
  initialDate?: string
  initialVenueId?: string
  onRefresh?: () => void
}

// Generar franjas de 08:00 a 23:30 (cada 30 min o 60 min)
const TIME_SLOTS = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '17:30', '18:00',
  '18:30', '19:00', '19:30', '20:00', '20:30', '21:00',
  '21:30', '22:00', '22:30', '23:00'
]

export function CalendarGrid({
  tenantId,
  courts,
  initialBookings,
  initialDate = new Date().toISOString().split('T')[0],
  initialVenueId = 'venue-yb',
  onRefresh,
}: CalendarGridProps) {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [selectedSport, setSelectedSport] = useState<string>('ALL')
  const [optimisticBookings, setOptimisticBookings] = useState<CalendarBooking[]>([])

  // Estado de sede seleccionada en caliente para respuesta instantánea (0ms)
  const [overrideVenue, setOverrideVenue] = useState<VenueItem | null>(null)

  // Escuchar cambio inmediato de sede (0ms de latencia) desde VenueSwitcher
  useEffect(() => {
    const handleVenueChange = (e: Event) => {
      const customEvent = e as CustomEvent<VenueItem>
      const venue = customEvent.detail
      if (!venue) return
      setOverrideVenue(venue)
      setSelectedSport('ALL')
    }

    window.addEventListener('canchar:venue-changed', handleVenueChange)
    return () => {
      window.removeEventListener('canchar:venue-changed', handleVenueChange)
    }
  }, [])

  // Canchas y reservas activas derivadas limpiamente
  const activeCourts = useMemo(() => {
    if (overrideVenue) {
      let customVenues: VenueItem[] | undefined
      try {
        const saved = localStorage.getItem('canchar_custom_venues')
        if (saved) customVenues = JSON.parse(saved)
      } catch {}
      return getVenueCourts(overrideVenue.id, customVenues)
    }
    return courts
  }, [overrideVenue, courts])

  const activeBookings = useMemo(() => {
    let base: CalendarBooking[]
    if (overrideVenue) {
      base = getVenueBookings(overrideVenue.id, selectedDate)
    } else if (selectedDate !== initialDate) {
      base = getVenueBookings(initialVenueId, selectedDate)
    } else {
      base = initialBookings
    }

    if (optimisticBookings.length === 0) return base

    const currentDayOptimistic = optimisticBookings.filter(
      (b) => b.starts_at.split('T')[0] === selectedDate
    )
    if (currentDayOptimistic.length === 0) return base

    const map = new Map<string, CalendarBooking>()
    base.forEach((b) => map.set(b.id, b))
    currentDayOptimistic.forEach((b) => map.set(b.id, b))
    return Array.from(map.values())
  }, [overrideVenue, initialBookings, selectedDate, initialDate, initialVenueId, optimisticBookings])

  // Modales
  const [isQuickBookOpen, setIsQuickBookOpen] = useState(false)
  const [isRainModalOpen, setIsRainModalOpen] = useState(false)
  const [quickBookSlot, setQuickBookSlot] = useState<{ courtId: string; time: string } | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<CalendarBooking | null>(null)

  // Sincronización en tiempo real con Supabase Realtime
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`tenant_${tenantId}_bookings`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          toast.info('Grilla sincronizada en tiempo real', {
            description: `Actualización automática de turnos (${payload.eventType}).`
          })
          onRefresh?.()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, onRefresh])

  // Filtro de canchas
  const filteredCourts = useMemo(() => {
    return activeCourts.filter(c => c.is_active && (selectedSport === 'ALL' || c.sport === selectedSport))
  }, [activeCourts, selectedSport])

  // Deportes disponibles
  const sports = useMemo(() => {
    const set = new Set(activeCourts.map(c => c.sport))
    return Array.from(set)
  }, [activeCourts])

  const handlePrevDay = () => {
    const prev = subDays(parseISO(selectedDate), 1)
    setSelectedDate(format(prev, 'yyyy-MM-dd'))
  }

  const handleNextDay = () => {
    const next = addDays(parseISO(selectedDate), 1)
    setSelectedDate(format(next, 'yyyy-MM-dd'))
  }

  const handleToday = () => {
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'))
  }

  // Mapear reservas por courtId y hora de inicio (HH:mm)
  const bookingMap = useMemo(() => {
    const map = new Map<string, CalendarBooking>()
    activeBookings.forEach((b) => {
      if (!b.starts_at) return
      if (b.starts_at.split('T')[0] !== selectedDate) return
      // Extraer hora local HH:mm
      const timePart = formatTime(b.starts_at)
      const key = `${b.court_id}_${timePart}`
      map.set(key, b)
    })
    return map
  }, [activeBookings, selectedDate])

  const formattedDateTitle = useMemo(() => {
    return format(parseISO(selectedDate), "EEEE d 'de' MMMM", { locale: es })
  }, [selectedDate])

  return (
    <div className="flex flex-col h-full space-y-3 sm:space-y-4">
      {/* Barra de Control y Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md">
        {/* Selector de Fecha */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToday} className="text-xs h-9 px-3">
            Hoy
          </Button>
          <div className="flex items-center bg-slate-950 rounded-xl border border-slate-800 p-0.5 sm:p-1">
            <button
              onClick={handlePrevDay}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              aria-label="Día anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-2 sm:px-3 py-1 text-xs sm:text-sm font-semibold text-white capitalize flex items-center gap-1.5 sm:gap-2">
              <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
              <span className="truncate max-w-35 sm:max-w-none">{formattedDateTitle}</span>
            </div>
            <button
              onClick={handleNextDay}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              aria-label="Día siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-9 rounded-xl border border-slate-800 bg-slate-950 px-2.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
          />
        </div>

        {/* Filtros de deporte y acciones */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          {/* Filtros de deporte con scroll horizontal suave */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar max-w-full">
            <button
              onClick={() => setSelectedSport('ALL')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0 ${
                selectedSport === 'ALL'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todas
            </button>
            {sports.map((sp) => (
              <button
                key={sp}
                onClick={() => setSelectedSport(sp)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0 ${
                  selectedSport === sp
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {sp}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Botón de Emergencia Protocolo Lluvia */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRainModalOpen(true)}
              className="text-xs bg-blue-950/40 border-blue-500/40 text-blue-300 hover:bg-blue-900/60 hover:text-white gap-1.5 h-8 px-2.5"
            >
              <CloudRain className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Protocolo</span> Lluvia
            </Button>

            {/* Indicador Realtime */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-[10px] sm:text-[11px] text-emerald-400 font-semibold shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden sm:inline">Sincronización en Vivo</span>
              <span className="sm:hidden">En Vivo</span>
            </div>
          </div>
        </div>
      </div>

      {/* Indicador para móviles de desplazamiento horizontal de canchas */}
      <div className="md:hidden flex items-center justify-between px-2 py-0.5 text-[11px] text-slate-400 select-none">
        <span className="flex items-center gap-1">
          <span>👉</span>
          <span>Deslizá para ver todas las canchas</span>
        </span>
        <span className="text-emerald-400 font-semibold">{filteredCourts.length} canchas</span>
      </div>

      {/* Matriz de Calendario con scroll táctil suave */}
      <div className="flex-1 overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950/80 shadow-2xl custom-scrollbar touch-momentum">
        <div className="min-w-180 sm:min-w-200">
          {/* Header de Canchas (Columnas) */}
          <div className="grid grid-cols-[80px_repeat(auto-fit,minmax(180px,1fr))] border-b border-slate-800 sticky top-0 z-10 bg-slate-950">
            <div className="p-3 text-center text-xs font-bold text-slate-500 border-r border-slate-800 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 mr-1" />
              Hora
            </div>
            {filteredCourts.map((court) => (
              <div
                key={court.id}
                className="p-3 text-center border-r border-slate-800/80 last:border-r-0 bg-slate-900/40"
              >
                <div className="text-sm font-bold text-white tracking-tight">{court.name}</div>
                <div className="text-[11px] text-emerald-400 font-medium">{court.sport}</div>
              </div>
            ))}
          </div>

          {/* Filas de Horarios */}
          <div className="divide-y divide-slate-800/60">
            {TIME_SLOTS.map((time) => (
              <div
                key={time}
                className="grid grid-cols-[80px_repeat(auto-fit,minmax(180px,1fr))] min-h-[64px]"
              >
                {/* Columna Hora */}
                <div className="p-2 text-center text-xs font-semibold text-slate-400 border-r border-slate-800 bg-slate-950/90 flex items-center justify-center">
                  {time}
                </div>

                {/* Celdas por Cancha */}
                {filteredCourts.map((court) => {
                  const bookingKey = `${court.id}_${time}`
                  const booking = bookingMap.get(bookingKey)

                  if (booking) {
                    const isFullyPaid = booking.status === 'FULLY_PAID' || booking.balance_due === 0
                    const isConfirmed = booking.status === 'CONFIRMED' || booking.status === 'DEPOSIT_PAID'
                    const isAbono = Boolean(
                      booking.internal_notes?.includes('ABONO') ||
                      booking.internal_notes?.includes('FIJO')
                    )

                    return (
                      <div
                        key={court.id}
                        onClick={() => setSelectedBooking(booking)}
                        className="p-1.5 border-r border-slate-800/60 last:border-r-0 cursor-pointer group"
                      >
                        <div
                          className={`h-full w-full rounded-xl p-2.5 flex flex-col justify-between transition-all duration-150 border ${
                            isAbono
                              ? 'bg-purple-950/40 border-purple-500/40 hover:border-purple-400 hover:bg-purple-950/60 text-purple-100'
                              : isFullyPaid
                              ? 'bg-emerald-950/40 border-emerald-500/40 hover:border-emerald-400 hover:bg-emerald-950/60 text-emerald-100'
                              : isConfirmed
                              ? 'bg-cyan-950/40 border-cyan-500/40 hover:border-cyan-400 hover:bg-cyan-950/60 text-cyan-100'
                              : 'bg-amber-950/40 border-amber-500/40 hover:border-amber-400 hover:bg-amber-950/60 text-amber-100'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0 flex-1">
                              <span className="font-bold text-xs truncate block">
                                {booking.customer_name}
                              </span>
                              {isAbono && (
                                <span className="inline-block mt-0.5 text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-purple-500/30 text-purple-200 border border-purple-400/40 tracking-wider">
                                  ABONO FIJO
                                </span>
                              )}
                            </div>
                            {isFullyPaid ? (
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : (
                              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            )}
                          </div>

                          <div className="flex items-center justify-between mt-1 text-[11px] opacity-90">
                            <span>{formatARS(booking.total_amount_ars)}</span>
                            {booking.balance_due > 0 ? (
                              <span className="text-amber-400 font-semibold">
                                Resta: {formatARS(booking.balance_due)}
                              </span>
                            ) : (
                              <span className="text-emerald-400 font-semibold">Saldado</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  }

                  // Celda libre
                  return (
                    <div
                      key={court.id}
                      onClick={() => {
                        setQuickBookSlot({ courtId: court.id, time })
                        setIsQuickBookOpen(true)
                      }}
                      className="p-1 border-r border-slate-800/60 last:border-r-0 group cursor-pointer hover:bg-emerald-950/20 transition-colors relative"
                    >
                      <div className="h-full w-full rounded-lg border border-dashed border-transparent group-hover:border-emerald-600/40 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/80 px-2 py-1 rounded-md border border-emerald-500/20">
                          <Plus className="w-3 h-3" />
                          Reservar
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modales */}
      {isQuickBookOpen && (
        <QuickBookingModal
          isOpen={isQuickBookOpen}
          onClose={() => {
            setIsQuickBookOpen(false)
            setQuickBookSlot(null)
          }}
          tenantId={tenantId}
          courts={activeCourts}
          preselectedDate={selectedDate}
          preselectedTime={quickBookSlot?.time || '19:00'}
          preselectedCourtId={quickBookSlot?.courtId}
          onSuccess={() => {
            if (quickBookSlot) {
              const court = activeCourts.find((c) => c.id === quickBookSlot.courtId)
              const startsAt = `${selectedDate}T${quickBookSlot.time}:00`
              const newOptimistic: CalendarBooking = {
                id: `bk-opt-${Date.now()}`,
                court_id: quickBookSlot.courtId,
                customer_name: 'Reserva Confirmada (Mostrador)',
                starts_at: startsAt,
                ends_at: `${selectedDate}T23:59:00`,
                status: 'CONFIRMED',
                origin: 'PHONE',
                total_amount_ars: 12000,
                deposit_amount_ars: 0,
                total_paid: 0,
                balance_due: 12000,
                courts: court ? { name: court.name, sport: court.sport } : undefined,
              }
              setOptimisticBookings((prev) => [...prev, newOptimistic])
            }
            onRefresh?.()
            router.refresh()
          }}
        />
      )}

      {selectedBooking && (
        <BookingDetailsModal
          isOpen={!!selectedBooking}
          onClose={() => setSelectedBooking(null)}
          booking={selectedBooking}
          onSuccess={() => {
            onRefresh?.()
            router.refresh()
          }}
        />
      )}

      {/* Modal de Protocolo Climático (Mejora 1B) */}
      <RainProtocolModal
        isOpen={isRainModalOpen}
        onClose={() => setIsRainModalOpen(false)}
        tenantId={tenantId}
        courts={activeCourts}
        currentDate={selectedDate}
        onSuccess={() => {
          onRefresh?.()
          router.refresh()
        }}
      />
    </div>
  )
}
