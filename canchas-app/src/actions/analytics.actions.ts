'use server'
// src/actions/analytics.actions.ts
// ==============================================================================
// SERVER ACTIONS — Analítica de Ocupación, Heatmap Semanal y Sugerencias de Precios
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { resolveEffectiveTenantId, assertTenantMember } from '@/lib/auth-security'
import { cleanNoteForDisplay } from '@/lib/utils'
import { revalidatePath } from 'next/cache'

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
  totalBookingsPeriod: number
  peakSlot: string
  peakSlotLabel: string
  peakSlotPct: number
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
  payment_type: 'DEPOSIT' | 'BALANCE' | 'CANTINA'
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
  totalCredit?: number
  totalDeposits?: number
  entries: DailyCashEntry[]
}

/**
 * Obtiene todos los cobros del día (señas online por MP/Transferencia, pagos manuales, saldos pagados en mostrador
 * y ventas de cantina / kiosco).
 * Separa de forma precisa:
 *   - EFECTIVO EN CAJA (CASH)
 *   - TRANSFERENCIAS (TRANSFER - alias / CBU / banco)
 *   - MERCADO PAGO (MERCADOPAGO - online / QR)
 *   - SEÑAS ABONADAS (señas online y mostrador)
 *   - TOTAL RECAUDADO (suma íntegra sin pérdidas ni duplicados)
 */
export async function getDailyCashReport(
  tenantId: string,
  date: string // 'YYYY-MM-DD'
): Promise<DailyCashReport> {
  const effectiveTenantId = (await resolveEffectiveTenantId(tenantId)) || tenantId
  if (!effectiveTenantId) {
    return { date, totalGeneral: 0, totalCash: 0, totalTransfer: 0, totalMP: 0, totalOther: 0, totalDeposits: 0, entries: [] }
  }

  const authCheck = await assertTenantMember(effectiveTenantId)
  if (!authCheck.authorized) {
    return { date, totalGeneral: 0, totalCash: 0, totalTransfer: 0, totalMP: 0, totalOther: 0, totalDeposits: 0, entries: [] }
  }

  const supabase = await createServiceClient()

  // Límites del día en huso horario de Argentina (UTC-3)
  const dayStart = new Date(`${date}T00:00:00-03:00`).toISOString()
  const dayEnd   = new Date(`${date}T23:59:59.999-03:00`).toISOString()

  // 1. Consultar reservas del día (turnos jugados en la fecha, o señas/cobros registrados dentro de la fecha)
  let bookingRows: Array<{
    id: string
    tenant_id?: string
    customer_name?: string | null
    deposit_cents?: number | string | null
    price_total_cents?: number | string | null
    payment_method?: string | null
    paid_at?: string | null
    created_at?: string | null
    updated_at?: string | null
    staff_notes?: string | null
    booked_at?: string | null
    status?: string | null
    courts?: { name?: string | null } | { name?: string | null }[] | null
  }> = []

  try {
    const [bookedRes, timeRes] = await Promise.all([
      // Reservas cuya franja de juego overlap con el día
      supabase
        .from('bookings')
        .select('id, tenant_id, customer_name, deposit_cents, price_total_cents, payment_method, paid_at, created_at, updated_at, staff_notes, booked_at, status, courts(name)')
        .eq('tenant_id', effectiveTenantId)
        .filter('booked_at', 'ov', `[${dayStart},${dayEnd}]`)
        .neq('status', 'cancelled'),
      // Reservas creadas o cobradas/actualizadas dentro de la fecha
      supabase
        .from('bookings')
        .select('id, tenant_id, customer_name, deposit_cents, price_total_cents, payment_method, paid_at, created_at, updated_at, staff_notes, booked_at, status, courts(name)')
        .eq('tenant_id', effectiveTenantId)
        .or(`and(created_at.gte.${dayStart},created_at.lte.${dayEnd}),and(paid_at.gte.${dayStart},paid_at.lte.${dayEnd}),and(updated_at.gte.${dayStart},updated_at.lte.${dayEnd})`)
        .neq('status', 'cancelled')
    ])

    const bookingsMap = new Map<string, typeof bookingRows[number]>()
    for (const b of (bookedRes.data ?? [])) bookingsMap.set(b.id, b)
    for (const b of (timeRes.data ?? [])) bookingsMap.set(b.id, b)
    bookingRows = Array.from(bookingsMap.values())
  } catch (err) {
    console.warn('[getDailyCashReport] Error querying bookings:', err)
  }

  const entries: DailyCashEntry[] = []

  // 1. Consultar cobros relacionales en booking_payments (máxima precisión contable)
  const recordedBookingIds = new Set<string>()
  try {
    const { data: dbPayments, error: payErr } = await supabase
      .from('booking_payments')
      .select(`
        id,
        amount_ars,
        amount_cents,
        payment_method,
        payment_type,
        registered_at,
        notes,
        booking_id,
        bookings (
          id,
          customer_name,
          courts (name)
        )
      `)
      .eq('tenant_id', effectiveTenantId)
      .gte('registered_at', dayStart)
      .lte('registered_at', dayEnd)
      .order('registered_at', { ascending: true })

    if (!payErr && dbPayments && dbPayments.length > 0) {
      for (const bp of dbPayments) {
        if (bp.booking_id) recordedBookingIds.add(bp.booking_id)
        const amt = Number(bp.amount_ars) || Math.round((Number(bp.amount_cents) || 0) / 100)
        if (amt <= 0) continue

        const bObj = Array.isArray(bp.bookings) ? bp.bookings[0] : bp.bookings
        const cObj = bObj && typeof bObj === 'object' && 'courts' in bObj
          ? (Array.isArray((bObj as unknown as { courts: { name?: string }[] }).courts)
              ? (bObj as unknown as { courts: { name?: string }[] }).courts[0]
              : (bObj as unknown as { courts: { name?: string } }).courts)
          : null
        let courtName = cObj?.name || 'Cancha'
        let customerName = (bObj as unknown as { customer_name?: string })?.customer_name || 'Cliente'

        if (bp.notes?.toLowerCase().includes('cuenta corriente')) {
          courtName = 'Cuenta Corriente (Cobro)'
          const nameMatch = bp.notes.match(/Cuenta Corriente:\s*([^-\n]+)/i)
          if (nameMatch) {
            customerName = nameMatch[1].trim()
          }
        }

        let method = 'CASH'
        const rawM = String(bp.payment_method || '').toUpperCase()
        if (rawM.includes('TRANSFER')) method = 'TRANSFER'
        else if (rawM.includes('MERCADO') || rawM.includes('MP') || rawM.includes('QR')) method = 'MERCADOPAGO'
        else if (rawM.includes('CORRIENTE') || rawM.includes('FIADO')) method = 'CUENTA_CORRIENTE'
        else if (rawM.includes('CARD') || rawM.includes('TARJETA')) method = 'OTHER'

        const rawType = String(bp.payment_type || '').toUpperCase()
        const pNotes = String(bp.notes || '').toLowerCase()
        const isDeposit = rawType === 'DEPOSIT' || pNotes.includes('seña')
        const pType = isDeposit ? 'DEPOSIT' : 'BALANCE'

        entries.push({
          id: `bp-${bp.id}`,
          customer_name: customerName,
          court_name: courtName,
          amount_ars: amt,
          payment_type: pType,
          payment_method: method,
          paid_at: bp.registered_at,
          notes: bp.notes || 'Cobro registrado',
          origin: bp.payment_method,
        })
      }
    }
  } catch (payCatch) {
    console.warn('[getDailyCashReport] Notice querying booking_payments:', payCatch)
  }

  // 2. Procesar reservas que aún no tienen cobros asentados formalmente en booking_payments (compatibilidad retroactiva garantizada)
  for (const row of bookingRows ?? []) {
    // Si esta reserva ya tiene cobros asentados formalmente en booking_payments, evitar duplicación
    if (recordedBookingIds.has(row.id)) continue

    const courtObj = Array.isArray(row.courts) ? row.courts[0] : row.courts
    const courtName = (courtObj as { name?: string } | null)?.name ?? 'Cancha'
    let totalDepositArs = Math.round((Number(row.deposit_cents) || 0) / 100)
    const totalPriceArs = Math.round((Number(row.price_total_cents) || 0) / 100)
    const notes = row.staff_notes || ''

    // 1.1 Extraer cobros explícitos en mostrador (ej. "Cobro $10.000 (Transferencia)...")
    const hasSaldoRestante = Boolean(notes.toLowerCase().includes('saldo restante'))
    const hasOnlineBooking = Boolean(notes.toLowerCase().includes('reserva online') || notes.toLowerCase().includes('seña verificada'))
    const allCobroMatches = [...notes.matchAll(/Cobro\s+\$?([\d\.,]+)\s*\(([^)]+)\)(?:[^\[\n]*\[([^\]]+)\])?/gi)]

    // Deduplicar cobros idénticos accidentales (ej. doble clic o colisión de red en el mismo minuto)
    const cobroMatches: typeof allCobroMatches = []
    for (const match of allCobroMatches) {
      const cleanAmt = match[1].replace(/\./g, '').replace(/,/g, '.')
      const amt = Math.round(Number(cleanAmt)) || 0
      const rawMeth = match[2].toUpperCase().trim()
      const isoTime = match[3]

      const isDup = cobroMatches.some((existing) => {
        const existAmt = Math.round(Number(existing[1].replace(/\./g, '').replace(/,/g, '.'))) || 0
        const existMeth = existing[2].toUpperCase().trim()
        const existIso = existing[3]
        if (amt !== existAmt || rawMeth !== existMeth) return false
        if (isoTime && existIso) {
          const diffMs = Math.abs(new Date(isoTime).getTime() - new Date(existIso).getTime())
          return diffMs < 120000 // Menos de 2 min de diferencia con mismo monto y método = doble registro accidental
        }
        return true
      })
      if (!isDup) {
        cobroMatches.push(match)
      }
    }

    if (!hasSaldoRestante && !hasOnlineBooking && cobroMatches.length > 0) {
      const isOnlyInitial = notes.toLowerCase().includes('seña inicial')
      if (isOnlyInitial) {
        const sumCobrosArs = cobroMatches.reduce((acc, m) => {
          const clean = m[1].replace(/\./g, '').replace(/,/g, '.')
          return acc + (Math.round(Number(clean)) || 0)
        }, 0)
        if (sumCobrosArs > 0 && sumCobrosArs < totalDepositArs && totalDepositArs >= totalPriceArs) {
          totalDepositArs = sumCobrosArs
        }
      }
    }

    let cobrosTotal = 0

    for (let idx = 0; idx < cobroMatches.length; idx++) {
      const m = cobroMatches[idx]
      const cleanAmt = m[1].replace(/\./g, '').replace(/,/g, '.')
      const amt = Math.round(Number(cleanAmt)) || 0
      const rawMeth = m[2].toUpperCase()
      const isoTimestamp = m[3] || row.paid_at || row.updated_at || row.created_at
      cobrosTotal += amt

      if (isoTimestamp && isoTimestamp >= dayStart && isoTimestamp <= dayEnd) {
        let method = 'CASH'
        if (rawMeth.includes('TRANSFER')) method = 'TRANSFER'
        else if (rawMeth.includes('MERCADO') || rawMeth.includes('MP') || rawMeth.includes('QR')) method = 'MERCADOPAGO'
        else if (rawMeth.includes('CORRIENTE') || rawMeth.includes('FIADO') || rawMeth.includes('DEUDA') || rawMeth.includes('CREDIT')) method = 'CUENTA_CORRIENTE'
        else if (rawMeth.includes('CASH') || rawMeth.includes('EFECTIVO')) method = 'CASH'
        else if (rawMeth.includes('CARD') || rawMeth.includes('TARJETA')) method = 'OTHER'

        const fullMatchText = m[0].toLowerCase()
        const isSaldoRestante = fullMatchText.includes('saldo restante') || notes.toLowerCase().includes('saldo restante')
        const isExplicitDeposit = fullMatchText.includes('seña inicial') || (!hasOnlineBooking && !isSaldoRestante && idx === 0)
        const paymentType = isExplicitDeposit ? 'DEPOSIT' : 'BALANCE'

        entries.push({
          id: `cobro-${row.id}-${idx}`,
          customer_name: row.customer_name || 'Cliente',
          court_name: courtName,
          amount_ars: amt,
          payment_type: paymentType,
          payment_method: method,
          paid_at: isoTimestamp,
          notes: cleanNoteForDisplay(notes),
          origin: method.toLowerCase(),
        })
      }
    }

    // 1.2 Seña previa inicial
    const initialDeposit = Math.max(0, totalDepositArs - cobrosTotal)
    if (initialDeposit > 0) {
      const señaIsoMatch = notes.match(/Seña verificada[^\[]*\[([^\]]+)\]/i)
      let initialPaidAt: string | null = señaIsoMatch ? señaIsoMatch[1] : null

      if (!initialPaidAt) {
        if (cobroMatches.length > 0) {
          const firstCobroIso = cobroMatches[0]?.[3]
          if (row.paid_at && row.paid_at !== firstCobroIso) {
            initialPaidAt = row.paid_at
          } else {
            const horaMatch = notes.match(/Seña verificada y aprobada.*?el\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+a las\s+(\d{1,2}):(\d{2})/i)
            if (horaMatch) {
              const [, dStr, hStr, mStr] = horaMatch
              const [d, m, y] = dStr.split('/')
              const paddedM = m.padStart(2, '0')
              const paddedD = d.padStart(2, '0')
              const paddedH = hStr.padStart(2, '0')
              initialPaidAt = `${y}-${paddedM}-${paddedD}T${paddedH}:${mStr}:00-03:00`
            } else {
              initialPaidAt = row.created_at || row.paid_at || null
            }
          }
        } else {
          initialPaidAt = row.paid_at || row.created_at || null
        }
      }

      if (initialPaidAt && initialPaidAt >= dayStart && initialPaidAt <= dayEnd) {
        let initialMethod = 'CASH'
        const rawMethod = String(row.payment_method || '').toLowerCase()
        const lowerNotes = notes.toLowerCase()
        if (rawMethod.includes('transfer') || rawMethod.includes('bank') || lowerNotes.includes('transfer')) {
          initialMethod = 'TRANSFER'
        } else if (rawMethod.includes('mercado') || rawMethod.includes('mp') || lowerNotes.includes('mercado')) {
          initialMethod = 'MERCADOPAGO'
        } else if (rawMethod.includes('corriente') || rawMethod.includes('fiado') || lowerNotes.includes('fiado') || lowerNotes.includes('cuenta corriente')) {
          initialMethod = 'CUENTA_CORRIENTE'
        }

        const isFull = initialDeposit >= totalPriceArs && totalPriceArs > 0
        entries.push({
          id: `dep-${row.id}`,
          customer_name: row.customer_name || 'Cliente',
          court_name: courtName,
          amount_ars: initialDeposit,
          payment_type: isFull ? 'BALANCE' : 'DEPOSIT',
          payment_method: initialMethod,
          paid_at: initialPaidAt,
          notes: cleanNoteForDisplay(notes),
          origin: row.payment_method || 'online',
        })
      }
    }
  }

  // 2. Consultar pedidos y ventas de Cantina del día
  try {
    let cantinaOrders: Array<{
      id: string
      court_name?: string | null
      customer_name?: string | null
      total_ars: number | string
      payment_method?: string | null
      payment_status?: string | null
      status?: string | null
      created_at: string
      notes?: string | null
      items?: unknown
    }> = []

    const { data: dbOrders, error: ordersErr } = await supabase
      .from('court_orders')
      .select('id, court_name, customer_name, total_ars, payment_method, payment_status, status, created_at, notes, items')
      .eq('tenant_id', effectiveTenantId)
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .not('status', 'eq', 'CANCELLED')

    if (!ordersErr && dbOrders) {
      cantinaOrders = dbOrders
    } else {
      // Fallback inmutable a audit_log si court_orders no está disponible
      const { data: auditData } = await supabase
        .from('audit_log')
        .select('new_data, created_at')
        .eq('tenant_id', effectiveTenantId)
        .eq('action', 'COURT_ORDER')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd)

      if (auditData && auditData.length > 0) {
        cantinaOrders = auditData
          .map((row) => row.new_data as typeof cantinaOrders[number])
          .filter(Boolean)
          .filter((o) => o.status !== 'CANCELLED')
      }
    }

    for (const order of cantinaOrders ?? []) {
      const statusUpper = String(order.status || '').toUpperCase()
      const paymentStatusUpper = String(order.payment_status || '').toUpperCase()
      if (statusUpper === 'CANCELLED' || paymentStatusUpper === 'CANCELLED') continue

      const orderTotal = Number(order.total_ars) || 0
      if (orderTotal <= 0) continue

      // Resolver método de pago de la orden
      let method = 'CASH'
      const rawMethod = String(order.payment_method || '').toUpperCase()
      const rawNotes = String(order.notes || '').toUpperCase()
      const rawCourt = String(order.court_name || '').toUpperCase()

      // Determinar si es efectivamente fiado / cuenta corriente (exclusivo si fue solicitado como fiado)
      const isCredit = rawMethod.includes('CORRIENTE') ||
                       rawMethod.includes('FIADO') ||
                       rawNotes.includes('FIADO') ||
                       rawNotes.includes('CUENTA CORRIENTE') ||
                       rawCourt.includes('CUENTA CORRIENTE')

      if (isCredit) {
        method = 'CUENTA_CORRIENTE'
      } else if (rawMethod.includes('TRANSFER') || rawNotes.includes('TRANSFER') || rawNotes.includes('TRANSFERENCIA')) {
        method = 'TRANSFER'
      } else if (rawMethod.includes('QR') || rawMethod.includes('MERCADO') || rawMethod.includes('MP') || rawNotes.includes('MERCADO') || rawNotes.includes('MP') || rawNotes.includes('QR')) {
        method = 'MERCADOPAGO'
      } else if (rawMethod.includes('CARD') || rawMethod.includes('TARJETA') || rawNotes.includes('TARJETA')) {
        method = 'OTHER'
      } else {
        method = 'CASH'
      }

      const courtLabel = order.court_name && order.court_name !== 'NONE'
        ? `Cantina (${order.court_name})`
        : 'Cantina Mostrador'

      entries.push({
        id: `cantina-${order.id}`,
        customer_name: order.customer_name || 'Cliente Cantina',
        court_name: courtLabel,
        amount_ars: orderTotal,
        payment_type: 'CANTINA',
        payment_method: method,
        paid_at: order.created_at,
        notes: order.notes ? cleanNoteForDisplay(order.notes) : 'Venta de cantina / kiosco',
        origin: 'cantina',
      })
    }
  } catch (cantinaErr) {
    console.warn('[getDailyCashReport] Cantina orders query notice:', cantinaErr)
  }

  // 3. Consultar cobros de Cuentas Corrientes registrados en el día
  try {
    const { data: auditPayments } = await supabase
      .from('audit_log')
      .select('id, new_data, created_at')
      .eq('tenant_id', effectiveTenantId)
      .eq('action', 'PAYMENT_RECEIVED')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)

    for (const ap of auditPayments ?? []) {
      const pData = ap.new_data as {
        type?: string
        amount?: number
        payment_method?: string
        customer_name?: string
        notes?: string
      } | null

      const amt = Number(pData?.amount) || 0
      if (amt <= 0) continue

      // Evitar duplicación si el cobro ya fue procesado mediante booking_payments
      const isAlreadyInEntries = entries.some(e =>
        e.court_name.includes('Cuenta Corriente') &&
        e.amount_ars === amt
      )
      if (isAlreadyInEntries) continue

      const pMethod = String(pData?.payment_method || '').toUpperCase()
      const resolvedMethod = pMethod === 'TRANSFER' ? 'TRANSFER' : 'CASH'

      entries.push({
        id: `pay-audit-${ap.id}`,
        customer_name: pData?.customer_name || 'Cliente Cuenta Corriente',
        court_name: 'Cuenta Corriente (Cobro)',
        amount_ars: amt,
        payment_type: 'BALANCE',
        payment_method: resolvedMethod,
        paid_at: ap.created_at,
        notes: pData?.notes || 'Cobro de saldo adeudado',
        origin: 'cuenta_corriente',
      })
    }
  } catch (auditErr) {
    console.warn('[getDailyCashReport] Audit payments query notice:', auditErr)
  }

  entries.sort((a, b) => (b.paid_at || '').localeCompare(a.paid_at || ''))

  const totalCash     = entries.filter(e => e.payment_method === 'CASH').reduce((s, e) => s + e.amount_ars, 0)
  const totalTransfer = entries.filter(e => e.payment_method === 'TRANSFER').reduce((s, e) => s + e.amount_ars, 0)
  const totalMP       = entries.filter(e => e.payment_method === 'MERCADOPAGO').reduce((s, e) => s + e.amount_ars, 0)
  const totalCredit   = entries.filter(e => e.payment_method === 'CUENTA_CORRIENTE').reduce((s, e) => s + e.amount_ars, 0)
  const totalOther    = entries
    .filter(e => !['CASH', 'TRANSFER', 'MERCADOPAGO', 'CUENTA_CORRIENTE'].includes(e.payment_method))
    .reduce((s, e) => s + e.amount_ars, 0)
  const totalDeposits = entries
    .filter(e => e.payment_type === 'DEPOSIT')
    .reduce((s, e) => s + e.amount_ars, 0)
  const totalGeneral  = totalCash + totalTransfer + totalMP + totalOther

  return { date, totalGeneral, totalCash, totalTransfer, totalMP, totalOther, totalCredit, totalDeposits, entries }
}

export interface BlindAuditRecord {
  id: string
  cashier_name?: string
  declared_cash: number
  expected_cash: number
  diff_cash: number
  status: 'EXACT' | 'OVER' | 'SHORT'
  notes?: string
  closed_at: string
}

/**
 * Guarda el arqueo ciego de caja en la base de datos (cash_shifts con fallback inmutable a audit_log).
 */
export async function saveBlindAuditAction(
  tenantId: string,
  payload: {
    cashierName?: string
    declaredCash: number
    expectedCash: number
    diffCash: number
    status: 'EXACT' | 'OVER' | 'SHORT'
    notes?: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const effectiveTenantId = (await resolveEffectiveTenantId(tenantId)) || tenantId
    const auth = await assertTenantMember(effectiveTenantId)
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'No autorizado' }
    }

    const supabase = await createServiceClient()
    const nowIso = new Date().toISOString()

    // 1. Intentar persistir en tabla dedicada cash_shifts
    const { error: shiftErr } = await supabase.from('cash_shifts').insert({
      tenant_id: effectiveTenantId,
      cashier_name: payload.cashierName || null,
      declared_cash_cents: Math.round(payload.declaredCash * 100),
      expected_cash_cents: Math.round(payload.expectedCash * 100),
      diff_cash_cents: Math.round(payload.diffCash * 100),
      status: payload.status,
      notes: payload.notes || null,
      closed_at: nowIso,
    })

    if (!shiftErr) {
      revalidatePath('/dashboard/caja')
      return { success: true }
    }

    // 2. Fallback inmutable a audit_log
    const fallbackAudit = {
      cashier_name: payload.cashierName || '',
      declared_cash: payload.declaredCash,
      expected_cash: payload.expectedCash,
      diff_cash: payload.diffCash,
      status: payload.status,
      notes: payload.notes || '',
      closed_at: nowIso,
    }

    const { error: auditErr } = await supabase.from('audit_log').insert({
      tenant_id: effectiveTenantId,
      action: 'CASH_SHIFT_AUDIT',
      table_name: 'cash_shifts',
      record_id: crypto.randomUUID(),
      new_data: fallbackAudit,
    })

    if (auditErr) {
      console.error('[saveBlindAuditAction] Fallback error:', auditErr.message)
      return { success: false, error: auditErr.message }
    }

    revalidatePath('/dashboard/caja')
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al guardar arqueo'
    console.error('[saveBlindAuditAction] Exception:', msg)
    return { success: false, error: msg }
  }
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

// Cache en memoria en servidor para reporte de ocupación semanal (60s)
const occupancyReportCache = new Map<string, { data: OccupancyReportData; expiresAt: number }>()

export async function invalidateOccupancyReportCache(tenantId?: string | null) {
  if (tenantId) {
    occupancyReportCache.delete(tenantId)
  } else {
    occupancyReportCache.clear()
  }
}

/**
 * Genera el reporte de ocupación semanal con datos 100% reales en huso horario de Argentina.
 */
export async function getOccupancyReport(tenantId: string): Promise<OccupancyReportData> {
  const emptyReport: OccupancyReportData = {
    weeklyAverageOccupancy: 0,
    totalBookingsPeriod: 0,
    peakSlot: 'Sin turnos registrados en este período',
    peakSlotLabel: 'Sin datos suficientes',
    peakSlotPct: 0,
    deadHoursCount: 0,
    projectedRevenueRecoveryArs: 0,
    heatmap: [],
    recommendations: [],
  }

  try {
    const effectiveTenantId = (await resolveEffectiveTenantId(tenantId)) || tenantId
    if (!effectiveTenantId) {
      return emptyReport
    }

    // Cache ultra-rápido en memoria (0ms)
    const cached = occupancyReportCache.get(effectiveTenantId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data
    }

    const authCheck = await assertTenantMember(effectiveTenantId)
    if (!authCheck.authorized) {
      return emptyReport
    }

    const supabase = await createServiceClient()

    // Reservas de los últimos 30 días y próximas
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
    const futureLimit = new Date(Date.now() + 30 * 86400000)

    // Cargar canchas y reservas en paralelo
    const [courtsRes, bookingsRes] = await Promise.all([
      supabase
        .from('courts')
        .select('id, slot_duration_minutes')
        .eq('tenant_id', effectiveTenantId)
        .eq('is_active', true),
      supabase
        .from('bookings')
        .select('booked_at, price_total_cents')
        .eq('tenant_id', effectiveTenantId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(600),
    ])

    const courts = courtsRes.data
    const bookings = bookingsRes.data
    const courtsCount = Math.max(1, courts?.length || 1)

    if (bookingsRes.error) {
      console.error('[getOccupancyReport] Error fetching bookings:', bookingsRes.error)
    }

    // Construir matriz day x slot con conteos reales en huso horario Argentina (UTC-3)
    const bookingMatrix: Record<string, number> = {}
    let totalBookingsPeriod = 0

    for (const b of bookings ?? []) {
      let rawDateStr = b.booked_at ? b.booked_at.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)?.[1] : null
      if (!rawDateStr) continue

      if (rawDateStr.includes(' ') && !rawDateStr.includes('T')) {
        rawDateStr = rawDateStr.replace(' ', 'T')
      }
      if (rawDateStr.endsWith('+00')) {
        rawDateStr = rawDateStr.replace('+00', 'Z')
      }

      const d = new Date(rawDateStr)
      if (isNaN(d.getTime()) || d < thirtyDaysAgo || d > futureLimit) continue

      // Conversión estricta a huso horario de Argentina (UTC-3)
      const argDate = new Date(d.getTime() - 3 * 60 * 60 * 1000)
      const dow  = argDate.getUTCDay()
      const hour = argDate.getUTCHours()

      const slot = SLOTS_MAP.find(s => hour >= s.startHour && hour < s.endHour)
      if (slot) {
        const key = `${dow}_${slot.key}`
        bookingMatrix[key] = (bookingMatrix[key] ?? 0) + 1
        totalBookingsPeriod++
      }
    }

    const heatmap: HeatmapCell[] = []
    let totalPctSum = 0

    for (const day of DAYS_MAP) {
      for (const slot of SLOTS_MAP) {
        // Capacidad teórica real: horas de la franja x 4 semanas en el mes x canchas
        const hoursInSlot = slot.endHour - slot.startHour
        const capacitySlots = Math.max(1, hoursInSlot * 4 * courtsCount)

        const realCount = bookingMatrix[`${day.index}_${slot.key}`] ?? 0
        const occupancyPct = Math.min(100, Math.round((realCount / capacitySlots) * 100))
        const totalBookingsCell = realCount
        // Solo considerar "horario muerto" si el club tiene actividad real (>= 5 reservas) y esa franja está bajo 25%
        const isDeadHour = totalBookingsPeriod >= 5 && occupancyPct < 25

        heatmap.push({
          dayIndex: day.index,
          dayName: day.name,
          slotKey: slot.key,
          slotLabel: slot.label,
          timeRange: slot.range,
          occupancyPct,
          totalBookings: totalBookingsCell,
          capacitySlots,
          isDeadHour,
        })
        totalPctSum += occupancyPct
      }
    }

    const weeklyAverage = heatmap.length > 0 ? Math.round(totalPctSum / heatmap.length) : 0

    // Agrupar por franja horaria general para determinar con certeza el horario más demandado
    const slotStats = SLOTS_MAP.map(slot => {
      let slotBookings = 0
      let slotCapacity = 0
      for (const day of DAYS_MAP) {
        const cell = heatmap.find(h => h.dayIndex === day.index && h.slotKey === slot.key)
        if (cell) {
          slotBookings += cell.totalBookings
          slotCapacity += cell.capacitySlots
        }
      }
      const avgPct = slotCapacity > 0 ? Math.round((slotBookings / slotCapacity) * 100) : 0
      return {
        ...slot,
        totalBookings: slotBookings,
        totalCapacity: slotCapacity,
        avgPct,
      }
    })

    let peakSlotLabel = 'Sin datos suficientes'
    let peakSlotPct = 0
    let peakSlot = 'Sin turnos registrados en este período'

    if (totalBookingsPeriod > 0) {
      // Priorizar el slot con mayor porcentaje de ocupación o mayor cantidad de turnos
      const topSlot = slotStats.reduce((max, s) => {
        if (s.avgPct > max.avgPct) return s
        if (s.avgPct === max.avgPct && s.totalBookings > max.totalBookings) return s
        return max
      }, slotStats[0])

      if (topSlot && topSlot.totalBookings > 0) {
        const startFormatted = topSlot.startHour.toString().padStart(2, '0')
        const endFormatted = topSlot.endHour === 24 ? '00' : topSlot.endHour.toString().padStart(2, '0')
        peakSlotLabel = `${topSlot.label.replace(' (Pico)', '')} (${startFormatted} a ${endFormatted} hs)`
        peakSlotPct = Math.max(1, topSlot.avgPct)
        peakSlot = `${peakSlotLabel} — ${peakSlotPct}% de ocupación promedio (${topSlot.totalBookings} turnos)`
      }
    }

    const deadCount = heatmap.filter(h => h.isDeadHour).length

    // Precio pico del club desde la base de datos real
    let peakPrice = 0
    let recommendations: PricingRecommendation[] = []
    let projectedRecovery = 0

    // Solo generar recomendaciones y cálculo de recuperación si hay al menos 5 reservas registradas
    if (totalBookingsPeriod >= 5 && deadCount > 0) {
      const { data: priceRules } = await supabase
        .from('price_rules')
        .select('price_cents')
        .eq('tenant_id', effectiveTenantId)
        .eq('is_active', true)
        .order('price_cents', { ascending: false })
        .limit(1)

      if (priceRules?.[0]?.price_cents) {
        peakPrice = Math.round(Number(priceRules[0].price_cents) / 100)
      } else {
        const prices = (bookings ?? [])
          .map(b => Number(b.price_total_cents || 0) / 100)
          .filter(p => p > 0)
        if (prices.length > 0) {
          peakPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
        }
      }

      if (peakPrice > 0) {
        const deadHours = heatmap.filter(h => h.isDeadHour).slice(0, 3)
        recommendations = deadHours.map((h, i) => ({
          id: `rec_${i}`,
          slotLabel: `${h.slotLabel} — ${h.dayName} (${h.timeRange})`,
          days: h.dayName,
          currentOccupancy: h.occupancyPct,
          standardPriceArs: peakPrice,
          suggestedPriceArs: Math.round(peakPrice * 0.8),
          discountPct: 20,
          projectedWeeklyRevenueArs: Math.round(peakPrice * 0.8 * Math.max(1, Math.round(h.capacitySlots * 0.25))),
          rationale: `Ocupación registrada de ${h.occupancyPct}% (${h.totalBookings} turnos). Una promoción atractiva del 20% OFF puede incentivar reservas en este horario.`,
          suggestedPromoTitle: `Promo ${h.slotLabel}: 20% OFF el ${h.dayName} de ${h.timeRange}`,
        }))

        projectedRecovery = recommendations.reduce((s, r) => s + r.projectedWeeklyRevenueArs, 0)
      }
    }

    const result: OccupancyReportData = {
      weeklyAverageOccupancy: weeklyAverage,
      totalBookingsPeriod,
      peakSlot,
      peakSlotLabel,
      peakSlotPct,
      deadHoursCount: deadCount,
      projectedRevenueRecoveryArs: projectedRecovery,
      heatmap,
      recommendations,
    }
    occupancyReportCache.set(effectiveTenantId, { data: result, expiresAt: Date.now() + 60000 })
    return result
  } catch (err) {
    console.error('[getOccupancyReport] Error:', err)
    return emptyReport
  }
}
