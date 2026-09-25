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

export interface ClubSocialLinks {
  instagram?: string
  facebook?: string
  tiktok?: string
}

export interface ClubServicesConfig {
  parking?: boolean           // Estacionamiento para jugadores/socios
  cantina?: boolean           // Cantina, buffet, bar y cafetería
  showers?: boolean           // Duchas y vestuarios
  cameras?: boolean           // Cámaras para ver partidos en vivo o grabar jugadas
  lighting?: boolean          // Iluminación LED profesional
  indoor?: boolean            // Canchas techadas / cubiertas
  grill?: boolean             // Parrilla / Quincho para tercer tiempo
  wifi?: boolean              // Wi-Fi libre de alta velocidad
  equipment_rental?: boolean  // Alquiler de paletas o pelotas
}

export interface ClubLocationConfig {
  address?: string
  city?: string
  province?: string
  reference?: string
  google_maps_url?: string
}

export interface ClubServicesAndLocationData {
  services: ClubServicesConfig
  location: ClubLocationConfig
}

/**
 * Extrae la URL limpia de Google Maps Embed si el usuario pegó la etiqueta iframe completa o una URL directa de embed
 */
export function extractGoogleMapsEmbedUrl(raw?: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Si pegaron la etiqueta <iframe> de Google Maps (Compartir -> Insertar un mapa)
  const iframeMatch = trimmed.match(/src=["'](https:\/\/(?:www\.)?google\.com\/maps\/embed[^"']+)["']/i)
  if (iframeMatch && iframeMatch[1]) {
    return iframeMatch[1]
  }

  // Si pegaron directamente la URL de embed
  if (/^https:\/\/(?:www\.)?google\.com\/maps\/embed/i.test(trimmed)) {
    return trimmed
  }

  return null
}

/**
 * Extrae coordenadas de una URL de Google Maps (@lat,lon o ?q=lat,lon o ll=lat,lon)
 */
export function extractCoordsFromGoogleMapsUrl(raw?: string | null): { lat: number; lon: number } | null {
  if (!raw) return null
  const trimmed = raw.trim()

  const atMatch = trimmed.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (atMatch) {
    const lat = parseFloat(atMatch[1])
    const lon = parseFloat(atMatch[2])
    if (!isNaN(lat) && !isNaN(lon)) return { lat, lon }
  }

  const qMatch = trimmed.match(/[?&](?:q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (qMatch) {
    const lat = parseFloat(qMatch[1])
    const lon = parseFloat(qMatch[2])
    if (!isNaN(lat) && !isNaN(lon)) return { lat, lon }
  }

  return null
}

/**
 * Genera una URL de incrustación de OpenStreetMap para coordenadas dadas (nunca bloqueada por iframes)
 */
export function buildOsmEmbedUrl(lat: number, lon: number, delta = 0.006): string {
  const minLon = (lon - delta).toFixed(6)
  const minLat = (lat - delta / 1.5).toFixed(6)
  const maxLon = (lon + delta).toFixed(6)
  const maxLat = (lat + delta / 1.5).toFixed(6)
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik&marker=${lat}%2C${lon}`
}

/**
 * Genera la URL para incrustar el mapa interactivo de forma segura y sin bloqueos de iframe.
 * Prioriza el embed oficial de Google Maps si fue provisto; de lo contrario utiliza OpenStreetMap.
 */
export function getGoogleMapsEmbedUrl(location: {
  address?: string
  city?: string
  province?: string
  google_maps_url?: string
  coords?: { lat: number; lon: number } | null
}): string {
  // 1. Si hay un embed oficial de Google Maps (Compartir > Insertar un mapa), usarlo directamente
  const officialEmbed = extractGoogleMapsEmbedUrl(location.google_maps_url)
  if (officialEmbed) {
    return officialEmbed
  }

  // 2. Si se suministraron coordenadas o se pueden extraer del enlace de Google Maps
  const coords = location.coords || extractCoordsFromGoogleMapsUrl(location.google_maps_url)
  if (coords) {
    return buildOsmEmbedUrl(coords.lat, coords.lon)
  }

  return ''
}

/**
 * Genera el enlace de navegación para abrir directamente en Google Maps
 */
export function getGoogleMapsDirectUrl(location: { address?: string; city?: string; province?: string; google_maps_url?: string }): string {
  if (location.google_maps_url && location.google_maps_url.trim()) {
    const raw = location.google_maps_url.trim()
    // Si era un iframe, extraer la URL o recurrir a la búsqueda
    const cleanEmbed = extractGoogleMapsEmbedUrl(raw)
    if (cleanEmbed) {
      return cleanEmbed
    }
    if (/^https?:\/\//i.test(raw)) return raw
    return `https://${raw}`
  }

  const queryParts = [location.address, location.city, location.province || 'Argentina'].filter(Boolean)
  const query = queryParts.join(', ')
  if (!query) return 'https://maps.google.com'

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/**
 * Genera el enlace de navegación para abrir en Waze
 */
export function getWazeDirectUrl(location: { address?: string; city?: string; province?: string; google_maps_url?: string; coords?: { lat: number; lon: number } | null }): string {
  const coords = location.coords || extractCoordsFromGoogleMapsUrl(location.google_maps_url)
  if (coords) {
    return `https://waze.com/ul?ll=${coords.lat},${coords.lon}&navigate=yes`
  }

  const queryParts = [location.address, location.city, location.province || 'Argentina'].filter(Boolean)
  const query = queryParts.join(', ')
  if (!query) return 'https://waze.com'
  return `https://waze.com/ul?q=${encodeURIComponent(query)}`
}

/**
 * Normaliza cualquier entrada de red social (handle, @handle, url corta o completa) a una URL válida
 */
export function normalizeSocialUrl(platform: 'instagram' | 'facebook' | 'tiktok', input?: string | null): string {
  if (!input) return ''
  let val = input.trim()
  if (!val) return ''

  // Si ya tiene protocolo http o https
  if (/^https?:\/\//i.test(val)) {
    return val
  }

  // Si comienza con www.
  if (/^www\./i.test(val)) {
    return `https://${val}`
  }

  // Si comienza con dominio directo
  if (/^(instagram\.com|facebook\.com|tiktok\.com|fb\.com)/i.test(val)) {
    return `https://${val}`
  }

  // Quitar arroba si fue provista
  val = val.replace(/^@+/, '')

  switch (platform) {
    case 'instagram':
      return `https://instagram.com/${val}`
    case 'facebook':
      return `https://facebook.com/${val}`
    case 'tiktok':
      return `https://tiktok.com/@${val}`
  }
}

/**
 * Extrae un nombre de usuario o handle legible para mostrar en badges o píldoras
 */
export function extractSocialHandle(platform: 'instagram' | 'facebook' | 'tiktok', urlOrHandle?: string | null): string {
  if (!urlOrHandle) return ''
  const trimmed = urlOrHandle.trim()
  if (!trimmed) return ''

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed)
      const path = parsed.pathname.replace(/^\/+|\/+$/g, '')
      if (platform === 'tiktok') {
        return path ? (path.startsWith('@') ? path : `@${path}`) : ''
      }
      return path ? `@${path}` : ''
    }
  } catch {}

  const clean = trimmed.replace(/^@+/, '')
  return clean ? `@${clean}` : ''
}

export interface ClubData {
  id: string
  name: string
  slug: string
  address: string
  city: string
  province?: string
  exactAddress?: string
  addressReference?: string
  googleMapsUrl?: string
  phone: string
  whatsappPhone: string
  sports: SportCategory[]
  courtsCount: number
  startingPrice: number
  hasLighting: boolean
  isIndoor: boolean
  hasCantina: boolean
  hasParking: boolean
  hasShowers?: boolean
  hasCameras?: boolean
  hasGrill?: boolean
  hasWifi?: boolean
  hasEquipmentRental?: boolean
  services?: ClubServicesConfig
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
  subscriptionStatus?: string
  isActive?: boolean
  highlightText?: string
  highlightBadge?: string
  isHighlightActive?: boolean
  socialLinks?: ClubSocialLinks
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
    hasShowers: false,
    hasCameras: false,
    hasGrill: false,
    hasWifi: false,
    hasEquipmentRental: false,
    services: {
      parking: false,
      cantina: false,
      showers: false,
      cameras: false,
      lighting: false,
      indoor: false,
      grill: false,
      wifi: false,
      equipment_rental: false,
    },
    exactAddress: '',
    addressReference: '',
    googleMapsUrl: '',
    province: 'Argentina',
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
 * Obtiene los datos bancarios del club para transferencias de seña directas.
 * Retorna undefined si el club aún no ha configurado sus datos bancarios.
 */
export function getClubBankDetails(club: ClubData): ClubBankDetails | undefined {
  if (club.bankDetails && (club.bankDetails.alias || club.bankDetails.cbu)) {
    return club.bankDetails
  }
  return undefined
}
