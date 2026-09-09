'use server'
// src/actions/waitlist.actions.ts
// ==============================================================================
// SERVER ACTIONS — Lista de Espera Automática con Prioridad de 10 min (Horarios Pico)
// ==============================================================================

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { buildWhatsAppLink } from '@/lib/utils'
import type { WaitlistEntry } from '@/types/database'

export interface WaitlistNotificationResult {
  hasWaitlistMatch: boolean
  notifiedEntry?: WaitlistEntry
  whatsAppUrl?: string
  messageText?: string
  priorityExpiresAt?: string
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
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from('waitlists')
      .insert({
        tenant_id: payload.tenant_id,
        court_id: payload.court_id || null,
        date: payload.date,
        time_slot: payload.time_slot,
        customer_name: payload.customer_name,
        customer_phone: payload.customer_phone,
        status: 'WAITING',
      })
      .select()
      .single()

    if (error) {
      console.warn('[addToWaitlist] Error:', error.message)
      return { success: false, error: error.message }
    }

    revalidatePath('/dashboard')
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
      return []
    }

    return (data as unknown as WaitlistEntry[]) || []
  } catch {
    return []
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
}): Promise<WaitlistNotificationResult> {
  try {
    const supabase = await createServiceClient()

    // 1. Buscar primer cliente en espera para esa fecha y horario
    const { data: waitlist, error } = await supabase
      .from('waitlists')
      .select('*')
      .eq('tenant_id', params.tenantId)
      .eq('date', params.date)
      .eq('time_slot', params.timeSlot)
      .eq('status', 'WAITING')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error || !waitlist) {
      return { hasWaitlistMatch: false }
    }

    // 2. Asignar ventana de prioridad de 10 minutos
    const priorityExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const notifiedAt = new Date().toISOString()

    await supabase
      .from('waitlists')
      .update({
        status: 'NOTIFIED',
        priority_expires_at: priorityExpiresAt,
        notified_at: notifiedAt,
      })
      .eq('id', waitlist.id)

    // 3. Obtener nombre del club para el mensaje
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, slug')
      .eq('id', params.tenantId)
      .single()

    const clubName = tenant?.name || 'CancharClub'
    const clubSlug = tenant?.slug || 'club'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cancharclub.com.ar'
    const claimUrl = `${appUrl}/club/${clubSlug}?claim_slot=${waitlist.id}&time=${params.timeSlot}`

    const messageText = `¡Buenas noticias ${waitlist.customer_name}! Se liberó un turno para hoy a las ${params.timeSlot} hs en ${clubName}. Tenés 10 minutos de prioridad exclusiva para confirmar tu reserva en este link: ${claimUrl}`

    const whatsAppUrl = buildWhatsAppLink(waitlist.customer_phone, messageText)

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
