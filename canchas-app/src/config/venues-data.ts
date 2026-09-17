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
    id: 'venue-yb',
    name: 'Club Pádel Central',
    branchName: 'Sede Yerba Buena (Central)',
    address: 'Av. Aconquija 2400',
    city: 'Yerba Buena, Tucumán',
    courtsCount: 3,
    sports: ['Pádel'],
    isPrimary: true
  },
  {
    id: 'venue-bs',
    name: 'Club Pádel Central',
    branchName: 'Sede Barrio Sur (Indoor)',
    address: 'General Paz 850',
    city: 'San Miguel de Tucumán',
    courtsCount: 4,
    sports: ['Pádel'],
    isPrimary: false
  },
  {
    id: 'venue-canas',
    name: 'Complejo Las Cañas',
    branchName: 'Sede Country & Predio',
    address: 'Av. Perón y Bascary',
    city: 'Yerba Buena, Tucumán',
    courtsCount: 8,
    sports: ['Fútbol', 'Pádel'],
    isPrimary: false
  }
]

// Canchas por cada sede
export const VENUES_COURTS: Record<string, CourtItem[]> = {
  'venue-yb': [
    { id: 'c1-1', name: 'Cancha 1 (Panorámica)', sport: 'PADEL', slot_duration: 'MIN_90', is_active: true },
    { id: 'c1-2', name: 'Cancha 2 (Techada)', sport: 'PADEL', slot_duration: 'MIN_90', is_active: true },
    { id: 'c1-3', name: 'Cancha 3 (Blindex)', sport: 'PADEL', slot_duration: 'MIN_90', is_active: true },
  ],
  'venue-bs': [
    { id: 'c-bs-1', name: 'Cancha Indoor 1 (Central)', sport: 'PADEL', slot_duration: 'MIN_90', is_active: true },
    { id: 'c-bs-2', name: 'Cancha Indoor 2 (Techada)', sport: 'PADEL', slot_duration: 'MIN_90', is_active: true },
    { id: 'c-bs-3', name: 'Cancha Indoor 3 (Blindex)', sport: 'PADEL', slot_duration: 'MIN_90', is_active: true },
    { id: 'c-bs-4', name: 'Cancha Cristal 4 (Pro)', sport: 'PADEL', slot_duration: 'MIN_90', is_active: true },
  ],
  'venue-canas': [
    { id: 'c2-f1', name: 'Fútbol 5 A (Sintético)', sport: 'FUTBOL', slot_duration: 'MIN_60', is_active: true },
    { id: 'c2-f2', name: 'Fútbol 5 B (Techada)', sport: 'FUTBOL', slot_duration: 'MIN_60', is_active: true },
    { id: 'c2-f3', name: 'Fútbol 7 Principal', sport: 'FUTBOL', slot_duration: 'MIN_60', is_active: true },
    { id: 'c2-f4', name: 'Fútbol 5 C (Estadio)', sport: 'FUTBOL', slot_duration: 'MIN_60', is_active: true },
    { id: 'c2-p1', name: 'Pádel 1 (Panorámica)', sport: 'PADEL', slot_duration: 'MIN_90', is_active: true },
    { id: 'c2-p2', name: 'Pádel 2 (Blindex)', sport: 'PADEL', slot_duration: 'MIN_90', is_active: true },
    { id: 'c2-p3', name: 'Pádel 3 (Central)', sport: 'PADEL', slot_duration: 'MIN_90', is_active: true },
    { id: 'c2-p4', name: 'Pádel 4 (Outdoor)', sport: 'PADEL', slot_duration: 'MIN_90', is_active: true },
  ]
}

export function getVenueCourts(venueId: string, customVenues?: VenueItem[]): CourtItem[] {
  if (VENUES_COURTS[venueId]) {
    return VENUES_COURTS[venueId]
  }

  // Si es una sede personalizada creada por el usuario
  const matched = customVenues?.find(v => v.id === venueId)
  if (matched) {
    const courts: CourtItem[] = []
    for (let i = 1; i <= matched.courtsCount; i++) {
      courts.push({
        id: `${matched.id}-c${i}`,
        name: `Cancha ${i} (${matched.sports[0] || 'Pádel'})`,
        sport: (matched.sports[0] || 'PADEL').toUpperCase(),
        slot_duration: 'MIN_90',
        is_active: true
      })
    }
    return courts
  }

  return VENUES_COURTS['venue-yb']
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
