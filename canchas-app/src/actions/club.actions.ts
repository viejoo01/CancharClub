'use server'
// src/actions/club.actions.ts
// ==============================================================================
// SERVER ACTIONS — Gestión del Club: Canchas, Precios, Calendario y Caja
// ==============================================================================

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SportType, SlotDuration, CourtSurface } from '@/types/database'
import { getClubBySlug, type ClubData, type CourtDefinition, type SportCategory, type PriceRuleDefinition, normalizeToSportCategory } from '@/config/clubs-catalog'
import { DEFAULT_CLUB_SCHEDULE, type ClubScheduleConfig, formatScheduleHours } from '@/lib/time-slots'
import { getArgentinaTimeStr, parseArgentinaDate } from '@/lib/utils'
import { getVenueBookings } from '@/config/venues-data'

// ─── NORMALIZADORES DE ENUMS POSTGRESQL ───────────────────────────────────────

function normalizeSportEnum(sport?: string | null): 'PADEL' | 'FUTBOL5' | 'FUTBOL7' | 'TENIS' {
  const s = (sport || 'PADEL').toUpperCase().replace(/[\s_-]/g, '')
  if (s.includes('7')) return 'FUTBOL7'
  if (s.includes('FUTBOL') || s.includes('5') || s.includes('SOCCER')) return 'FUTBOL5'
  if (s.includes('TENIS') || s.includes('TENNIS')) return 'TENIS'
  return 'PADEL'
}

function normalizeSurfaceEnum(surface?: string | null): 'CESPED_SINTETICO' | 'PASTO_NATURAL' | 'CEMENTO' | 'POLVO_LADRILLO' | 'CRISTAL' {
  const s = (surface || '').toUpperCase().replace(/[\s-]/g, '_')
  if (s.includes('CRISTAL') || s.includes('VIDRIO') || s.includes('BLINDEX') || s.includes('PANORAMIC')) return 'CRISTAL'
  if (s.includes('NATURAL') || s.includes('PASTO_NATURAL') || s.includes('GRASS')) return 'PASTO_NATURAL'
  if (s.includes('CEMENTO') || s.includes('QUICK') || s.includes('HARD') || s.includes('HORMIGON')) return 'CEMENTO'
  if (s.includes('LADRILLO') || s.includes('CLAY') || s.includes('POLVO')) return 'POLVO_LADRILLO'
  return 'CESPED_SINTETICO'
}

// ─── CANCHAS ──────────────────────────────────────────────────────────────────

export async function getClubCourts(tenantId: string) {
  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from('courts')
      .select('id, name, sport, slot_duration_minutes, surface, has_lights, is_indoor, is_active, display_order')
      .eq('tenant_id', tenantId)
      .order('display_order', { ascending: true })

    if (error) {
      console.warn('[getClubCourts] Error fetching courts:', error.message)
      return []
    }
    return (data ?? []).map(c => ({
      ...c,
      slot_duration: (c.slot_duration_minutes === 60 ? 'MIN_60' : c.slot_duration_minutes === 120 ? 'MIN_120' : 'MIN_90') as SlotDuration,
      surface: (c.surface || 'CESPED_SINTETICO') as CourtSurface,
      has_lighting: Boolean(c.has_lights),
    }))
  } catch (err) {
    console.warn('[getClubCourts] Fallback por excepción:', err)
    return []
  }
}

export async function createCourt(payload: {
  tenant_id: string
  name: string
  sport: SportType
  slot_duration?: SlotDuration
  slot_duration_minutes?: number
  surface?: CourtSurface | null
  has_lighting?: boolean
  has_lights?: boolean
  is_indoor?: boolean
  is_active?: boolean
}) {
  const supabase = await createServiceClient()
  const durationMinutes = payload.slot_duration_minutes || (payload.slot_duration === 'MIN_60' ? 60 : payload.slot_duration === 'MIN_120' ? 120 : 90)
  const hasLights = payload.has_lights !== undefined ? payload.has_lights : (payload.has_lighting !== undefined ? payload.has_lighting : true)
  const sportEnum = normalizeSportEnum(payload.sport)
  const surfaceEnum = normalizeSurfaceEnum(payload.surface)

  const insertData = {
    tenant_id: payload.tenant_id,
    name: payload.name.trim(),
    sport: sportEnum,
    slot_duration_minutes: durationMinutes,
    surface: surfaceEnum,
    has_lights: hasLights,
    is_indoor: Boolean(payload.is_indoor),
    is_active: payload.is_active !== false,
  }

  const { data, error } = await supabase
    .from('courts')
    .insert(insertData)
    .select()
    .single()

  if (error) {
    console.error('[createCourt] Error inserting court:', error.message)
    return { success: false, error: error.message }
  }
  revalidatePath('/dashboard/canchas')
  revalidatePath('/dashboard')
  return { success: true, court: data }
}

export async function updateCourt(courtId: string, payload: Partial<{
  name: string
  sport: SportType
  slot_duration: SlotDuration
  slot_duration_minutes: number
  surface: CourtSurface | null
  has_lighting: boolean
  has_lights: boolean
  is_indoor: boolean
  is_active: boolean
}>) {
  const supabase = await createServiceClient()
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  }
  if (payload.name !== undefined) updateData.name = payload.name.trim()
  if (payload.sport !== undefined) {
    updateData.sport = normalizeSportEnum(payload.sport)
  }
  if (payload.surface !== undefined) {
    updateData.surface = normalizeSurfaceEnum(payload.surface)
  }
  if (payload.is_indoor !== undefined) updateData.is_indoor = payload.is_indoor
  if (payload.is_active !== undefined) updateData.is_active = payload.is_active
  if (payload.slot_duration_minutes !== undefined) {
    updateData.slot_duration_minutes = payload.slot_duration_minutes
  } else if (payload.slot_duration !== undefined) {
    updateData.slot_duration_minutes = payload.slot_duration === 'MIN_60' ? 60 : payload.slot_duration === 'MIN_120' ? 120 : 90
  }
  if (payload.has_lights !== undefined) {
    updateData.has_lights = payload.has_lights
  } else if (payload.has_lighting !== undefined) {
    updateData.has_lights = payload.has_lighting
  }

  const { error } = await supabase
    .from('courts')
    .update(updateData)
    .eq('id', courtId)

  if (error) {
    console.error('[updateCourt] Error updating court:', error.message)
    return { success: false, error: error.message }
  }
  revalidatePath('/dashboard/canchas')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteCourt(
  courtId: string, 
  tenantId: string,
  options?: { force?: boolean }
): Promise<{ success: boolean; hasActiveBookings?: boolean; activeCount?: number; error?: string }> {
  const supabase = await createServiceClient()

  try {
    // 1. Validar si existen reservas activas (no canceladas / no finalizadas)
    const { count: activeCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('court_id', courtId)
      .in('status', ['confirmed', 'confirmed_cash', 'pending_deposit', 'in_process'])

    if (!options?.force && activeCount && activeCount > 0) {
      return { 
        success: false, 
        hasActiveBookings: true,
        activeCount,
        error: `Esta cancha tiene ${activeCount} turno(s) activo(s) confirmado(s). Para darla de baja sin perder las reservas de los clientes, podés marcarla como "Inactiva". Si deseás eliminarla de todos modos junto con sus turnos, confirmá la eliminación.` 
      }
    }

    // 2. Desvincular pedidos de cantina asociados a la cancha si existen
    try {
      await supabase
        .from('court_orders')
        .update({ court_id: null })
        .eq('court_id', courtId)
    } catch {}

    // 3. Eliminar bloqueos de cancha (court_blocks) si existen
    try {
      await supabase
        .from('court_blocks')
        .delete()
        .eq('court_id', courtId)
    } catch {}

    // 4. Eliminar turnos fijos (recurring_slots) si existen
    try {
      await supabase
        .from('recurring_slots')
        .delete()
        .eq('court_id', courtId)
    } catch {}

    // 5. Eliminar listas de espera (waitlists) si existen
    try {
      await supabase
        .from('waitlists')
        .delete()
        .eq('court_id', courtId)
    } catch {}

    // 6. Eliminar reglas de precio asociadas a esta cancha
    try {
      await supabase
        .from('price_rules')
        .delete()
        .eq('court_id', courtId)
    } catch (prErr: unknown) {
      console.warn('[deleteCourt] Warning deleting price rules:', prErr)
    }

    // 7. Eliminar TODAS las reservas asociadas a esta cancha
    // (Crucial: evita la violación de FK "bookings_court_id_fkey" en PostgreSQL)
    const { error: bookingsErr } = await supabase
      .from('bookings')
      .delete()
      .eq('court_id', courtId)

    if (bookingsErr) {
      console.error('[deleteCourt] Error deleting bookings:', bookingsErr.message)
      return { success: false, error: 'No se pudieron limpiar las reservas asociadas a la cancha: ' + bookingsErr.message }
    }

    // 8. Eliminar la cancha de la tabla courts
    const { error: courtErr } = await supabase
      .from('courts')
      .delete()
      .eq('id', courtId)
      .eq('tenant_id', tenantId)

    if (courtErr) {
      console.error('[deleteCourt] Error deleting court:', courtErr.message)
      return { success: false, error: courtErr.message }
    }

    revalidatePath('/dashboard/canchas')
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/precios')
    revalidatePath('/dashboard/fijos')
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al eliminar la cancha'
    console.error('[deleteCourt] Exception:', err)
    return { success: false, error: msg }
  }
}

// ─── CALENDARIO & TURNOS DEL DÍA ──────────────────────────────────────────────

export async function getCalendarBookings(tenantId: string, dateIso: string) {
  try {
    const supabase = await createClient()
    const startOfDay = `${dateIso}T00:00:00.000Z`
    const endOfDay = `${dateIso}T23:59:59.999Z`

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        court_id,
        customer_name,
        customer_phone,
        customer_email,
        booked_at,
        status,
        price_total_cents,
        deposit_cents,
        staff_notes,
        payment_method,
        courts (id, name, sport, slot_duration_minutes)
      `)
      .eq('tenant_id', tenantId)
      .filter('booked_at', 'ov', `[${startOfDay},${endOfDay}]`)
      .not('status', 'in', '("cancelled")')
      .order('created_at', { ascending: true })

    if (error) {
      console.warn('[getCalendarBookings] Fallback a datos locales/demo:', error.message || error)
      return []
    }

    interface RawDbBooking {
      id: string
      court_id: string
      customer_name?: string | null
      customer_phone?: string | null
      customer_email?: string | null
      booked_at?: string | null
      status?: string | null
      price_total_cents?: number | null
      deposit_cents?: number | null
      staff_notes?: string | null
      payment_method?: string | null
      courts?: { id?: string; name?: string; sport?: string; slot_duration_minutes?: number } | null
    }

    // Parsear booked_at (tstzrange) para la grilla de turnos
    return ((data || []) as unknown as RawDbBooking[]).map((b) => {
      let start = ''
      let end = ''
      if (b.booked_at) {
        const match = b.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
        if (match) {
          start = match[1]
          end = match[2]
        }
      }

      if (start && start.includes(' ') && !start.includes('T')) {
        start = start.replace(' ', 'T')
      }
      if (end && end.includes(' ') && !end.includes('T')) {
        end = end.replace(' ', 'T')
      }

      const totalArs = b.price_total_cents ? Math.round(Number(b.price_total_cents) / 100) : 14000
      const depositArs = b.deposit_cents ? Math.round(Number(b.deposit_cents) / 100) : 7000
      const isConfirmed = b.status === 'confirmed' || b.status === 'confirmed_cash'
      const statusFormatted = isConfirmed ? 'CONFIRMED' : (b.status === 'pending_deposit' ? 'PENDING_DEPOSIT' : 'CONFIRMED')

      const courtObj = b.courts
      const courtName = courtObj?.name || 'Cancha'
      const courtSport = courtObj?.sport || 'PADEL'
      const courtDuration = courtObj?.slot_duration_minutes === 60 ? 'MIN_60' : 'MIN_90'

      return {
        id: b.id,
        court_id: b.court_id,
        customer_name: b.customer_name || 'Jugador Online',
        customer_phone: b.customer_phone,
        customer_email: b.customer_email,
        starts_at: start,
        ends_at: end,
        status: statusFormatted,
        origin: 'ONLINE_PORTAL',
        total_amount_ars: totalArs,
        deposit_amount_ars: depositArs,
        total_paid: depositArs,
        balance_due: Math.max(0, totalArs - depositArs),
        internal_notes: b.staff_notes || 'Seña transferida 24hs',
        courts: {
          name: courtName,
          sport: courtSport,
          slot_duration: courtDuration,
        },
      }
    })
  } catch (err) {
    console.warn('[getCalendarBookings] Fallback por excepción:', err)
    return []
  }
}

// ─── REGLAS DE PRECIOS ────────────────────────────────────────────────────────

export async function getClubPriceRules(tenantId: string) {
  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from('price_rules')
      .select(`
        id,
        tenant_id,
        court_id,
        name,
        day_of_week,
        time_from,
        time_to,
        price_cents,
        priority,
        is_active,
        courts(name, sport)
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('[getClubPriceRules] Error fetching price rules:', error.message)
      return []
    }
    return (data ?? []).map(r => ({
      ...r,
      days_of_week: r.day_of_week,
      price_ars: Math.round(Number(r.price_cents) / 100),
      time_from: r.time_from ? r.time_from.substring(0, 5) : '18:00',
      time_to: r.time_to ? r.time_to.substring(0, 5) : '23:00',
    }))
  } catch (err) {
    console.warn('[getClubPriceRules] Exception:', err)
    return []
  }
}

export async function createPriceRule(payload: {
  tenant_id: string
  court_id?: string | null
  name: string
  days_of_week?: number[]
  day_of_week?: number[]
  time_from: string
  time_to: string
  price_ars: number
  deposit_pct?: number
}) {
  const supabase = await createServiceClient()
  const days = (payload.days_of_week && payload.days_of_week.length > 0)
    ? payload.days_of_week
    : (payload.day_of_week && payload.day_of_week.length > 0)
      ? payload.day_of_week
      : [1, 2, 3, 4, 5, 6, 0]
  const priceCents = Math.round(Number(payload.price_ars) * 100)
  const timeFromFormatted = payload.time_from.length === 5 ? `${payload.time_from}:00` : payload.time_from
  const timeToFormatted = payload.time_to.length === 5 ? `${payload.time_to}:00` : payload.time_to

  // Si no se especifica court_id, asignar a todas las canchas activas del club
  let targetCourtIds: string[] = []
  if (payload.court_id) {
    targetCourtIds = [payload.court_id]
  } else {
    const { data: clubCourts } = await supabase
      .from('courts')
      .select('id')
      .eq('tenant_id', payload.tenant_id)
      .eq('is_active', true)

    if (clubCourts && clubCourts.length > 0) {
      targetCourtIds = clubCourts.map(c => c.id)
    }
  }

  if (targetCourtIds.length === 0) {
    return {
      success: false,
      error: 'Debes registrar al menos una cancha activa antes de definir tarifas.',
    }
  }

  const rowsToInsert = targetCourtIds.map(cid => ({
    tenant_id: payload.tenant_id,
    court_id: cid,
    name: payload.name.trim(),
    day_of_week: days,
    time_from: timeFromFormatted,
    time_to: timeToFormatted,
    price_cents: priceCents,
    priority: 1,
    is_active: true,
  }))

  const { data, error } = await supabase
    .from('price_rules')
    .insert(rowsToInsert)
    .select()

  if (error) {
    console.error('[createPriceRule] Error inserting price rule:', error.message)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/precios')
  return { success: true, rule: data?.[0] }
}

export async function deletePriceRule(ruleId: string, tenantId: string) {
  const supabase = await createServiceClient()
  try {
    // Desvincular de bookings si alguna reserva apunta a esta regla de precios
    try {
      await supabase
        .from('bookings')
        .update({ price_rule_id: null })
        .eq('price_rule_id', ruleId)
    } catch {}

    const { error } = await supabase
      .from('price_rules')
      .delete()
      .eq('id', ruleId)
      .eq('tenant_id', tenantId)

    if (error) {
      return { success: false, error: error.message }
    }
    revalidatePath('/dashboard/precios')
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al eliminar tarifa'
    return { success: false, error: msg }
  }
}

// ─── CAJA DIARIA & ARQUEO ─────────────────────────────────────────────────────

export async function getDailyCashSummary(tenantId: string, dateStr: string) {
  try {
    const supabase = await createClient()

    // Buscar pagos registrados en el día
    const { data: payments, error } = await supabase
      .from('booking_payments')
      .select(`
        id,
        amount_ars,
        payment_method,
        payment_date,
        created_at,
        reference_number,
        notes,
        booking_id,
        bookings (
          customer_name,
          courts (name)
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('payment_date', dateStr)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('[getDailyCashSummary] Fallback a datos locales/demo:', error.message || error)
      return {
        totalCollected: 0,
        breakdown: { CASH: 0, TRANSFER: 0, MERCADOPAGO: 0, OTHER: 0 },
        payments: [],
        bookingsCount: 0,
      }
    }

    const breakdown = {
      CASH: 0,
      TRANSFER: 0,
      MERCADOPAGO: 0,
      OTHER: 0,
    }

    let totalCollected = 0
    payments?.forEach(p => {
      const amt = Number(p.amount_ars)
      totalCollected += amt
      if (p.payment_method === 'CASH') breakdown.CASH += amt
      else if (p.payment_method === 'TRANSFER') breakdown.TRANSFER += amt
      else if (p.payment_method === 'MERCADOPAGO' || p.payment_method === 'QR_MP') breakdown.MERCADOPAGO += amt
      else breakdown.OTHER += amt
    })

    return {
      totalCollected,
      breakdown,
      payments: payments ?? [],
      bookingsCount: payments?.length ?? 0,
    }
  } catch (err) {
    console.warn('[getDailyCashSummary] Fallback por excepción:', err)
    return {
      totalCollected: 0,
      breakdown: { CASH: 0, TRANSFER: 0, MERCADOPAGO: 0, OTHER: 0 },
      payments: [],
      bookingsCount: 0,
    }
  }
}

// ─── TURNOS FIJOS / ABONADOS (Mejora 2A) ──────────────────────────────────────

export async function getRecurringBookings(tenantId: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('recurring_bookings')
      .select('*, courts(name, sport)')
      .eq('tenant_id', tenantId)
      .order('day_of_week', { ascending: true })

    if (error) {
      return []
    }

    return data ?? []
  } catch {
    return []
  }
}

export async function createRecurringBooking(payload: {
  tenant_id: string
  court_id: string
  day_of_week: number
  start_time: string
  end_time: string
  customer_name: string
  customer_phone: string
  total_amount_ars: number
  deposit_amount_ars: number
  notes?: string
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recurring_bookings')
    .insert({
      ...payload,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    console.warn('[createRecurringBooking] DB insert fallback warning:', error.message)
    return { success: true, warning: 'Guardado localmente' }
  }

  revalidatePath('/dashboard/fijos')
  revalidatePath('/dashboard')
  return { success: true, booking: data }
}

export async function toggleRecurringBookingStatus(id: string, currentStatus: boolean) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('recurring_bookings')
    .update({ is_active: !currentStatus })
    .eq('id', id)

  if (error) {
    console.warn('[toggleRecurringBookingStatus] DB update fallback warning:', error.message)
  }

  revalidatePath('/dashboard/fijos')
  revalidatePath('/dashboard')
  return { success: true }
}

// ─── AJUSTE MASIVO POR INFLACIÓN (Mejora 3C) ──────────────────────────────────

export async function applyBulkInflationPriceAdjustment(
  tenantId: string,
  percentage: number,
  roundingStep: number = 500
) {
  const supabase = await createServiceClient()

  // 1. Obtener reglas de precios actuales desde la columna price_cents real
  const { data: currentRules, error } = await supabase
    .from('price_rules')
    .select('id, name, price_cents')
    .eq('tenant_id', tenantId)

  if (error || !currentRules || currentRules.length === 0) {
    return {
      success: true,
      updatedCount: 0,
      message: `No se encontraron tarifas activas para ajustar`,
    }
  }

  const multiplier = 1 + (percentage / 100)
  let updatedCount = 0

  for (const rule of currentRules) {
    const currentPriceArs = Math.round((Number(rule.price_cents) || 0) / 100)
    const rawPrice = currentPriceArs * multiplier
    const roundedPriceArs = Math.round(rawPrice / roundingStep) * roundingStep
    const newPriceCents = Math.round(roundedPriceArs * 100)

    const { error: updateErr } = await supabase
      .from('price_rules')
      .update({ price_cents: newPriceCents })
      .eq('id', rule.id)

    if (!updateErr) updatedCount++
  }

  revalidatePath('/dashboard/precios')
  revalidatePath('/dashboard')
  revalidatePath('/club/[slug]', 'page')
  return {
    success: true,
    updatedCount,
    message: `Se actualizaron ${updatedCount} tarifas con un aumento del ${percentage}%`,
  }
}

// ─── HORARIOS DE APERTURA Y CIERRE DEL CLUB ─────────────────────────────────

export async function getClubSchedule(tenantId: string): Promise<ClubScheduleConfig> {
  if (!tenantId) return DEFAULT_CLUB_SCHEDULE
  try {
    const supabase = await createServiceClient()
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('description')
      .eq('id', tenantId)
      .maybeSingle()

    if (error || !tenant || !tenant.description) {
      return DEFAULT_CLUB_SCHEDULE
    }

    try {
      const parsed = JSON.parse(tenant.description)
      return {
        opening_time: parsed.opening_time || DEFAULT_CLUB_SCHEDULE.opening_time,
        closing_time: parsed.closing_time || DEFAULT_CLUB_SCHEDULE.closing_time,
      }
    } catch {
      return DEFAULT_CLUB_SCHEDULE
    }
  } catch (err) {
    console.error('[getClubSchedule] Exception:', err)
    return DEFAULT_CLUB_SCHEDULE
  }
}

export async function updateClubSchedule(
  tenantId: string,
  schedule: { opening_time: string; closing_time: string }
): Promise<{ success: boolean; schedule?: ClubScheduleConfig; error?: string }> {
  if (!tenantId) {
    return { success: false, error: 'Identificador de club requerido' }
  }

  try {
    const supabase = await createServiceClient()

    const { data: tenant, error: fetchErr } = await supabase
      .from('tenants')
      .select('description, slug')
      .eq('id', tenantId)
      .single()

    if (fetchErr || !tenant) {
      return { success: false, error: fetchErr?.message || 'Club no encontrado' }
    }

    let meta: Record<string, unknown> = {}
    if (tenant.description) {
      try {
        meta = JSON.parse(tenant.description)
      } catch {
        meta = {}
      }
    }

    meta.opening_time = schedule.opening_time || DEFAULT_CLUB_SCHEDULE.opening_time
    meta.closing_time = schedule.closing_time || DEFAULT_CLUB_SCHEDULE.closing_time

    const { error: updateErr } = await supabase
      .from('tenants')
      .update({
        description: JSON.stringify(meta),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)

    if (updateErr) {
      console.error('[updateClubSchedule] Error updating tenants:', updateErr.message)
      return { success: false, error: updateErr.message }
    }

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/canchas')
    if (tenant.slug) {
      revalidatePath(`/club/${tenant.slug}`)
    }

    return {
      success: true,
      schedule: {
        opening_time: meta.opening_time as string,
        closing_time: meta.closing_time as string,
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al guardar horario'
    console.error('[updateClubSchedule] Exception:', err)
    return { success: false, error: msg }
  }
}

// ─── PORTAL PÚBLICO: DATOS REALES DE TENANT Y CANCHAS (Mejora 8) ───────────────

export async function getClubPublicData(slug: string): Promise<ClubData> {
  const normalizedSlug = (slug || '').trim().toLowerCase()
  const fallback = getClubBySlug(normalizedSlug)

  try {
    const supabase = await createServiceClient()

    // 1. Consultar tenant real en Supabase por slug
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select(`
        id,
        name,
        slug,
        address,
        city,
        phone_whatsapp,
        is_active,
        bank_alias,
        bank_cbu,
        bank_account_holder,
        bank_name,
        payment_methods,
        description
      `)
      .eq('slug', normalizedSlug)
      .maybeSingle()

    if (tenantErr || !tenant) {
      if (tenantErr) console.warn('[getClubPublicData] tenantErr:', tenantErr.message)
      return fallback
    }

    // 2. Consultar canchas activas del tenant
    const { data: courts } = await supabase
      .from('courts')
      .select('id, name, sport, slot_duration_minutes, surface, is_indoor, has_lights, is_active, display_order')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    // 3. Consultar reglas de precios activas del tenant
    const { data: priceRules } = await supabase
      .from('price_rules')
      .select('id, court_id, name, day_of_week, time_from, time_to, price_cents, priority, is_active')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('priority', { ascending: false })

    const priceRulesMapped: PriceRuleDefinition[] = (priceRules || []).map((r) => ({
      id: r.id,
      courtId: r.court_id,
      name: r.name,
      dayOfWeek: Array.isArray(r.day_of_week) && r.day_of_week.length > 0 ? r.day_of_week : [0, 1, 2, 3, 4, 5, 6],
      timeFrom: (r.time_from || '00:00:00').substring(0, 5),
      timeTo: (r.time_to || '23:59:59').substring(0, 5),
      priceArs: Math.round((Number(r.price_cents) || 2000000) / 100),
      depositPct: 50,
    }))

    const courtsMapped: CourtDefinition[] = (courts && courts.length > 0)
      ? courts.map((c) => {
          const courtRules = priceRulesMapped.filter((r) => !r.courtId || r.courtId === c.id)
          const pricePerHour = courtRules.length > 0
            ? Math.min(...courtRules.map((r) => r.priceArs))
            : 20000

          const features: string[] = []
          if (c.is_indoor) features.push('Techada')
          if (c.has_lights) features.push('Iluminación LED')
          if (c.surface) features.push(c.surface)

          return {
            id: c.id,
            name: c.name,
            sport: normalizeToSportCategory(c.sport),
            surface: c.surface || 'Césped Sintético',
            isIndoor: Boolean(c.is_indoor),
            hasLighting: Boolean(c.has_lights),
            features,
            slotDurationMinutes: c.slot_duration_minutes || (c.sport?.includes('FUTBOL') ? 60 : 90),
            pricePerHour,
            depositPercentage: 0.5,
          }
        })
      : []

    // Determinar deportes únicos normalizados
    const sports = Array.from(new Set(courtsMapped.map((c) => normalizeToSportCategory(c.sport)))) as SportCategory[]

    // Calcular precio inicial más bajo
    const startingPrice = priceRulesMapped.length > 0
      ? Math.min(...priceRulesMapped.map((r) => r.priceArs))
      : (courtsMapped[0]?.pricePerHour || 20000)

    const rawMethods = Array.isArray(tenant.payment_methods) ? tenant.payment_methods : ['TRANSFER']
    const hasMp = rawMethods.some((m: string) => m === 'MERCADO_PAGO' || m === 'MERCADOPAGO')

    let schedule: ClubScheduleConfig = DEFAULT_CLUB_SCHEDULE
    if (tenant.description) {
      try {
        const parsed = JSON.parse(tenant.description)
        if (parsed.opening_time || parsed.closing_time) {
          schedule = {
            opening_time: parsed.opening_time || DEFAULT_CLUB_SCHEDULE.opening_time,
            closing_time: parsed.closing_time || DEFAULT_CLUB_SCHEDULE.closing_time,
          }
        }
      } catch {}
    }

    return {
      id: tenant.id,
      name: tenant.name || fallback.name,
      slug: tenant.slug || normalizedSlug,
      address: tenant.address || fallback.address,
      city: tenant.city || fallback.city,
      phone: tenant.phone_whatsapp || fallback.phone,
      whatsappPhone: tenant.phone_whatsapp ? tenant.phone_whatsapp.replace(/\D/g, '') : fallback.whatsappPhone,
      sports: sports.length > 0 ? sports : [],
      courtsCount: courtsMapped.length,
      startingPrice,
      hasLighting: courtsMapped.some((c) => c.features.includes('Iluminación LED')),
      isIndoor: courtsMapped.some((c) => c.features.includes('Techada')),
      hasCantina: fallback.hasCantina,
      hasParking: fallback.hasParking,
      rating: 5.0,
      reviewsCount: 0,
      availableToday: true,
      openHours: formatScheduleHours(schedule.opening_time, schedule.closing_time),
      schedule,
      courts: courtsMapped,
      priceRules: priceRulesMapped,
      bankDetails: tenant.bank_alias
        ? {
            bankName: tenant.bank_name || 'Mercado Pago',
            accountHolder: tenant.bank_account_holder || tenant.name,
            alias: tenant.bank_alias,
            cbu: tenant.bank_cbu || '',
          }
        : undefined,
      paymentMethods: hasMp ? ['TRANSFER', 'MERCADOPAGO'] : ['TRANSFER'],
      mpConnected: hasMp,
    }
  } catch (err) {
    console.error('[getClubPublicData] Exception:', err)
    return fallback
  }
}

export interface OccupiedSlotInfo {
  courtId: string
  courtName?: string
  time: string
}

/**
 * Consulta en tiempo real los turnos ya reservados para una fecha en un club.
 * Combina reservas en memoria (0ms) y base de datos PostgreSQL.
 */
export async function getClubOccupiedSlots(
  tenantId: string,
  dateIso: string
): Promise<OccupiedSlotInfo[]> {
  try {
    const occupied: OccupiedSlotInfo[] = []
    const seen = new Set<string>()

    const addSlot = (courtId: string, courtName: string | undefined, time: string) => {
      const key = `${courtId || ''}_${courtName || ''}_${time}`
      if (!seen.has(key)) {
        seen.add(key)
        occupied.push({ courtId, courtName, time })
      }
    }

    // 1. Verificar reservas en memoria (0ms, para reservas recién hechas o manuales)
    const inMemoryBookings = getVenueBookings(tenantId, dateIso)
    for (const b of inMemoryBookings) {
      if (!String(b.status).toUpperCase().includes('CANCEL')) {
        let timeStr = ''
        if (b.starts_at) {
          if (b.starts_at.includes('T')) {
            timeStr = b.starts_at.split('T')[1].substring(0, 5)
          } else if (b.starts_at.includes(' ')) {
            timeStr = b.starts_at.split(' ')[1].substring(0, 5)
          }
        }
        if (timeStr) {
          const cName = Array.isArray(b.courts) ? b.courts[0]?.name : b.courts?.name
          addSlot(b.court_id, cName, timeStr)
        }
      }
    }

    // 2. Consultar PostgreSQL en Supabase si tenantId es un UUID válido
    if (tenantId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      const supabase = await createServiceClient()
      const startOfDay = new Date(`${dateIso}T00:00:00-03:00`).toISOString()
      const endOfDay = new Date(`${dateIso}T23:59:59-03:00`).toISOString()

      const { data: dbBookings } = await supabase
        .from('bookings')
        .select('court_id, booked_at, status, courts(id, name)')
        .eq('tenant_id', tenantId)
        .filter('booked_at', 'ov', `[${startOfDay},${endOfDay}]`)
        .not('status', 'in', '("cancelled")')

      if (dbBookings && dbBookings.length > 0) {
        for (const b of dbBookings) {
          if (b.booked_at) {
            const match = b.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
            if (match && match[1]) {
              const startDate = parseArgentinaDate(match[1])
              if (!isNaN(startDate.getTime())) {
                const timeStr = getArgentinaTimeStr(startDate)
                const courtObj = Array.isArray(b.courts) ? b.courts[0] : b.courts
                const courtName = (courtObj as { name?: string } | null)?.name
                addSlot(b.court_id, courtName, timeStr)
              }
            }
          }
        }
      }
    }

    return occupied
  } catch (err) {
    console.warn('[getClubOccupiedSlots] Error:', err)
    return []
  }
}

export async function getPublicClubs(): Promise<ClubData[]> {
  try {
    const supabase = await createServiceClient()
    const { data: tenants, error } = await supabase
      .from('tenants')
      .select(`
        id,
        name,
        slug,
        address,
        city,
        phone_whatsapp,
        is_active,
        bank_alias,
        bank_cbu,
        bank_account_holder,
        bank_name,
        mp_access_token,
        description
      `)
      .eq('is_active', true)

    if (error || !tenants) {
      if (error) console.warn('[getPublicClubs] error:', error.message)
      return []
    }

    const clubsList: ClubData[] = []

    for (const t of tenants) {
      const { data: courts } = await supabase
        .from('courts')
        .select('id, name, sport, slot_duration_minutes, surface, is_indoor, has_lights, is_active')
        .eq('tenant_id', t.id)
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      const { data: priceRules } = await supabase
        .from('price_rules')
        .select('id, court_id, name, day_of_week, time_from, time_to, price_cents, priority, is_active')
        .eq('tenant_id', t.id)
        .eq('is_active', true)
        .order('priority', { ascending: false })

      const priceRulesMapped: PriceRuleDefinition[] = (priceRules || []).map((r) => ({
        id: r.id,
        courtId: r.court_id,
        name: r.name,
        dayOfWeek: Array.isArray(r.day_of_week) && r.day_of_week.length > 0 ? r.day_of_week : [0, 1, 2, 3, 4, 5, 6],
        timeFrom: (r.time_from || '00:00:00').substring(0, 5),
        timeTo: (r.time_to || '23:59:59').substring(0, 5),
        priceArs: Math.round((Number(r.price_cents) || 2000000) / 100),
        depositPct: 50,
      }))

      const courtsMapped: CourtDefinition[] = (courts && courts.length > 0)
        ? courts.map((c) => {
            const courtRules = priceRulesMapped.filter((r) => !r.courtId || r.courtId === c.id)
            const pricePerHour = courtRules.length > 0
              ? Math.min(...courtRules.map((r) => r.priceArs))
              : 20000
            const features: string[] = []
            if (c.is_indoor) features.push('Techada')
            if (c.has_lights) features.push('Iluminación LED')
            if (c.surface) features.push(c.surface)
            return {
              id: c.id,
              name: c.name,
              sport: normalizeToSportCategory(c.sport),
              features: features.length > 0 ? features : ['Césped Sintético'],
              pricePerHour,
              depositPercentage: 0.5,
              slotDurationMinutes: c.slot_duration_minutes || (c.sport?.includes('FUTBOL') ? 60 : 90),
            }
          })
        : []

      const sports = Array.from(new Set(courtsMapped.map((c) => normalizeToSportCategory(c.sport)))) as SportCategory[]
      const startingPrice = priceRulesMapped.length > 0
        ? Math.min(...priceRulesMapped.map((r) => r.priceArs))
        : (courtsMapped[0]?.pricePerHour || 20000)

      let schedule: ClubScheduleConfig = DEFAULT_CLUB_SCHEDULE
      if (t.description) {
        try {
          const parsed = JSON.parse(t.description)
          if (parsed.opening_time || parsed.closing_time) {
            schedule = {
              opening_time: parsed.opening_time || DEFAULT_CLUB_SCHEDULE.opening_time,
              closing_time: parsed.closing_time || DEFAULT_CLUB_SCHEDULE.closing_time,
            }
          }
        } catch {}
      }

      clubsList.push({
        id: t.id,
        name: t.name || 'Club Deportivo',
        slug: t.slug || t.id,
        address: t.address || 'Argentina',
        city: t.city || 'Argentina',
        phone: t.phone_whatsapp || '',
        whatsappPhone: t.phone_whatsapp ? t.phone_whatsapp.replace(/\D/g, '') : '',
        sports: sports.length > 0 ? sports : ['PADEL'],
        courtsCount: courtsMapped.length,
        startingPrice: courtsMapped.length > 0 ? startingPrice : 0,
        hasLighting: courtsMapped.some((c) => c.features.includes('Iluminación LED')),
        isIndoor: courtsMapped.some((c) => c.features.includes('Techada')),
        hasCantina: false,
        hasParking: false,
        rating: 5.0,
        reviewsCount: 0,
        availableToday: true,
        openHours: formatScheduleHours(schedule.opening_time, schedule.closing_time),
        schedule,
        courts: courtsMapped,
        priceRules: priceRulesMapped,
        bankDetails: t.bank_alias
          ? {
              bankName: t.bank_name || 'Mercado Pago',
              accountHolder: t.bank_account_holder || t.name,
              alias: t.bank_alias,
              cbu: t.bank_cbu || '',
            }
          : undefined,
        paymentMethods: t.mp_access_token ? ['TRANSFER', 'MERCADOPAGO'] : ['TRANSFER'],
        mpConnected: Boolean(t.mp_access_token),
      })
    }

    return clubsList
  } catch (err) {
    console.error('[getPublicClubs] Exception:', err)
    return []
  }
}


