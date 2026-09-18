// src/config/clubs-catalog.ts
// ==============================================================================
// CATÁLOGO CENTRALIZADO DE CLUBES Y DISPONIBILIDAD — CANCHARCLUB
// ==============================================================================

import { DEFAULT_CLUB_SCHEDULE, type ClubScheduleConfig } from '@/lib/time-slots'

export type SportCategory = 'PADEL' | 'FUTBOL' | 'TENIS' | 'BASQUET'

/**
 * Normaliza cualquier variante de deporte a una de las categorías públicas de la plataforma
 */
export function normalizeToSportCategory(sport?: string | null): SportCategory {
  if (!sport) return 'PADEL'
  const s = sport.toUpperCase().trim().replace(/[\s_-]/g, '')
  if (s.includes('FUTBOL') || s.includes('SOCCER') || s.includes('F5') || s.includes('F7') || s.includes('F11') || s.includes('FUT')) {
    return 'FUTBOL'
  }
  if (s.includes('TENIS') || s.includes('TENNIS')) {
    return 'TENIS'
  }
  if (s.includes('BASQUET') || s.includes('BASKET')) {
    return 'BASQUET'
  }
  return 'PADEL'
}

export interface CourtDefinition {
  id: string
  name: string
  sport: SportCategory
  features: string[]
  pricePerHour: number
  depositPercentage: number // e.g. 0.5 for 50%
  slotDurationMinutes?: number
}

export interface ClubBankDetails {
  bankName: string
  accountHolder: string
  alias: string
  cbu: string
  cuit?: string
}

export interface ClubData {
  id: string
  name: string
  slug: string
  address: string
  city: string
  phone: string
  whatsappPhone: string
  sports: SportCategory[]
  courtsCount: number
  startingPrice: number
  hasLighting: boolean
  isIndoor: boolean
  hasCantina: boolean
  hasParking: boolean
  rating: number
  reviewsCount: number
  availableToday: boolean
  openHours: string
  courts: CourtDefinition[]
  bankDetails?: ClubBankDetails
  paymentMethods?: ('TRANSFER' | 'MERCADOPAGO')[]
  mpConnected?: boolean
  schedule?: ClubScheduleConfig
}

export const CLUBS_DATABASE: ClubData[] = []

export interface GeneratedSlot {
  time: string
  courtId: string
  courtName: string
  sport: SportCategory
  totalPrice: number
  depositPrice: number
  isAvailable: boolean
  features: string[]
}

/**
 * Busca un club por su slug. Si no existe, devuelve una plantilla por defecto con el nombre formateado.
 */
export function getClubBySlug(slug: string): ClubData {
  const normalizedSlug = (slug || '').trim().toLowerCase()
  const found = CLUBS_DATABASE.find(c => c.slug.toLowerCase() === normalizedSlug)
  if (found) return found

  const formattedName = normalizedSlug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())

  return {
    id: `club-${normalizedSlug}`,
    name: formattedName || 'Club Deportivo',
    slug: normalizedSlug,
    address: 'Argentina',
    city: 'Argentina',
    phone: '',
    whatsappPhone: '',
    sports: [],
    courtsCount: 0,
    startingPrice: 0,
    hasLighting: false,
    isIndoor: false,
    hasCantina: false,
    hasParking: false,
    rating: 5.0,
    reviewsCount: 0,
    availableToday: true,
    openHours: '08:00 a 00:00 hs',
    courts: []
  }
}

/**
 * Genera la grilla de turnos para un club y deporte dado respetando el horario de apertura y cierre
 */
export function generateClubSlots(club: ClubData, sport: SportCategory): GeneratedSlot[] {
  const targetCategory = normalizeToSportCategory(sport)
  const matchingCourts = club.courts.filter(c => normalizeToSportCategory(c.sport) === targetCategory)
  if (matchingCourts.length === 0) return []

  const opening = club.schedule?.opening_time || DEFAULT_CLUB_SCHEDULE.opening_time
  const closing = club.schedule?.closing_time || DEFAULT_CLUB_SCHEDULE.closing_time

  const [startH, startM] = opening.split(':').map(Number)
  const [endH, endM] = closing.split(':').map(Number)
  const startMins = startH * 60 + (startM || 0)
  let endMins = endH * 60 + (endM || 0)
  if (endMins < startMins) endMins += 24 * 60

  const slots: GeneratedSlot[] = []

  matchingCourts.forEach((court, courtIndex) => {
    const isCourtPadel = normalizeToSportCategory(court.sport) === 'PADEL'
    const duration = court.slotDurationMinutes || (isCourtPadel ? 90 : 60)
    // Si hay más de una cancha y duración 90m, escalonar 30 min la cancha secundaria para flujo parejo
    const courtOffset = (matchingCourts.length > 1 && duration === 90 && courtIndex % 2 === 1) ? 30 : 0
    const courtStart = startMins + courtOffset

    for (let m = courtStart; m <= endMins; m += duration) {
      const totalMinutes = m % (24 * 60)
      const hh = Math.floor(totalMinutes / 60).toString().padStart(2, '0')
      const mm = (totalMinutes % 60).toString().padStart(2, '0')
      const time = `${hh}:${mm}`

      const totalPrice = court.pricePerHour
      const depositPrice = Math.round(totalPrice * court.depositPercentage)

      slots.push({
        time,
        courtId: court.id,
        courtName: court.name,
        sport: normalizeToSportCategory(court.sport),
        totalPrice,
        depositPrice,
        isAvailable: true,
        features: court.features
      })
    }
  })

  // Ordenar por horario y luego por nombre de cancha
  return slots.sort((a, b) => a.time.localeCompare(b.time) || a.courtName.localeCompare(b.courtName))
}

/**
 * Obtiene los datos bancarios del club para transferencias de seña directas
 */
export function getClubBankDetails(club: ClubData): ClubBankDetails {
  if (club.bankDetails) return club.bankDetails
  const cleanSlug = club.slug.replace(/[^a-z0-9]/g, '')
  return {
    bankName: 'Mercado Pago / Transferencia Directa',
    accountHolder: club.name,
    alias: `${cleanSlug}.mp`,
    cbu: '0000003100098765432100',
  }
}
