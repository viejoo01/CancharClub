// src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, addMinutes } from 'date-fns'
import { es } from 'date-fns/locale'
import type { SlotDuration, SportType, BookingStatus, PaymentMethod } from '@/types/database'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function setClientCookie(name: string, value: string, maxAge = 86400) {
  if (typeof document !== 'undefined') {
    document.cookie = `${name}=${value}; path=/; max-age=${maxAge}`
  }
}

// ─── Formato de fechas ────────────────────────────────────────────────────────

export function formatDate(iso: string, pattern = 'dd/MM/yyyy') {
  return format(parseISO(iso), pattern, { locale: es })
}

export function formatTime(iso: string) {
  return format(parseISO(iso), 'HH:mm', { locale: es })
}

export function formatDateTime(iso: string) {
  return format(parseISO(iso), "dd/MM/yyyy 'a las' HH:mm", { locale: es })
}

export function formatDateLong(iso: string) {
  return format(parseISO(iso), "EEEE d 'de' MMMM yyyy", { locale: es })
}

// ─── Duración de slot → minutos ───────────────────────────────────────────────

export function slotDurationToMinutes(duration: SlotDuration): number {
  const map: Record<SlotDuration, number> = {
    MIN_60: 60,
    MIN_90: 90,
    MIN_120: 120,
  }
  return map[duration]
}

export function slotDurationLabel(duration: SlotDuration): string {
  const map: Record<SlotDuration, string> = {
    MIN_60: '1 hora',
    MIN_90: '1:30 hs',
    MIN_120: '2 horas',
  }
  return map[duration]
}

/** Calcula ends_at a partir de starts_at y la duración del slot */
export function computeEndsAt(startsAt: string, duration: SlotDuration): string {
  const mins = slotDurationToMinutes(duration)
  return addMinutes(parseISO(startsAt), mins).toISOString()
}

// ─── Labels legibles ──────────────────────────────────────────────────────────

export function sportLabel(sport: SportType): string {
  const map: Record<SportType, string> = {
    PADEL: 'Pádel',
    FUTBOL_5: 'Fútbol 5',
    FUTBOL_7: 'Fútbol 7',
    FUTBOL5: 'Fútbol 5',
    FUTBOL7: 'Fútbol 7',
    TENIS: 'Tenis',
    SQUASH: 'Squash',
    BASQUET: 'Básquet',
    OTHER: 'Otro',
  }
  return map[sport] ?? sport
}

export function bookingStatusLabel(status: BookingStatus): string {
  const map: Record<BookingStatus, string> = {
    SLOT_LOCKED: 'Bloqueado (checkout)',
    PENDING_DEPOSIT: 'Seña pendiente',
    DEPOSIT_PAID: 'Seña abonada',
    CONFIRMED: 'Confirmado',
    PARTIAL_PAID: 'Pago parcial',
    FULLY_PAID: 'Pagado',
    CANCELLED_USER: 'Cancelado por jugador',
    CANCELLED_CLUB: 'Cancelado por club',
    RAIN_CANCELLED: 'Suspendido por lluvia',
    NO_SHOW: 'No se presentó',
    COMPLETED: 'Completado',
  }
  return map[status] ?? status
}

export function bookingStatusColor(status: BookingStatus): string {
  const map: Record<BookingStatus, string> = {
    SLOT_LOCKED: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    PENDING_DEPOSIT: 'bg-orange-100 text-orange-800 border-orange-300',
    DEPOSIT_PAID: 'bg-blue-100 text-blue-800 border-blue-300',
    CONFIRMED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    PARTIAL_PAID: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    FULLY_PAID: 'bg-green-100 text-green-800 border-green-300',
    CANCELLED_USER: 'bg-gray-100 text-gray-500 border-gray-200',
    CANCELLED_CLUB: 'bg-red-100 text-red-800 border-red-300',
    RAIN_CANCELLED: 'bg-sky-100 text-sky-800 border-sky-300',
    NO_SHOW: 'bg-slate-100 text-slate-600 border-slate-200',
    COMPLETED: 'bg-purple-100 text-purple-800 border-purple-300',
  }
  return map[status] ?? 'bg-gray-100 text-gray-600'
}

export function paymentMethodLabel(method: string | PaymentMethod): string {
  const m = String(method || '').toUpperCase()
  if (m.includes('CASH') || m === 'EFECTIVO') return 'Efectivo'
  if (m.includes('TRANSFER') || m.includes('BANK')) return 'Transferencia'
  if (m.includes('MERCADO') || m.includes('MP')) return 'Mercado Pago'
  if (m.includes('DEBIT')) return 'Tarjeta Débito'
  if (m.includes('CREDIT')) return 'Tarjeta Crédito'
  if (m.includes('CARD') || m === 'TARJETA') return 'Tarjeta'
  if (m.includes('QR')) return 'QR Mercado Pago'
  if (m === 'OTHER' || m === 'OTRO') return 'Otro'
  return 'Efectivo'
}

/**
 * Traduce y normaliza notas internas eliminando identificadores en inglés (TRANSFER, CASH, etc.)
 * y dando formato estándar argentino (24hs, viñetas limpias, sin guiones sueltos).
 */
export function cleanNoteForDisplay(notes: string | undefined | null): string {
  if (!notes) return ''
  let cleaned = notes
    // Traducir identificadores y siglas técnicas en inglés a español
    .replace(/\(TRANSFER\)/gi, '(Transferencia)')
    .replace(/\(TRANSFERENCIA\)/gi, '(Transferencia)')
    .replace(/\(CASH\)/gi, '(Efectivo)')
    .replace(/\(EFECTIVO\)/gi, '(Efectivo)')
    .replace(/\(MERCADOPAGO\)/gi, '(Mercado Pago)')
    .replace(/\(MERCADO PAGO\)/gi, '(Mercado Pago)')
    .replace(/\(MP\)/gi, '(Mercado Pago)')
    .replace(/\(CARD\)/gi, '(Tarjeta)')
    .replace(/\(DEBIT_CARD\)/gi, '(Tarjeta Débito)')
    .replace(/\(CREDIT_CARD\)/gi, '(Tarjeta Crédito)')
    .replace(/\bTRANSFER\b/gi, 'Transferencia')
    .replace(/\bCASH\b/gi, 'Efectivo')
    .replace(/\bDEPOSIT\b/gi, 'Seña')
    .replace(/\bBALANCE\b/gi, 'Saldo')
    .replace(/\bNO-SHOW\b/gi, 'No asistió')
    .replace(/\bNO SHOW\b/gi, 'No asistió')
    .replace(/\bCONFIRMED\b/gi, 'Confirmado')
    .replace(/\bPENDING\b/gi, 'Pendiente')
    .replace(/\bCANCELLED\b/gi, 'Cancelado')
    .replace(/\bCANCELED\b/gi, 'Cancelado')
    // Normalizar horas en formato 12h (p. m. / a. m. / pm / am) a formato estándar argentino de 24 hs
    .replace(/(\d{1,2}):(\d{2})\s*(?:p\.\s*m\.|pm)\s*(?:hs)?/gi, (_, h, m) => {
      const hour = parseInt(h, 10)
      const hour24 = hour === 12 ? 12 : hour + 12
      return `${String(hour24).padStart(2, '0')}:${m} hs`
    })
    .replace(/(\d{1,2}):(\d{2})\s*(?:a\.\s*m\.|am)\s*(?:hs)?/gi, (_, h, m) => {
      const hour = parseInt(h, 10)
      const hour24 = hour === 12 ? 0 : hour
      return `${String(hour24).padStart(2, '0')}:${m} hs`
    })
    // Convertir timestamps ISO [YYYY-MM-DDTHH:mm:ss.sssZ] a hora local argentina (UTC-3)
    .replace(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\]/gi, (_, iso) => {
      try {
        const d = new Date(iso)
        if (isNaN(d.getTime())) return ''
        const timeStr = d.toLocaleTimeString('es-AR', {
          timeZone: 'America/Argentina/Buenos_Aires',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
        return `a las ${timeStr} hs`
      } catch {
        return ''
      }
    })
    // Formatear montos sin separador de miles: $12500 -> $12.500
    .replace(/\$(\d{4,})/g, (_, num) => {
      return `$${Number(num).toLocaleString('es-AR')}`
    })
    // Si quedó duplicado 'a las XX:XX hs a las XX:XX hs' o 'a las XX:XX hs • a las XX:XX hs'
    .replace(/a las (\d{2}:\d{2} hs)(?:\s+(?:•\s+)?a las \1)+/gi, 'a las $1')
    // Ocultar IDs técnicos y hashes internos de pasarelas
    .replace(/\[MP Pref:[^\]]+\]/gi, '')
    .replace(/\[MP-ID:[^\]]+\]/gi, '')
    // Reemplazar separadores internos con viñetas limpias
    .replace(/\s*-\s*\|\s*/g, ' • ')
    .replace(/\s*\|\s*/g, ' • ')
    .replace(/\s*-\s*-\s*/g, ' - ')
    .replace(/\s*•\s*•\s*/g, ' • ')
    .trim()

  // Eliminar guiones, barras o viñetas sueltas al inicio y al final
  cleaned = cleaned.replace(/^[\s\-•|]+/, '').replace(/[\s\-•|]+$/, '').trim()
  return cleaned
}

// ─── Moneda argentina ─────────────────────────────────────────────────────────

export function formatARS(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

export function buildWhatsAppLink(phone: string, message: string): string {
  const cleaned = phone.replace(/\D/g, '')
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`
}

export function buildBookingWhatsAppMessage(params: {
  clubName: string
  courtName: string
  sport: SportType
  startsAt: string
  endsAt: string
  customerName: string
  bookingId: string
}): string {
  const { clubName, courtName, sport, startsAt, endsAt, customerName, bookingId } = params
  const date = formatDateLong(startsAt)
  const timeFrom = formatTime(startsAt)
  const timeTo = formatTime(endsAt)
  const sportStr = sportLabel(sport)

  return `¡Hola ${clubName}! 👋\n\n` +
    `Acabo de reservar una cancha:\n\n` +
    `🏟️ *${courtName}* (${sportStr})\n` +
    `📅 ${date}\n` +
    `🕐 ${timeFrom} - ${timeTo}\n` +
    `👤 ${customerName}\n` +
    `🔖 Reserva #${bookingId.slice(-8).toUpperCase()}\n\n` +
    `Por favor confirmame la reserva. ¡Gracias!`
}

// ─── Generación de external_reference para MP ─────────────────────────────────

export function generateExternalReference(): string {
  return crypto.randomUUID()
}

// ─── Verificación de horario de atención ─────────────────────────────────────

export function isWithinBusinessHours(
  date: Date,
  hours: { open: string; close: string }
): boolean {
  const [openH, openM] = hours.open.split(':').map(Number)
  const [closeH, closeM] = hours.close.split(':').map(Number)
  const totalMinutes = date.getHours() * 60 + date.getMinutes()
  const openMinutes = openH * 60 + openM
  const closeMinutes = closeH * 60 + closeM
  return totalMinutes >= openMinutes && totalMinutes < closeMinutes
}

// ─── Utilidades de Zona Horaria Segura (Argentina UTC-3) ──────────────────────

/**
 * Obtiene la fecha actual en formato ISO 'YYYY-MM-DD' en la zona horaria de Argentina (America/Argentina/Buenos_Aires).
 * Previene bugs de salto de día entre las 21:00 y las 00:00 en servidores UTC.
 */
export function getArgentinaTodayIso(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(now)
}

/**
 * Obtiene la hora actual en formato 'HH:MM' (24hs) en la zona horaria de Argentina.
 */
export function getArgentinaTimeStr(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return formatter.format(now)
}

/**
 * Obtiene la fecha actual en formato 'D/M/AAAA' en la zona horaria de Argentina.
 */
export function getArgentinaDateStr(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  })
  return formatter.format(now)
}

/**
 * Convierte un starts_at o fecha+hora a objeto Date forzando el offset de Argentina (-03:00) si no tiene zona horaria.
 * Evita desfasajes de 3 horas en entornos UTC (Vercel, Docker, Supabase).
 */
export function parseArgentinaDate(startsAt: string): Date {
  if (!startsAt) return new Date(NaN)
  const hasTimezone = startsAt.includes('Z') || startsAt.includes('+') || (startsAt.length > 10 && startsAt.slice(10).includes('-'))
  const normalized = hasTimezone ? startsAt : `${startsAt}-03:00`
  return new Date(normalized)
}

/**
 * Determina si una fecha y horario de turno ya han pasado respecto a la hora oficial de Argentina.
 */
export function isSlotTimeInPast(dateIso: string, timeStr: string): boolean {
  if (!dateIso || !timeStr) return false
  const now = new Date()
  const todayIso = getArgentinaTodayIso(now)
  const currentTimeStr = getArgentinaTimeStr(now)
  return dateIso < todayIso || (dateIso === todayIso && timeStr <= currentTimeStr)
}

/**
 * Formatea fecha y hora para alertas de débito automático: 'DD/MM/AAAA HH:MM'
 * en la zona horaria oficial de Argentina.
 */
export function formatAutoDebitAlertDate(dateInput?: string | number | Date | null): string {
  const d = dateInput ? new Date(dateInput) : new Date()
  const dateObj = isNaN(d.getTime()) ? new Date() : d

  const formatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return formatter.format(dateObj).replace(',', '').trim()
}

