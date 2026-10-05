'use server'
// src/actions/players.actions.ts
// ==============================================================================
// SERVER ACTIONS — Gestión y Reputación de Jugadores (Asistencia, No-Shows, Gastos)
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { assertTenantMember } from '@/lib/auth-security'
import { revalidatePath } from 'next/cache'

export type ReputationTier = 'EXEMPLARY' | 'RELIABLE' | 'MODERATE' | 'HIGH_RISK'

export interface PlayerSummary {
  phone: string
  name: string
  total_bookings: number
  completed_bookings: number
  no_show_count: number
  cancelled_count: number
  score_percentage: number
  total_spent_ars: number
  last_booking_date: string | null
  tier: ReputationTier
  is_high_risk: boolean
  is_blocked: boolean
  block_reason?: string | null
  notes?: string | null
}

export interface PlayerHistoryItem {
  id: string
  court_name: string
  starts_at: string
  status: string
  total_amount_ars: number
  deposit_amount_ars: number
  origin: string
}

export interface PlayersReportResult {
  success: boolean
  players: PlayerSummary[]
  stats: {
    totalPlayers: number
    exemplaryCount: number
    highRiskCount: number
    avgAttendanceRate: number
    totalRevenueTracked: number
  }
  error?: string
}

/**
 * Obtiene la lista agregada de todos los jugadores del club con sus métricas
 * calculadas a partir de la tabla bookings real.
 */
export async function getPlayersReputation(
  tenantId: string,
  searchQuery?: string
): Promise<PlayersReportResult> {
  try {
    const authCheck = await assertTenantMember(tenantId)
    if (!authCheck.authorized) {
      return {
        success: false,
        players: [],
        stats: { totalPlayers: 0, exemplaryCount: 0, highRiskCount: 0, avgAttendanceRate: 0, totalRevenueTracked: 0 },
        error: authCheck.error || 'No autorizado',
      }
    }

    const supabase = await createServiceClient()

    // 1. Obtener todas las reservas del tenant
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('id, customer_name, customer_phone, status, price_total_cents, booked_at, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[getPlayersReputation] Error:', error.message)
      return {
        success: false,
        players: [],
        stats: { totalPlayers: 0, exemplaryCount: 0, highRiskCount: 0, avgAttendanceRate: 0, totalRevenueTracked: 0 },
        error: error.message,
      }
    }

    if (!bookings || bookings.length === 0) {
      return {
        success: true,
        players: [],
        stats: { totalPlayers: 0, exemplaryCount: 0, highRiskCount: 0, avgAttendanceRate: 0, totalRevenueTracked: 0 },
      }
    }

    // 2. Agrupar por teléfono (o nombre si no tiene teléfono)
    const map = new Map<string, {
      name: string
      phone: string
      total: number
      completed: number
      noShow: number
      cancelled: number
      spent: number
      lastDate: string | null
    }>()

    for (const b of bookings) {
      const phone = (b.customer_phone || '').trim()
      const name = (b.customer_name || 'Jugador').trim()
      const key = phone || name

      if (!key) continue

      let startsAt: string | null = null
      if (b.booked_at) {
        const match = b.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
        if (match && match[1]) startsAt = match[1]
      }

      let record = map.get(key)
      if (!record) {
        record = {
          name,
          phone,
          total: 0,
          completed: 0,
          noShow: 0,
          cancelled: 0,
          spent: 0,
          lastDate: startsAt,
        }
        map.set(key, record)
      }

      record.total++

      const status = (b.status || '').toUpperCase()
      const spentAmount = Math.round((Number(b.price_total_cents) || 0) / 100)

      if (['COMPLETED', 'FULLY_PAID', 'CONFIRMED', 'CONFIRMED_CASH'].includes(status)) {
        record.completed++
        record.spent += spentAmount
      } else if (status === 'NO_SHOW') {
        record.noShow++
      } else if (status.startsWith('CANCEL')) {
        record.cancelled++
      }
    }

    // 2.5 Cargar datos de bloqueos y notas de jugadores para este tenant
    const statusMap = new Map<string, { is_blocked: boolean; block_reason?: string | null; notes?: string | null }>()

    const { data: dbPlayers, error: dbPlayersErr } = await supabase
      .from('players')
      .select('phone, is_blocked, internal_notes')
      .eq('tenant_id', tenantId)

    if (!dbPlayersErr && dbPlayers) {
      for (const p of dbPlayers) {
        if (p.phone) {
          statusMap.set(p.phone.trim(), {
            is_blocked: Boolean(p.is_blocked),
            notes: p.internal_notes || null,
          })
        }
      }
    } else {
      // Fallback audit_log para persistencia inmutable
      const { data: auditPlayers } = await supabase
        .from('audit_log')
        .select('record_id, new_data')
        .eq('tenant_id', tenantId)
        .eq('action', 'PLAYER_STATUS')

      if (auditPlayers) {
        for (const a of auditPlayers) {
          const d = (a.new_data || {}) as Record<string, unknown>
          const phoneKey = String(a.record_id || d.phone || '').trim()
          if (phoneKey) {
            statusMap.set(phoneKey, {
              is_blocked: Boolean(d.is_blocked),
              block_reason: d.block_reason ? String(d.block_reason) : null,
              notes: d.notes ? String(d.notes) : null,
            })
          }
        }
      }
    }

    // 3. Procesar scores y tiers
    const players: PlayerSummary[] = []
    let totalScoreSum = 0
    let exemplaryCount = 0
    let highRiskCount = 0
    let totalRevenue = 0

    map.forEach((item) => {
      const attendanceRate = item.total > 0
        ? Math.round((item.completed / item.total) * 100)
        : 100

      let tier: ReputationTier = 'RELIABLE'
      const isHighRisk = item.noShow >= 2 || (item.total >= 3 && attendanceRate < 50)

      if (isHighRisk) {
        tier = 'HIGH_RISK'
        highRiskCount++
      } else if (attendanceRate >= 90 && item.total >= 3) {
        tier = 'EXEMPLARY'
        exemplaryCount++
      } else if (attendanceRate >= 70) {
        tier = 'RELIABLE'
      } else {
        tier = 'MODERATE'
      }

      totalScoreSum += attendanceRate
      totalRevenue += item.spent

      const cleanPhone = item.phone.trim()
      const numericPhone = cleanPhone.replace(/\D/g, '')
      const statusInfo = statusMap.get(cleanPhone) || (numericPhone ? statusMap.get(numericPhone) : undefined)
      const isBlocked = statusInfo ? statusInfo.is_blocked : false
      const blockReason = statusInfo ? statusInfo.block_reason : null
      const notes = statusInfo ? statusInfo.notes : null

      players.push({
        phone: item.phone,
        name: item.name,
        total_bookings: item.total,
        completed_bookings: item.completed,
        no_show_count: item.noShow,
        cancelled_count: item.cancelled,
        score_percentage: attendanceRate,
        total_spent_ars: item.spent,
        last_booking_date: item.lastDate,
        tier,
        is_high_risk: isHighRisk,
        is_blocked: isBlocked,
        block_reason: blockReason,
        notes: notes,
      })
    })

    // Ordenar por total de reservas desc
    players.sort((a, b) => b.total_bookings - a.total_bookings)

    // Filtrar si hay búsqueda
    let filteredPlayers = players
    if (searchQuery && searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim()
      filteredPlayers = players.filter(
        p => p.name.toLowerCase().includes(q) || p.phone.includes(q)
      )
    }

    const totalPlayers = players.length
    const avgAttendanceRate = totalPlayers > 0 ? Math.round(totalScoreSum / totalPlayers) : 100

    return {
      success: true,
      players: filteredPlayers,
      stats: {
        totalPlayers,
        exemplaryCount,
        highRiskCount,
        avgAttendanceRate,
        totalRevenueTracked: totalRevenue,
      },
    }
  } catch (err) {
    console.error('[getPlayersReputation] Exception:', err)
    return {
      success: false,
      players: [],
      stats: { totalPlayers: 0, exemplaryCount: 0, highRiskCount: 0, avgAttendanceRate: 0, totalRevenueTracked: 0 },
      error: 'Error inesperado al cargar jugadores',
    }
  }
}

/**
 * Obtiene el historial de turnos de un jugador específico por teléfono
 */
export async function getPlayerHistory(
  tenantId: string,
  phone: string
): Promise<{ success: boolean; history: PlayerHistoryItem[]; error?: string }> {
  try {
    const authCheck = await assertTenantMember(tenantId)
    if (!authCheck.authorized) {
      return { success: false, history: [], error: authCheck.error || 'No autorizado' }
    }

    const supabase = await createServiceClient()
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('id, booked_at, status, price_total_cents, deposit_cents, payment_method, courts(name)')
      .eq('tenant_id', tenantId)
      .eq('customer_phone', phone)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return { success: false, history: [], error: error.message }
    }

    interface RawBooking {
      id: string
      booked_at?: string | null
      status: string
      price_total_cents?: number | null
      deposit_cents?: number | null
      payment_method?: string | null
      courts?: { name?: string | null } | Array<{ name?: string | null }> | null
    }

    const history: PlayerHistoryItem[] = ((bookings as unknown as RawBooking[]) || []).map((b) => {
      let startsAt = ''
      if (b.booked_at) {
        const match = b.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
        if (match && match[1]) startsAt = match[1]
      }
      const courtObj = Array.isArray(b.courts) ? b.courts[0] : b.courts

      return {
        id: b.id,
        court_name: courtObj?.name || 'Cancha',
        starts_at: startsAt,
        status: b.status,
        total_amount_ars: Math.round((Number(b.price_total_cents) || 0) / 100),
        deposit_amount_ars: Math.round((Number(b.deposit_cents) || 0) / 100),
        origin: b.payment_method?.toUpperCase() || 'MOSTRADOR',
      }
    })

    return { success: true, history }
  } catch (err) {
    console.error('[getPlayerHistory] Exception:', err)
    return { success: false, history: [], error: 'Error al consultar historial' }
  }
}

/**
 * Verifica si un número de teléfono está en la lista negra / bloqueado para un club
 */
export async function isPlayerBlocked(tenantId: string, phone: string): Promise<boolean> {
  if (!tenantId || !phone) return false
  const cleanPhone = phone.trim()
  const numericPhone = cleanPhone.replace(/\D/g, '')

  try {
    const supabase = await createServiceClient()

    // 1. Intentar consultar tabla players
    const { data: player, error } = await supabase
      .from('players')
      .select('is_blocked')
      .eq('tenant_id', tenantId)
      .in('phone', [cleanPhone, numericPhone].filter(Boolean))
      .eq('is_blocked', true)
      .limit(1)

    if (!error && player && player.length > 0) {
      return true
    }

    // 2. Fallback audit_log
    const { data: auditData } = await supabase
      .from('audit_log')
      .select('new_data')
      .eq('tenant_id', tenantId)
      .eq('action', 'PLAYER_STATUS')
      .in('record_id', [cleanPhone, numericPhone].filter(Boolean))
      .order('created_at', { ascending: false })
      .limit(1)

    if (auditData && auditData.length > 0) {
      const d = auditData[0].new_data as Record<string, unknown>
      return Boolean(d?.is_blocked)
    }

    return false
  } catch (err) {
    console.warn('[isPlayerBlocked] Warning:', err)
    return false
  }
}

/**
 * Bloquear o desbloquear a un jugador en el club
 */
export async function toggleBlockPlayer(
  tenantId: string,
  phone: string,
  reason?: string
): Promise<{ success: boolean; is_blocked: boolean; error?: string }> {
  try {
    const authCheck = await assertTenantMember(tenantId)
    if (!authCheck.authorized) {
      return { success: false, is_blocked: false, error: authCheck.error || 'No autorizado' }
    }

    const cleanPhone = phone.trim()
    const numericPhone = cleanPhone.replace(/\D/g, '')
    const targetPhone = numericPhone || cleanPhone

    const currentlyBlocked = await isPlayerBlocked(tenantId, cleanPhone)
    const newBlockedState = !currentlyBlocked

    const supabase = await createServiceClient()

    // 1. Intentar actualizar en players
    await supabase
      .from('players')
      .upsert({
        tenant_id: tenantId,
        phone: targetPhone,
        name: 'Jugador',
        is_blocked: newBlockedState,
        internal_notes: reason || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone' })

    // 2. Siempre registrar en audit_log para persistencia inmutable
    await supabase.from('audit_log').insert({
      tenant_id: tenantId,
      action: 'PLAYER_STATUS',
      table_name: 'players',
      record_id: targetPhone,
      new_data: {
        phone: targetPhone,
        is_blocked: newBlockedState,
        block_reason: reason || null,
        updated_at: new Date().toISOString(),
      },
    })

    revalidatePath('/dashboard/jugadores')
    return { success: true, is_blocked: newBlockedState }
  } catch (err) {
    console.error('[toggleBlockPlayer] Error:', err)
    return { success: false, is_blocked: false, error: 'Error al cambiar estado del jugador' }
  }
}

/**
 * Guardar notas internas sobre un jugador
 */
export async function savePlayerNotes(
  tenantId: string,
  phone: string,
  notes: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const authCheck = await assertTenantMember(tenantId)
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error || 'No autorizado' }
    }

    const cleanPhone = phone.trim()
    const numericPhone = cleanPhone.replace(/\D/g, '')
    const targetPhone = numericPhone || cleanPhone

    const supabase = await createServiceClient()

    await supabase
      .from('players')
      .upsert({
        tenant_id: tenantId,
        phone: targetPhone,
        name: 'Jugador',
        internal_notes: notes.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone' })

    await supabase.from('audit_log').insert({
      tenant_id: tenantId,
      action: 'PLAYER_STATUS',
      table_name: 'players',
      record_id: targetPhone,
      new_data: {
        phone: targetPhone,
        notes: notes.trim(),
        updated_at: new Date().toISOString(),
      },
    })

    revalidatePath('/dashboard/jugadores')
    return { success: true }
  } catch (err) {
    console.error('[savePlayerNotes] Error:', err)
    return { success: false, error: 'Error al guardar notas del jugador' }
  }
}

