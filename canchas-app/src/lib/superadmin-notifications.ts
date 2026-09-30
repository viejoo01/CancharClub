// src/lib/superadmin-notifications.ts
// ==============================================================================
// TELEMETRÍA Y ALERTAS INSTANTÁNEAS PARA SUPERADMIN (TELEGRAM / WEBHOOK / LOGS)
// ==============================================================================

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
 * (Telegram Bot, Discord/Slack Webhook o registro seguro en consola).
 * Es no-bloqueante: si falla la red externa nunca interrumpe el flujo del cliente.
 */
export async function sendSuperadminAlert(payload: SuperadminAlertPayload): Promise<{
  success: boolean
  telegramDelivered: boolean
  webhookDelivered: boolean
  error?: string
}> {
  let telegramDelivered = false
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

    const priorityIcon = payload.priority === 'URGENT' ? '🚨🚨🚨' : payload.priority === 'HIGH' ? '⚠️' : '🔔'
    
    // 1. Construcción del mensaje para Telegram
    let telegramText = `${priorityIcon} *CANCHARCLUB TELEMETRÍA*\n\n`
    telegramText += `📌 *${payload.title}*\n`
    telegramText += `🏢 *Club:* ${payload.clubName}${payload.clubSlug ? ` (\`${payload.clubSlug}\`)` : ''}\n`
    telegramText += `⏰ *Fecha:* ${nowStr} (ARG)\n`

    if (payload.details && Object.keys(payload.details).length > 0) {
      telegramText += `\n📋 *Detalles:*`
      for (const [key, value] of Object.entries(payload.details)) {
        if (value !== undefined && value !== null) {
          telegramText += `\n• *${key}:* ${value}`
        }
      }
    }

    telegramText += `\n\n🔗 [Ir a Panel Superadmin](https://cancharclub.com.ar/superadmin)`

    // 2. Envío a Telegram si están configuradas las credenciales
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN
    const telegramChatId = process.env.TELEGRAM_CHAT_ID

    if (telegramToken && telegramChatId) {
      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: telegramText,
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
          }),
        })
        if (tgRes.ok) {
          telegramDelivered = true
        } else {
          console.warn('[SUPERADMIN TELEMETRY] Telegram API error:', await tgRes.text())
        }
      } catch (tgErr) {
        console.warn('[SUPERADMIN TELEMETRY] Telegram dispatch error:', tgErr)
      }
    }

    // 3. Envío a Webhook genérico (Discord/Slack/Zapier/N8N) si está configurado
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
        if (whRes.ok) {
          webhookDelivered = true
        }
      } catch (whErr) {
        console.warn('[SUPERADMIN TELEMETRY] Webhook dispatch error:', whErr)
      }
    }

    // 4. Log unificado para trazabilidad
    console.log(`[SUPERADMIN TELEMETRY] [${payload.event}] ${payload.clubName}: ${payload.title}`, {
      ...payload.details,
      telegramDelivered,
      webhookDelivered,
    })

    return {
      success: true,
      telegramDelivered,
      webhookDelivered,
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error desconocido'
    console.warn('[SUPERADMIN TELEMETRY] Exception in sendSuperadminAlert:', errorMsg)
    return {
      success: false,
      telegramDelivered: false,
      webhookDelivered: false,
      error: errorMsg,
    }
  }
}
