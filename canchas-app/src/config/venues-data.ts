// src/config/venues-data.ts
// ==============================================================================
// CONFIGURACIÓN CENTRALIZADA DE SEDES, CANCHAS Y TURNOS MULTISEDE
// ==============================================================================

import type { CalendarBooking } from '@/components/dashboard/calendar-grid'

export interface VenueItem {
  id: string
  name: string
  branchName: string
  address: string
  city: string
  courtsCount: number
  sports: string[]
  isPrimary?: boolean
}

export interface CourtItem {
  id: string
  name: string
  sport: string
  slot_duration: 'MIN_60' | 'MIN_90' | 'MIN_120'
  is_active: boolean
}

export const DEFAULT_VENUES: VenueItem[] = [
  {
    id: 'venue-main',
    name: 'Sede Principal',
    branchName: 'Sede Central',
    address: 'Sede del club',
    city: 'Argentina',
    courtsCount: 2,
    sports: ['Fútbol', 'Pádel'],
    isPrimary: true
  }
]

// Canchas personalizadas por sede
export const VENUES_COURTS: Record<string, CourtItem[]> = {}

export function getVenueCourts(venueId: string, customVenues?: VenueItem[]): CourtItem[] {
  if (VENUES_COURTS[venueId]) {
    return VENUES_COURTS[venueId]
  }

  // Si es una sede personalizada creada por el usuario
  const matched = customVenues?.find(v => v.id === venueId)
  if (matched && matched.courtsCount > 0) {
    const courts: CourtItem[] = []
    for (let i = 1; i <= matched.courtsCount; i++) {
      courts.push({
        id: `${matched.id}-c${i}`,
        name: `Cancha ${i} (${matched.sports[0] || 'Deporte'})`,
        sport: (matched.sports[0] || 'CANCHA').toUpperCase(),
        slot_duration: 'MIN_90',
        is_active: true
      })
    }
    return courts
  }

  return []
}

// Registro global en memoria de reservas en vivo (garantiza sincronización 0ms)
const IN_MEMORY_VENUE_BOOKINGS: CalendarBooking[] = []

export function addVenueBooking(booking: CalendarBooking) {
  const existingIdx = IN_MEMORY_VENUE_BOOKINGS.findIndex((b) => b.id === booking.id)
  if (existingIdx >= 0) {
    IN_MEMORY_VENUE_BOOKINGS[existingIdx] = booking
  } else {
    IN_MEMORY_VENUE_BOOKINGS.unshift(booking)
  }
}

export function getInMemoryBookings(): CalendarBooking[] {
  return IN_MEMORY_VENUE_BOOKINGS
}

export function getVenueBookings(venueId: string, dateStr: string): CalendarBooking[] {
  const today = dateStr || new Date().toISOString().split('T')[0]

  // Reservas dinámicas en memoria para la fecha seleccionada (0ms latencia)
  const dynamicForDay = IN_MEMORY_VENUE_BOOKINGS.filter((b) => {
    const d = b.starts_at?.includes('T') ? b.starts_at.split('T')[0] : b.starts_at?.split(' ')[0]
    return d === today
  })

  // Modo Oficial Producción: Grilla limpia sin turnos ficticios de demostración
  const baseBookings: CalendarBooking[] = []

  const map = new Map<string, CalendarBooking>()
  baseBookings.forEach((b) => map.set(b.id, b))
  dynamicForDay.forEach((b) => map.set(b.id, b))
  return Array.from(map.values())
}
