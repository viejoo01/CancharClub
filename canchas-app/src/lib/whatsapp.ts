// src/lib/whatsapp.ts
// ==============================================================================
// CANCHARCLUB — MÓDULO DE NOTIFICACIONES AUTOMÁTICAS POR WHATSAPP
// Soporta Meta Cloud API (Graph v19+) y fallback transparente a wa.me URL
// ==============================================================================

import { siteConfig } from '@/config/site'
import { formatARS } from '@/lib/utils'

export interface WhatsAppSendResult {
  success: boolean
  messageId?: string
  isSimulated: boolean
  waUrl: string
  error?: string
}

/**
 * Normaliza y formatea un número telefónico al estándar internacional E.164
 * para Argentina (prefijo 549...).
 */
export function normalizePhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1)
  }
  if (cleaned.startsWith('15') && cleaned.length === 10) {
    cleaned = cleaned.slice(2)
  }
  if (cleaned.startsWith('549')) {
    return cleaned
  }
  if (cleaned.startsWith('54')) {
    return `549${cleaned.slice(2)}`
  }
  return `549${cleaned}`
}

/**
 * Genera el enlace directo wa.me con mensaje pre-cargado
 */
export function buildWaMeLink(phone: string, text: string): string {
  const norm = normalizePhoneForWhatsApp(phone)
  return `https://wa.me/${norm}?text=${encodeURIComponent(text)}`
}

/**
 * Envío de mensaje por WhatsApp:
 * 1. Si existen variables de entorno de Meta Graph API, intenta el despacho directo.
 * 2. Si no están configuradas (modo local/demo o sin API paga), opera en modo simulado
 *    y entrega el enlace wa.me para despacho manual o por frontend.
 */
export async function sendWhatsAppMessage(
  toPhone: string,
  messageText: string
): Promise<WhatsAppSendResult> {
  const normalizedPhone = normalizePhoneForWhatsApp(toPhone)
  const waUrl = buildWaMeLink(normalizedPhone, messageText)

  const token = process.env.WHATSAPP_API_TOKEN || process.env.META_WA_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneId) {
    console.log(`[WhatsApp:Simulado] Para: ${normalizedPhone}\nMensaje: ${messageText}`)
    return {
      success: true,
      isSimulated: true,
      waUrl,
      messageId: `sim_${Date.now()}`,
    }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)

    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedPhone,
        type: 'text',
        text: { preview_url: true, body: messageText },
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const json = await res.json()
    if (!res.ok) {
      console.warn('[WhatsApp:MetaAPI Error]', json)
      return {
        success: false,
        isSimulated: false,
        waUrl,
        error: json?.error?.message || 'Error en WhatsApp Cloud API',
      }
    }

    const messageId = json?.messages?.[0]?.id
    return {
      success: true,
      isSimulated: false,
      waUrl,
      messageId,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[WhatsApp:Send Exception]', msg)
    return {
      success: false,
      isSimulated: true,
      waUrl,
      error: msg,
    }
  }
}

// ─── PLANTILLAS TRANSACCIONALES AUTOMÁTICAS ───────────────────────────────────

/**
 * 1. Confirmación de Reserva
 */
export async function notifyBookingConfirmation(params: {
  phone: string
  customerName: string
  clubName: string
  courtName: string
  dateStr: string
  timeStr: string
  totalARS: number
  depositARS: number
  bookingCode?: string
}): Promise<WhatsAppSendResult> {
  const pendingARS = params.totalARS - params.depositARS
  const codeText = params.bookingCode ? `\n📌 *Código:* ${params.bookingCode}` : ''
  const message = `¡Hola ${params.customerName}! 🎾⚽\nTu turno en *${params.clubName}* está *CONFIRMADO*.\n\n📍 *Cancha:* ${params.courtName}\n📅 *Fecha:* ${params.dateStr}\n⏰ *Horario:* ${params.timeStr} hs\n💳 *Seña pagada:* ${formatARS(params.depositARS)}\n💰 *Saldo restante en cancha:* ${formatARS(pendingARS)}${codeText}\n\nLlegá 10 minutos antes para entrar en calor. ¡Te esperamos!\n\n_Gestionado con ${siteConfig.name}_`

  return sendWhatsAppMessage(params.phone, message)
}

/**
 * 2. Recordatorio Pre-Partido (24hs o 3hs antes)
 */
export async function notifyMatchReminder(params: {
  phone: string
  customerName: string
  clubName: string
  courtName: string
  timeStr: string
  hoursBefore?: number
  address?: string
}): Promise<WhatsAppSendResult> {
  const hours = params.hoursBefore ?? 3
  const addressText = params.address ? `\n📍 *Ubicación:* ${params.address}` : ''
  const message = `¡Hola ${params.customerName}! ⏰ Te recordamos que tu partido en *${params.clubName}* empieza en ${hours} hs (a las ${params.timeStr} hs).\n🏟️ *Cancha:* ${params.courtName}${addressText}\n\n¡Prepará las zapatillas y nos vemos en la cancha! 🏆`

  return sendWhatsAppMessage(params.phone, message)
}

/**
 * 3. Notificación de Seña Acreditada
 */
export async function notifyDepositReceived(params: {
  phone: string
  customerName: string
  clubName: string
  amountARS: number
  balanceARS: number
  bookingCode?: string
}): Promise<WhatsAppSendResult> {
  const message = `¡Hola ${params.customerName}! ✅ Hemos recibido tu seña de *${formatARS(params.amountARS)}* para tu reserva en *${params.clubName}*.\n💰 *Saldo pendiente a abonar en el predio:* ${formatARS(params.balanceARS)}.\n\n¡Gracias por elegirnos!`

  return sendWhatsAppMessage(params.phone, message)
}

/**
 * 4. Aviso de Suspensión por Lluvia / Saldo a Favor
 */
export async function notifyRainCancellation(params: {
  phone: string
  customerName: string
  clubName: string
  courtName: string
  timeStr: string
  creditAmountARS: number
}): Promise<WhatsAppSendResult> {
  const message = `Estimado/a ${params.customerName}: ⛈️\nDebido a las condiciones climáticas desfavorables, el turno de las ${params.timeStr} hs en la cancha *${params.courtName}* de *${params.clubName}* ha sido suspendido.\n\n🎉 Se te ha acreditado un saldo a favor de *${formatARS(params.creditAmountARS)}* para tu próxima reserva.\n\nPodrás usarlo contactando directamente al club o al reservar tu próximo turno.`

  return sendWhatsAppMessage(params.phone, message)
}

/**
 * 5. Notificación de Cupo Disponible en Lista de Espera
 */
export async function notifyWaitlistSlotAvailable(params: {
  phone: string
  customerName: string
  clubName: string
  courtName: string
  dateStr: string
  timeStr: string
  checkoutUrl: string
}): Promise<WhatsAppSendResult> {
  const message = `¡Hola ${params.customerName}! 🔔 ¡Se liberó un turno en *${params.clubName}*!\n\n🏟️ *Cancha:* ${params.courtName}\n📅 *Fecha:* ${params.dateStr}\n⏰ *Horario:* ${params.timeStr} hs\n\nReservalo antes de que te lo ganen acá:\n🔗 ${params.checkoutUrl}\n\n¡Apurate, los cupos son por orden de llegada!`

  return sendWhatsAppMessage(params.phone, message)
}
