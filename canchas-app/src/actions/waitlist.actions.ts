'use server'
// src/actions/waitlist.actions.ts
// ==============================================================================
// SERVER ACTIONS — Lista de Espera Automática con Prioridad de 10 min (Horarios Pico)
// Gestión atómica, aislamiento multi-tenant estricto y cascada secuencial.
// ==============================================================================

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { buildWhatsAppLink, isSlotTimeInPast } from '@/lib/utils'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { assertTenantMember } from '@/lib/auth-security'
import { sanitizeText } from '@/lib/sanitize'
import type { WaitlistEntry } from '@/types/database'

export interface WaitlistNotificationResult {
  hasWaitlistMatch: boolean
  notifiedEntry?: WaitlistEntry
  whatsAppUrl?: string
  messageText?: string
  priorityExpiresAt?: string
}

function isValidUuid(id?: string | null): boolean {
  return Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
}

/**
 * Inscribir un cliente en la lista de espera para un horario ocupado.
 * Persistencia atómica en PostgreSQL con aislamiento estricto por tenant_id.
 */
export async function addToWaitlist(payload: {
  tenant_id: string
  court_id?: string | null
  date: string
  time_slot: string
  customer_name: string
  customer_phone: string
}): Promise<{ success: boolean; entry?: WaitlistEntry; error?: string }> {
  try {
    if (!isValidUuid(payload.tenant_id)) {
      return { success: false, error: 'Identificador de club inválido.' }
    }

    if (payload.court_id && !isValidUuid(payload.court_id)) {
      return { success: false, error: 'Identificador de cancha inválido.' }
    }

    const cleanName = sanitizeText(payload.customer_name || '', 60).trim()
    const cleanPhone = (payload.customer_phone || '').replace(/[^\d+]/g, '').trim()

    if (cleanName.length < 2) {
      return { success: false, error: 'Por favor ingresá un nombre válido.' }
    }
    if (cleanPhone.length < 6) {
      return { success: false, error: 'Por favor ingresá un número de WhatsApp válido.' }
    }

    if (isSlotTimeInPast(payload.date, payload.time_slot)) {
      return {
        success: false,
        error: 'No podés anotarte en lista de espera para un horario que ya pasó.',
      }
    }

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from('waitlists')
      .insert({
        tenant_id: payload.tenant_id,
        court_id: payload.court_id || null,
        date: payload.date,
        time_slot: payload.time_slot,
        customer_name: cleanName,
        customer_phone: cleanPhone,
        status: 'WAITING',
      })
      .select()
      .single()

    if (error || !data) {
      console.error('[addToWaitlist] Error al insertar en PostgreSQL:', error?.message)
      return { success: false, error: error?.message || 'Error al guardar inscripción en lista de espera.' }
    }

    try { revalidatePath('/dashboard') } catch {}
    return { success: true, entry: data as WaitlistEntry }
  } catch (err) {
    console.error('[addToWaitlist] Unexpected error:', err)
    return { success: false, error: 'Error al anotarse en la lista de espera' }
  }
}

/**
 * Obtener la lista de espera activa de un club para una fecha (solo personal autorizado).
 */
export async function getTenantWaitlists(
  tenantId: string,
  date?: string
): Promise<WaitlistEntry[]> {
  try {
    if (!isValidUuid(tenantId)) return []

    const authCheck = await assertTenantMember(tenantId)
    if (!authCheck.authorized) {
      return []
    }

    // Ejecutar cascada preventiva de prioridades vencidas
    await advanceWaitlistCascade(tenantId)

    const supabase = await createClient()
    let query = supabase
      .from('waitlists')
      .select('*, court:courts(name, sport)')
      .eq('tenant_id', tenantId)
      .in('status', ['WAITING', 'NOTIFIED'])
      .order('created_at', { ascending: true })

    if (date) {
      query = query.eq('date', date)
    }

    const { data, error } = await query
    if (error) {
      console.error('[getTenantWaitlists] DB error:', error.message)
      return []
    }

    return (data as unknown as WaitlistEntry[]) || []
  } catch (err) {
    console.error('[getTenantWaitlists] Unexpected error:', err)
    return []
  }
}

/** 
 * Trigger al cancelar una reserva:
 * Busca si hay alguien esperando ese día y horario y le asigna 10 minutos de exclusividad.
 * Orden FIFO estricto (created_at ASC) priorizando cancha específica sobre cancha libre.
 */
export async function processWaitlistOnCancellation(params: {
  tenantId: string
  date: string
  timeSlot: string
  courtId?: string | null
}): Promise<WaitlistNotificationResult> {
  try {
    if (!isValidUuid(params.tenantId)) {
      return { hasWaitlistMatch: false }
    }

    // Si el turno ya pasó, no despachar lista de espera
    if (isSlotTimeInPast(params.date, params.timeSlot)) {
      return { hasWaitlistMatch: false }
    }

    const supabase = await createServiceClient()
    const nowIso = new Date().toISOString()

    // 0. Si ya existe un jugador con prioridad exclusiva NOTIFIED aún no expirada para este horario, no sobreescribir
    const { data: currentActive } = await supabase
      .from('waitlists')
      .select('id, priority_expires_at')
      .eq('tenant_id', params.tenantId)
      .eq('date', params.date)
      .eq('time_slot', params.timeSlot)
      .eq('status', 'NOTIFIED')
      .gt('priority_expires_at', nowIso)
      .limit(1)
      .maybeSingle()

    if (currentActive) {
      return { hasWaitlistMatch: false }
    }

    // 1. Buscar primer cliente en espera para esa fecha y horario (FIFO: created_at ASC)
    let query = supabase
      .from('waitlists')
      .select('*')
      .eq('tenant_id', params.tenantId)
      .eq('date', params.date)
      .eq('time_slot', params.timeSlot)
      .eq('status', 'WAITING')

    if (params.courtId && isValidUuid(params.courtId)) {
      query = query.or(`court_id.eq.${params.courtId},court_id.is.null`)
    }

    const { data: candidates, error } = await query
      .order('court_id', { ascending: false, nullsFirst: false }) // Cancha específica primero
      .order('created_at', { ascending: true }) // Primer orden de llegada (FIFO)
      .limit(1)

    const waitlist = candidates?.[0] as WaitlistEntry | undefined
    if (error || !waitlist) {
      return { hasWaitlistMatch: false }
    }

    // 2. Asignar ventana de prioridad de 10 minutos de forma atómica
    const priorityExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const notifiedAt = new Date().toISOString()

    const { data: updatedEntry, error: updateErr } = await supabase
      .from('waitlists')
      .update({
        status: 'NOTIFIED',
        priority_expires_at: priorityExpiresAt,
        notified_at: notifiedAt,
      })
      .eq('id', waitlist.id)
      .eq('status', 'WAITING') // Condición atómica para prevenir race conditions concurrentes
      .select()
      .maybeSingle()

    if (updateErr || !updatedEntry) {
      console.warn('[processWaitlistOnCancellation] No se pudo asignar status NOTIFIED de forma atómica')
      return { hasWaitlistMatch: false }
    }

    // 3. Obtener metadatos del club para el enlace y mensaje de WhatsApp
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, slug')
      .eq('id', params.tenantId)
      .single()

    const clubName = tenant?.name || 'CancharClub'
    const clubSlug = tenant?.slug || 'club'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cancharclub.com.ar'
    const courtParam = params.courtId || updatedEntry.court_id ? `&courtId=${params.courtId || updatedEntry.court_id}` : ''
    const claimUrl = `${appUrl}/club/${clubSlug}?claim_slot=${updatedEntry.id}&time=${params.timeSlot}&date=${params.date}${courtParam}`

    const messageText = `¡Buenas noticias ${updatedEntry.customer_name}! 🎾 Se liberó un turno para el día ${params.date} a las ${params.timeSlot} hs en ${clubName}. Tenés 10 minutos de prioridad exclusiva para confirmar tu reserva en este link antes de publicarlo a otros jugadores:\n${claimUrl}`

    const whatsAppUrl = buildWhatsAppLink(updatedEntry.customer_phone, messageText)

    // Despacho no-bloqueante por WhatsApp API si está configurada
    if (updatedEntry.customer_phone) {
      sendWhatsAppMessage(updatedEntry.customer_phone, messageText).catch(err =>
        console.error('[Waitlist WhatsApp AutoSend Error]', err)
      )
    }

    return {
      hasWaitlistMatch: true,
      notifiedEntry: updatedEntry as WaitlistEntry,
      whatsAppUrl,
      messageText,
      priorityExpiresAt,
    }
  } catch (err) {
    console.error('[processWaitlistOnCancellation] Error:', err)
    return { hasWaitlistMatch: false }
  }
}

/**
 * Cascada Automática y Secuencial de Lista de Espera:
 * Si pasaron los 10 minutos de exclusividad y el turno no fue reclamado,
 * expira la notificación actual y le otorga 10 minutos al siguiente jugador en la fila (FIFO).
 */
export async function advanceWaitlistCascade(tenantId?: string): Promise<{
  expiredCount: number
  cascadedCount: number
}> {
  let expiredCount = 0
  let cascadedCount = 0

  try {
    const supabase = await createServiceClient()
    const nowIso = new Date().toISOString()

    let query = supabase
      .from('waitlists')
      .select('id, tenant_id, court_id, date, time_slot, customer_name, customer_phone')
      .eq('status', 'NOTIFIED')
      .lte('priority_expires_at', nowIso)

    if (tenantId && isValidUuid(tenantId)) {
      query = query.eq('tenant_id', tenantId)
    }

    const { data: expiredEntries, error } = await query
    if (error || !expiredEntries || expiredEntries.length === 0) {
      return { expiredCount: 0, cascadedCount: 0 }
    }

    for (const exp of expiredEntries) {
      // 1. Marcar la entrada como EXPIRED de forma atómica
      const { data: marked } = await supabase
        .from('waitlists')
        .update({ status: 'EXPIRED' })
        .eq('id', exp.id)
        .eq('status', 'NOTIFIED')
        .select('id')
        .maybeSingle()

      if (!marked) continue
      expiredCount++

      // 2. Verificar si el turno ya fue ocupado en bookings por reserva manual o admin
      const { data: booked } = await supabase
        .from('bookings')
        .select('id')
        .eq('tenant_id', exp.tenant_id)
        .neq('status', 'cancelled')
        .limit(1)

      // 3. Disparar notificación al SIGUIENTE jugador en la fila
      const cascadeResult = await processWaitlistOnCancellation({
        tenantId: exp.tenant_id,
        courtId: exp.court_id,
        date: exp.date,
        timeSlot: exp.time_slot,
      })

      if (cascadeResult.hasWaitlistMatch) {
        cascadedCount++
      }
    }

    return { expiredCount, cascadedCount }
  } catch (err) {
    console.error('[advanceWaitlistCascade] Error:', err)
    return { expiredCount, cascadedCount }
  }
}

/**
 * Verifica si un token claim_slot de lista de espera es válido, está activo y dentro de sus 10 min.
 * Si la ventana expiró, avanza automáticamente la cascada para el siguiente jugador.
 */
export async function verifyWaitlistClaim(claimId: string): Promise<{
  valid: boolean
  entry?: WaitlistEntry
  secondsRemaining?: number
  error?: string
}> {
  try {
    const cleanId = (claimId || '').trim()
    if (!isValidUuid(cleanId)) {
      return { valid: false, error: 'Identificador de reclamo inválido.' }
    }

    const supabase = await createServiceClient()
    const { data: entry, error } = await supabase
      .from('waitlists')
      .select('*')
      .eq('id', cleanId)
      .maybeSingle()

    if (error || !entry) {
      return { valid: false, error: 'No se encontró la reserva de lista de espera.' }
    }

    if (entry.status === 'CLAIMED') {
      return { valid: false, error: 'Este turno ya fue reservado.' }
    }

    if (entry.status === 'EXPIRED') {
      return {
        valid: false,
        error: 'Tu tiempo de prioridad exclusiva de 10 minutos ha expirado. El turno fue ofrecido al siguiente jugador en espera.',
      }
    }

    if (entry.status !== 'NOTIFIED') {
      return { valid: false, error: 'Esta reserva de lista de espera no cuenta con prioridad activa.' }
    }

    const expTime = entry.priority_expires_at ? new Date(entry.priority_expires_at).getTime() : 0
    const nowTime = Date.now()
    const secondsRemaining = Math.max(0, Math.floor((expTime - nowTime) / 1000))

    if (secondsRemaining <= 0) {
      // Expiración inmediata y avance de cascada al siguiente en fila
      await supabase
        .from('waitlists')
        .update({ status: 'EXPIRED' })
        .eq('id', cleanId)
        .eq('status', 'NOTIFIED')

      void processWaitlistOnCancellation({
        tenantId: entry.tenant_id,
        courtId: entry.court_id,
        date: entry.date,
        timeSlot: entry.time_slot,
      })

      return {
        valid: false,
        error: 'Tu tiempo de prioridad exclusiva de 10 minutos ha expirado. El turno fue ofrecido al siguiente jugador en espera.',
      }
    }

    return {
      valid: true,
      entry: entry as WaitlistEntry,
      secondsRemaining,
    }
  } catch (err) {
    console.error('[verifyWaitlistClaim] Error:', err)
    return { valid: false, error: 'Error al verificar prioridad de lista de espera' }
  }
}

/**
 * Reclama un turno de lista de espera de forma estrictamente atómica.
 * Protege contra Race Conditions: solo una transacción concurrente puede
 * transicionar el registro de NOTIFIED a CLAIMED.
 */
export async function claimWaitlistSlotAtomically(claimId: string): Promise<boolean> {
  try {
    const cleanId = (claimId || '').trim()
    if (!isValidUuid(cleanId)) return false

    const supabase = await createServiceClient()

    // 1. Intentar mediante RPC atómico en PostgreSQL
    try {
      const { data: rpcSuccess, error: rpcErr } = await supabase.rpc('claim_waitlist_slot_atomic', {
        p_claim_id: cleanId,
      })
      if (!rpcErr && typeof rpcSuccess === 'boolean') {
        return rpcSuccess
      }
    } catch {
      // Fallback a UPDATE directo atómico si la función aún no fue migrada
    }

    // 2. UPDATE atómico con condición WHERE status='NOTIFIED' AND priority_expires_at > NOW()
    const nowIso = new Date().toISOString()
    const { data: updated, error } = await supabase
      .from('waitlists')
      .update({ status: 'CLAIMED' })
      .eq('id', cleanId)
      .eq('status', 'NOTIFIED')
      .gt('priority_expires_at', nowIso)
      .select('id')
      .maybeSingle()

    if (error || !updated) {
      return false
    }

    return true
  } catch (err) {
    console.error('[claimWaitlistSlotAtomically] Error:', err)
    return false
  }
}

/**
 * Alias de compatibilidad para marcar turno como reclamado.
 */
export async function markWaitlistAsClaimed(claimId: string): Promise<boolean> {
  return claimWaitlistSlotAtomically(claimId)
}

/**
 * Obtiene turnos con prioridad activa de lista de espera para un club y fecha.
 * Ejecuta cascada previa para descartar ventanas vencidas.
 */
export async function getWaitlistActivePriorities(
  tenantId: string,
  date: string
): Promise<Array<{ id: string; court_id: string | null; time_slot: string; expires_at: string }>> {
  try {
    if (!isValidUuid(tenantId)) return []

    // 1. Limpieza y avance de cascada en tiempo real
    await advanceWaitlistCascade(tenantId)

    const supabase = await createServiceClient()
    const nowIso = new Date().toISOString()
    const { data } = await supabase
      .from('waitlists')
      .select('id, court_id, time_slot, priority_expires_at')
      .eq('tenant_id', tenantId)
      .eq('date', date)
      .eq('status', 'NOTIFIED')
      .gt('priority_expires_at', nowIso)

    const list: Array<{ id: string; court_id: string | null; time_slot: string; expires_at: string }> = []
    if (data) {
      for (const row of data) {
        list.push({
          id: row.id,
          court_id: row.court_id,
          time_slot: row.time_slot,
          expires_at: row.priority_expires_at,
        })
      }
    }

    return list
  } catch (err) {
    console.warn('[getWaitlistActivePriorities] Error:', err)
    return []
  }
}
