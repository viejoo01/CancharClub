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

export interface PriceRuleDefinition {
  id: string
  courtId?: string | null
  name: string
  dayOfWeek: number[]
  timeFrom: string
  timeTo: string
  priceArs: number
  depositPct: number
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
  priceRules?: PriceRuleDefinition[]
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
    courts: [],
    priceRules: []
  }
}

/**
 * Genera la grilla de turnos para un club y deporte dado respetando el horario de apertura, cierre
 * y aplicando las tarifas dinámicas reales según día de la semana y franja horaria.
 */
export function generateClubSlots(
  club: ClubData,
  sport: SportCategory,
  targetDate?: string
): GeneratedSlot[] {
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

  // Determinar día de la semana correspondiente a targetDate (0 = Dom, 1 = Lun, ..., 6 = Sáb)
  let dayOfWeek = new Date().getDay()
  if (targetDate) {
    const parts = targetDate.split('-').map(Number)
    if (parts.length === 3) {
      dayOfWeek = new Date(parts[0], parts[1] - 1, parts[2]).getDay()
    }
  }

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

      // Calcular precio dinámico según reglas de tarifas configuradas por el club
      let totalPrice = court.pricePerHour
      let depositPct = court.depositPercentage || 0.5

      if (club.priceRules && club.priceRules.length > 0) {
        // Filtrar reglas que correspondan a esta cancha (o aplicables a todas) y a este día de la semana
        const applicableRules = club.priceRules.filter(rule => {
          const matchesCourt = !rule.courtId || rule.courtId === court.id
          const matchesDay = !rule.dayOfWeek || rule.dayOfWeek.length === 0 || (Array.isArray(rule.dayOfWeek) && rule.dayOfWeek.includes(dayOfWeek))
          return matchesCourt && matchesDay
        })

        // Buscar regla donde el horario del turno esté contenido en [timeFrom, timeTo]
        const matchingRule = applicableRules
          .filter(rule => time >= rule.timeFrom && time <= rule.timeTo)
          .sort((a, b) => b.timeFrom.localeCompare(a.timeFrom))[0]

        if (matchingRule) {
          totalPrice = matchingRule.priceArs
          depositPct = (matchingRule.depositPct || 50) / 100
        } else if (applicableRules.length > 0) {
          // Si no hubo coincidencia horaria estricta en el día, aplicar la tarifa más cercana del día
          totalPrice = applicableRules[0].priceArs
          depositPct = (applicableRules[0].depositPct || 50) / 100
        } else {
          // Si no hay regla específica configurada para este día (ej: fin de semana aún no diferenciado),
          // heredar la franja horaria correspondiente de la cancha
          const courtRules = club.priceRules.filter(rule => !rule.courtId || rule.courtId === court.id)
          const timeFallback = courtRules
            .filter(rule => time >= rule.timeFrom && time <= rule.timeTo)
            .sort((a, b) => b.timeFrom.localeCompare(a.timeFrom))[0]
          if (timeFallback) {
            totalPrice = timeFallback.priceArs
            depositPct = (timeFallback.depositPct || 50) / 100
          }
        }
      }

      const depositPrice = Math.round(totalPrice * depositPct)

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
