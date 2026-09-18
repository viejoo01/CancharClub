'use server'
// src/actions/analytics.actions.ts
// ==============================================================================
// SERVER ACTIONS — Analítica de Ocupación, Heatmap Semanal y Sugerencias de Precios
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface HeatmapCell {
  dayIndex: number // 0: Dom, 1: Lun, ..., 6: Sab
  dayName: string
  slotKey: 'MANANA' | 'SIESTA' | 'TARDE' | 'NOCHE'
  slotLabel: string
  timeRange: string
  occupancyPct: number
  totalBookings: number
  capacitySlots: number
  isDeadHour: boolean
}

export interface PricingRecommendation {
  id: string
  slotLabel: string
  days: string
  currentOccupancy: number
  standardPriceArs: number
  suggestedPriceArs: number
  discountPct: number
  projectedWeeklyRevenueArs: number
  rationale: string
  suggestedPromoTitle: string
}

export interface OccupancyReportData {
  weeklyAverageOccupancy: number
  peakSlot: string
  deadHoursCount: number
  projectedRevenueRecoveryArs: number
  heatmap: HeatmapCell[]
  recommendations: PricingRecommendation[]
}

// ─── Caja Diaria ─────────────────────────────────────────────────────────────

export interface DailyCashEntry {
  id: string
  customer_name: string
  court_name: string
  amount_ars: number
  payment_type: 'DEPOSIT' | 'BALANCE'
  payment_method: string
  paid_at: string
  notes: string | null
  origin: string
}

export interface DailyCashReport {
  date: string
  totalGeneral: number
  totalCash: number
  totalTransfer: number
  totalMP: number
  totalOther: number
  entries: DailyCashEntry[]
}

/**
 * Obtiene todos los cobros del día (señas + saldos pagados) de la BD real.
 * Infiere el método de pago según el origen de la reserva:
 *   ONLINE_PORTAL  → MERCADOPAGO
 *   WHATSAPP       → TRANSFER
 *   WALK_IN / resto → CASH
 */
export async function getDailyCashReport(
  tenantId: string,
  date: string // 'YYYY-MM-DD'
): Promise<DailyCashReport> {
  const supabase = await createServiceClient()

  const dayStart = `${date}T00:00:00`
  const dayEnd   = `${date}T23:59:59`

  // Señas pagadas en la fecha
  const { data: depositRows } = await supabase
    .from('bookings')
    .select('id, customer_name, deposit_amount_ars, deposit_paid_at, origin, internal_notes, court:courts(name)')
    .eq('tenant_id', tenantId)
    .gte('deposit_paid_at', dayStart)
    .lte('deposit_paid_at', dayEnd)
    .in('status', ['DEPOSIT_PAID', 'CONFIRMED', 'PARTIAL_PAID', 'FULLY_PAID', 'COMPLETED'])
    .order('deposit_paid_at', { ascending: true })

  // Saldos pagados en la fecha
  const { data: balanceRows } = await supabase
    .from('bookings')
    .select('id, customer_name, total_amount_ars, deposit_amount_ars, balance_paid_at, origin, internal_notes, court:courts(name)')
    .eq('tenant_id', tenantId)
    .gte('balance_paid_at', dayStart)
    .lte('balance_paid_at', dayEnd)
    .in('status', ['FULLY_PAID', 'COMPLETED'])
    .order('balance_paid_at', { ascending: true })

  const inferMethod = (origin: string) => {
    if (origin === 'ONLINE_PORTAL') return 'MERCADOPAGO'
    if (origin === 'WHATSAPP') return 'TRANSFER'
    return 'CASH'
  }

  const entries: DailyCashEntry[] = []

  for (const row of depositRows ?? []) {
    const courtObj = row.court as unknown as { name: string } | null
    entries.push({
      id: `dep-${row.id}`,
      customer_name: row.customer_name,
      court_name: courtObj?.name ?? 'Cancha',
      amount_ars: row.deposit_amount_ars ?? 0,
      payment_type: 'DEPOSIT',
      payment_method: inferMethod(row.origin ?? ''),
      paid_at: row.deposit_paid_at ?? '',
      notes: row.internal_notes ?? null,
      origin: row.origin ?? '',
    })
  }

  for (const row of balanceRows ?? []) {
    const courtObj = row.court as unknown as { name: string } | null
    const balanceAmount = (row.total_amount_ars ?? 0) - (row.deposit_amount_ars ?? 0)
    if (balanceAmount > 0) {
      entries.push({
        id: `bal-${row.id}`,
        customer_name: row.customer_name,
        court_name: courtObj?.name ?? 'Cancha',
        amount_ars: balanceAmount,
        payment_type: 'BALANCE',
        payment_method: inferMethod(row.origin ?? ''),
        paid_at: row.balance_paid_at ?? '',
        notes: row.internal_notes ?? null,
        origin: row.origin ?? '',
      })
    }
  }

  entries.sort((a, b) => a.paid_at.localeCompare(b.paid_at))

  const totalCash     = entries.filter(e => e.payment_method === 'CASH').reduce((s, e) => s + e.amount_ars, 0)
  const totalTransfer = entries.filter(e => e.payment_method === 'TRANSFER').reduce((s, e) => s + e.amount_ars, 0)
  const totalMP       = entries.filter(e => e.payment_method === 'MERCADOPAGO').reduce((s, e) => s + e.amount_ars, 0)
  const totalOther    = entries
    .filter(e => !['CASH', 'TRANSFER', 'MERCADOPAGO'].includes(e.payment_method))
    .reduce((s, e) => s + e.amount_ars, 0)
  const totalGeneral  = totalCash + totalTransfer + totalMP + totalOther

  return { date, totalGeneral, totalCash, totalTransfer, totalMP, totalOther, entries }
}

// ─── Heatmap y Reportes de Ocupación ─────────────────────────────────────────

const DAYS_MAP = [
  { index: 1, name: 'Lunes' },
  { index: 2, name: 'Martes' },
  { index: 3, name: 'Miércoles' },
  { index: 4, name: 'Jueves' },
  { index: 5, name: 'Viernes' },
  { index: 6, name: 'Sábado' },
  { index: 0, name: 'Domingo' },
]

const SLOTS_MAP: {
  key: 'MANANA' | 'SIESTA' | 'TARDE' | 'NOCHE'
  label: string
  range: string
  startHour: number
  endHour: number
}[] = [
  { key: 'MANANA', label: 'Mañana',       range: '08:00 - 13:00', startHour: 8,  endHour: 13 },
  { key: 'SIESTA', label: 'Siesta',       range: '13:00 - 17:00', startHour: 13, endHour: 17 },
  { key: 'TARDE',  label: 'Tarde',        range: '17:00 - 20:00', startHour: 17, endHour: 20 },
  { key: 'NOCHE',  label: 'Noche (Pico)', range: '20:00 - 00:00', startHour: 20, endHour: 24 },
]

/**
 * Genera el heatmap de ocupación semanal.
 * Si hay ≥10 reservas en los últimos 30 días usa datos reales;
 * de lo contrario usa el perfil inteligente como fallback.
 */
export async function getOccupancyReport(tenantId: string): Promise<OccupancyReportData> {
  try {
    const supabase = await createServiceClient()

    // Canchas activas → para calcular capacidad teórica
    const { data: courts } = await supabase
      .from('courts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)

    const courtsCount = courts?.length || 2

    // Reservas de los últimos 30 días
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data: bookings } = await supabase
      .from('bookings')
      .select('starts_at, total_amount_ars')
      .eq('tenant_id', tenantId)
      .gte('starts_at', thirtyDaysAgo)
      .in('status', ['CONFIRMED', 'FULLY_PAID', 'DEPOSIT_PAID', 'PARTIAL_PAID', 'COMPLETED'])

    const totalRealBookings = bookings?.length ?? 0

    // Construir matriz day×slot con conteos reales
    const bookingMatrix: Record<string, number> = {}
    if (totalRealBookings >= 10 && bookings) {
      for (const b of bookings) {
        const d = new Date(b.starts_at)
        const dow  = d.getDay()
        const hour = d.getHours()
        const slot = SLOTS_MAP.find(s => hour >= s.startHour && hour < s.endHour)
        if (slot) {
          const key = `${dow}_${slot.key}`
          bookingMatrix[key] = (bookingMatrix[key] ?? 0) + 1
        }
      }
    }

    // Perfil de fallback realista para canchas de pádel/fútbol en AR
    const basePct: Record<string, number> = {
      MANANA: 18, SIESTA: 22, TARDE: 68, NOCHE: 92,
    }

    const heatmap: HeatmapCell[] = []
    let totalPctSum = 0

    for (const day of DAYS_MAP) {
      for (const slot of SLOTS_MAP) {
        const capacitySlots = 16 * courtsCount // 4 franjas × 4 semanas × canchas

        let occupancyPct: number
        let totalBookingsCell: number

        if (totalRealBookings >= 10) {
          const realCount = bookingMatrix[`${day.index}_${slot.key}`] ?? 0
          occupancyPct = Math.min(100, Math.round((realCount / capacitySlots) * 100))
          totalBookingsCell = realCount
        } else {
          const boost = (day.index === 5 || day.index === 6) ? 1.15 : day.index === 1 ? 0.85 : 1.0
          const base  = basePct[slot.key] * boost
          occupancyPct = Math.min(98, Math.max(8, Math.round(base + (day.index * 2) % 7)))
          totalBookingsCell = Math.round((occupancyPct / 100) * capacitySlots)
        }

        heatmap.push({
          dayIndex: day.index,
          dayName: day.name,
          slotKey: slot.key,
          slotLabel: slot.label,
          timeRange: slot.range,
          occupancyPct,
          totalBookings: totalBookingsCell,
          capacitySlots,
          isDeadHour: occupancyPct < 28,
        })
        totalPctSum += occupancyPct
      }
    }

    const weeklyAverage = Math.round(totalPctSum / heatmap.length)
    const deadCount = heatmap.filter(h => h.isDeadHour).length
    const peakCell  = heatmap.reduce((m, h) => h.occupancyPct > m.occupancyPct ? h : m, heatmap[0])
    const peakSlot  = peakCell
      ? `${peakCell.slotLabel} (${peakCell.timeRange}) — ${peakCell.occupancyPct}% ocupación`
      : 'Noche (20:00 - 00:00 hs)'

    // Precio pico del club desde la columna real price_cents
    const { data: priceRules } = await supabase
      .from('price_rules')
      .select('price_cents')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('price_cents', { ascending: false })
      .limit(1)
    const peakPrice = (priceRules?.[0]?.price_cents)
      ? Math.round(Number(priceRules[0].price_cents) / 100)
      : 25000

    // Recomendaciones: una por hora muerta (máx. 3)
    const deadHours = heatmap.filter(h => h.isDeadHour).slice(0, 3)
    const recommendations: PricingRecommendation[] = deadHours.length > 0
      ? deadHours.map((h, i) => ({
          id: `rec_${i}`,
          slotLabel: `${h.slotLabel} — ${h.dayName} (${h.timeRange})`,
          days: h.dayName,
          currentOccupancy: h.occupancyPct,
          standardPriceArs: peakPrice,
          suggestedPriceArs: Math.round(peakPrice * 0.7),
          discountPct: 30,
          projectedWeeklyRevenueArs: Math.round(peakPrice * 0.7 * h.capacitySlots * 0.5),
          rationale: `Ocupación de apenas ${h.occupancyPct}%. Una reducción del 30% puede duplicar la ocupación y recuperar ingresos ociosos.`,
          suggestedPromoTitle: `Promo ${h.slotLabel}: 30% OFF el ${h.dayName} de ${h.timeRange}`,
        }))
      : [
          {
            id: 'rec_general',
            slotLabel: 'Siesta (13:00 a 17:00)',
            days: 'Lunes a Jueves',
            currentOccupancy: 22,
            standardPriceArs: peakPrice,
            suggestedPriceArs: Math.round(peakPrice * 0.7),
            discountPct: 30,
            projectedWeeklyRevenueArs: Math.round(peakPrice * 0.7 * 16),
            rationale: 'Franja siesta habitualmente baja. Una promo del 30% incentiva partidos en horario de almuerzo.',
            suggestedPromoTitle: `Promo Siesta: 30% OFF de 13 a 17 hs`,
          },
        ]

    const projectedRecovery = recommendations.reduce((s, r) => s + r.projectedWeeklyRevenueArs, 0)

    return {
      weeklyAverageOccupancy: weeklyAverage,
      peakSlot,
      deadHoursCount: deadCount,
      projectedRevenueRecoveryArs: projectedRecovery,
      heatmap,
      recommendations,
    }
  } catch (err) {
    console.error('[getOccupancyReport] Error:', err)
    return {
      weeklyAverageOccupancy: 52,
      peakSlot: 'Noche (20:00 - 00:00 hs)',
      deadHoursCount: 8,
      projectedRevenueRecoveryArs: 210000,
      heatmap: [],
      recommendations: [],
    }
  }
}
