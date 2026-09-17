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
    startingPrice: 18000,
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
      { id: 'c1-1', name: 'Cancha 1 (Panorámica)', sport: 'PADEL', features: ['Panorámica', 'Cristal 12mm', 'LED Pro'], pricePerHour: 18000, depositPercentage: 0.5 },
      { id: 'c1-2', name: 'Cancha 2 (Techada)', sport: 'PADEL', features: ['Techada', 'Indoor', 'Césped Azul'], pricePerHour: 18000, depositPercentage: 0.5 },
      { id: 'c1-3', name: 'Cancha 3 (Blindex)', sport: 'PADEL', features: ['Blindex Pro', 'Foco LED'], pricePerHour: 18000, depositPercentage: 0.5 },
    ]
  },
  {
    id: 'c2',
    name: 'Complejo Deportivo Las Cañas',
    slug: 'las-canas',
    address: 'Av. Perón y Bascary',
    city: 'Yerba Buena, Tucumán',
    phone: '+54 9 381 555-4321',
    whatsappPhone: '5493815554321',
    sports: ['FUTBOL', 'PADEL'],
    courtsCount: 8,
    startingPrice: 16000,
    hasLighting: true,
    isIndoor: true,
    hasCantina: true,
    hasParking: true,
    rating: 4.8,
    reviewsCount: 230,
    availableToday: true,
    openHours: '08:00 a 01:00 hs',
    courts: [
      { id: 'c2-f1', name: 'Cancha Fútbol 5 A', sport: 'FUTBOL', features: ['Césped Sintético 40mm', 'Iluminación LED'], pricePerHour: 20000, depositPercentage: 0.5 },
      { id: 'c2-f2', name: 'Cancha Fútbol 5 B (Techada)', sport: 'FUTBOL', features: ['Techada', 'Pelotas Incluidas'], pricePerHour: 22000, depositPercentage: 0.5 },
      { id: 'c2-f3', name: 'Cancha Fútbol 7', sport: 'FUTBOL', features: ['Fútbol 7', 'Césped FIFA Quality', 'Vestuarios'], pricePerHour: 32000, depositPercentage: 0.5 },
      { id: 'c2-p1', name: 'Cancha Pádel 1 (Panorámica)', sport: 'PADEL', features: ['Panorámica', 'Césped Texturizado'], pricePerHour: 16000, depositPercentage: 0.5 },
      { id: 'c2-p2', name: 'Cancha Pádel 2 (Blindex)', sport: 'PADEL', features: ['Blindex', 'Techada'], pricePerHour: 16000, depositPercentage: 0.5 },
      { id: 'c2-p3', name: 'Cancha Pádel 3 (Central)', sport: 'PADEL', features: ['Tribunas', 'Iluminación Pro'], pricePerHour: 18000, depositPercentage: 0.5 },
    ]
  },
  {
    id: 'c3',
    name: 'Tucumán Lawn Tennis Club',
    slug: 'lawn-tennis',
    address: 'Parque 9 de Julio',
    city: 'San Miguel de Tucumán',
    phone: '+54 9 381 422-7890',
    whatsappPhone: '5493814227890',
    sports: ['TENIS', 'PADEL'],
    courtsCount: 6,
    startingPrice: 14000,
    hasLighting: true,
    isIndoor: false,
    hasCantina: true,
    hasParking: true,
    rating: 4.9,
    reviewsCount: 310,
    availableToday: true,
    openHours: '07:30 a 23:00 hs',
    courts: [
      { id: 'c3-t1', name: 'Cancha Tenis 1 (Polvo de Ladrillo)', sport: 'TENIS', features: ['Polvo de Ladrillo', 'Iluminación LED'], pricePerHour: 14000, depositPercentage: 0.5 },
      { id: 'c3-t2', name: 'Cancha Tenis 2 (Polvo de Ladrillo)', sport: 'TENIS', features: ['Polvo de Ladrillo', 'Sombra Natural'], pricePerHour: 14000, depositPercentage: 0.5 },
      { id: 'c3-t3', name: 'Cancha Tenis 3 (Rápida / Hard)', sport: 'TENIS', features: ['Superficie Rápida', 'Luces LED'], pricePerHour: 15000, depositPercentage: 0.5 },
      { id: 'c3-p1', name: 'Cancha Pádel 1', sport: 'PADEL', features: ['Panorámica', 'Césped Verde'], pricePerHour: 15000, depositPercentage: 0.5 },
      { id: 'c3-p2', name: 'Cancha Pádel 2', sport: 'PADEL', features: ['Blindex Pro'], pricePerHour: 15000, depositPercentage: 0.5 },
    ]
  },
  {
    id: 'c4',
    name: 'San Martín Arena Pádel',
    slug: 'san-martin-arena',
    address: 'Bolívar 1960',
    city: 'San Miguel de Tucumán',
    phone: '+54 9 381 488-9900',
    whatsappPhone: '5493814889900',
    sports: ['PADEL'],
    courtsCount: 2,
    startingPrice: 15000,
    hasLighting: true,
    isIndoor: true,
    hasCantina: true,
    hasParking: false,
    rating: 4.7,
    reviewsCount: 98,
    availableToday: true,
    openHours: '09:00 a 00:00 hs',
    courts: [
      { id: 'c4-p1', name: 'Cancha 1 Arena (Techada)', sport: 'PADEL', features: ['Techada', 'Panorámica WPT'], pricePerHour: 15000, depositPercentage: 0.5 },
      { id: 'c4-p2', name: 'Cancha 2 Arena (Techada)', sport: 'PADEL', features: ['Techada', 'Césped Azul Pro'], pricePerHour: 15000, depositPercentage: 0.5 },
    ]
  },
  {
    id: 'c5',
    name: 'Predio Golazo Fútbol',
    slug: 'golazo-futbol',
    address: 'Ruta 9 Km 1302',
    city: 'Tafí Viejo, Tucumán',
    phone: '+54 9 381 477-3322',
    whatsappPhone: '5493814773322',
    sports: ['FUTBOL'],
    courtsCount: 4,
    startingPrice: 22000,
    hasLighting: true,
    isIndoor: false,
    hasCantina: true,
    hasParking: true,
    rating: 4.6,
    reviewsCount: 85,
    availableToday: true,
    openHours: '14:00 a 01:00 hs',
    courts: [
      { id: 'c5-f1', name: 'Cancha Fútbol 5 (Estadio)', sport: 'FUTBOL', features: ['Césped Sintético Nuevo', 'Reflectores LED'], pricePerHour: 22000, depositPercentage: 0.5 },
      { id: 'c5-f2', name: 'Cancha Fútbol 5 (Norte)', sport: 'FUTBOL', features: ['Césped Sintético 45mm'], pricePerHour: 22000, depositPercentage: 0.5 },
      { id: 'c5-f3', name: 'Cancha Fútbol 7 Principal', sport: 'FUTBOL', features: ['Fútbol 7', 'Tribuna Techada', 'Parrillas'], pricePerHour: 34000, depositPercentage: 0.5 },
    ]
  },
  {
    id: 'c6',
    name: 'Club Atlético & Social Villa Luján',
    slug: 'villa-lujan-basquet',
    address: 'Don Bosco 2280',
    city: 'San Miguel de Tucumán',
    phone: '+54 9 381 433-2211',
    whatsappPhone: '5493814332211',
    sports: ['BASQUET', 'FUTBOL'],
    courtsCount: 3,
    startingPrice: 20000,
    hasLighting: true,
    isIndoor: true,
    hasCantina: true,
    hasParking: true,
    rating: 4.8,
    reviewsCount: 112,
    availableToday: true,
    openHours: '08:00 a 23:30 hs',
    courts: [
      { id: 'c6-b1', name: 'Microestadio Básquet (Parquet)', sport: 'BASQUET', features: ['Piso de Parquet Flotante', 'Tableros de Acrílico'], pricePerHour: 25000, depositPercentage: 0.5 },
      { id: 'c6-f1', name: 'Cancha Futsal / Fútbol 5', sport: 'FUTBOL', features: ['Techada', 'Piso Alisado Pro'], pricePerHour: 20000, depositPercentage: 0.5 },
    ]
  },
  {
    id: 'c7',
    name: 'Complejo El Rincón Tenis',
    slug: 'el-rincon-tenis',
    address: 'Camino del Perú 1050',
    city: 'Yerba Buena, Tucumán',
    phone: '+54 9 381 466-1188',
    whatsappPhone: '5493814661188',
    sports: ['TENIS'],
    courtsCount: 4,
    startingPrice: 15000,
    hasLighting: true,
    isIndoor: false,
    hasCantina: true,
    hasParking: true,
    rating: 4.7,
    reviewsCount: 76,
    availableToday: true,
    openHours: '08:00 a 23:00 hs',
    courts: [
      { id: 'c7-t1', name: 'Cancha Tenis 1 (Polvo de Ladrillo)', sport: 'TENIS', features: ['Polvo de Ladrillo', 'Luces LED'], pricePerHour: 15000, depositPercentage: 0.5 },
      { id: 'c7-t2', name: 'Cancha Tenis 2 (Polvo de Ladrillo)', sport: 'TENIS', features: ['Polvo de Ladrillo', 'Césped Perimetral'], pricePerHour: 15000, depositPercentage: 0.5 },
      { id: 'c7-t3', name: 'Cancha Tenis 3 (Rápida)', sport: 'TENIS', features: ['Pista Dura', 'Iluminación Pro'], pricePerHour: 16000, depositPercentage: 0.5 },
    ]
  },
  {
    id: 'c8',
    name: 'Estadio Polideportivo Central',
    slug: 'polideportivo-central',
    address: 'Av. Benjamín Aráoz 800',
    city: 'San Miguel de Tucumán',
    phone: '+54 9 381 499-5566',
    whatsappPhone: '5493814995566',
    sports: ['BASQUET', 'FUTBOL'],
    courtsCount: 2,
    startingPrice: 24000,
    hasLighting: true,
    isIndoor: true,
    hasCantina: true,
    hasParking: true,
    rating: 4.5,
    reviewsCount: 64,
    availableToday: true,
    openHours: '08:00 a 00:00 hs',
    courts: [
      { id: 'c8-b1', name: 'Gimnasio Principal Básquet', sport: 'BASQUET', features: ['Techada', 'Parquet', 'Tableros Pro'], pricePerHour: 26000, depositPercentage: 0.5 },
      { id: 'c8-f1', name: 'Cancha Fútbol 5 Sintético', sport: 'FUTBOL', features: ['Techada', 'Césped 50mm'], pricePerHour: 24000, depositPercentage: 0.5 },
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
