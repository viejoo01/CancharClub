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
  CloudRain,
  DollarSign
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuickBookingModal, type QuickBookingPriceRule } from './quick-booking-modal'
import { BookingDetailsModal } from './booking-details-modal'
import { RainProtocolModal } from './rain-protocol-modal'
import { ClubScheduleModal } from './club-schedule-modal'
import { formatARS, formatTime, getArgentinaTodayIso, getArgentinaTimeStr, isAbonoBooking } from '@/lib/utils'
import { generateTimeSlots, DEFAULT_CLUB_SCHEDULE, timeStringToMinutes, type ClubScheduleConfig } from '@/lib/time-slots'
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
  tenant_id?: string
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
  is_abono?: boolean
  recurring_slot_id?: string | null
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
  created_at?: string | null
}

// Caché en cliente para cambio instantáneo (0ms) entre fechas
const clientBookingsCache = new Map<string, { bookings: CalendarBooking[]; timestamp: number }>()

function getTodayArgentinaIso(): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return formatter.format(new Date())
  } catch {
    return new Date().toISOString().split('T')[0]
  }
}

/**
 * Persiste una copia local ligera en localStorage para que el personal de recepción
 * pueda consultar turnos, canchas y teléfonos de contacto en modo offline ante cortes de red.
 */
function saveOfflineScheduleSnapshot(
  dateIso: string,
  tenantId: string | null | undefined,
  courtsList: CourtItem[],
  bookingsList: CalendarBooking[]
) {
  if (typeof window === 'undefined') return
  try {
    const todayIso = getTodayArgentinaIso()
    if (dateIso === todayIso || !localStorage.getItem('canchar_today_schedule_snapshot')) {
      const snapshot = {
        date: dateIso,
        updatedAt: new Date().toISOString(),
        tenantId: tenantId || '',
        courts: courtsList.map((c) => ({
          id: c.id,
          name: c.name,
          sport: c.sport,
        })),
        bookings: bookingsList.map((b) => {
          const cName = courtsList.find((c) => c.id === b.court_id)?.name || 'Cancha'
          return {
            id: b.id,
            court_id: b.court_id,
            court_name: cName,
            starts_at: b.starts_at,
            ends_at: b.ends_at,
            time_str: `${formatTimeArgentina(b.starts_at)} - ${formatTimeArgentina(b.ends_at)}`,
            customer_name: b.customer_name || 'Sin nombre',
            customer_phone: b.customer_phone || '',
            status: b.status,
            total_amount_ars: b.total_amount_ars,
            deposit_amount_ars: b.deposit_amount_ars,
            balance_due: b.balance_due,
          }
        }),
      }
      localStorage.setItem('canchar_today_schedule_snapshot', JSON.stringify(snapshot))
    }
  } catch {
    // Silently ignore localStorage quota limits
  }
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
  initialDate = getArgentinaTodayIso(),
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

  // Desplazar al horario actual (ahora) en huso horario de Argentina
  const scrollToNow = useCallback(() => {
    const timeStr = getArgentinaTimeStr()
    const [hh, mmRaw] = timeStr.split(':')
    const mm = Number(mmRaw) < 30 ? '00' : '30'
    const currentTimeStr = `${hh}:${mm}`
    const matchingSlot = timeSlots.find((t) => t >= currentTimeStr) || timeSlots[0]
    if (matchingSlot) {
      scrollToTimeSlot(matchingSlot)
      toast.info(`Desplazado a las ${matchingSlot} hs`, { duration: 1800 })
    }
  }, [timeSlots, scrollToTimeSlot])


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

  // Atajos de teclado rápidos para el encargado de recepción
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        setQuickBookSlot(null)
        setIsQuickBookOpen(true)
        toast.info('Atajo [N]: Nuevo Turno', { duration: 1500 })
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        toast.info('Atajo [C]: Ir a Cantina', { duration: 1500 })
        router.push('/dashboard/cantina')
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        toast.info('Atajo [F]: Ir a Caja', { duration: 1500 })
        router.push('/dashboard/caja')
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        scrollToNow()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [router, scrollToNow])

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
    if (initialBookings && initialBookings.length > 0) {
      setLoadedBookings(initialBookings)
      saveOfflineScheduleSnapshot(selectedDate, tenantId, activeCourts, initialBookings)
    }
  }, [initialBookings, selectedDate, tenantId, activeCourts])

  // Cargar turnos reales de la base de datos para la fecha seleccionada con caché local instantáneo (0ms)
  const fetchBookingsForDate = useCallback(async (dateToFetch: string, force = false) => {
    if (!tenantId) return
    const cacheKey = `${tenantId}_${dateToFetch}`
    if (force) {
      clientBookingsCache.delete(cacheKey)
    }
    const cached = clientBookingsCache.get(cacheKey)

    // Si ya existe en caché reciente (20s) y no es forzado, mostrar al instante (0ms de latencia visual)
    if (!force && cached && Date.now() - cached.timestamp < 20_000) {
      setLoadedBookings(cached.bookings)
    }

    try {
      const fresh = await getCalendarBookings(tenantId, dateToFetch)
      if (Array.isArray(fresh)) {
        const bookingsList = fresh as CalendarBooking[]
        clientBookingsCache.set(cacheKey, { bookings: bookingsList, timestamp: Date.now() })
        setLoadedBookings(bookingsList)
        saveOfflineScheduleSnapshot(dateToFetch, tenantId, activeCourts, bookingsList)
        setOptimisticBookings((prev) =>
          prev.filter(
            (ob) =>
              !bookingsList.some(
                (b) =>
                  b.id === ob.id ||
                  (b.court_id === ob.court_id &&
                    (b.starts_at === ob.starts_at ||
                      formatTimeArgentina(b.starts_at) === formatTimeArgentina(ob.starts_at)))
              )
          )
        )
        setSelectedBooking((prev) => {
          if (!prev) return null
          const updated = bookingsList.find((b) => b.id === prev.id)
          return updated || prev
        })
      }
    } catch (err) {
      console.error('[CalendarGrid] Error fetching bookings:', err)
    }
  }, [tenantId, activeCourts])

  // Cargar turnos al cambiar de fecha
  useEffect(() => {
    if (!selectedDate || !tenantId) return
    fetchBookingsForDate(selectedDate)
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
        const freshList = fresh as CalendarBooking[]
        clientBookingsCache.set(`${tenantId}_${selectedDate}`, { bookings: freshList, timestamp: Date.now() })

        setLoadedBookings((prev) => {
          const prevSig = prev.map(b => `${b.id}:${b.status}:${b.total_paid}:${b.balance_due}`).sort().join('|')
          const freshSig = freshList.map(b => `${b.id}:${b.status}:${b.total_paid}:${b.balance_due}`).sort().join('|')

          if (prevSig !== freshSig) {
            // Notificaciones en vivo de altas y bajas de turnos
            if (freshList.length > prev.length) {
              const newB = freshList.find(f => !prev.some(p => p.id === f.id))
              if (newB) {
                toast.success('¡Nueva reserva registrada en el sistema!', {
                  description: `${newB.customer_name} en ${newB.courts && !Array.isArray(newB.courts) ? newB.courts.name : 'Cancha'}`
                })
              }
            } else if (freshList.length < prev.length) {
              toast.info('Se ha cancelado o liberado un turno en la grilla.')
            }
            return freshList
          }
          return prev
        })

        setSelectedBooking((prev) => {
          if (!prev) return null
          const updated = freshList.find((b) => b.id === prev.id)
          return updated || prev
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
        (payload: { new: unknown; old: unknown }) => {
          const newRec = payload.new as { tenant_id?: string } | null
          const oldRec = payload.old as { tenant_id?: string } | null
          if ((newRec?.tenant_id && newRec.tenant_id !== tenantId) || (oldRec?.tenant_id && oldRec.tenant_id !== tenantId)) {
            return
          }
          silentSync()
          onRefresh?.()
        }
      )
      .subscribe()

    // 3. Heartbeat pasivo cada 25 segundos (los WebSockets y BroadcastChannel ya actualizan al instante)
    const intervalId = setInterval(() => {
      if (!document.hidden) {
        silentSync()
      }
    }, 25000)

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
  }, [tenantId, selectedDate, onRefresh])

  // Filtro de canchas ordenadas de la más antigua creada a la más nueva creada (de izquierda a derecha)
  const filteredCourts = useMemo(() => {
    return activeCourts
      .filter((c) => c.is_active && (selectedSport === 'ALL' || c.sport === selectedSport))
      .sort((a, b) => {
        if (a.created_at && b.created_at) {
          const timeA = new Date(a.created_at).getTime()
          const timeB = new Date(b.created_at).getTime()
          if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) {
            return timeA - timeB
          }
        }
        return a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' })
      })
  }, [activeCourts, selectedSport])

  // Densidad de grilla y modo recepción (Adaptable a monitores de 24" y laptops)
  // Densidad de grilla (Adaptable a monitores de 24" y laptops)
  const [gridDensity, setGridDensity] = useState<'normal' | 'compact'>('normal')

  // Cargar preferencia guardada o auto-activar vista compacta si el club tiene 5 o más canchas
  useEffect(() => {
    try {
      const saved = localStorage.getItem('canchar_calendar_density') as 'normal' | 'compact' | null
      if (saved === 'normal' || saved === 'compact') {
        setGridDensity(saved)
        return
      }
    } catch {}

    if (activeCourts.length >= 5) {
      setGridDensity('compact')
    }
  }, [activeCourts.length])

  const changeGridDensity = (density: 'normal' | 'compact') => {
    setGridDensity(density)
    try {
      localStorage.setItem('canchar_calendar_density', density)
    } catch {}
  }

  // Ancho y dimensiones adaptativas según densidad seleccionada y cantidad de canchas
  // En monitores de 24 pulgadas (1920x1080), 132px permite mostrar hasta 11-13 canchas completas sin scroll horizontal
  const isCompact = gridDensity === 'compact'
  const colWidth = isCompact ? 132 : 172
  const timeColWidth = isCompact ? 68 : 76

  // Plantilla exacta de columnas para evitar wrap desfasado en CSS Grid
  const gridTemplateCols = `${timeColWidth}px repeat(${filteredCourts.length}, minmax(${colWidth}px, 1fr))`
  const totalGridMinWidth = `${timeColWidth + filteredCourts.length * colWidth}px`

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

  // Filtro de búsqueda de turnos y clientes sincronizado desde Header (Ctrl+K)
  const [searchFilter, setSearchFilter] = useState('')

  // Reloj en vivo de Argentina y cálculo de posición de la línea láser en la grilla
  const [currentTimeStr, setCurrentTimeStr] = useState<string>(() => getArgentinaTimeStr())
  const todayIso = useMemo(() => getTodayArgentinaIso(), [])
  const isToday = selectedDate === todayIso

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeStr(getArgentinaTimeStr())
    }, 20000)
    return () => clearInterval(timer)
  }, [])

  // Escuchar eventos globales: búsqueda de turnos y apertura de modal rápido
  useEffect(() => {
    const handleOpenQuick = () => setIsQuickBookOpen(true)
    const handleSearch = (e: Event) => {
      const customEvent = e as CustomEvent<{ query?: string }>
      setSearchFilter(customEvent.detail?.query?.trim().toLowerCase() || '')
    }

    window.addEventListener('open-quick-booking-modal', handleOpenQuick)
    window.addEventListener('canchar-search-bookings', handleSearch)
    return () => {
      window.removeEventListener('open-quick-booking-modal', handleOpenQuick)
      window.removeEventListener('canchar-search-bookings', handleSearch)
    }
  }, [])

  // Cálculo de la posición exacta en píxeles de la hora actual en la grilla
  const currentTimePosition = useMemo(() => {
    if (!isToday || timeSlots.length === 0) return null
    const currentMins = timeStringToMinutes(currentTimeStr)
    const firstSlotMins = timeStringToMinutes(timeSlots[0])
    const lastSlotMins = timeStringToMinutes(timeSlots[timeSlots.length - 1]) + 30

    if (currentMins < firstSlotMins || currentMins > lastSlotMins) return null

    let slotIndex = -1
    for (let i = 0; i < timeSlots.length; i++) {
      const sMins = timeStringToMinutes(timeSlots[i])
      if (currentMins >= sMins && currentMins < sMins + 30) {
        slotIndex = i
        break
      }
    }

    if (slotIndex === -1) return null

    const slotMins = timeStringToMinutes(timeSlots[slotIndex])
    const diffMins = currentMins - slotMins
    const slotHeight = isCompact ? 46 : 64
    const topPx = slotIndex * slotHeight + (diffMins / 30) * slotHeight

    return {
      topPx,
      timeStr: currentTimeStr,
    }
  }, [isToday, timeSlots, currentTimeStr, isCompact])

  // Desplazamiento animado al marcador de hora actual
  const scrollToCurrentTimeMarker = useCallback(() => {
    if (!gridContainerRef.current) return
    if (currentTimePosition) {
      gridContainerRef.current.scrollTo({
        top: Math.max(0, currentTimePosition.topPx - 100),
        behavior: 'smooth',
      })
      toast.info(`Desplazado a la hora actual (${currentTimePosition.timeStr} hs)`, { duration: 1800 })
    } else {
      toast.info('La hora actual está fuera del rango operativo de la grilla', { duration: 2200 })
    }
  }, [currentTimePosition])

  // Auto-scroll inicial a la línea de hora actual al abrir la grilla
  const autoScrolledRef = useRef(false)
  useEffect(() => {
    if (currentTimePosition && !autoScrolledRef.current && gridContainerRef.current) {
      autoScrolledRef.current = true
      const timer = setTimeout(() => {
        gridContainerRef.current?.scrollTo({
          top: Math.max(0, currentTimePosition.topPx - 100),
          behavior: 'smooth',
        })
      }, 350)
      return () => clearTimeout(timer)
    }
  }, [currentTimePosition])

  // Atajos de teclado para Recepción: N (Nuevo Turno), T (Hora Actual), C (Cantina), F (Cobros)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isInput =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement)?.isContentEditable
      if (isInput) return

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        setIsQuickBookOpen(true)
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        const today = getTodayArgentinaIso()
        if (selectedDate !== today) {
          setSelectedDate(today)
          setTimeout(() => {
            scrollToCurrentTimeMarker()
          }, 300)
        } else {
          scrollToCurrentTimeMarker()
        }
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        router.push('/dashboard/cantina')
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        router.push('/dashboard/cobros')
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('canchar-toggle-executive-panel'))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [router, selectedDate, scrollToCurrentTimeMarker])

  // Listener para seleccionar un turno remotamente (ej: desde el Panel Ejecutivo)
  useEffect(() => {
    const handleSelectBooking = (e: Event) => {
      const customEvent = e as CustomEvent<{ booking?: CalendarBooking; bookingId?: string }>
      if (customEvent.detail?.booking) {
        setSelectedBooking(customEvent.detail.booking)
      } else if (customEvent.detail?.bookingId) {
        const found = activeBookings.find((b) => b.id === customEvent.detail.bookingId)
        if (found) setSelectedBooking(found)
      }
    }

    window.addEventListener('canchar-select-booking', handleSelectBooking)
    return () => window.removeEventListener('canchar-select-booking', handleSelectBooking)
  }, [activeBookings])

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
    <div className="flex flex-col h-full space-y-3 sm:space-y-4 w-full">
      {/* Barra de Control Unificada y Minimalista estilo Linear / Apple Calendar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 px-3.5 py-2 rounded-2xl bg-white/90 dark:bg-[#0E1526]/90 border border-slate-200/80 dark:border-white/[0.08] backdrop-blur-md shadow-2xs shrink-0">
        {/* Navegación de Fecha con Segmented Control */}
        <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleToday} 
            className="text-xs h-8 px-3 rounded-xl bg-slate-100/80 dark:bg-white/[0.05] border-slate-200/80 dark:border-white/[0.08] text-slate-800 dark:text-slate-100 hover:bg-slate-200/80 dark:hover:bg-white/[0.1] font-semibold cursor-pointer transition-all shadow-2xs"
          >
            Hoy
          </Button>
          
          <div className="flex items-center bg-slate-100/70 dark:bg-white/[0.04] rounded-xl border border-slate-200/80 dark:border-white/[0.08] p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={handlePrevDay}
              className="p-1.5 hover:bg-white dark:hover:bg-white/[0.08] rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all cursor-pointer"
              aria-label="Día anterior"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div className="px-3 py-1 text-xs font-bold text-slate-900 dark:text-white capitalize flex items-center gap-2 select-none">
              <CalendarIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="tracking-tight">{formattedDateTitle}</span>
            </div>
            <button
              type="button"
              onClick={handleNextDay}
              className="p-1.5 hover:bg-white dark:hover:bg-white/[0.08] rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all cursor-pointer"
              aria-label="Día siguiente"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={scrollToNow}
            className="text-xs h-8 px-2.5 rounded-xl text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10 gap-1.5 cursor-pointer font-medium transition-colors"
            title="Ir a hora actual"
          >
            <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Ahora</span>
          </Button>
        </div>

        {/* Filtros por Deporte - Segmented Pills */}
        <div className="flex items-center gap-1 bg-slate-100/70 dark:bg-white/[0.04] p-1 rounded-xl border border-slate-200/80 dark:border-white/[0.08] overflow-x-auto no-scrollbar shadow-2xs">
          <button
            type="button"
            onClick={() => setSelectedSport('ALL')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 ${
              selectedSport === 'ALL'
                ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/[0.05]'
            }`}
          >
            Todas
          </button>
          {sports.map((sp) => (
            <button
              type="button"
              key={sp}
              onClick={() => setSelectedSport(sp)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 ${
                selectedSport === sp
                  ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/[0.05]'
              }`}
            >
              {sp}
            </button>
          ))}
        </div>

        {/* Acciones Secundarias Limpias */}
        <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsScheduleModalOpen(true)}
            className="text-xs h-8 px-2.5 rounded-xl border border-slate-200/70 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.03] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.08] gap-1.5 cursor-pointer font-medium transition-all"
            title="Configurar horario de apertura y cierre"
          >
            <Clock className="w-3 h-3 text-slate-400" />
            <span className="hidden md:inline font-mono text-[11px]">{schedule.opening_time} - {schedule.closing_time} hs</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsRainModalOpen(true)}
            className="text-xs h-8 px-2.5 rounded-xl border border-sky-200/70 dark:border-sky-500/20 bg-sky-50/50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-100/70 dark:hover:bg-sky-500/20 gap-1.5 cursor-pointer font-medium transition-all"
            title="Protocolo Lluvia"
          >
            <CloudRain className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span className="hidden md:inline">Lluvia</span>
          </Button>

          {filteredCourts.length > 0 && (
            <div className="flex items-center gap-0.5 bg-slate-100/70 dark:bg-white/[0.04] p-0.5 rounded-xl border border-slate-200/80 dark:border-white/[0.08] shadow-2xs">
              <button
                type="button"
                onClick={() => changeGridDensity('compact')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                  gridDensity === 'compact'
                    ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
                title="Modo Compacto"
              >
                Compacto
              </button>
              <button
                type="button"
                onClick={() => changeGridDensity('normal')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                  gridDensity === 'normal'
                    ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
                title="Modo Cómodo"
              >
                Cómodo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Banner de búsqueda activa con botón para limpiar */}
      {searchFilter && (
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300 shadow-xs animate-in fade-in duration-150">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Filtrando turnos de: <strong className="font-bold underline">{searchFilter}</strong>
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              setSearchFilter('')
              window.dispatchEvent(new CustomEvent('canchar-search-bookings', { detail: { query: '' } }))
            }}
            className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-white px-2 py-0.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer"
          >
            Limpiar filtro (×)
          </button>
        </div>
      )}

      {/* Matriz de Calendario o Estado Vacío */}
      {filteredCourts.length === 0 ? (
        <div className="flex-1 rounded-2xl border border-slate-200/90 dark:border-slate-800/80 bg-white dark:bg-slate-950/80 p-12 flex flex-col items-center justify-center text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Clock className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">No hay canchas registradas en este club</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
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
          className="flex-1 overflow-x-auto overflow-y-auto h-[calc(100vh-130px)] min-h-[580px] rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0B0F19] shadow-sm dark:shadow-2xl custom-scrollbar overscroll-y-auto relative select-none sm:select-auto w-full"
          style={{ scrollBehavior: 'smooth' }}
        >
        <div 
          className="w-full min-w-full"
          style={{ minWidth: `max(100%, ${totalGridMinWidth})` }}
        >
          {/* Header de Canchas (Columnas) - Sticky Top con Stadium Scoreboard Style */}
          <div 
            className="grid w-full border-b border-slate-200/80 dark:border-white/[0.08] sticky top-0 z-20 bg-white/95 dark:bg-[#0E1526]/95 backdrop-blur-md shadow-2xs"
            style={{ gridTemplateColumns: gridTemplateCols }}
          >
            <div 
              className={`${isCompact ? 'p-2' : 'p-3'} text-center text-xs font-bold text-slate-600 dark:text-slate-400 border-r border-slate-200/80 dark:border-white/[0.08] flex items-center justify-center sticky left-0 top-0 z-30 bg-slate-100/90 dark:bg-[#0E1526]/90 backdrop-blur-md shadow-[4px_0_12px_rgba(0,0,0,0.03)] dark:shadow-[4px_0_12px_rgba(0,0,0,0.5)]`}
              style={{ width: `${timeColWidth}px` }}
            >
              <Clock className="w-3.5 h-3.5 mr-1 text-emerald-600 dark:text-emerald-400 shrink-0" />
              Hora
            </div>
            {filteredCourts.map((court) => {
              const spLower = (court.sport || '').toLowerCase()
              const isPadel = spLower.includes('padel') || spLower.includes('pádel')
              const isFutbol = spLower.includes('futbol') || spLower.includes('fútbol')
              const isTenis = spLower.includes('tenis') || spLower.includes('tennis')

              const sportBadgeStyle = isPadel
                ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25'
                : isFutbol
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                : isTenis
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25'
                : 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/25'

              return (
                <div
                  key={court.id}
                  className={`${isCompact ? 'p-2' : 'p-2.5'} text-center border-r border-slate-200/80 dark:border-white/[0.08] last:border-r-0 bg-white/90 dark:bg-[#0E1526]/90 flex flex-col items-center justify-center min-w-0 transition-colors`}
                >
                  <div className={`${isCompact ? 'text-xs' : 'text-sm'} font-bold text-slate-900 dark:text-white tracking-tight truncate max-w-full px-1`} title={court.name}>
                    {court.name}
                  </div>
                  <div className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold tracking-wide uppercase ${sportBadgeStyle}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 shrink-0" />
                    <span className="truncate">{court.sport}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Filas de Horarios con Marcador Láser de Hora Actual */}
          <div className="divide-y divide-slate-100 dark:divide-white/[0.04] w-full relative">
            {/* Línea horizontal en vivo de Hora Actual (Láser rojo con badge sticky) */}
            {currentTimePosition && (
              <div 
                className="absolute left-0 right-0 z-30 pointer-events-none flex items-center transition-all duration-300"
                style={{ top: `${currentTimePosition.topPx}px` }}
              >
                {/* Pill indicador de hora fija sobre la columna sticky de hora */}
                <div 
                  className="sticky left-0 z-30 flex items-center justify-center bg-rose-600 text-white font-mono font-bold text-[10px] px-2 py-0.5 rounded-full shadow-[0_0_12px_rgba(225,29,72,0.8)] border border-rose-400/80 gap-1 shrink-0 select-none"
                  style={{ width: `${timeColWidth - 4}px`, marginLeft: '2px' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  <span>{currentTimePosition.timeStr}</span>
                </div>

                {/* Línea horizontal continua con brillo láser suave */}
                <div className="flex-1 h-0.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.7)] ml-1" />
              </div>
            )}

            {timeSlots.map((time) => (
              <div
                key={time}
                data-time={time}
                className={`grid w-full transition-all duration-150 ${isCompact ? 'min-h-11.5' : 'min-h-16'}`}
                style={{ gridTemplateColumns: gridTemplateCols }}
              >
                {/* Columna Hora - Sticky Left con Sombra de Elevación */}
                <div 
                  className={`${isCompact ? 'p-1 sm:p-1.5 text-[11px]' : 'p-2 text-xs'} text-center font-mono font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200/80 dark:border-white/[0.08] bg-white/95 dark:bg-[#0B0F19]/95 backdrop-blur-xs sticky left-0 z-10 flex items-center justify-center shadow-[4px_0_12px_rgba(0,0,0,0.02)] dark:shadow-[4px_0_12px_rgba(0,0,0,0.4)] select-none tabular-nums`}
                  style={{ width: `${timeColWidth}px` }}
                >
                  {time}
                </div>

                {/* Celdas por Cancha */}
                {filteredCourts.map((court) => {
                  const bookingKey = `${court.id}_${time}`
                  const slotInfo = slotBookingMap.get(bookingKey)

                  if (slotInfo) {
                    const { booking, isStart, isEnd, isMiddle, endTime, totalSlots } = slotInfo
                    const isHovered = hoveredBookingId === booking.id
                    const isStaffDeskPaid = Boolean(
                      booking.internal_notes?.includes('Cobro $') ||
                      booking.internal_notes?.includes('en mostrador') ||
                      booking.internal_notes?.includes('Seña inicial') ||
                      booking.origin === 'STAFF_MANUAL'
                    )
                    const isPendingValidation = Boolean(
                      (String(booking.status) === 'PENDING_DEPOSIT' ||
                       String(booking.status) === 'PENDING' ||
                       (booking.origin === 'ONLINE_PORTAL' &&
                        booking.internal_notes?.toUpperCase().includes('TRANSFER') &&
                        !booking.internal_notes?.includes('Seña verificada y aprobada'))) &&
                      !isStaffDeskPaid
                    )
                    const isFullyPaid = (booking.status === 'FULLY_PAID' || booking.balance_due === 0) && !isPendingValidation
                    const isConfirmed = (booking.status === 'CONFIRMED' || booking.status === 'DEPOSIT_PAID') && !isPendingValidation
                    const isAbono = isAbonoBooking({
                      is_abono: booking.is_abono,
                      recurring_slot_id: booking.recurring_slot_id,
                      internal_notes: booking.internal_notes,
                    })

                    // Estilo de tarjeta de evento de alta gama con banda de estado vertical izquierda
                    const colorClasses = isAbono
                      ? 'bg-purple-500/[0.08] dark:bg-purple-500/[0.14] border-purple-200/90 dark:border-white/[0.08] border-l-4 border-l-purple-500 text-purple-950 dark:text-purple-100 shadow-2xs'
                      : isPendingValidation
                      ? 'bg-amber-500/[0.08] dark:bg-amber-500/[0.14] border-amber-200/90 dark:border-white/[0.08] border-l-4 border-l-amber-500 text-amber-950 dark:text-amber-100 shadow-2xs'
                      : isFullyPaid
                      ? 'bg-emerald-500/[0.08] dark:bg-emerald-500/[0.14] border-emerald-200/90 dark:border-white/[0.08] border-l-4 border-l-emerald-500 text-slate-900 dark:text-emerald-100 shadow-2xs'
                      : isConfirmed
                      ? 'bg-sky-500/[0.08] dark:bg-sky-500/[0.14] border-sky-200/90 dark:border-white/[0.08] border-l-4 border-l-sky-500 text-slate-900 dark:text-sky-100 shadow-2xs'
                      : 'bg-amber-500/[0.08] dark:bg-amber-500/[0.14] border-amber-200/90 dark:border-white/[0.08] border-l-4 border-l-amber-500 text-slate-900 dark:text-amber-100 shadow-2xs'

                    const isSearchActive = searchFilter.length > 0
                    const isMatchSearch = isSearchActive && Boolean(
                      booking.customer_name?.toLowerCase().includes(searchFilter) ||
                      booking.customer_phone?.toLowerCase().includes(searchFilter) ||
                      booking.customer_email?.toLowerCase().includes(searchFilter)
                    )
                    const searchHighlightClasses = isSearchActive
                      ? isMatchSearch
                        ? 'ring-2 ring-emerald-500 dark:ring-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.7)] z-20 scale-[1.01]'
                        : 'opacity-30'
                      : ''

                    // Caso 1: Turno de 1 solo slot de 30 min
                    if (isStart && isEnd) {
                      return (
                        <div
                          key={court.id}
                          onClick={() => setSelectedBooking(booking)}
                          onMouseEnter={() => setHoveredBookingId(booking.id)}
                          onMouseLeave={() => setHoveredBookingId(null)}
                          className={`${isCompact ? 'p-1' : 'p-1.5'} border-r border-slate-100 dark:border-white/[0.04] last:border-r-0 cursor-pointer group min-w-0`}
                        >
                          <div
                            className={`h-full w-full rounded-2xl ${isCompact ? 'p-1.5' : 'p-2.5'} flex flex-col justify-between transition-all duration-150 border ${colorClasses} ${searchHighlightClasses} ${isHovered ? 'scale-[1.01] shadow-md z-20 brightness-105' : 'shadow-2xs'}`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0 flex-1">
                                <span className={`font-bold truncate block text-slate-900 dark:text-white ${isCompact ? 'text-[11px] leading-tight' : 'text-xs'}`}>
                                  {booking.customer_name}
                                </span>
                                {isPendingValidation ? (
                                  <span className="inline-block mt-0.5 text-[8px] font-bold uppercase px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/30 tracking-wider">
                                    VALIDAR
                                  </span>
                                ) : isAbono ? (
                                  <span className="inline-block mt-0.5 text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded-md bg-purple-500/20 text-purple-900 dark:text-purple-200 border border-purple-500/30 tracking-wider">
                                    ABONO
                                  </span>
                                ) : null}
                              </div>
                              {isPendingValidation ? (
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
                              ) : isFullyPaid ? (
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                              )}
                            </div>

                            <div className={`flex items-center justify-between ${isCompact ? 'mt-0.5 text-[10px]' : 'mt-1 text-[11px]'} gap-1`}>
                              <span className="truncate font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{formatARS(booking.total_amount_ars)}</span>
                              {!isAbono && booking.balance_due > 0 ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedBooking(booking)
                                  }}
                                  className={`inline-flex items-center gap-1 ${isCompact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'} rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 font-bold shadow-2xs transition-all hover:scale-105 active:scale-95 cursor-pointer shrink-0 tabular-nums`}
                                  title={`Cobrar resto de ${formatARS(booking.balance_due)}`}
                                >
                                  <DollarSign className="w-2.5 h-2.5 text-white shrink-0" />
                                  <span className="truncate">
                                    {isCompact ? formatARS(booking.balance_due) : `Cobrar ${formatARS(booking.balance_due)}`}
                                  </span>
                                </button>
                              ) : isAbono ? (
                                <span className={`text-purple-700 dark:text-purple-300 font-bold ${isCompact ? 'text-[9px]' : 'text-[10px]'} shrink-0`}>Abono</span>
                              ) : (
                                <span className={`text-emerald-700 dark:text-emerald-400 font-bold ${isCompact ? 'text-[9px]' : 'text-[10px]'} shrink-0`}>Saldado</span>
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
                          className={`${isCompact ? 'px-1 pt-1' : 'px-1.5 pt-1.5'} pb-0 border-r border-slate-100 dark:border-white/[0.04] last:border-r-0 cursor-pointer relative z-10 flex flex-col min-w-0`}
                        >
                          <div
                            className={`h-full ${isCompact ? 'min-h-10.5 px-2 py-1' : 'min-h-15 p-2.5'} w-full rounded-t-2xl rounded-b-none flex flex-col justify-between transition-all duration-150 border-t border-x border-b-0 -mb-px relative z-10 ${colorClasses} ${searchHighlightClasses} ${isHovered ? 'brightness-105' : ''}`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0 flex-1">
                                <span className={`font-bold truncate block text-slate-900 dark:text-white ${isCompact ? 'text-[11px] leading-tight' : 'text-xs'}`}>
                                  {booking.customer_name}
                                </span>
                                {isPendingValidation ? (
                                  <span className="inline-block mt-0.5 text-[8px] font-bold uppercase px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/30 tracking-wider">
                                    VALIDAR
                                  </span>
                                ) : isAbono ? (
                                  <span className="inline-block mt-0.5 text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded-md bg-purple-500/20 text-purple-900 dark:text-purple-200 border border-purple-500/30 tracking-wider">
                                    ABONO
                                  </span>
                                ) : null}
                              </div>
                              {isPendingValidation ? (
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
                              ) : isFullyPaid ? (
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                              )}
                            </div>

                            <div className={`flex items-center justify-between ${isCompact ? 'mt-0.5 text-[10px]' : 'mt-1 text-[11px]'} gap-1`}>
                              <span className="truncate font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{formatARS(booking.total_amount_ars)}</span>
                              {!isAbono && booking.balance_due > 0 ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedBooking(booking)
                                  }}
                                  className={`inline-flex items-center gap-1 ${isCompact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'} rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 font-bold shadow-2xs transition-all hover:scale-105 active:scale-95 cursor-pointer shrink-0 tabular-nums`}
                                  title={`Cobrar resto de ${formatARS(booking.balance_due)}`}
                                >
                                  <DollarSign className="w-2.5 h-2.5 text-white shrink-0" />
                                  <span className="truncate">
                                    {isCompact ? formatARS(booking.balance_due) : `Cobrar resto (${formatARS(booking.balance_due)})`}
                                  </span>
                                </button>
                              ) : isAbono ? (
                                <span className={`text-purple-700 dark:text-purple-300 font-bold ${isCompact ? 'text-[9px]' : 'text-[10px]'} shrink-0`}>Abono</span>
                              ) : (
                                <span className={`text-emerald-700 dark:text-emerald-400 font-bold ${isCompact ? 'text-[9px]' : 'text-[10px]'} shrink-0`}>Saldado</span>
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
                          className={`${isCompact ? 'px-1' : 'px-1.5'} py-0 border-r border-slate-100 dark:border-white/[0.04] last:border-r-0 cursor-pointer relative z-10 flex flex-col min-w-0`}
                        >
                          <div
                            className={`h-full ${isCompact ? 'min-h-11 px-2 py-0.5' : 'min-h-16 px-2.5 py-1.5'} w-full rounded-none flex items-center justify-between transition-all duration-150 border-x border-y-0 -my-px relative z-10 ${colorClasses} ${searchHighlightClasses} ${isHovered ? 'brightness-105' : ''}`}
                          >
                            <span className="text-[10px] font-medium opacity-80 italic truncate text-slate-700 dark:text-slate-300">
                              {isCompact ? 'En curso' : 'Turno en curso...'}
                            </span>
                            <span className={`font-bold truncate text-slate-900 dark:text-white ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
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
                        className={`${isCompact ? 'px-1 pb-1' : 'px-1.5 pb-1.5'} pt-0 border-r border-slate-100 dark:border-white/[0.04] last:border-r-0 cursor-pointer relative z-10 flex flex-col min-w-0`}
                      >
                        <div
                          className={`h-full ${isCompact ? 'min-h-10.5 px-2 py-1' : 'min-h-15 px-2.5 py-2'} w-full rounded-b-2xl rounded-t-none flex flex-col justify-between transition-all duration-150 border-b border-x border-t-0 -mt-px relative z-10 ${colorClasses} ${searchHighlightClasses} ${isHovered ? 'brightness-105' : ''}`}
                        >
                          <div className={`flex items-center justify-between w-full h-full ${isCompact ? 'text-[10px]' : 'text-[11px]'} mt-auto gap-1`}>
                            <div className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300 truncate">
                              <Clock className={`${isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-sky-600 dark:text-sky-400 shrink-0`} />
                              <span className="truncate font-mono tabular-nums">{isCompact ? `${endTime} hs` : `Hasta las ${endTime} hs`}</span>
                            </div>
                            {!isAbono && booking.balance_due > 0 ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedBooking(booking)
                                }}
                                className={`inline-flex items-center gap-1 ${isCompact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'} rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 font-bold shadow-2xs transition-all hover:scale-105 active:scale-95 cursor-pointer shrink-0 tabular-nums`}
                                title={`Cobrar resto de ${formatARS(booking.balance_due)}`}
                              >
                                <DollarSign className="w-2.5 h-2.5 text-white shrink-0" />
                                <span className="truncate">
                                  {isCompact ? formatARS(booking.balance_due) : `Cobrar resto (${formatARS(booking.balance_due)})`}
                                </span>
                              </button>
                            ) : isAbono ? (
                              <span className={`font-bold uppercase tracking-wider ${isCompact ? 'px-1.5 py-0.2 text-[8px]' : 'px-2 py-0.5 text-[10px]'} rounded-md bg-purple-500/20 text-purple-900 dark:text-purple-300 border border-purple-500/30 shrink-0`}>
                                Abono
                              </span>
                            ) : (
                              <span className={`font-bold uppercase tracking-wider ${isCompact ? 'px-1.5 py-0.2 text-[8px]' : 'px-2 py-0.5 text-[10px]'} rounded-md bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 shrink-0`}>
                                {totalSlots === 2 ? '1 h' : `${totalSlots * 30}m`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  }

                  // Celda libre - Lienzo Interactivo
                  return (
                    <div
                      key={court.id}
                      onClick={() => {
                        setQuickBookSlot({ courtId: court.id, time })
                        setIsQuickBookOpen(true)
                      }}
                      className={`border-r border-slate-100 dark:border-white/[0.04] last:border-r-0 group cursor-pointer hover:bg-emerald-500/[0.04] dark:hover:bg-emerald-500/[0.06] transition-all relative min-w-0 ${isCompact ? 'min-h-11.5 p-0.5 sm:p-1' : 'min-h-16 p-1'} ${searchFilter ? 'opacity-30' : ''}`}
                    >
                      {/* Área visible en desktop con hover suave */}
                      <div className="hidden sm:flex h-full w-full rounded-xl border border-dashed border-transparent group-hover:border-emerald-500/30 items-center justify-center transition-all opacity-0 group-hover:opacity-100">
                        <span className={`inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400 bg-white/95 dark:bg-[#111827]/95 rounded-full border border-emerald-500/30 shadow-2xs backdrop-blur-xs transition-transform group-hover:scale-105 ${isCompact ? 'text-[10px] px-2 py-0.5' : 'text-[11px] px-3 py-1'}`}>
                          <Plus className="w-3 h-3 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
                          <span>Reservar</span>
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
          onSuccess={(newBooking) => {
            setIsQuickBookOpen(false)
            setQuickBookSlot(null)
            if (newBooking) {
              setOptimisticBookings((prev) => [newBooking, ...prev.filter((b) => b.id !== newBooking.id)])
            }
            fetchBookingsForDate(selectedDate, true)
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
