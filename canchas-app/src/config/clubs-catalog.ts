// src/config/clubs-catalog.ts
// ==============================================================================
// CATÁLOGO CENTRALIZADO DE CLUBES Y DISPONIBILIDAD — CANCHARCLUB
// ==============================================================================

export type SportCategory = 'PADEL' | 'FUTBOL' | 'TENIS' | 'BASQUET'

export interface CourtDefinition {
  id: string
  name: string
  sport: SportCategory
  features: string[]
  pricePerHour: number
  depositPercentage: number // e.g. 0.5 for 50%
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
 * Genera la grilla de turnos para un club y deporte dado
 */
export function generateClubSlots(club: ClubData, sport: SportCategory): GeneratedSlot[] {
  const matchingCourts = club.courts.filter(c => c.sport === sport)
  if (matchingCourts.length === 0) return []

  // Horarios estándar del día
  const timeSlots = ['16:00', '17:30', '18:00', '19:00', '19:30', '20:30', '21:00', '22:00', '22:30', '23:00']
  const slots: GeneratedSlot[] = []

  // Generamos turnos disponibles
  matchingCourts.forEach((court) => {
    timeSlots.forEach((time) => {
      const isOccupied = false

      const totalPrice = court.pricePerHour
      const depositPrice = Math.round(totalPrice * court.depositPercentage)

      slots.push({
        time,
        courtId: court.id,
        courtName: court.name,
        sport: court.sport,
        totalPrice,
        depositPrice,
        isAvailable: !isOccupied,
        features: court.features
      })
    })
  })

  // Ordenar por horario
  return slots.sort((a, b) => a.time.localeCompare(b.time))
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
