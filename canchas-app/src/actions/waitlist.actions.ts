'use server'
// src/actions/waitlist.actions.ts
// ==============================================================================
// SERVER ACTIONS — Lista de Espera Automática con Prioridad de 10 min (Horarios Pico)
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

// Almacén en memoria como respaldo de contingencia si la tabla 'waitlists' aún no fue migrada en Supabase
const memoryWaitlists: WaitlistEntry[] = []

function isTableMissingError(error?: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const msg = (error.message || '').toLowerCase()
  return (
    error.code === 'PGRST205' ||
    msg.includes("could not find the table 'public.waitlists'") ||
    msg.includes('relation "public.waitlists" does not exist') ||
    (msg.includes('waitlists') && msg.includes('schema cache'))
  )
}

/** Inscribir un cliente en la lista de espera para un horario ocupado */
export async function addToWaitlist(payload: {
  tenant_id: string
  court_id?: string | null
  date: string
  time_slot: string
  customer_name: string
  customer_phone: string
}): Promise<{ success: boolean; entry?: WaitlistEntry; error?: string }> {
  try {
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

    if (error) {
      if (isTableMissingError(error)) {
        console.warn('[addToWaitlist] Tabla waitlists pendiente en DB, guardando en contingencia memoria.')
        const fallbackEntry: WaitlistEntry = {
          id: `wl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          tenant_id: payload.tenant_id,
          court_id: payload.court_id || null,
          date: payload.date,
          time_slot: payload.time_slot,
          customer_name: payload.customer_name,
          customer_phone: payload.customer_phone,
          status: 'WAITING',
          created_at: new Date().toISOString(),
        }
        memoryWaitlists.push(fallbackEntry)
        try { revalidatePath('/dashboard') } catch {}
        return { success: true, entry: fallbackEntry }
      }

      console.warn('[addToWaitlist] Error:', error.message)
      return { success: false, error: error.message }
    }

    try { revalidatePath('/dashboard') } catch {}
    return { success: true, entry: data as WaitlistEntry }
  } catch (err) {
    console.error('[addToWaitlist] Unexpected error:', err)
    return { success: false, error: 'Error al anotarse en la lista de espera' }
  }
}

/** Obtener la lista de espera activa de un club para una fecha */
export async function getTenantWaitlists(
  tenantId: string,
  date?: string
): Promise<WaitlistEntry[]> {
  try {
    const authCheck = await assertTenantMember(tenantId)
    if (!authCheck.authorized) {
      return []
    }

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
      console.warn('[getTenantWaitlists] DB warning:', error.message)
      return memoryWaitlists.filter(
        w => w.tenant_id === tenantId && (date ? w.date === date : true) && (w.status === 'WAITING' || w.status === 'NOTIFIED')
      )
    }

    const dbEntries = (data as unknown as WaitlistEntry[]) || []
    const memoryMatches = memoryWaitlists.filter(
      w => w.tenant_id === tenantId && (date ? w.date === date : true) && (w.status === 'WAITING' || w.status === 'NOTIFIED')
    )
    return [...dbEntries, ...memoryMatches]
  } catch {
    return memoryWaitlists.filter(
      w => w.tenant_id === tenantId && (date ? w.date === date : true) && (w.status === 'WAITING' || w.status === 'NOTIFIED')
    )
  }
}

/** 
 * Trigger al cancelar una reserva:
 * Busca si hay alguien esperando ese día y horario y le asigna 10 minutos de exclusividad
 */
export async function processWaitlistOnCancellation(params: {
  tenantId: string
  date: string
  timeSlot: string
  courtId?: string | null
}): Promise<WaitlistNotificationResult> {
  try {
    // Si el turno a cancelar ya ha pasado en el tiempo, no despachar lista de espera
    if (isSlotTimeInPast(params.date, params.timeSlot)) {
      return { hasWaitlistMatch: false }
    }

    const supabase = await createServiceClient()

    // 1. Buscar primer cliente en espera para esa fecha y horario (priorizando cancha específica o cualquiera)
    let query = supabase
      .from('waitlists')
      .select('*')
      .eq('tenant_id', params.tenantId)
      .eq('date', params.date)
      .eq('time_slot', params.timeSlot)
      .eq('status', 'WAITING')

    if (params.courtId) {
      query = query.or(`court_id.eq.${params.courtId},court_id.is.null`)
    }

    const { data: waitlistData, error } = await query
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    let waitlist: WaitlistEntry | undefined = waitlistData as WaitlistEntry | undefined
    if (error || !waitlist) {
      waitlist = memoryWaitlists.find(
        w => w.tenant_id === params.tenantId &&
          w.date === params.date &&
          w.time_slot === params.timeSlot &&
          w.status === 'WAITING' &&
          (!params.courtId || !w.court_id || w.court_id === params.courtId)
      )
    }

    if (!waitlist) {
      return { hasWaitlistMatch: false }
    }

    // 2. Asignar ventana de prioridad de 10 minutos
    const priorityExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const notifiedAt = new Date().toISOString()

    try {
      await supabase
        .from('waitlists')
        .update({
          status: 'NOTIFIED',
          priority_expires_at: priorityExpiresAt,
          notified_at: notifiedAt,
        })
        .eq('id', waitlist.id)
    } catch {
      // En fallback en memoria
    }

    waitlist.status = 'NOTIFIED'
    waitlist.priority_expires_at = priorityExpiresAt
    waitlist.notified_at = notifiedAt

    // 3. Obtener nombre del club para el mensaje
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, slug')
      .eq('id', params.tenantId)
      .single()

    const clubName = tenant?.name || 'CancharClub'
    const clubSlug = tenant?.slug || 'club'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cancharclub.com.ar'
    const courtParam = params.courtId || waitlist.court_id ? `&courtId=${params.courtId || waitlist.court_id}` : ''
    const claimUrl = `${appUrl}/club/${clubSlug}?claim_slot=${waitlist.id}&time=${params.timeSlot}&date=${params.date}${courtParam}`

    const messageText = `¡Buenas noticias ${waitlist.customer_name}! 🎾 Se liberó un turno para el día ${params.date} a las ${params.timeSlot} hs en ${clubName}. Tenés 10 minutos de prioridad exclusiva para confirmar tu reserva en este link antes de publicarlo a otros jugadores:\n${claimUrl}`

    const whatsAppUrl = buildWhatsAppLink(waitlist.customer_phone, messageText)

    // Despacho automático no-bloqueante por WhatsApp API si está configurada
    if (waitlist.customer_phone) {
      sendWhatsAppMessage(waitlist.customer_phone, messageText).catch(err =>
        console.error('[Waitlist WhatsApp AutoSend Error]', err)
      )
    }

    return {
      hasWaitlistMatch: true,
      notifiedEntry: waitlist as WaitlistEntry,
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
 * Verifica si un token claim_slot de lista de espera es válido, está activo y dentro de sus 10 min.
 */
export async function verifyWaitlistClaim(claimId: string): Promise<{
  valid: boolean
  entry?: WaitlistEntry
  secondsRemaining?: number
  error?: string
}> {
  try {
    const cleanId = (claimId || '').trim()
    if (!cleanId) return { valid: false, error: 'Identificador de reclamo inválido.' }

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from('waitlists')
      .select('*')
      .eq('id', cleanId)
      .maybeSingle()

    let entry: WaitlistEntry | undefined = data as unknown as WaitlistEntry | undefined
    if (error || !entry) {
      entry = memoryWaitlists.find(w => w.id === cleanId)
    }

    if (!entry) {
      return { valid: false, error: 'No se encontró la reserva de lista de espera.' }
    }

    if (entry.status === 'CLAIMED') {
      return { valid: false, error: 'Este turno ya fue reservado.' }
    }

    const expTime = entry.priority_expires_at ? new Date(entry.priority_expires_at).getTime() : 0
    const nowTime = Date.now()
    const secondsRemaining = Math.max(0, Math.floor((expTime - nowTime) / 1000))

    if (secondsRemaining <= 0) {
      return {
        valid: false,
        error: 'Tu tiempo de prioridad exclusiva de 10 minutos ha expirado. El turno quedó abierto al público.',
      }
    }

    return {
      valid: true,
      entry,
      secondsRemaining,
    }
  } catch (err) {
    console.error('[verifyWaitlistClaim] Error:', err)
    return { valid: false, error: 'Error al verificar prioridad de lista de espera' }
  }
}

/**
 * Marca una entrada de lista de espera como reclamada / reservada con éxito
 */
export async function markWaitlistAsClaimed(claimId: string): Promise<boolean> {
  try {
    const cleanId = (claimId || '').trim()
    if (!cleanId) return false

    const supabase = await createServiceClient()
    await supabase
      .from('waitlists')
      .update({ status: 'CLAIMED' })
      .eq('id', cleanId)

    const mem = memoryWaitlists.find(w => w.id === cleanId)
    if (mem) mem.status = 'CLAIMED'

    return true
  } catch (err) {
    console.warn('[markWaitlistAsClaimed] Error:', err)
    return false
  }
}

/**
 * Obtiene turnos con prioridad activa de lista de espera para un club y fecha
 */
export async function getWaitlistActivePriorities(
  tenantId: string,
  date: string
): Promise<Array<{ id: string; court_id: string | null; time_slot: string; expires_at: string }>> {
  try {
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

    // Complementar con memoria si existe
    const nowMs = Date.now()
    for (const mem of memoryWaitlists) {
      if (
        mem.tenant_id === tenantId &&
        mem.date === date &&
        mem.status === 'NOTIFIED' &&
        mem.priority_expires_at &&
        new Date(mem.priority_expires_at).getTime() > nowMs &&
        !list.some(l => l.id === mem.id)
      ) {
        list.push({
          id: mem.id,
          court_id: mem.court_id || null,
          time_slot: mem.time_slot,
          expires_at: mem.priority_expires_at,
        })
      }
    }

    return list
  } catch (err) {
    console.warn('[getWaitlistActivePriorities] Error:', err)
    return []
  }
}
