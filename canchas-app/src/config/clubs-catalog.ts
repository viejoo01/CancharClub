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

export const CLUBS_DATABASE: ClubData[] = [
  {
    id: 'c1',
    name: 'Club Pádel Central',
    slug: 'padel-central',
    address: 'Av. Aconquija 2400',
    city: 'Yerba Buena, Tucumán',
    phone: '+54 9 381 412-3456',
    whatsappPhone: '5493814123456',
    sports: ['PADEL'],
    courtsCount: 3,
    startingPrice: 14000,
    hasLighting: true,
    isIndoor: true,
    hasCantina: true,
    hasParking: true,
    rating: 4.9,
    reviewsCount: 142,
    availableToday: true,
    openHours: '08:00 a 00:00 hs',
    bankDetails: {
      bankName: 'Mercado Pago / Banco Galicia',
      accountHolder: 'Club Pádel Central SRL',
      alias: 'padelcentral.mp',
      cbu: '0000003100098765432101',
      cuit: '30-71234567-9',
    },
    paymentMethods: ['TRANSFER'],
    mpConnected: false,
    courts: [
      { id: 'c1-1', name: 'Cancha 1 (Panorámica)', sport: 'PADEL', features: ['Panorámica', 'Cristal 12mm', 'LED Pro'], pricePerHour: 14000, depositPercentage: 0.5 },
      { id: 'c1-2', name: 'Cancha 2 (Techada)', sport: 'PADEL', features: ['Techada', 'Indoor', 'Césped Azul'], pricePerHour: 14000, depositPercentage: 0.5 },
      { id: 'c1-3', name: 'Cancha 3 (Blindex)', sport: 'PADEL', features: ['Blindex Pro', 'Foco LED'], pricePerHour: 14000, depositPercentage: 0.5 },
    ]
  }
]

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

  // Plantilla amigable si el slug es nuevo (ej. creado desde superadmin)
  const formattedName = normalizedSlug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())

  return {
    id: `club-${normalizedSlug}`,
    name: formattedName || 'Club Deportivo',
    slug: normalizedSlug,
    address: 'Tucumán, Argentina',
    city: 'San Miguel de Tucumán',
    phone: '+54 9 381 400-0000',
    whatsappPhone: '5493814000000',
    sports: ['PADEL', 'FUTBOL'],
    courtsCount: 3,
    startingPrice: 16000,
    hasLighting: true,
    isIndoor: true,
    hasCantina: true,
    hasParking: true,
    rating: 4.8,
    reviewsCount: 45,
    availableToday: true,
    openHours: '08:00 a 00:00 hs',
    courts: [
      { id: 'c-auto-1', name: 'Cancha 1 (Techada)', sport: 'FUTBOL', features: ['Césped Sintético', 'Iluminación LED'], pricePerHour: 20000, depositPercentage: 0.5 },
      { id: 'c-auto-2', name: 'Cancha 2 (Panorámica)', sport: 'PADEL', features: ['Panorámica', 'Cristal 12mm'], pricePerHour: 16000, depositPercentage: 0.5 },
    ]
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
