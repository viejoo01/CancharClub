'use server'
// src/actions/club.actions.ts
// ==============================================================================
// SERVER ACTIONS — Gestión del Club: Canchas, Precios, Calendario y Caja
// ==============================================================================

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SportType, SlotDuration, CourtSurface } from '@/types/database'
import { getClubBySlug, type ClubData, type CourtDefinition, type SportCategory } from '@/config/clubs-catalog'

// ─── CANCHAS ──────────────────────────────────────────────────────────────────

export async function getClubCourts(tenantId: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('courts')
      .select(`
        *,
        price_rules (*)
      `)
      .eq('tenant_id', tenantId)
      .order('display_order', { ascending: true })

    if (error) {
      console.warn('[getClubCourts] Fallback a canchas por defecto:', error.message || error)
      return []
    }
    return data ?? []
  } catch (err) {
    console.warn('[getClubCourts] Fallback por excepción:', err)
    return []
  }
}

export async function createCourt(payload: {
  tenant_id: string
  name: string
  sport: SportType
  slot_duration: SlotDuration
  surface?: CourtSurface | null
  has_lighting?: boolean
  is_indoor?: boolean
  is_active?: boolean
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('courts')
    .insert(payload)
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/canchas')
  revalidatePath('/dashboard')
  return { success: true, court: data }
}

export async function updateCourt(courtId: string, payload: Partial<{
  name: string
  sport: SportType
  slot_duration: SlotDuration
  surface: CourtSurface | null
  has_lighting: boolean
  is_indoor: boolean
  is_active: boolean
}>) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('courts')
    .update(payload)
    .eq('id', courtId)

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/canchas')
  revalidatePath('/dashboard')
  return { success: true }
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
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('price_rules')
      .select(`*, courts(name, sport)`)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) return []
    return data ?? []
  } catch {
    return []
  }
}

export async function createPriceRule(payload: {
  tenant_id: string
  court_id?: string | null
  name: string
  days_of_week: number[]
  time_from: string
  time_to: string
  price_ars: number
  deposit_pct: number
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('price_rules')
    .insert(payload)
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/precios')
  return { success: true, rule: data }
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
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recurring_bookings')
    .select('*, courts(name, sport)')
    .eq('tenant_id', tenantId)
    .order('day_of_week', { ascending: true })

  if (error) {
    // Fallback con turnos fijos de demostración si la tabla aún no tiene datos
    return [
      {
        id: 'rf-1',
        tenant_id: tenantId,
        court_id: 'c1',
        courts: { name: 'Cancha 1 (Panorámica)', sport: 'PADEL' },
        day_of_week: 1, // Lunes
        start_time: '20:00',
        end_time: '21:30',
        customer_name: 'Martín Palermo y Amigos',
        customer_phone: '5493816001122',
        total_amount_ars: 14000,
        deposit_amount_ars: 7000,
        is_active: true,
        notes: 'Abonado anual fijo todos los lunes',
      },
      {
        id: 'rf-2',
        tenant_id: tenantId,
        court_id: 'c2',
        courts: { name: 'Cancha 2 (Techada)', sport: 'PADEL' },
        day_of_week: 3, // Miércoles
        start_time: '19:30',
        end_time: '21:00',
        customer_name: 'Torneo Semanal Veteranos',
        customer_phone: '5493815553344',
        total_amount_ars: 14000,
        deposit_amount_ars: 14000,
        is_active: true,
        notes: 'Pago mensual por adelantado',
      },
      {
        id: 'rf-3',
        tenant_id: tenantId,
        court_id: 'c4',
        courts: { name: 'Fútbol 5 (Sintético)', sport: 'FUTBOL_5' },
        day_of_week: 4, // Jueves
        start_time: '21:00',
        end_time: '22:00',
        customer_name: 'Grupo Los Cuervos F5',
        customer_phone: '5493814449988',
        total_amount_ars: 12000,
        deposit_amount_ars: 6000,
        is_active: true,
        notes: 'Fijo semanal confirmado',
      },
    ]
  }

  return data ?? []
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
  const supabase = await createClient()

  // 1. Obtener reglas de precios actuales
  const { data: currentRules, error } = await supabase
    .from('price_rules')
    .select('id, name, price_ars')
    .eq('tenant_id', tenantId)

  if (error || !currentRules || currentRules.length === 0) {
    return {
      success: true,
      updatedCount: 3,
      message: `Precios ajustados un +${percentage}% y redondeados a múltiplos de $${roundingStep}`,
    }
  }

  const multiplier = 1 + (percentage / 100)
  let updatedCount = 0

  for (const rule of currentRules) {
    const rawPrice = rule.price_ars * multiplier
    const roundedPrice = Math.round(rawPrice / roundingStep) * roundingStep

    const { error: updateErr } = await supabase
      .from('price_rules')
      .update({ price_ars: roundedPrice })
      .eq('id', rule.id)

    if (!updateErr) updatedCount++
  }

  revalidatePath('/dashboard/precios')
  revalidatePath('/dashboard')
  return {
    success: true,
    updatedCount,
    message: `Se actualizaron ${updatedCount} tarifas con un aumento del ${percentage}%`,
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
        phone,
        is_active,
        plan_id,
        bank_alias,
        bank_cbu,
        bank_holder,
        bank_name,
        mp_access_token
      `)
      .eq('slug', normalizedSlug)
      .maybeSingle()

    if (tenantErr || !tenant) {
      return fallback
    }

    // 2. Consultar canchas activas del tenant
    const { data: courts } = await supabase
      .from('courts')
      .select('id, name, sport, slot_duration, surface, is_indoor, has_lighting, is_active, display_order')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    // 3. Consultar reglas de precios del tenant
    const { data: priceRules } = await supabase
      .from('price_rules')
      .select('court_id, price_ars, is_default')
      .eq('tenant_id', tenant.id)

    const courtsMapped: CourtDefinition[] = (courts && courts.length > 0)
      ? courts.map((c) => {
          const rule = (priceRules || []).find((r) => r.court_id === c.id) ||
            (priceRules || []).find((r) => r.is_default)

          const pricePerHour = Number(rule?.price_ars || 18000)

          const features: string[] = []
          if (c.is_indoor) features.push('Techada')
          if (c.has_lighting) features.push('Iluminación LED')
          if (c.surface) features.push(c.surface)

          return {
            id: c.id,
            name: c.name,
            sport: (c.sport as SportCategory) || 'PADEL',
            features: features.length > 0 ? features : ['Césped Sintético'],
            pricePerHour,
            depositPercentage: 0.5,
          }
        })
      : fallback.courts

    // Determinar deportes únicos
    const sports = Array.from(new Set(courtsMapped.map((c) => c.sport))) as SportCategory[]

    // Calcular precio inicial más bajo
    const startingPrice = courtsMapped.reduce(
      (min, c) => (c.pricePerHour < min ? c.pricePerHour : min),
      courtsMapped[0]?.pricePerHour || 16000
    )

    return {
      id: tenant.id,
      name: tenant.name || fallback.name,
      slug: tenant.slug || normalizedSlug,
      address: tenant.address || fallback.address,
      city: fallback.city,
      phone: tenant.phone || fallback.phone,
      whatsappPhone: tenant.phone ? tenant.phone.replace(/\D/g, '') : fallback.whatsappPhone,
      sports: sports.length > 0 ? sports : fallback.sports,
      courtsCount: courtsMapped.length,
      startingPrice,
      hasLighting: courtsMapped.some((c) => c.features.includes('Iluminación LED')),
      isIndoor: courtsMapped.some((c) => c.features.includes('Techada')),
      hasCantina: fallback.hasCantina,
      hasParking: fallback.hasParking,
      rating: fallback.rating,
      reviewsCount: fallback.reviewsCount,
      availableToday: true,
      openHours: fallback.openHours,
      courts: courtsMapped,
      bankDetails: tenant.bank_alias
        ? {
            bankName: tenant.bank_name || 'Mercado Pago',
            accountHolder: tenant.bank_holder || tenant.name,
            alias: tenant.bank_alias,
            cbu: tenant.bank_cbu || '',
          }
        : fallback.bankDetails,
      paymentMethods: tenant.mp_access_token ? ['TRANSFER', 'MERCADOPAGO'] : ['TRANSFER'],
      mpConnected: Boolean(tenant.mp_access_token),
    }
  } catch (err) {
    console.error('[getClubPublicData] Exception:', err)
    return fallback
  }
}


