// src/lib/superadmin-notifications.ts
// ==============================================================================
// TELEMETRÍA Y ALERTAS INSTANTÁNEAS PARA SUPERADMIN (EMAIL / WHATSAPP / WEBHOOK)
// ==============================================================================

import { sendEmail } from '@/lib/notifications/email.service'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export type SuperadminEventType = 
  | 'NEW_CLUB_REGISTRATION'
  | 'CARD_MANDATE_LINKED'
  | 'REVOCATION_REQUESTED'
  | 'REVOCATION_UNDONE'
  | 'SUBSCRIPTION_PAYMENT_RECORDED'
  | 'TEST_ALERT'

export interface SuperadminAlertPayload {
  event: SuperadminEventType
  title: string
  clubName: string
  clubSlug?: string
  details?: Record<string, string | number | boolean | null | undefined>
  priority?: 'NORMAL' | 'HIGH' | 'URGENT'
}

/**
 * Envía una notificación instantánea a los canales de telemetría del Superadmin
 * (Email oficial cancharclub@gmail.com, WhatsApp y Webhook, sin depender de servicios externos no deseados).
 * Es 100% no-bloqueante: si falla cualquier conexión externa nunca interrumpe la operación del club.
 */
export async function sendSuperadminAlert(payload: SuperadminAlertPayload): Promise<{
  success: boolean
  emailDelivered: boolean
  whatsappDelivered: boolean
  webhookDelivered: boolean
  error?: string
}> {
  let emailDelivered = false
  let whatsappDelivered = false
  let webhookDelivered = false

  try {
    const nowStr = new Date().toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Tucuman',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    const priorityIcon = payload.priority === 'URGENT' ? '🚨' : payload.priority === 'HIGH' ? '⚠️' : '🔔'
    const superadminEmail = process.env.SUPERADMIN_NOTIFICATION_EMAIL || process.env.SUPERADMIN_EMAIL || 'cancharclub@gmail.com'
    const superadminPhone = process.env.SUPERADMIN_PHONE || '543816839320'

    // 1. Envío por Email Transaccional (Resend)
    try {
      let detailsHtml = ''
      if (payload.details && Object.keys(payload.details).length > 0) {
        detailsHtml = `
          <div style="background: #1e293b; border-radius: 8px; padding: 14px; margin: 16px 0;">
            <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: bold; color: #94a3b8; text-transform: uppercase;">Detalle del Evento:</p>
            <ul style="margin: 0; padding-left: 18px; color: #e2e8f0; font-size: 14px; line-height: 1.6;">
              ${Object.entries(payload.details)
                .filter(([, v]) => v !== undefined && v !== null)
                .map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`)
                .join('')}
            </ul>
          </div>
        `
      }

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; margin: 0;">
          <div style="max-width: 580px; margin: 0 auto; background: #090d16; border: 1px solid #1e293b; border-radius: 16px; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 18px;">
              <span style="font-size: 11px; font-weight: 800; color: #10b981; text-transform: uppercase; letter-spacing: 1px;">CANCHARCLUB • TELEMETRÍA</span>
              <h2 style="color: #ffffff; margin: 6px 0 0 0; font-size: 20px;">${priorityIcon} ${payload.title}</h2>
            </div>
            
            <p style="font-size: 15px; margin: 0 0 8px 0; color: #f1f5f9;">
              <strong>Club:</strong> <span style="color: #38bdf8; font-weight: bold;">${payload.clubName}</span> ${payload.clubSlug ? `<code style="background: #1e293b; padding: 2px 6px; border-radius: 4px; font-size: 12px; color: #a5f3fc;">${payload.clubSlug}</code>` : ''}
            </p>
            <p style="font-size: 13px; color: #94a3b8; margin: 0 0 16px 0;">
              <strong>Fecha y Hora:</strong> ${nowStr} (Argentina)
            </p>

            ${detailsHtml}

            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #1e293b; text-align: center;">
              <a href="https://cancharclub.com.ar/superadmin" style="background: #10b981; color: #ffffff; padding: 10px 22px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 13px; display: inline-block;">
                Ver en Panel Superadmin →
              </a>
            </div>
          </div>
        </body>
        </html>
      `

      const emailRes = await sendEmail({
        to: superadminEmail,
        subject: `[CancharClub] ${payload.title} — ${payload.clubName}`,
        html: emailHtml,
      })
      if (emailRes.success) {
        emailDelivered = true
      }
    } catch (mailErr) {
      console.warn('[SUPERADMIN TELEMETRY] Email dispatch notice:', mailErr)
    }

    // 2. Envío a WhatsApp si está configurada la API de WhatsApp
    try {
      let waText = `*${priorityIcon} CANCHARCLUB • ALERTA*\n\n`
      waText += `📌 *${payload.title}*\n`
      waText += `🏢 *Club:* ${payload.clubName}${payload.clubSlug ? ` (${payload.clubSlug})` : ''}\n`
      waText += `⏰ *Fecha:* ${nowStr}\n`

      if (payload.details && Object.keys(payload.details).length > 0) {
        waText += `\n📋 *Detalles:*\n`
        for (const [key, value] of Object.entries(payload.details)) {
          if (value !== undefined && value !== null) {
            waText += `• *${key}:* ${value}\n`
          }
        }
      }
      waText += `\n🔗 https://cancharclub.com.ar/superadmin`

      const waRes = await sendWhatsAppMessage(superadminPhone, waText)
      if (waRes.success && !waRes.isSimulated) {
        whatsappDelivered = true
      }
    } catch (waErr) {
      console.warn('[SUPERADMIN TELEMETRY] WhatsApp dispatch notice:', waErr)
    }

    // 3. Envío a Webhook genérico si existe
    const webhookUrl = process.env.SUPERADMIN_WEBHOOK_URL
    if (webhookUrl) {
      try {
        const whRes = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            timestamp: new Date().toISOString(),
            formattedDate: nowStr,
          }),
        })
        if (whRes.ok) webhookDelivered = true
      } catch (whErr) {
        console.warn('[SUPERADMIN TELEMETRY] Webhook dispatch notice:', whErr)
      }
    }

    // 4. Registro seguro en logs
    console.log(`[SUPERADMIN TELEMETRY] [${payload.event}] ${payload.clubName}: ${payload.title}`, {
      ...payload.details,
      emailDelivered,
      whatsappDelivered,
      webhookDelivered,
    })

    return {
      success: true,
      emailDelivered,
      whatsappDelivered,
      webhookDelivered,
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error desconocido'
    console.warn('[SUPERADMIN TELEMETRY] Exception in sendSuperadminAlert:', errorMsg)
    return {
      success: false,
      emailDelivered: false,
      whatsappDelivered: false,
      webhookDelivered: false,
      error: errorMsg,
    }
  }
}
