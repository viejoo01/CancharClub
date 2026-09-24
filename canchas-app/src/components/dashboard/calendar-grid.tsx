'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
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
import { QuickBookingModal, type QuickBookingPriceRule } from './quick-booking-modal'
import { BookingDetailsModal } from './booking-details-modal'
import { RainProtocolModal } from './rain-protocol-modal'
import { ClubScheduleModal } from './club-schedule-modal'
import { formatARS, formatTime } from '@/lib/utils'
import { generateTimeSlots, DEFAULT_CLUB_SCHEDULE, type ClubScheduleConfig } from '@/lib/time-slots'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { BookingStatus } from '@/types/database'
import { getVenueCourts, type VenueItem } from '@/config/venues-data'
import { getCalendarBookings } from '@/actions/club.actions'

function getBookingLocalDate(startsAtIso?: string | null): string {
  if (!startsAtIso) return ''
  try {
    let s = startsAtIso
    if (s.includes(' ') && !s.includes('T')) s = s.replace(' ', 'T')
    if (s.endsWith('+00')) s = s.replace('+00', 'Z')
    if (!s.includes('Z') && !s.includes('+') && !s.slice(10).includes('-')) {
      return s.split('T')[0]
    }
    const d = new Date(s)
    if (isNaN(d.getTime())) return s.split('T')[0]
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return formatter.format(d)
  } catch {
    return startsAtIso.split('T')[0]
  }
}

function formatTimeArgentina(iso?: string | null): string {
  if (!iso) return ''
  try {
    let s = iso
    if (s.includes(' ') && !s.includes('T')) s = s.replace(' ', 'T')
    if (s.endsWith('+00')) s = s.replace('+00', 'Z')
    if (!s.includes('Z') && !s.includes('+') && !s.slice(10).includes('-')) {
      const parts = s.split('T')
      if (parts[1]) return parts[1].substring(0, 5)
    }
    const d = new Date(s)
    if (isNaN(d.getTime())) return ''
    const formatter = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    return formatter.format(d)
  } catch {
    return formatTime(iso)
  }
}

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
  initialSchedule?: ClubScheduleConfig
  priceRules?: QuickBookingPriceRule[]
  onRefresh?: () => void
}

export function CalendarGrid({
  tenantId,
  courts,
  initialBookings,
  initialDate = new Date().toISOString().split('T')[0],
  initialSchedule,
  priceRules,
  onRefresh,
}: CalendarGridProps) {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [selectedSport, setSelectedSport] = useState<string>('ALL')
  const [optimisticBookings, setOptimisticBookings] = useState<CalendarBooking[]>([])
  const [schedule, setSchedule] = useState<ClubScheduleConfig>(
    initialSchedule || DEFAULT_CLUB_SCHEDULE
  )
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)

  // Sincronizar si cambia el horario inicial desde el servidor
  useEffect(() => {
    if (initialSchedule) {
      setSchedule(initialSchedule)
    }
  }, [initialSchedule])

  // Generar franjas horarias estrictamente según apertura y cierre del club (08:00 no aparece si abre 10:00)
  const timeSlots = useMemo(() => {
    return generateTimeSlots(schedule.opening_time, schedule.closing_time, 30)
  }, [schedule])

  // Referencia al contenedor con scroll de la matriz de horarios
  const gridContainerRef = useRef<HTMLDivElement>(null)

  // Desplazar suavemente a un horario específico
  const scrollToTimeSlot = useCallback((targetTime: string) => {
    if (!gridContainerRef.current) return
    const container = gridContainerRef.current
    const rowEl = container.querySelector(`[data-time="${targetTime}"]`) as HTMLElement | null
    if (rowEl) {
      const topOffset = rowEl.offsetTop - 50
      container.scrollTo({ top: Math.max(0, topOffset), behavior: 'smooth' })
    }
  }, [])

  // Desplazar al horario actual (ahora)
  const scrollToNow = useCallback(() => {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = now.getMinutes() < 30 ? '00' : '30'
    const currentTimeStr = `${hh}:${mm}`
    const matchingSlot = timeSlots.find((t) => t >= currentTimeStr) || timeSlots[0]
    if (matchingSlot) {
      scrollToTimeSlot(matchingSlot)
      toast.info(`Desplazado a las ${matchingSlot} hs`, { duration: 1800 })
    }
  }, [timeSlots, scrollToTimeSlot])

  // Auto-desplazamiento suave al horario actual en el primer render si la fecha es hoy
  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    if (selectedDate === todayStr && timeSlots.length > 0) {
      const timer = setTimeout(() => {
        const now = new Date()
        const hh = String(now.getHours()).padStart(2, '0')
        const mm = now.getMinutes() < 30 ? '00' : '30'
        const currentSlot = `${hh}:${mm}`
        const target = timeSlots.find((t) => t >= currentSlot)
        if (target && gridContainerRef.current) {
          const rowEl = gridContainerRef.current.querySelector(`[data-time="${target}"]`) as HTMLElement | null
          if (rowEl) {
            gridContainerRef.current.scrollTo({
              top: Math.max(0, rowEl.offsetTop - 50),
              behavior: 'smooth',
            })
          }
        }
      }, 350)
      return () => clearTimeout(timer)
    }
  }, [selectedDate, timeSlots])

  // Manejador del evento wheel del mouse (siempre fluido y natural)
  const handleGridWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!gridContainerRef.current) return

    // Shift + rueda: desplazamiento horizontal suave entre canchas
    if (e.shiftKey) {
      gridContainerRef.current.scrollLeft += (e.deltaY || e.deltaX)
      return
    }

    const container = gridContainerRef.current
    const isAtTop = container.scrollTop <= 0 && e.deltaY < 0
    const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 4 && e.deltaY > 0

    // Si llega a los extremos superior o inferior, fluir el scroll hacia el contenedor principal (main)
    if (isAtTop || isAtBottom) {
      const mainEl = container.closest('main')
      if (mainEl) {
        mainEl.scrollTop += e.deltaY
      }
    }
  }, [])

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
    if (courts && courts.length > 0) {
      return courts
    }
    if (overrideVenue && overrideVenue.id !== 'venue-main' && overrideVenue.id !== 'venue-yb') {
      let customVenues: VenueItem[] | undefined
      try {
        const saved = localStorage.getItem('canchar_custom_venues')
        if (saved) customVenues = JSON.parse(saved)
      } catch {}
      const res = getVenueCourts(overrideVenue.id, customVenues)
      if (res && res.length > 0) return res
    }
    return courts || []
  }, [overrideVenue, courts])

  const [loadedBookings, setLoadedBookings] = useState<CalendarBooking[]>(initialBookings || [])

  // Sincronizar si cambia initialBookings desde el servidor
  useEffect(() => {
    if (initialBookings) {
      setLoadedBookings(initialBookings)
    }
  }, [initialBookings])

  // Cargar turnos reales de la base de datos para la fecha seleccionada
  const fetchBookingsForDate = useCallback(async (dateToFetch: string) => {
    if (!tenantId) return
    try {
      const fresh = await getCalendarBookings(tenantId, dateToFetch)
      if (Array.isArray(fresh)) {
        setLoadedBookings(fresh as CalendarBooking[])
        setOptimisticBookings([])
      }
    } catch (err) {
      console.error('[CalendarGrid] Error fetching bookings:', err)
    }
  }, [tenantId])

  // Cargar turnos al cambiar de fecha y mantener consultas continuas a la base de datos cada 5 segundos
  useEffect(() => {
    if (!selectedDate || !tenantId) return

    fetchBookingsForDate(selectedDate)

    const syncBookings = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      fetchBookingsForDate(selectedDate)
    }

    const interval = setInterval(syncBookings, 5000)
    window.addEventListener('focus', syncBookings)
    document.addEventListener('visibilitychange', syncBookings)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', syncBookings)
      document.removeEventListener('visibilitychange', syncBookings)
    }
  }, [selectedDate, tenantId, fetchBookingsForDate])

  const activeBookings = useMemo(() => {
    const base: CalendarBooking[] = loadedBookings || []

    if (optimisticBookings.length === 0) return base

    const currentDayOptimistic = optimisticBookings.filter((b) => {
      const bDate = getBookingLocalDate(b.starts_at)
      return bDate === selectedDate
    })
    if (currentDayOptimistic.length === 0) return base

    const map = new Map<string, CalendarBooking>()
    base.forEach((b) => map.set(b.id, b))
    currentDayOptimistic.forEach((b) => map.set(b.id, b))
    return Array.from(map.values())
  }, [loadedBookings, selectedDate, optimisticBookings])

  // Modales
  const [isQuickBookOpen, setIsQuickBookOpen] = useState(false)
  const [isRainModalOpen, setIsRainModalOpen] = useState(false)
  const [quickBookSlot, setQuickBookSlot] = useState<{ courtId: string; time: string } | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<CalendarBooking | null>(null)

  // Sincronización continua y automática con la Base de Datos (Realtime WebSockets + Heartbeat 4s + Focus Sync)
  useEffect(() => {
    if (!tenantId) return

    let isMounted = true

    // Sincronización silenciosa en segundo plano (sin parpadeo ni loaders que interrumpan al usuario)
    const silentSync = async () => {
      try {
        const fresh = await getCalendarBookings(tenantId, selectedDate)
        if (!isMounted || !Array.isArray(fresh)) return

        setLoadedBookings((prev) => {
          const prevSig = prev.map(b => `${b.id}:${b.status}:${b.total_paid}:${b.balance_due}`).sort().join('|')
          const freshSig = (fresh as CalendarBooking[]).map(b => `${b.id}:${b.status}:${b.total_paid}:${b.balance_due}`).sort().join('|')

          if (prevSig !== freshSig) {
            // Notificaciones en vivo de altas y bajas de turnos
            if (fresh.length > prev.length) {
              const newB = (fresh as CalendarBooking[]).find(f => !prev.some(p => p.id === f.id))
              if (newB) {
                toast.success('¡Nueva reserva registrada en el sistema!', {
                  description: `${newB.customer_name} en ${newB.courts && !Array.isArray(newB.courts) ? newB.courts.name : 'Cancha'}`
                })
              }
            } else if (fresh.length < prev.length) {
              toast.info('Se ha cancelado o liberado un turno en la grilla.')
            }
            return fresh as CalendarBooking[]
          }
          return prev
        })
      } catch (err) {
        console.warn('[silentSync] Error al sincronizar:', err)
      }
    }

    // 1. Escucha por BroadcastChannel (sincronización instantánea 0ms entre pestañas / checkout)
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel('canchar_bookings')
      bc.onmessage = (event) => {
        if (event.data?.type === 'BOOKING_CONFIRMED') {
          if (event.data?.booking) {
            toast.success('¡Nuevo turno confirmado y señado!', {
              description: `${event.data.booking.customer_name || 'Jugador'} en ${event.data.booking.courts?.name || 'Cancha'}`
            })
            setOptimisticBookings((prev) => [event.data.booking, ...prev])
          }
          silentSync()
          router.refresh()
          onRefresh?.()
        }
      }
    } catch {}

    // 2. Escucha por canal Postgres en Supabase Realtime (WebSockets)
    const supabase = createClient()
    const channel = supabase
      .channel(`tenant_${tenantId}_realtime_bookings`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
        },
        (payload) => {
          const newRec = payload.new as { tenant_id?: string } | null
          const oldRec = payload.old as { tenant_id?: string } | null
          if ((newRec?.tenant_id && newRec.tenant_id !== tenantId) || (oldRec?.tenant_id && oldRec.tenant_id !== tenantId)) {
            return
          }
          silentSync()
          router.refresh()
          onRefresh?.()
        }
      )
      .subscribe()

    // 3. Heartbeat continuo cada 4 segundos (Garantiza que nunca haga falta pulsar F5)
    const intervalId = setInterval(() => {
      if (!document.hidden) {
        silentSync()
      }
    }, 4000)

    // 4. Sincronización inmediata al volver a la pestaña o ventana del navegador
    const handleFocus = () => {
      silentSync()
    }
    const handleVisibility = () => {
      if (!document.hidden) {
        silentSync()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      isMounted = false
      clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
      supabase.removeChannel(channel)
      bc?.close()
    }
  }, [tenantId, selectedDate, onRefresh, router])

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

  const [hoveredBookingId, setHoveredBookingId] = useState<string | null>(null)

  // Mapear reservas por courtId cubriendo todos los intervalos de 30 minutos (ej. 13:00 y 13:30 para 1 hora exacta)
  const slotBookingMap = useMemo(() => {
    const map = new Map<string, {
      booking: CalendarBooking
      isStart: boolean
      isEnd: boolean
      isMiddle: boolean
      startTime: string
      endTime: string
      slotIndex: number
      totalSlots: number
    }>()

    activeBookings.forEach((b) => {
      const bDate = getBookingLocalDate(b.starts_at)
      if (bDate !== selectedDate) return

      const startTime = formatTimeArgentina(b.starts_at)
      let endTime = b.ends_at ? formatTimeArgentina(b.ends_at) : ''

      if (!endTime || endTime === startTime) {
        const courtDuration = Array.isArray(b.courts) ? b.courts[0]?.slot_duration : b.courts?.slot_duration
        const durationMins = courtDuration === 'MIN_90' ? 90 : courtDuration === 'MIN_120' ? 120 : 60
        const [sh, sm] = startTime.split(':').map(Number)
        const totalMins = sh * 60 + sm + durationMins
        const eh = Math.floor(totalMins / 60) % 24
        const em = totalMins % 60
        endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
      }

      // Calcular cantidad de slots de 30 minutos
      const [sh, sm] = startTime.split(':').map(Number)
      const [eh, em] = endTime.split(':').map(Number)
      const startMinutes = sh * 60 + sm
      let endMinutes = eh * 60 + em
      if (endMinutes <= startMinutes) {
        endMinutes += 24 * 60 // Pasa de medianoche
      }

      const totalSlots = Math.max(1, Math.round((endMinutes - startMinutes) / 30))
      const startIndex = timeSlots.indexOf(startTime)

      if (startIndex !== -1) {
        for (let i = 0; i < totalSlots; i++) {
          const slotTime = timeSlots[startIndex + i]
          if (!slotTime) break
          const isStart = i === 0
          const isEnd = i === totalSlots - 1
          const isMiddle = !isStart && !isEnd
          const key = `${b.court_id}_${slotTime}`
          map.set(key, {
            booking: b,
            isStart,
            isEnd,
            isMiddle,
            startTime,
            endTime,
            slotIndex: i,
            totalSlots,
          })
        }
      } else {
        const key = `${b.court_id}_${startTime}`
        map.set(key, {
          booking: b,
          isStart: true,
          isEnd: true,
          isMiddle: false,
          startTime,
          endTime,
          slotIndex: 0,
          totalSlots: 1,
        })
      }
    })

    return map
  }, [activeBookings, selectedDate, timeSlots])

  const formattedDateTitle = useMemo(() => {
    return format(parseISO(selectedDate), "EEEE d 'de' MMMM", { locale: es })
  }, [selectedDate])

  return (
    <div className="flex flex-col h-full space-y-3 sm:space-y-4">
      {/* Barra de Control y Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md">
        {/* Selector de Fecha */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToday} className="text-xs h-10 px-3 min-w-[52px]">
            Hoy
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={scrollToNow}
            className="text-xs h-10 px-2.5 bg-amber-950/30 border-amber-500/30 text-amber-300 hover:bg-amber-900/50 hover:text-amber-100 flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Desplazarse en la grilla al horario actual"
          >
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Ahora</span>
          </Button>
          <div className="flex items-center bg-slate-950 rounded-xl border border-slate-800 p-0.5 sm:p-1">
            <button
              onClick={handlePrevDay}
              className="p-2 sm:p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
              aria-label="Día anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-2 sm:px-3 py-1 text-xs sm:text-sm font-semibold text-white capitalize flex items-center gap-1.5 sm:gap-2">
              <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
              <span className="truncate max-w-[120px] xs:max-w-[150px] sm:max-w-none">{formattedDateTitle}</span>
            </div>
            <button
              onClick={handleNextDay}
              className="p-2 sm:p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
              aria-label="Día siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-10 rounded-xl border border-slate-800 bg-slate-950 px-2.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
          />
        </div>

        {/* Filtros de deporte y acciones */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          {/* Filtros de deporte con scroll horizontal suave */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar max-w-full">
            <button
              onClick={() => setSelectedSport('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0 min-h-[34px] ${
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
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0 min-h-[34px] ${
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
            {/* Botón de Horarios de Apertura y Cierre */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsScheduleModalOpen(true)}
              className="text-xs bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60 hover:text-white gap-1.5 h-8 px-2.5 cursor-pointer"
              title="Configurar horario de apertura y cierre del club"
            >
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Horario:</span> {schedule.opening_time} - {schedule.closing_time} hs
            </Button>

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
      <div className="md:hidden flex items-center justify-between px-2 py-1 text-[11px] text-slate-400 select-none">
        <span className="flex items-center gap-1.5 animate-pulse">
          <span className="inline-flex items-center gap-1 bg-slate-800/80 rounded-lg px-2 py-1 border border-slate-700/60">
            <ChevronLeft className="w-3 h-3 text-slate-500" />
            <span className="text-slate-300 font-medium">Deslizá para ver canchas</span>
            <ChevronRight className="w-3 h-3 text-slate-500" />
          </span>
        </span>
        <span className="text-emerald-400 font-semibold bg-emerald-950/40 px-2 py-1 rounded-lg border border-emerald-500/30">
          {filteredCourts.length} {filteredCourts.length === 1 ? 'cancha' : 'canchas'}
        </span>
      </div>

      {/* Matriz de Calendario o Estado Vacío */}
      {filteredCourts.length === 0 ? (
        <div className="flex-1 rounded-2xl border border-slate-800/80 bg-slate-950/80 p-12 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <Clock className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">No hay canchas registradas en este club</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Para visualizar y gestionar la grilla de turnos, primero agregá las canchas (Fútbol, Pádel, etc.) en el menú Canchas.
            </p>
          </div>
          <Button
            onClick={() => router.push('/dashboard/canchas')}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl px-4 cursor-pointer"
          >
            Ir a Gestión de Canchas
          </Button>
        </div>
      ) : (
        <>
        <div 
          ref={gridContainerRef}
          onWheel={handleGridWheel}
          className="flex-1 overflow-x-auto overflow-y-auto max-h-[calc(100vh-235px)] sm:max-h-[calc(100vh-220px)] min-h-[480px] rounded-2xl border border-slate-800/80 bg-slate-950/80 shadow-2xl custom-scrollbar overscroll-y-auto relative select-none sm:select-auto"
          style={{ scrollBehavior: 'smooth' }}
        >
        <div className="min-w-180 sm:min-w-200">
          {/* Header de Canchas (Columnas) - Sticky Top */}
          <div className="grid grid-cols-[80px_repeat(auto-fit,minmax(180px,1fr))] border-b border-slate-800 sticky top-0 z-20 bg-slate-950/95 backdrop-blur-md shadow-md">
            <div className="p-3 text-center text-xs font-bold text-slate-400 border-r border-slate-800 flex items-center justify-center sticky left-0 top-0 z-30 bg-slate-950 shadow-xs">
              <Clock className="w-3.5 h-3.5 mr-1 text-emerald-400" />
              Hora
            </div>
            {filteredCourts.map((court) => (
              <div
                key={court.id}
                className="p-3 text-center border-r border-slate-800/80 last:border-r-0 bg-slate-900/90"
              >
                <div className="text-sm font-bold text-white tracking-tight">{court.name}</div>
                <div className="text-[11px] text-emerald-400 font-medium">{court.sport}</div>
              </div>
            ))}
          </div>

          {/* Filas de Horarios */}
          <div className="divide-y divide-slate-800/60">
            {timeSlots.map((time) => (
              <div
                key={time}
                data-time={time}
                className="grid grid-cols-[80px_repeat(auto-fit,minmax(180px,1fr))] min-h-[72px]"
              >
                {/* Columna Hora - Sticky Left */}
                <div className="p-2 text-center text-xs font-semibold text-slate-400 border-r border-slate-800 bg-slate-950/95 sticky left-0 z-10 flex items-center justify-center shadow-xs">
                  {time}
                </div>

                {/* Celdas por Cancha */}
                {filteredCourts.map((court) => {
                  const bookingKey = `${court.id}_${time}`
                  const slotInfo = slotBookingMap.get(bookingKey)

                  if (slotInfo) {
                    const { booking, isStart, isEnd, isMiddle, endTime, totalSlots } = slotInfo
                    const isHovered = hoveredBookingId === booking.id
                    const isPendingValidation = Boolean(
                      String(booking.status) === 'PENDING_DEPOSIT' ||
                      String(booking.status) === 'PENDING' ||
                      ((booking.internal_notes?.toUpperCase().includes('TRANSFER') || booking.deposit_amount_ars > 0) &&
                       !booking.internal_notes?.includes('Seña verificada y aprobada'))
                    )
                    const isFullyPaid = (booking.status === 'FULLY_PAID' || booking.balance_due === 0) && !isPendingValidation
                    const isConfirmed = (booking.status === 'CONFIRMED' || booking.status === 'DEPOSIT_PAID') && !isPendingValidation
                    const isAbono = Boolean(
                      booking.internal_notes?.includes('ABONO') ||
                      booking.internal_notes?.includes('FIJO')
                    )

                    // Estilo de color coordinado
                    const colorClasses = isAbono
                      ? isHovered
                        ? 'bg-purple-950/70 border-purple-400 text-purple-100 shadow-md'
                        : 'bg-purple-950/40 border-purple-500/40 hover:border-purple-400 hover:bg-purple-950/60 text-purple-100'
                      : isPendingValidation
                      ? isHovered
                        ? 'bg-amber-950/80 border-amber-400 text-amber-100 shadow-md'
                        : 'bg-amber-950/50 border-amber-500/60 hover:border-amber-400 hover:bg-amber-950/70 text-amber-100'
                      : isFullyPaid
                      ? isHovered
                        ? 'bg-emerald-950/70 border-emerald-400 text-emerald-100 shadow-md'
                        : 'bg-emerald-950/40 border-emerald-500/40 hover:border-emerald-400 hover:bg-emerald-950/60 text-emerald-100'
                      : isConfirmed
                      ? isHovered
                        ? 'bg-cyan-950/70 border-cyan-400 text-cyan-100 shadow-md'
                        : 'bg-cyan-950/40 border-cyan-500/40 hover:border-cyan-400 hover:bg-cyan-950/60 text-cyan-100'
                      : isHovered
                      ? 'bg-amber-950/70 border-amber-400 text-amber-100 shadow-md'
                      : 'bg-amber-950/40 border-amber-500/40 hover:border-amber-400 hover:bg-amber-950/60 text-amber-100'

                    // Caso 1: Turno de 1 solo slot de 30 min
                    if (isStart && isEnd) {
                      return (
                        <div
                          key={court.id}
                          onClick={() => setSelectedBooking(booking)}
                          onMouseEnter={() => setHoveredBookingId(booking.id)}
                          onMouseLeave={() => setHoveredBookingId(null)}
                          className="p-1.5 border-r border-slate-800/60 last:border-r-0 cursor-pointer group"
                        >
                          <div
                            className={`h-full w-full rounded-xl p-2.5 flex flex-col justify-between transition-all duration-150 border ${colorClasses}`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0 flex-1">
                                <span className="font-bold text-xs truncate block">
                                  {booking.customer_name}
                                </span>
                                {isPendingValidation ? (
                                  <span className="inline-block mt-0.5 text-[8px] font-bold uppercase px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-200 border border-amber-400/40 tracking-wider">
                                    VALIDAR SEÑA
                                  </span>
                                ) : isAbono ? (
                                  <span className="inline-block mt-0.5 text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-purple-500/30 text-purple-200 border border-purple-400/40 tracking-wider">
                                    ABONO FIJO
                                  </span>
                                ) : null}
                              </div>
                              {isPendingValidation ? (
                                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
                              ) : isFullyPaid ? (
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

                    // Caso 2: Primer slot de un turno multislot (ej. 13:00 para 13:00 - 14:00)
                    if (isStart) {
                      return (
                        <div
                          key={court.id}
                          onClick={() => setSelectedBooking(booking)}
                          onMouseEnter={() => setHoveredBookingId(booking.id)}
                          onMouseLeave={() => setHoveredBookingId(null)}
                          className="px-1.5 pt-1.5 pb-0 border-r border-slate-800/60 last:border-r-0 cursor-pointer relative z-10 flex flex-col"
                        >
                          <div
                            className={`h-full min-h-[66px] w-full rounded-t-xl rounded-b-none p-2.5 flex flex-col justify-between transition-all duration-150 border-t border-x border-b-0 -mb-[1px] relative z-10 ${colorClasses}`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0 flex-1">
                                <span className="font-bold text-xs truncate block">
                                  {booking.customer_name}
                                </span>
                                {isPendingValidation ? (
                                  <span className="inline-block mt-0.5 text-[8px] font-bold uppercase px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-200 border border-amber-400/40 tracking-wider">
                                    VALIDAR SEÑA
                                  </span>
                                ) : isAbono ? (
                                  <span className="inline-block mt-0.5 text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-purple-500/30 text-purple-200 border border-purple-400/40 tracking-wider">
                                    ABONO FIJO
                                  </span>
                                ) : null}
                              </div>
                              {isPendingValidation ? (
                                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
                              ) : isFullyPaid ? (
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

                    // Caso 3: Slot intermedio de un turno de 90+ min
                    if (isMiddle) {
                      return (
                        <div
                          key={court.id}
                          onClick={() => setSelectedBooking(booking)}
                          onMouseEnter={() => setHoveredBookingId(booking.id)}
                          onMouseLeave={() => setHoveredBookingId(null)}
                          className="px-1.5 py-0 border-r border-slate-800/60 last:border-r-0 cursor-pointer relative z-10 flex flex-col"
                        >
                          <div
                            className={`h-full min-h-[72px] w-full rounded-none px-2.5 py-1.5 flex items-center justify-between transition-all duration-150 border-x border-y-0 -my-[1px] relative z-10 ${colorClasses}`}
                          >
                            <span className="text-[10px] font-medium opacity-70 italic">
                              Turno en curso...
                            </span>
                            <span className="text-[10px] opacity-75 font-semibold">
                              {booking.customer_name}
                            </span>
                          </div>
                        </div>
                      )
                    }

                    // Caso 4: Último slot del turno combinado (ej. 13:30 para turno de 13:00 a 14:00)
                    return (
                      <div
                        key={court.id}
                        onClick={() => setSelectedBooking(booking)}
                        onMouseEnter={() => setHoveredBookingId(booking.id)}
                        onMouseLeave={() => setHoveredBookingId(null)}
                        className="px-1.5 pb-1.5 pt-0 border-r border-slate-800/60 last:border-r-0 cursor-pointer relative z-10 flex flex-col"
                      >
                        <div
                          className={`h-full min-h-[66px] w-full rounded-b-xl rounded-t-none px-2.5 py-2 flex flex-col justify-between transition-all duration-150 border-b border-x border-t-0 -mt-[1px] relative z-10 ${colorClasses}`}
                        >
                          <div className="flex items-center justify-between w-full h-full text-[11px] opacity-90 mt-auto">
                            <div className="flex items-center gap-1.5 font-semibold text-slate-300">
                              <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <span>Hasta las {endTime} hs</span>
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-900/80 border border-slate-700/60 text-slate-300">
                              {totalSlots === 2 ? '1 hora' : `${totalSlots * 30} min`}
                            </span>
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
                      className="p-1 border-r border-slate-800/60 last:border-r-0 group cursor-pointer hover:bg-emerald-950/20 transition-colors relative min-h-[72px]"
                    >
                      {/* Área visible en desktop con hover */}
                      <div className="hidden sm:flex h-full w-full rounded-lg border border-dashed border-transparent group-hover:border-emerald-600/40 items-center justify-center transition-all opacity-0 group-hover:opacity-100">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/80 px-2 py-1 rounded-md border border-emerald-500/20">
                          <Plus className="w-3 h-3" />
                          Reservar
                        </span>
                      </div>
                      {/* Área táctil visible en mobile siempre */}
                      <div className="sm:hidden h-full w-full rounded-lg flex items-center justify-center">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-500/60 px-1.5 py-0.5 rounded border border-dashed border-emerald-600/25">
                          <Plus className="w-2.5 h-2.5" />
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
      <div className="flex items-center justify-end px-2 py-1 text-[11px] text-slate-400">
        <span className="text-emerald-400 font-medium">
          {filteredCourts.length} {filteredCourts.length === 1 ? 'cancha operativa' : 'canchas operativas'}
        </span>
      </div>
      </>
      )}

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
          priceRules={priceRules}
          preselectedDate={selectedDate}
          preselectedTime={quickBookSlot?.time || '19:00'}
          preselectedCourtId={quickBookSlot?.courtId}
          onSuccess={() => {
            setIsQuickBookOpen(false)
            setQuickBookSlot(null)
            setOptimisticBookings([])
            fetchBookingsForDate(selectedDate)
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
            fetchBookingsForDate(selectedDate)
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
          fetchBookingsForDate(selectedDate)
          onRefresh?.()
          router.refresh()
        }}
      />

      {/* Modal de Horarios de Apertura y Cierre del Club */}
      {isScheduleModalOpen && (
        <ClubScheduleModal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          tenantId={tenantId}
          initialSchedule={schedule}
          onSuccess={(newSchedule) => {
            setSchedule(newSchedule)
            onRefresh?.()
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
