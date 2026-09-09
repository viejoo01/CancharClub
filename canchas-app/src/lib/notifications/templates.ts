// src/lib/notifications/templates.ts
// ==============================================================================
// PLANTILLAS DE COMUNICACIÓN TRANSACCIONAL — CANCHARCLUB
// Dominio web oficial: cancharclub.com.ar
// Canales: WhatsApp API / Resend (Email) / SMS
// ==============================================================================

import { siteConfig } from '@/config/site'

/**
 * Parámetros para la confirmación de reserva al jugador
 */
export interface PlayerBookingConfirmationParams {
  clubName: string
  courtName: string
  time: string // Ej: "20:00 hs - 07/09/2026"
  link: string // URL del comprobante / voucher
  playerPhone?: string
}

/**
 * Parámetros para el recordatorio de partido 3 horas antes (1B)
 */
export interface PlayerMatchReminderParams {
  playerName: string
  clubName: string
  courtName: string
  time: string
  hoursBefore?: number
  address?: string
  link: string
}

/**
 * Parámetros para el aviso de abono mensual al dueño del club (Día 1)
 */
export interface ClubMonthlyBillingNoticeParams {
  ownerName: string
  clubName: string
  link: string // URL para abonar la factura
  dueDate?: string // Por defecto "día 7"
  amount?: number
}

/**
 * Parámetros para la alerta de suspensión por falta de pago (Día 13)
 */
export interface ClubSuspensionAlertParams {
  clubName: string
  link: string // URL de reactivación inmediata
  ownerName?: string
  daysOverdue?: number
}

// ------------------------------------------------------------------------------
// GENERADORES DE MENSAJES DE TEXTO (WHATSAPP / SMS)
// ------------------------------------------------------------------------------

/**
 * 1. Confirmación de Turno al Jugador
 * Texto: "¡Turno confirmado en [Nombre del Club]! Cancha: [Cancha] - Horario: [Hora]. Podés revisar el comprobante y la ubicación acá: [Link]. Gestionado mediante CancharClub (cancharclub.com.ar)."
 */
export function getPlayerBookingConfirmationText(params: PlayerBookingConfirmationParams): string {
  return `¡Turno confirmado en ${params.clubName}! Cancha: ${params.courtName} - Horario: ${params.time}. Podés revisar el comprobante y la ubicación acá: ${params.link}. Gestionado mediante ${siteConfig.name} (${siteConfig.domain}).`
}

/**
 * Recordatorio de Turno al Jugador (3 horas antes) — Mejora 1B
 */
export function getPlayerMatchReminderText(params: PlayerMatchReminderParams): string {
  const hours = params.hoursBefore || 3
  return `¡Hola ${params.playerName}! Te recordamos que tu partido en ${params.clubName} comienza en ${hours} horas (a las ${params.time}). Cancha: ${params.courtName}. Llegá 10 minutos antes para entrar en calor. Ubicación y detalles: ${params.link}. ¡A jugar con ${siteConfig.name} (${siteConfig.domain})!`
}

/**
 * 2. Aviso de Facturación al Club (Día 1 de cada mes)
 * Texto: "Hola [Nombre], ya está disponible tu abono mensual de CancharClub para [Nombre del Club]. Recordá abonar antes del día 7 para mantener habilitadas tus reservas online sin interrupciones. Link de pago: [Link]"
 */
export function getClubMonthlyBillingNoticeText(params: ClubMonthlyBillingNoticeParams): string {
  return `Hola ${params.ownerName}, ya está disponible tu abono mensual de ${siteConfig.name} para ${params.clubName}. Recordá abonar antes del día 7 para mantener habilitadas tus reservas online sin interrupciones. Link de pago: ${params.link}`
}

/**
 * 3. Alerta de Suspensión al Club (Día 13)
 * Texto: "Aviso de CancharClub: Las reservas online públicas de [Nombre del Club] han sido temporalmente pausadas por saldo pendiente. Regularizalo aquí para reactivarlas al instante: [Link]"
 */
export function getClubSuspensionAlertText(params: ClubSuspensionAlertParams): string {
  return `Aviso de ${siteConfig.name}: Las reservas online públicas de ${params.clubName} han sido temporalmente pausadas por saldo pendiente. Regularizalo aquí para reactivarlas al instante: ${params.link}`
}

// ------------------------------------------------------------------------------
// GENERADORES DE ENLACES PARA WHATSAPP CLICK-TO-CHAT
// ------------------------------------------------------------------------------

/**
 * Formatea un número de teléfono a formato internacional E.164 para WhatsApp
 * Ej: "3816001234" -> "5493816001234"
 */
export function formatWhatsAppPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('549')) return cleaned
  if (cleaned.startsWith('54')) return `549${cleaned.slice(2)}`
  return `549${cleaned}`
}

/**
 * Crea un enlace directo `https://wa.me/...` con mensaje codificado
 */
export function createWhatsAppShareUrl(phone: string, text: string): string {
  const cleanPhone = formatWhatsAppPhone(phone)
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
}

// ------------------------------------------------------------------------------
// PLANTILLAS HTML PARA CORREOS ELECTRÓNICOS (RESEND / SMTP)
// ------------------------------------------------------------------------------

export const emailTemplates = {
  /**
   * Correo para el jugador confirmando su turno
   */
  playerBookingConfirmation: (params: PlayerBookingConfirmationParams) => ({
    subject: `¡Turno confirmado en ${params.clubName}! - ${siteConfig.name}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #020617; color: #f8fafc; border-radius: 16px; overflow: hidden; border: 1px solid #1e293b;">
        <div style="background: linear-gradient(135deg, #059669, #0d9488); padding: 32px 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">CANCHAR<span style="color: #a7f3d0;">CLUB</span></h1>
          <p style="margin: 6px 0 0 0; color: #a7f3d0; font-size: 13px; font-weight: 500;">${siteConfig.domain} • ${siteConfig.tagline}</p>
        </div>
        
        <div style="padding: 32px 24px;">
          <h2 style="font-size: 20px; color: #ffffff; margin-top: 0;">¡Tu turno está confirmado!</h2>
          <p style="color: #94a3b8; font-size: 15px; line-height: 1.6;">
            ¡Turno confirmado en <strong>${params.clubName}</strong>! A continuación encontrarás los detalles de tu juego:
          </p>

          <div style="background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="margin: 8px 0; color: #cbd5e1; font-size: 14px;">🏟️ <strong>Cancha:</strong> ${params.courtName}</p>
            <p style="margin: 8px 0; color: #cbd5e1; font-size: 14px;">⏰ <strong>Horario:</strong> ${params.time}</p>
            <p style="margin: 8px 0; color: #cbd5e1; font-size: 14px;">📍 <strong>Club:</strong> ${params.clubName}</p>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${params.link}" style="background-color: #10b981; color: #020617; text-decoration: none; padding: 14px 28px; font-weight: 700; border-radius: 10px; display: inline-block; font-size: 15px;">
              Revisar Comprobante y Ubicación
            </a>
          </div>

          <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 32px; border-top: 1px solid #1e293b; padding-top: 16px;">
            Gestionado mediante <strong>${siteConfig.name}</strong> (${siteConfig.domain}) • ${siteConfig.supportEmail}
          </p>
        </div>
      </div>
    `
  }),

  /**
   * Correo al dueño del club con aviso de facturación (Día 1)
   */
  clubMonthlyBillingNotice: (params: ClubMonthlyBillingNoticeParams) => ({
    subject: `Tu abono mensual de ${siteConfig.name} está disponible - ${params.clubName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #020617; color: #f8fafc; border-radius: 16px; overflow: hidden; border: 1px solid #1e293b;">
        <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 32px 24px; text-align: center; border-bottom: 2px solid #10b981;">
          <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">CANCHAR<span style="color: #10b981;">CLUB</span></h1>
          <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 13px;">Facturación Mensual de Servicios • ${siteConfig.domain}</p>
        </div>
        
        <div style="padding: 32px 24px;">
          <h2 style="font-size: 20px; color: #ffffff; margin-top: 0;">Hola ${params.ownerName},</h2>
          <p style="color: #94a3b8; font-size: 15px; line-height: 1.6;">
            Ya está disponible tu abono mensual de <strong>${siteConfig.name}</strong> para <strong>${params.clubName}</strong>.
          </p>

          <div style="background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="margin: 6px 0; color: #cbd5e1; font-size: 14px;">📌 <strong>Concepto:</strong> Abono Mensual ${siteConfig.name} - ${params.clubName}</p>
            <p style="margin: 6px 0; color: #f59e0b; font-size: 14px;">📅 <strong>Vencimiento ordinario:</strong> Día 7 de este mes</p>
            <p style="margin: 6px 0; color: #94a3b8; font-size: 13px;">Recordá abonar antes del día 7 para mantener habilitadas tus reservas online sin interrupciones.</p>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${params.link}" style="background-color: #10b981; color: #020617; text-decoration: none; padding: 14px 28px; font-weight: 700; border-radius: 10px; display: inline-block; font-size: 15px;">
              Abonar con Mercado Pago
            </a>
          </div>

          <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 32px; border-top: 1px solid #1e293b; padding-top: 16px;">
            Soporte Administrativo: <a href="mailto:${siteConfig.supportEmail}" style="color: #10b981;">${siteConfig.supportEmail}</a>
          </p>
        </div>
      </div>
    `
  }),

  /**
   * Correo al club de alerta de suspensión (Día 13)
   */
  clubSuspensionAlert: (params: ClubSuspensionAlertParams) => ({
    subject: `URGENTE: Reservas pausadas por saldo pendiente - ${params.clubName} [${siteConfig.name}]`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #020617; color: #f8fafc; border-radius: 16px; overflow: hidden; border: 1px solid #ef4444;">
        <div style="background: linear-gradient(135deg, #7f1d1d, #450a0a); padding: 32px 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">CANCHAR<span style="color: #fca5a5;">CLUB</span></h1>
          <p style="margin: 6px 0 0 0; color: #fca5a5; font-size: 13px; font-weight: 600;">AVISO DE SUSPENSIÓN TEMPORAL</p>
        </div>
        
        <div style="padding: 32px 24px;">
          <h2 style="font-size: 20px; color: #f87171; margin-top: 0;">Aviso de ${siteConfig.name}</h2>
          <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">
            Las reservas online públicas de <strong>${params.clubName}</strong> han sido temporalmente pausadas por saldo pendiente.
          </p>

          <div style="background-color: #1e1b4b; border: 1px solid #ef4444; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0; color: #fca5a5; font-size: 14px; line-height: 1.5;">
              Tus jugadores no podrán agendar turnos de forma autónoma hasta regularizar la cuenta. Tu panel interno sigue accesible temporalmente para cobros en mostrador.
            </p>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${params.link}" style="background-color: #ef4444; color: #ffffff; text-decoration: none; padding: 14px 28px; font-weight: 700; border-radius: 10px; display: inline-block; font-size: 15px;">
              Regularizar Aquí y Reactivar al Instante
            </a>
          </div>

          <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 32px; border-top: 1px solid #1e293b; padding-top: 16px;">
            Si ya realizaste el pago por transferencia, envíanos el comprobante a <a href="${siteConfig.links.whatsapp}" style="color: #10b981;">WhatsApp de Cobranzas</a>.
          </p>
        </div>
      </div>
    `
  })
}
