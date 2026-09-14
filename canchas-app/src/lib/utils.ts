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
    TENIS: 'Tenis',
    SQUASH: 'Squash',
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

export function paymentMethodLabel(method: PaymentMethod): string {
  const map: Record<PaymentMethod, string> = {
    CASH: 'Efectivo',
    TRANSFER: 'Transferencia',
    MERCADOPAGO: 'Mercado Pago',
    DEBIT_CARD: 'Tarjeta Débito',
    CREDIT_CARD: 'Tarjeta Crédito',
    QR_MP: 'QR MP',
    OTHER: 'Otro',
  }
  return map[method] ?? method
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
