// src/config/venues-data.ts
// ==============================================================================
// CONFIGURACIÓN CENTRALIZADA DE SEDES, CANCHAS Y TURNOS MULTISEDE
// ==============================================================================

import type { BookingStatus } from '@/types/database'
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

export function getVenueBookings(venueId: string, dateStr: string): CalendarBooking[] {
  const today = dateStr || new Date().toISOString().split('T')[0]

  switch (venueId) {
    case 'venue-bs':
      return [
        {
          id: 'bs-b-1',
          court_id: 'c-bs-1',
          customer_name: 'Gonzalo Morales',
          customer_phone: '+54 9 381 488-1234',
          customer_email: 'gonzalo@demo.com',
          status: 'CONFIRMED' as BookingStatus,
          origin: 'ONLINE',
          total_amount_ars: 15000,
          deposit_amount_ars: 5000,
          total_paid: 5000,
          balance_due: 10000,
          internal_notes: 'Partido Mixto 6ta - Sede Barrio Sur',
          starts_at: `${today}T17:00:00.000Z`,
          ends_at: `${today}T18:30:00.000Z`,
          courts: { name: 'Cancha Indoor 1 (Central)', sport: 'PADEL', slot_duration: 'MIN_90' },
          booking_payments: [{ amount_ars: 5000, payment_method: 'MERCADOPAGO', created_at: `${today}T11:00:00.000Z` }]
        },
        {
          id: 'bs-b-2',
          court_id: 'c-bs-2',
          customer_name: 'Valeria Gómez',
          customer_phone: '+54 9 381 533-8899',
          customer_email: 'valeria@demo.com',
          status: 'CONFIRMED' as BookingStatus,
          origin: 'ONLINE',
          total_amount_ars: 15000,
          deposit_amount_ars: 15000,
          total_paid: 15000,
          balance_due: 0,
          internal_notes: 'Clase de Pádel Femenino - Pagado 100%',
          starts_at: `${today}T18:30:00.000Z`,
          ends_at: `${today}T20:00:00.000Z`,
          courts: { name: 'Cancha Indoor 2 (Techada)', sport: 'PADEL', slot_duration: 'MIN_90' },
          booking_payments: [{ amount_ars: 15000, payment_method: 'TRANSFER', created_at: `${today}T12:30:00.000Z` }]
        },
        {
          id: 'bs-b-3',
          court_id: 'c-bs-3',
          customer_name: 'Matías Rivas (Torneo)',
          customer_phone: '+54 9 381 622-4411',
          customer_email: 'matias@demo.com',
          status: 'COMPLETED' as BookingStatus,
          origin: 'MANUAL_ADMIN',
          total_amount_ars: 16000,
          deposit_amount_ars: 16000,
          total_paid: 16000,
          balance_due: 0,
          internal_notes: 'Semifinal Circuito Indoor Tucumán',
          starts_at: `${today}T20:00:00.000Z`,
          ends_at: `${today}T21:30:00.000Z`,
          courts: { name: 'Cancha Indoor 3 (Blindex)', sport: 'PADEL', slot_duration: 'MIN_90' },
          booking_payments: [{ amount_ars: 16000, payment_method: 'CASH', created_at: `${today}T19:50:00.000Z` }]
        },
        {
          id: 'bs-b-4',
          court_id: 'c-bs-4',
          customer_name: 'Pablo Benítez',
          customer_phone: '+54 9 381 405-9922',
          customer_email: 'pablo@demo.com',
          status: 'CONFIRMED' as BookingStatus,
          origin: 'ONLINE',
          total_amount_ars: 16000,
          deposit_amount_ars: 6000,
          total_paid: 6000,
          balance_due: 10000,
          internal_notes: 'Retador Nocturno Cancha Cristal Pro',
          starts_at: `${today}T21:30:00.000Z`,
          ends_at: `${today}T23:00:00.000Z`,
          courts: { name: 'Cancha Cristal 4 (Pro)', sport: 'PADEL', slot_duration: 'MIN_90' },
          booking_payments: [{ amount_ars: 6000, payment_method: 'MERCADOPAGO', created_at: `${today}T15:00:00.000Z` }]
        }
      ]

    case 'venue-canas':
      return [
        {
          id: 'canas-b-1',
          court_id: 'c2-f1',
          customer_name: 'Luciano Paz (Torneo F5)',
          customer_phone: '+54 9 381 633-4455',
          customer_email: 'luciano@demo.com',
          status: 'CONFIRMED' as BookingStatus,
          origin: 'ONLINE',
          total_amount_ars: 22000,
          deposit_amount_ars: 10000,
          total_paid: 10000,
          balance_due: 12000,
          internal_notes: 'Fútbol 5 nocturno - Traen pelotas propias',
          starts_at: `${today}T19:00:00.000Z`,
          ends_at: `${today}T20:00:00.000Z`,
          courts: { name: 'Fútbol 5 A (Sintético)', sport: 'FUTBOL', slot_duration: 'MIN_60' },
          booking_payments: [{ amount_ars: 10000, payment_method: 'MERCADOPAGO', created_at: `${today}T14:10:00.000Z` }]
        },
        {
          id: 'canas-b-2',
          court_id: 'c2-f2',
          customer_name: 'Juan Manuel Correa',
          customer_phone: '+54 9 381 501-2345',
          customer_email: 'juanma@demo.com',
          status: 'CONFIRMED' as BookingStatus,
          origin: 'MANUAL_ADMIN',
          total_amount_ars: 24000,
          deposit_amount_ars: 12000,
          total_paid: 12000,
          balance_due: 12000,
          internal_notes: 'F5 Techada - Grupo de ex alumnos',
          starts_at: `${today}T20:00:00.000Z`,
          ends_at: `${today}T21:00:00.000Z`,
          courts: { name: 'Fútbol 5 B (Techada)', sport: 'FUTBOL', slot_duration: 'MIN_60' },
          booking_payments: [{ amount_ars: 12000, payment_method: 'TRANSFER', created_at: `${today}T16:00:00.000Z` }]
        },
        {
          id: 'canas-b-3',
          court_id: 'c2-f3',
          customer_name: 'Equipo La Banda FC',
          customer_phone: '+54 9 381 499-7788',
          customer_email: 'labanda@demo.com',
          status: 'CONFIRMED' as BookingStatus,
          origin: 'ONLINE',
          total_amount_ars: 34000,
          deposit_amount_ars: 15000,
          total_paid: 15000,
          balance_due: 19000,
          internal_notes: 'Fútbol 7 Principal - Con vestuarios',
          starts_at: `${today}T21:00:00.000Z`,
          ends_at: `${today}T22:00:00.000Z`,
          courts: { name: 'Fútbol 7 Principal', sport: 'FUTBOL', slot_duration: 'MIN_60' },
          booking_payments: [{ amount_ars: 15000, payment_method: 'MERCADOPAGO', created_at: `${today}T11:20:00.000Z` }]
        },
        {
          id: 'canas-b-4',
          court_id: 'c2-p1',
          customer_name: 'Agustín Navarro',
          customer_phone: '+54 9 381 411-9988',
          customer_email: 'agustin@demo.com',
          status: 'CONFIRMED' as BookingStatus,
          origin: 'ONLINE',
          total_amount_ars: 16000,
          deposit_amount_ars: 8000,
          total_paid: 8000,
          balance_due: 8000,
          internal_notes: 'Pádel 6ta Categoría Las Cañas',
          starts_at: `${today}T18:00:00.000Z`,
          ends_at: `${today}T19:30:00.000Z`,
          courts: { name: 'Pádel 1 (Panorámica)', sport: 'PADEL', slot_duration: 'MIN_90' },
          booking_payments: [{ amount_ars: 8000, payment_method: 'TRANSFER', created_at: `${today}T13:00:00.000Z` }]
        },
        {
          id: 'canas-b-5',
          court_id: 'c2-p2',
          customer_name: 'Lucas Maidana',
          customer_phone: '+54 9 381 577-3344',
          customer_email: 'lucas@demo.com',
          status: 'COMPLETED' as BookingStatus,
          origin: 'MANUAL_ADMIN',
          total_amount_ars: 16000,
          deposit_amount_ars: 16000,
          total_paid: 16000,
          balance_due: 0,
          internal_notes: 'Desafío Pádel - Pagado en cantina',
          starts_at: `${today}T19:30:00.000Z`,
          ends_at: `${today}T21:00:00.000Z`,
          courts: { name: 'Pádel 2 (Blindex)', sport: 'PADEL', slot_duration: 'MIN_90' },
          booking_payments: [{ amount_ars: 16000, payment_method: 'CASH', created_at: `${today}T19:25:00.000Z` }]
        }
      ]

    case 'venue-yb':
    default:
      return [
        {
          id: 'demo-b-1',
          court_id: 'c1-1',
          customer_name: 'Martín Alurralde',
          customer_phone: '+54 9 381 411-2233',
          customer_email: 'martin@demo.com',
          status: 'CONFIRMED' as BookingStatus,
          origin: 'ONLINE',
          total_amount_ars: 18000,
          deposit_amount_ars: 5000,
          total_paid: 5000,
          balance_due: 13000,
          internal_notes: 'Pádel 7ma categoría - Pagó seña por Mercado Pago',
          starts_at: `${today}T18:00:00.000Z`,
          ends_at: `${today}T19:30:00.000Z`,
          courts: { name: 'Cancha 1 (Panorámica)', sport: 'PADEL', slot_duration: 'MIN_90' },
          booking_payments: [{ amount_ars: 5000, payment_method: 'MERCADOPAGO', created_at: `${today}T10:00:00.000Z` }]
        },
        {
          id: 'demo-b-2',
          court_id: 'c1-2',
          customer_name: 'Santiago Terán',
          customer_phone: '+54 9 381 599-8877',
          customer_email: 'santi@demo.com',
          status: 'COMPLETED' as BookingStatus,
          origin: 'MANUAL_ADMIN',
          total_amount_ars: 16000,
          deposit_amount_ars: 16000,
          total_paid: 16000,
          balance_due: 0,
          internal_notes: 'Abonado 100% en efectivo en recepción',
          starts_at: `${today}T19:30:00.000Z`,
          ends_at: `${today}T21:00:00.000Z`,
          courts: { name: 'Cancha 2 (Techada)', sport: 'PADEL', slot_duration: 'MIN_90' },
          booking_payments: [{ amount_ars: 16000, payment_method: 'CASH', created_at: `${today}T19:25:00.000Z` }]
        },
        {
          id: 'demo-b-3',
          court_id: 'c1-3',
          customer_name: 'Facundo Silva',
          customer_phone: '+54 9 381 511-0022',
          customer_email: 'facu@demo.com',
          status: 'CONFIRMED' as BookingStatus,
          origin: 'ONLINE',
          total_amount_ars: 16000,
          deposit_amount_ars: 8000,
          total_paid: 8000,
          balance_due: 8000,
          internal_notes: 'Pareja 4ta Categoría - Torneo Fin de Semana',
          starts_at: `${today}T20:00:00.000Z`,
          ends_at: `${today}T21:30:00.000Z`,
          courts: { name: 'Cancha 3 (Blindex)', sport: 'PADEL', slot_duration: 'MIN_90' },
          booking_payments: [{ amount_ars: 8000, payment_method: 'MERCADOPAGO', created_at: `${today}T14:30:00.000Z` }]
        }
      ]
  }
}
