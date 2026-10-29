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
import { formatARS, isAbonoBooking, getArgentinaTodayIso } from '@/lib/utils'

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
    const supabase = await createServiceClient()

    // 1. Intentar consultar tabla dedicada whatsapp_bot_configs
    const { data: dbConfig, error: dbErr } = await supabase
      .from('whatsapp_bot_configs')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!dbErr && dbConfig) {
      const hasRealKeys = Boolean(
        (dbConfig.api_key && dbConfig.phone_number_id) ||
        (process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
      )
      return {
        tenant_id: tenantId,
        is_enabled: dbConfig.is_enabled ?? true,
        auto_confirm_bookings: dbConfig.auto_confirm_bookings ?? true,
        auto_reminder_2h: dbConfig.auto_reminder_2h ?? true,
        auto_waitlist_alert: dbConfig.auto_waitlist_alert ?? true,
        provider: hasRealKeys ? 'META_CLOUD' : 'SIMULATED',
        phone_number_id: dbConfig.phone_number_id || undefined,
        api_key: dbConfig.api_key || undefined,
        custom_greeting: dbConfig.custom_greeting || defaultConfig.custom_greeting,
        updated_at: dbConfig.updated_at,
      }
    }

    // 2. Fallback a audit_log
    const { data } = await supabase
      .from('audit_log')
      .select('new_data')
      .eq('tenant_id', tenantId)
      .eq('action', 'WHATSAPP_BOT_CONFIG')
      .order('created_at', { ascending: false })
      .limit(1)

    if (data && data.length > 0 && data[0].new_data) {
      const saved = data[0].new_data as WhatsAppBotConfig
      const hasRealKeys = Boolean(
        (saved.api_key && saved.phone_number_id) ||
        (process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
      )
      return {
        ...defaultConfig,
        ...saved,
        provider: hasRealKeys ? 'META_CLOUD' : 'SIMULATED',
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

    // 1. Guardar relacionalmente en tabla dedicada whatsapp_bot_configs
    try {
      await supabase.from('whatsapp_bot_configs').upsert({
        tenant_id: tenantId,
        is_enabled: updated.is_enabled,
        auto_confirm_bookings: updated.auto_confirm_bookings,
        auto_reminder_2h: updated.auto_reminder_2h,
        auto_waitlist_alert: updated.auto_waitlist_alert,
        provider: updated.provider,
        phone_number_id: updated.phone_number_id || null,
        api_key: updated.api_key || null,
        custom_greeting: updated.custom_greeting || null,
        updated_at: updated.updated_at,
      }, { onConflict: 'tenant_id' })
    } catch (tblErr) {
      console.warn('[saveWhatsAppBotConfig] Table write warning:', tblErr)
    }

    // 2. Dual-write a audit_log
    const { error } = await supabase.from('audit_log').insert({
      tenant_id: tenantId,
      action: 'WHATSAPP_BOT_CONFIG',
      table_name: 'tenants',
      record_id: tenantId,
      new_data: updated,
    })

    if (error) {
      console.error('[saveWhatsAppBotConfig] Error saving config:', error.message)
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

    // 1. Intentar consultar tabla dedicada whatsapp_message_logs
    const { data: dbLogs, error: dbErr } = await supabase
      .from('whatsapp_message_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sent_at', { ascending: false })
      .limit(30)

    if (!dbErr && dbLogs && dbLogs.length > 0) {
      return dbLogs.map((row: {
        id: string
        tenant_id: string
        recipient_phone: string
        recipient_name: string
        message_type: 'CONFIRMATION' | 'REMINDER_2H' | 'WAITLIST_ALERT' | 'DEBT_REMINDER' | 'TEST'
        content: string
        status: 'SENT' | 'PENDING' | 'FAILED' | 'SIMULATED'
        sent_at: string
      }) => ({
        id: row.id,
        tenant_id: row.tenant_id,
        recipient_phone: row.recipient_phone,
        recipient_name: row.recipient_name,
        message_type: row.message_type,
        content: row.content,
        status: row.status,
        sent_at: row.sent_at,
      }))
    }

    // 2. Fallback a audit_log
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

/** Registra un log de mensaje en base de datos */
async function logAutomatedMessage(
  tenantId: string,
  log: Omit<AutomatedMessageLog, 'id' | 'tenant_id'>
) {
  try {
    const supabase = await createServiceClient()

    // 1. Intentar insertar en tabla dedicada whatsapp_message_logs
    try {
      await supabase.from('whatsapp_message_logs').insert({
        tenant_id: tenantId,
        recipient_phone: log.recipient_phone,
        recipient_name: log.recipient_name,
        message_type: log.message_type,
        content: log.content,
        status: log.status,
        sent_at: log.sent_at || new Date().toISOString(),
      })
    } catch (tblErr) {
      console.warn('[logAutomatedMessage] Relational log insert:', tblErr)
    }

    // 2. Dual-write inmutable a audit_log
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
): Promise<{
  success: boolean
  isSimulated?: boolean
  waUrl?: string
  error?: string
  customerName?: string
  customerPhone?: string
  messageText?: string
}> {
  try {
    const supabase = await createServiceClient()
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('id, tenant_id, customer_name, customer_phone, booked_at, price_total_cents, deposit_cents, staff_deposit_amount_cents, staff_notes, recurring_slot_id, courts(name, sport), tenants(name, address, bank_alias, phone_whatsapp)')
      .eq('id', bookingId)
      .maybeSingle()

    if (bErr || !booking) {
      console.error('[sendAutomatedBookingConfirmation] Error al obtener reserva:', bErr?.message || 'No encontrada')
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

    // Parsear fecha y hora desde booked_at (tstzrange e.g. ["2026-10-12 13:00:00+00","2026-10-12 14:00:00+00"))
    let dateStr = ''
    let timeStr = ''
    if (booking.booked_at) {
      const match = booking.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
      if (match?.[1]) {
        const raw = match[1].trim()
        const isoNormalized = raw.includes(' ') ? raw.replace(' ', 'T') : raw
        const finalIso = isoNormalized.endsWith('+00')
          ? isoNormalized.replace('+00', 'Z')
          : (isoNormalized.endsWith('+00:00') ? isoNormalized.replace('+00:00', 'Z') : isoNormalized)
        const d = new Date(finalIso)
        if (!isNaN(d.getTime())) {
          dateStr = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })
          timeStr = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
        }
      }
    }
    if (dateStr) {
      dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1)
    }

    const isAbonoTurn = isAbonoBooking({
      recurring_slot_id: (booking as { recurring_slot_id?: string | null }).recurring_slot_id,
      staff_notes: booking.staff_notes,
    })

    const totalArs = Math.round(Number(booking.price_total_cents || 0) / 100)
    const paidArs = isAbonoTurn
      ? totalArs
      : Math.round(Number(booking.staff_deposit_amount_cents ?? booking.deposit_cents ?? 0) / 100)
    const balanceArs = isAbonoTurn ? 0 : Math.max(0, totalArs - paidArs)

    const balanceText = isAbonoTurn
      ? '$ 0 (Cubierto por abono mensual)'
      : (balanceArs > 0 ? formatARS(balanceArs) : '$ 0')

    const isPending = !isAbonoTurn && paidArs === 0
    const messageHeader = isPending
      ? `*SOLICITUD DE TURNO REGISTRADA - ${clubName.toUpperCase()}*`
      : `*TURNO CONFIRMADO - ${clubName.toUpperCase()}*`
    const introText = isPending
      ? `Hola *${booking.customer_name}*, registramos tu solicitud de reserva. El turno quedará formalmente confirmado una vez acreditado el pago de la seña correspondiente:`
      : `Hola *${booking.customer_name}*, tu reserva quedó validada y agendada con éxito:`
    const closingText = isPending
      ? 'Por favor completá o informá el pago de la seña para asegurar la cancha.'
      : 'Te recordamos presentarte 10 minutos antes.'

    const message = 
`${messageHeader}

${introText}

• *Fecha:* ${dateStr}
• *Horario:* ${timeStr} hs
• *Cancha:* ${courtName}
${clubAddress}• *Total:* ${formatARS(totalArs)}
• *Seña abonada:* ${formatARS(paidArs)}
• *Saldo restante a pagar en cancha:* ${balanceText}

${closingText}
_Comprobante automático emitido por CancharClub._`

    const sendRes = await sendWhatsAppMessage(phone, message, {
      token: config.api_key,
      phoneId: config.phone_number_id,
    })

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
      customerName: booking.customer_name || undefined,
      customerPhone: phone,
      messageText: message,
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

    const config = await getWhatsAppBotConfig(tenantId)

    const testMessage = 
`🤖 *CANCHARCLUB — PRUEBA DE BOT WHATSAPP*

¡Conexión verificada con éxito!
Tu bot de automatización de CancharClub está activo y listo para despachar:
• Confirmaciones de reservas online
• Recordatorios automáticos 2 horas antes
• Alertas instantáneas a lista de espera

Fecha y hora: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`

    const sendRes = await sendWhatsAppMessage(cleanPhone, testMessage, {
      token: config.api_key,
      phoneId: config.phone_number_id,
    })

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

/**
 * Envía avisos automáticos de lluvia masivos a los jugadores afectados
 */
export async function sendAutomatedRainAlerts(
  tenantId: string,
  affectedBookings: Array<{
    bookingId: string
    customerName: string
    customerPhone: string
    courtName: string
    timeStr: string
    depositArs: number
    rescheduleUrl?: string
  }>
): Promise<{ success: boolean; sentCount: number; errorsCount: number }> {
  try {
    const config = await getWhatsAppBotConfig(tenantId)
    let sentCount = 0
    let errorsCount = 0

    for (const item of affectedBookings) {
      if (!item.customerPhone || item.customerPhone.trim().length < 6) {
        errorsCount++
        continue
      }

      const message =
`🌧️ *AVISO DE LLUVIA — CANCELACIÓN PREVENTIVA*

Hola *${item.customerName}*, te escribimos de parte del club.
Debido a las condiciones climáticas adversas, el turno de hoy a las *${item.timeStr} hs* en *${item.courtName}* fue cancelado por protocolo de seguridad.

💰 *Tu seña de ${formatARS(item.depositArs)} ya quedó acreditada al 100% como saldo a favor en tu Billetera CancharClub*, disponible automáticamente para tu próxima reserva.

¡Cuidate y te esperamos en tu próximo partido!`

      try {
        const sendRes = await sendWhatsAppMessage(item.customerPhone, message, {
          token: config.api_key,
          phoneId: config.phone_number_id,
        })

        await logAutomatedMessage(tenantId, {
          recipient_phone: item.customerPhone,
          recipient_name: item.customerName,
          message_type: 'TEST',
          content: message,
          status: sendRes.isSimulated ? 'SIMULATED' : (sendRes.success ? 'SENT' : 'FAILED'),
          sent_at: new Date().toISOString(),
        })

        if (sendRes.success) sentCount++
        else errorsCount++
      } catch {
        errorsCount++
      }
    }

    return { success: true, sentCount, errorsCount }
  } catch (err) {
    console.error('[sendAutomatedRainAlerts] Error:', err)
    return { success: false, sentCount: 0, errorsCount: affectedBookings.length }
  }
}

/**
 * Envío de Recordatorio 2 Horas Antes por WhatsApp con ubicación y voucher
 */
export async function sendTurnoReminderWhatsApp(
  bookingId: string
): Promise<{ success: boolean; error?: string; waUrl?: string; isSimulated?: boolean }> {
  try {
    const supabase = await createServiceClient()
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('id, tenant_id, customer_name, customer_phone, booked_at, price_total_cents, deposit_cents, staff_deposit_amount_cents, staff_notes, recurring_slot_id, courts(name, sport), tenants(name, address, google_maps_url)')
      .eq('id', bookingId)
      .maybeSingle()

    if (bErr || !booking) {
      return { success: false, error: 'Reserva no encontrada' }
    }

    const phone = booking.customer_phone
    if (!phone || phone.trim().length < 6) {
      return { success: false, error: 'El cliente no tiene teléfono válido' }
    }

    const config = await getWhatsAppBotConfig(booking.tenant_id)
    const courtObj = Array.isArray(booking.courts) ? booking.courts[0] : booking.courts
    const tenantObj = Array.isArray(booking.tenants) ? booking.tenants[0] : booking.tenants
    const courtName = courtObj?.name || 'Cancha'
    const clubName = tenantObj?.name || 'Club Deportivo'
    const mapsLink = tenantObj?.google_maps_url ? `📍 Ubicación: ${tenantObj.google_maps_url}\n` : ''

    let timeStr = '19:00'
    if (booking.booked_at) {
      const match = booking.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
      if (match?.[1]) {
        const raw = match[1].trim()
        const iso = raw.includes(' ') ? raw.replace(' ', 'T') : raw
        const d = new Date(iso)
        if (!isNaN(d.getTime())) {
          timeStr = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
        }
      }
    }

    const isAbonoTurn = isAbonoBooking({
      recurring_slot_id: (booking as { recurring_slot_id?: string | null }).recurring_slot_id,
      staff_notes: (booking as { staff_notes?: string | null }).staff_notes,
    })

    const totalArs = Math.round(Number(booking.price_total_cents || 0) / 100)
    const paidArs = isAbonoTurn
      ? totalArs
      : Math.round(Number(booking.staff_deposit_amount_cents ?? booking.deposit_cents ?? 0) / 100)
    const balanceArs = isAbonoTurn ? 0 : Math.max(0, totalArs - paidArs)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.cancharclub.com.ar'
    const splitUrl = `${appUrl}/partido/${booking.id}`

    const balanceMessageText = isAbonoTurn
      ? '$0 (Cubierto por abono mensual)'
      : (balanceArs > 0 ? formatARS(balanceArs) : '$0 (Al día)')

    const message =
`⏰ *RECORDATORIO DE TURNO — EN 2 HORAS* 🎾

Hola *${booking.customer_name}*, te recordamos que hoy tenés turno:

🏟️ *Cancha:* ${courtName} (${clubName})
⏰ *Horario:* ${timeStr} hs
${mapsLink}💰 *Saldo a abonar en mostrador:* ${balanceMessageText}

👥 ¿Jugás con amigos? Dividí el pago acá:
${splitUrl}

¡Te esperamos! Por favor presentate 10 minutos antes.`

    const sendRes = await sendWhatsAppMessage(phone, message, {
      token: config.api_key,
      phoneId: config.phone_number_id,
    })

    await logAutomatedMessage(booking.tenant_id, {
      recipient_phone: phone,
      recipient_name: booking.customer_name || 'Cliente',
      message_type: 'REMINDER_2H',
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
    const msg = err instanceof Error ? err.message : 'Error al enviar recordatorio'
    return { success: false, error: msg }
  }
}

/**
 * Obtener turnos programados para hoy para la grilla de recordatorios de WhatsApp
 */
export async function getTodayTurnosForReminders(tenantId: string): Promise<Array<{
  id: string
  customerName: string
  customerPhone: string
  courtName: string
  timeStr: string
  balanceArs: number
  alreadyReminded: boolean
}>> {
  try {
    const supabase = await createServiceClient()
    const todayArg = getArgentinaTodayIso()
    const startOfDay = new Date(`${todayArg}T00:00:00-03:00`).toISOString()
    const endOfDay = new Date(`${todayArg}T23:59:59.999-03:00`).toISOString()

    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, customer_name, customer_phone, booked_at, price_total_cents, deposit_cents, staff_deposit_amount_cents, staff_notes, recurring_slot_id, courts(name)')
      .eq('tenant_id', tenantId)
      .filter('booked_at', 'ov', `[${startOfDay},${endOfDay}]`)
      .not('status', 'ilike', '%cancel%')
      .order('booked_at', { ascending: true })

    if (!bookings || bookings.length === 0) return []

    // Obtener logs de recordatorios ya enviados hoy en horario local de Argentina
    const { data: todayLogs } = await supabase
      .from('audit_log')
      .select('new_data')
      .eq('tenant_id', tenantId)
      .eq('action', 'WHATSAPP_MESSAGE_SENT')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)

    const remindedPhones = new Set<string>()
    if (todayLogs) {
      todayLogs.forEach((l) => {
        const d = l.new_data as { recipient_phone?: string; message_type?: string }
        if (d?.message_type === 'REMINDER_2H' && d.recipient_phone) {
          remindedPhones.add(d.recipient_phone)
        }
      })
    }

    return bookings.map((b) => {
      const courtObj = Array.isArray(b.courts) ? b.courts[0] : b.courts
      let timeStr = '19:00'
      if (b.booked_at) {
        const match = b.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
        if (match?.[1]) {
          const raw = match[1].trim()
          const iso = raw.includes(' ') ? raw.replace(' ', 'T') : raw
          const d = new Date(iso)
          if (!isNaN(d.getTime())) {
            timeStr = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
          }
        }
      }

      const isAbonoTurn = isAbonoBooking({
        recurring_slot_id: (b as { recurring_slot_id?: string | null }).recurring_slot_id,
        staff_notes: (b as { staff_notes?: string | null }).staff_notes,
      })

      const totalArs = Math.round(Number(b.price_total_cents || 0) / 100)
      const paidArs = isAbonoTurn
        ? totalArs
        : Math.round(Number(b.staff_deposit_amount_cents ?? b.deposit_cents ?? 0) / 100)
      const balanceArs = isAbonoTurn ? 0 : Math.max(0, totalArs - paidArs)
      const phone = b.customer_phone || ''

      return {
        id: b.id,
        customerName: b.customer_name || 'Cliente',
        customerPhone: phone,
        courtName: courtObj?.name || 'Cancha',
        timeStr,
        balanceArs,
        alreadyReminded: remindedPhones.has(phone),
      }
    })
  } catch (err) {
    console.error('[getTodayTurnosForReminders] Error:', err)
    return []
  }
}

