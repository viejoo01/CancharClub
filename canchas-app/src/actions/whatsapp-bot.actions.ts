'use server'
// src/actions/whatsapp-bot.actions.ts
// ==============================================================================
// SERVER ACTIONS — Automatización de Bot de WhatsApp para Clubes Deportivos
// Despacho 100% automático desatendido: Confirmación, Recordatorio 2h y Lista de Espera
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { assertTenantMember } from '@/lib/auth-security'
import { sanitizeText } from '@/lib/sanitize'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { formatARS } from '@/lib/utils'

export interface WhatsAppBotConfig {
  tenant_id: string
  is_enabled: boolean
  auto_confirm_bookings: boolean   // Enviar confirmación automática al aprobarse la reserva
  auto_reminder_2h: boolean        // Recordatorio automático 2 horas antes del partido
  auto_waitlist_alert: boolean     // Aviso instantáneo al primero en lista de espera al liberarse un turno
  provider: 'META_CLOUD' | 'EVOLUTION_API' | 'SIMULATED'
  phone_number_id?: string
  api_key?: string
  custom_greeting?: string
  updated_at?: string
}

export interface AutomatedMessageLog {
  id: string
  tenant_id: string
  recipient_phone: string
  recipient_name: string
  message_type: 'CONFIRMATION' | 'REMINDER_2H' | 'WAITLIST_ALERT' | 'DEBT_REMINDER' | 'TEST'
  content: string
  status: 'SENT' | 'PENDING' | 'FAILED' | 'SIMULATED'
  sent_at: string
}

/** Obtiene la configuración del bot de WhatsApp para el club */
export async function getWhatsAppBotConfig(tenantId: string): Promise<WhatsAppBotConfig> {
  const defaultConfig: WhatsAppBotConfig = {
    tenant_id: tenantId,
    is_enabled: true,
    auto_confirm_bookings: true,
    auto_reminder_2h: true,
    auto_waitlist_alert: true,
    provider: (process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) ? 'META_CLOUD' : 'SIMULATED',
    custom_greeting: '¡Hola! Te escribimos de CancharClub en nombre de tu club.',
  }

  try {
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) return defaultConfig

    const supabase = await createServiceClient()
    const { data } = await supabase
      .from('audit_log')
      .select('new_data')
      .eq('tenant_id', tenantId)
      .eq('action', 'WHATSAPP_BOT_CONFIG')
      .order('created_at', { ascending: false })
      .limit(1)

    if (data && data.length > 0 && data[0].new_data) {
      return {
        ...defaultConfig,
        ...(data[0].new_data as WhatsAppBotConfig),
        tenant_id: tenantId,
      }
    }

    return defaultConfig
  } catch (err) {
    console.error('[getWhatsAppBotConfig] Error:', err)
    return defaultConfig
  }
}

/** Guarda la configuración del bot de WhatsApp para el club */
export async function saveWhatsAppBotConfig(
  tenantId: string,
  config: Partial<WhatsAppBotConfig>
): Promise<{ success: boolean; config: WhatsAppBotConfig; error?: string }> {
  try {
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return { success: false, config: config as WhatsAppBotConfig, error: auth.error || 'Sin permisos sobre este club' }
    }

    const current = await getWhatsAppBotConfig(tenantId)
    const updated: WhatsAppBotConfig = {
      ...current,
      ...config,
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    }

    const supabase = await createServiceClient()
    const { error } = await supabase.from('audit_log').insert({
      tenant_id: tenantId,
      action: 'WHATSAPP_BOT_CONFIG',
      table_name: 'tenants',
      record_id: tenantId,
      new_data: updated,
    })

    if (error) {
      console.error('[saveWhatsAppBotConfig] Error saving config:', error.message)
      return { success: false, config: updated, error: error.message }
    }

    revalidatePath('/dashboard/whatsapp')
    return { success: true, config: updated }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al guardar configuración'
    return { success: false, config: config as WhatsAppBotConfig, error: msg }
  }
}

/** Obtiene el historial reciente de mensajes automatizados del club */
export async function getWhatsAppMessageLogs(tenantId: string): Promise<AutomatedMessageLog[]> {
  try {
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) return []

    const supabase = await createServiceClient()
    const { data } = await supabase
      .from('audit_log')
      .select('id, record_id, new_data, created_at')
      .eq('tenant_id', tenantId)
      .eq('action', 'WHATSAPP_MESSAGE_SENT')
      .order('created_at', { ascending: false })
      .limit(30)

    if (!data) return []

    return data.map((row) => ({
      id: row.id,
      tenant_id: tenantId,
      ...(row.new_data as Omit<AutomatedMessageLog, 'id' | 'tenant_id'>),
    }))
  } catch {
    return []
  }
}

/** Registra un log de mensaje en audit_log */
async function logAutomatedMessage(
  tenantId: string,
  log: Omit<AutomatedMessageLog, 'id' | 'tenant_id'>
) {
  try {
    const supabase = await createServiceClient()
    await supabase.from('audit_log').insert({
      tenant_id: tenantId,
      action: 'WHATSAPP_MESSAGE_SENT',
      table_name: 'whatsapp_logs',
      record_id: crypto.randomUUID(),
      new_data: log,
    })
  } catch (err) {
    console.warn('[logAutomatedMessage] Warning:', err)
  }
}

/**
 * Disparo automático de confirmación de reserva por WhatsApp
 * Se invoca inmediatamente tras aprobarse o pagarse la seña del turno.
 */
export async function sendAutomatedBookingConfirmation(
  bookingId: string
): Promise<{ success: boolean; isSimulated?: boolean; waUrl?: string; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('id, tenant_id, customer_name, customer_phone, booked_at, starts_at, total_amount_ars, price_total_cents, deposit_cents, total_paid, balance_due, staff_notes, courts(name, sport), tenants(name, address, bank_alias, phone_whatsapp)')
      .eq('id', bookingId)
      .maybeSingle()

    if (bErr || !booking) {
      return { success: false, error: 'Reserva no encontrada' }
    }

    const config = await getWhatsAppBotConfig(booking.tenant_id)
    if (!config.is_enabled || !config.auto_confirm_bookings) {
      return { success: true, isSimulated: true, error: 'Automatización desactivada en el club' }
    }

    const phone = booking.customer_phone
    if (!phone || phone.trim().length < 6) {
      return { success: false, error: 'El cliente no tiene teléfono de WhatsApp válido' }
    }

    const courtObj = Array.isArray(booking.courts) ? booking.courts[0] : booking.courts
    const tenantObj = Array.isArray(booking.tenants) ? booking.tenants[0] : booking.tenants
    const courtName = courtObj?.name || 'Cancha'
    const clubName = tenantObj?.name || 'Club Deportivo'
    const clubAddress = tenantObj?.address ? `📍 ${tenantObj.address}\n` : ''

    // Parsear fecha y hora
    let dateStr = ''
    let timeStr = ''
    if (booking.booked_at) {
      const match = booking.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
      if (match?.[1]) {
        const d = new Date(match[1])
        dateStr = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })
        timeStr = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
      }
    }
    if (!dateStr && booking.starts_at) {
      const d = new Date(booking.starts_at)
      dateStr = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })
      timeStr = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
    }

    const totalArs = booking.total_amount_ars || (Number(booking.price_total_cents || 0) / 100)
    const paidArs = booking.total_paid || (Number(booking.deposit_cents || 0) / 100)
    const balanceArs = Math.max(0, totalArs - paidArs)

    const balanceText = balanceArs > 0
      ? `\n💰 *Saldo a pagar al llegar:* ${formatARS(balanceArs)}`
      : '\n✅ *Turno saldado al 100%*'

    const message = 
`🎾 *¡TURNO CONFIRMADO EN ${clubName.toUpperCase()}!* ⚽

Hola *${booking.customer_name}*, tu reserva quedó validada y agendada con éxito:

📅 *Fecha:* ${dateStr}
⏰ *Horario:* ${timeStr} hs
🏟️ *Cancha:* ${courtName}
${clubAddress}💵 *Total:* ${formatARS(totalArs)}
💳 *Seña abonada:* ${formatARS(paidArs)}${balanceText}

¡Te esperamos! Te recordamos llegar 10 minutos antes.
_Mensaje automático enviado por CancharClub._`

    const sendRes = await sendWhatsAppMessage(phone, message)

    await logAutomatedMessage(booking.tenant_id, {
      recipient_phone: phone,
      recipient_name: booking.customer_name || 'Cliente',
      message_type: 'CONFIRMATION',
      content: message,
      status: sendRes.isSimulated ? 'SIMULATED' : (sendRes.success ? 'SENT' : 'FAILED'),
      sent_at: new Date().toISOString(),
    })

    return {
      success: sendRes.success,
      isSimulated: sendRes.isSimulated,
      waUrl: sendRes.waUrl,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al enviar confirmación'
    console.error('[sendAutomatedBookingConfirmation] Error:', msg)
    return { success: false, error: msg }
  }
}

/** Enviar mensaje de prueba para verificar conectividad del bot */
export async function testWhatsAppBotMessage(
  tenantId: string,
  targetPhone: string
): Promise<{ success: boolean; isSimulated: boolean; waUrl: string; error?: string }> {
  try {
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return { success: false, isSimulated: false, waUrl: '', error: 'Sin permisos' }
    }

    const cleanPhone = sanitizeText(targetPhone, 30).replace(/[^\d+]/g, '')
    if (cleanPhone.length < 8) {
      return { success: false, isSimulated: false, waUrl: '', error: 'Número de WhatsApp inválido' }
    }

    const testMessage = 
`🤖 *CANCHARCLUB — PRUEBA DE BOT WHATSAPP*

¡Conexión verificada con éxito!
Tu bot de automatización de CancharClub está activo y listo para despachar:
• Confirmaciones de reservas online
• Recordatorios automáticos 2 horas antes
• Alertas instantáneas a lista de espera

Fecha y hora: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`

    const sendRes = await sendWhatsAppMessage(cleanPhone, testMessage)

    await logAutomatedMessage(tenantId, {
      recipient_phone: cleanPhone,
      recipient_name: 'Prueba de Conexión',
      message_type: 'TEST',
      content: testMessage,
      status: sendRes.isSimulated ? 'SIMULATED' : (sendRes.success ? 'SENT' : 'FAILED'),
      sent_at: new Date().toISOString(),
    })

    return {
      success: sendRes.success,
      isSimulated: sendRes.isSimulated,
      waUrl: sendRes.waUrl,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error en prueba de bot'
    return { success: false, isSimulated: false, waUrl: '', error: msg }
  }
}
