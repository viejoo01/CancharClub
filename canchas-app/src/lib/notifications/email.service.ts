// src/lib/notifications/email.service.ts
// ==============================================================================
// SERVICIO TRANSACCIONAL DE EMAIL (RESEND API CON FALLBACK SEGURO)
// ==============================================================================

import { emailTemplates } from './templates'

interface SendEmailParams {
  to: string
  subject: string
  html: string
}

/**
 * Envía un correo electrónico transaccional vía Resend REST API o simulación en dev
 */
export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailParams): Promise<{ success: boolean; id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'notificaciones@cancharclub.com.ar'

  if (!apiKey) {
    console.log(`[EMAIL SIMULADO] Destino: ${to} | Asunto: "${subject}"`)
    return { success: true, id: `simulated-${Date.now()}` }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `CancharClub <${fromEmail}>`,
        to: [to],
        subject,
        html,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.warn('Resend API response error:', data)
      return { success: false, error: data?.message || 'Error en Resend' }
    }

    return { success: true, id: data.id }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.warn('Excepción al enviar email transaccional:', message)
    return { success: false, error: message }
  }
}

/**
 * Notifica al jugador con el comprobante y detalle de su turno confirmado
 */
export async function sendBookingConfirmationToPlayer(params: {
  playerEmail: string
  playerName: string
  clubName: string
  courtName: string
  time: string
  bookingId: string
}): Promise<void> {
  if (!params.playerEmail || !params.playerEmail.includes('@')) return

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.cancharclub.com.ar'
  const receiptLink = `${siteUrl}/reserva/${params.bookingId}/confirmado`

  const template = emailTemplates.playerBookingConfirmation({
    playerName: params.playerName,
    clubName: params.clubName,
    courtName: params.courtName,
    time: params.time,
    link: receiptLink,
  })

  await sendEmail({
    to: params.playerEmail,
    subject: template.subject,
    html: template.html,
  })
}

/**
 * Notifica al dueño del club cuando entra una nueva reserva online
 */
export async function sendNewBookingAlertToClub(params: {
  clubEmail: string
  clubName: string
  playerName: string
  courtName: string
  time: string
  totalPrice: number
  depositPaid: number
}): Promise<void> {
  if (!params.clubEmail || !params.clubEmail.includes('@')) return

  const subject = `🎉 Nueva reserva online en ${params.courtName} - CancharClub`
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background-color: #020617; color: #f8fafc; border-radius: 16px; overflow: hidden; border: 1px solid #1e293b; padding: 28px;">
      <div style="border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 20px;">
        <h2 style="color: #10b981; margin: 0; font-size: 20px;">¡Nueva reserva online ingresada!</h2>
        <p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0 0;">${params.clubName}</p>
      </div>

      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.5;">
        Un jugador acaba de reservar un turno a través de la plataforma:
      </p>

      <div style="background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 18px; margin: 20px 0;">
        <p style="margin: 6px 0; color: #cbd5e1; font-size: 13px;">👤 <strong>Jugador:</strong> ${params.playerName}</p>
        <p style="margin: 6px 0; color: #cbd5e1; font-size: 13px;">🏟️ <strong>Cancha:</strong> ${params.courtName}</p>
        <p style="margin: 6px 0; color: #cbd5e1; font-size: 13px;">⏰ <strong>Horario:</strong> ${params.time}</p>
        <p style="margin: 6px 0; color: #34d399; font-size: 13px;">💵 <strong>Seña abonada:</strong> $${params.depositPaid.toLocaleString('es-AR')}</p>
        <p style="margin: 6px 0; color: #94a3b8; font-size: 13px;">🪙 <strong>Total turno:</strong> $${params.totalPrice.toLocaleString('es-AR')}</p>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <a href="https://www.cancharclub.com.ar/dashboard" style="background-color: #10b981; color: #020617; text-decoration: none; padding: 12px 24px; font-weight: 700; border-radius: 10px; display: inline-block; font-size: 14px;">
          Abrir Panel del Club
        </a>
      </div>
    </div>
  `

  await sendEmail({
    to: params.clubEmail,
    subject,
    html,
  })
}
