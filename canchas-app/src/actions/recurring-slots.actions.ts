'use server'
// src/actions/recurring-slots.actions.ts
// ==============================================================================
// SERVER ACTIONS — Gestión de Turnos Fijos Recurrentes (Abonados Semanales)
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { parseArgentinaDate, getArgentinaTodayIso } from '@/lib/utils'
import { addVenueBooking } from '@/config/venues-data'
import type { RecurringSlot } from '@/types/database'
import { assertTenantMember } from '@/lib/auth-security'

const recurringSlotsCache = new Map<string, { data: RecurringSlot[]; expiresAt: number }>()

export async function invalidateRecurringSlotsCache(tenantId?: string | null) {
  if (tenantId) recurringSlotsCache.delete(tenantId)
  else recurringSlotsCache.clear()
}

/** Obtener todos los turnos fijos del club */
export async function getRecurringSlots(tenantId: string): Promise<RecurringSlot[]> {
  try {
    if (!tenantId) return []

    const cached = recurringSlotsCache.get(tenantId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data
    }

    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return []
    }

    const serviceClient = await createServiceClient()
    const { data, error } = await serviceClient
      .from('recurring_slots')
      .select('*, court:courts(id, name, sport, slot_duration_minutes)')
      .eq('tenant_id', tenantId)
      .order('day_of_week', { ascending: true })

    if (!error && data && data.length > 0) {
      const res = data as unknown as RecurringSlot[]
      recurringSlotsCache.set(tenantId, { data: res, expiresAt: Date.now() + 60000 })
      return res
    }

    // Si la tabla no existe o está vacía, consultar audit_log para este tenant_id
    const { data: auditData } = await serviceClient
      .from('audit_log')
      .select('new_data')
      .eq('tenant_id', tenantId)
      .eq('action', 'RECURRING_SLOT')
      .eq('table_name', 'recurring_slots')
      .order('created_at', { ascending: true })

    if (auditData && auditData.length > 0) {
      const res = auditData
        .map(r => r.new_data as RecurringSlot)
        .filter(s => s && s.status !== 'CANCELLED')
      recurringSlotsCache.set(tenantId, { data: res, expiresAt: Date.now() + 60000 })
      return res
    }

    return []
  } catch (err) {
    console.error('[getRecurringSlots] Error:', err)
    return []
  }
}

/** Crear un nuevo turno fijo */
export async function createRecurringSlot(payload: {
  tenant_id: string
  court_id: string
  day_of_week: number
  start_time: string
  end_time: string
  customer_name: string
  customer_phone: string
  customer_email?: string
  monthly_price: number
  payment_due_day: number
  notes?: string
}): Promise<{ success: boolean; slot?: RecurringSlot; error?: string }> {
  try {
    const todayArg = getArgentinaTodayIso()
    const [tYear, tMonth] = todayArg.split('-').map(Number)

    // Miembro del club autorizado (Dueño o Encargado)
    const auth = await assertTenantMember(payload.tenant_id)
    if (!auth.authorized) {
      return {
        success: false,
        error: auth.error || 'Sin permisos para crear turnos fijos (abonados).',
      }
    }

    const serviceClient = await createServiceClient()
    const { data, error } = await serviceClient
      .from('recurring_slots')
      .insert({
        ...payload,
        status: 'ACTIVE',
      })
      .select()
      .single()

    if (error) {
      console.warn('[createRecurringSlot] DB insert fallback:', error.message)
      const newSlot: RecurringSlot = {
        id: `rec-${Date.now()}`,
        tenant_id: payload.tenant_id,
        court_id: payload.court_id,
        day_of_week: payload.day_of_week,
        start_time: payload.start_time,
        end_time: payload.end_time,
        customer_name: payload.customer_name,
        customer_phone: payload.customer_phone,
        customer_email: payload.customer_email,
        monthly_price: payload.monthly_price,
        payment_due_day: payload.payment_due_day,
        status: 'ACTIVE',
        last_generated_month: `${tYear}-${String(tMonth).padStart(2, '0')}`,
        notes: payload.notes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      try {
        await serviceClient.from('audit_log').insert({
          tenant_id: payload.tenant_id,
          action: 'RECURRING_SLOT',
          table_name: 'recurring_slots',
          record_id: newSlot.id,
          new_data: newSlot,
        })
      } catch (auditErr) {
        console.warn('audit_log insert fallback warning:', auditErr)
      }

      revalidatePath('/dashboard/fijos')
      revalidatePath('/dashboard')
      return { success: true, slot: newSlot }
    }

    // Auto-generar turnos para el mes en curso en horario de Argentina
    await generateMonthlyBookingsForSlot(data.id, tYear, tMonth)

    await invalidateRecurringSlotsCache(payload.tenant_id)
    revalidatePath('/dashboard/fijos')
    revalidatePath('/dashboard')
    return { success: true, slot: data as RecurringSlot }
  } catch (err) {
    console.error('[createRecurringSlot] Unexpected error:', err)
    return { success: false, error: 'Error interno al crear turno fijo' }
  }
}

/** Cambiar estado (ACTIVE, PAUSED, CANCELLED) */
export async function updateRecurringSlotStatus(
  slotId: string, 
  newStatus: 'ACTIVE' | 'PAUSED' | 'CANCELLED'
): Promise<{ success: boolean; error?: string }> {
  try {
    const serviceClient = await createServiceClient()
    const { data: slot } = await serviceClient
      .from('recurring_slots')
      .select('id, tenant_id')
      .eq('id', slotId)
      .maybeSingle()

    const targetTenantId = slot?.tenant_id
    const auth = await assertTenantMember(targetTenantId)
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Sin permisos para modificar turnos fijos.' }
    }

    const { error } = await serviceClient
      .from('recurring_slots')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', slotId)
      .eq('tenant_id', targetTenantId)

    if (error) {
      // Fallback audit_log
      const { data } = await serviceClient
        .from('audit_log')
        .select('id, new_data')
        .eq('action', 'RECURRING_SLOT')
        .eq('record_id', slotId)
        .limit(1)

      if (data && data.length > 0) {
        const existing = data[0].new_data as RecurringSlot
        existing.status = newStatus
        existing.updated_at = new Date().toISOString()
        await serviceClient
          .from('audit_log')
          .update({ new_data: existing })
          .eq('id', data[0].id)
      }
    }

    await invalidateRecurringSlotsCache(targetTenantId)
    revalidatePath('/dashboard/fijos')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('[updateRecurringSlotStatus] Error:', err)
    return { success: false, error: 'Error al actualizar estado del turno fijo' }
  }
}

/** Actualizar datos de un turno fijo (precio mensual, día de corte, cliente, etc.) */
export async function updateRecurringSlot(
  slotId: string,
  payload: Partial<{
    court_id: string
    day_of_week: number
    start_time: string
    end_time: string
    customer_name: string
    customer_phone: string
    customer_email?: string
    monthly_price: number
    payment_due_day: number
    notes?: string
  }>
): Promise<{ success: boolean; slot?: RecurringSlot; error?: string }> {
  try {
    const serviceClient = await createServiceClient()
    const { data: slot } = await serviceClient
      .from('recurring_slots')
      .select('*')
      .eq('id', slotId)
      .maybeSingle()

    let targetTenantId = slot?.tenant_id
    if (!targetTenantId) {
      const { data: auditRow } = await serviceClient
        .from('audit_log')
        .select('tenant_id, new_data')
        .eq('action', 'RECURRING_SLOT')
        .eq('record_id', slotId)
        .maybeSingle()
      targetTenantId = auditRow?.tenant_id
    }

    const auth = await assertTenantMember(targetTenantId)
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Sin permisos para modificar el turno fijo.' }
    }

    const updateData: Record<string, unknown> = {
      ...payload,
      updated_at: new Date().toISOString(),
    }

    const { data: updatedDb, error } = await serviceClient
      .from('recurring_slots')
      .update(updateData)
      .eq('id', slotId)
      .select('*, court:courts(id, name, sport, slot_duration_minutes)')
      .maybeSingle()

    if (error || !updatedDb) {
      // Fallback audit_log
      const { data } = await serviceClient
        .from('audit_log')
        .select('id, new_data')
        .eq('action', 'RECURRING_SLOT')
        .eq('record_id', slotId)
        .limit(1)

      if (data && data.length > 0) {
        const existing = (data[0].new_data || {}) as Record<string, unknown>
        const merged = { ...existing, ...payload, updated_at: new Date().toISOString() } as RecurringSlot
        await serviceClient
          .from('audit_log')
          .update({ new_data: merged })
          .eq('id', data[0].id)
        
        revalidatePath('/dashboard/fijos')
        revalidatePath('/dashboard')
        revalidatePath('/dashboard/canchas')
        return { success: true, slot: merged }
      }
    }

    await invalidateRecurringSlotsCache(targetTenantId)
    revalidatePath('/dashboard/fijos')
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/canchas')
    return { success: true, slot: updatedDb as unknown as RecurringSlot }
  } catch (err) {
    console.error('[updateRecurringSlot] Error:', err)
    return { success: false, error: 'Error al actualizar el abono recurrente' }
  }
}

/**
 * Eliminar un turno fijo recurrente (abonado)
 * Opcionalmente cancela las reservas futuras asociadas generadas en la grilla para liberar el horario.
 */
export async function deleteRecurringSlot(
  slotId: string,
  options?: { cancelFutureBookings?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const serviceClient = await createServiceClient()

    // 1. Obtener datos del slot para auditoría y validación
    let targetTenantId: string | undefined
    let slotCustomerName: string | undefined
    let slotCourtId: string | undefined

    const { data: slot } = await serviceClient
      .from('recurring_slots')
      .select('id, tenant_id, customer_name, court_id')
      .eq('id', slotId)
      .maybeSingle()

    if (slot) {
      targetTenantId = slot.tenant_id
      slotCustomerName = slot.customer_name
      slotCourtId = slot.court_id
    } else {
      const { data: auditRow } = await serviceClient
        .from('audit_log')
        .select('tenant_id, new_data')
        .eq('action', 'RECURRING_SLOT')
        .eq('record_id', slotId)
        .maybeSingle()
      if (auditRow) {
        targetTenantId = auditRow.tenant_id
        const parsed = auditRow.new_data as Record<string, unknown> | null
        slotCustomerName = (parsed?.customer_name as string) || undefined
        slotCourtId = (parsed?.court_id as string) || undefined
      }
    }

    const auth = await assertTenantMember(targetTenantId)
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Sin permisos para eliminar el turno fijo.' }
    }

    // 2. Si se cancelan reservas futuras generadas por este abono
    const cancelBookings = options?.cancelFutureBookings ?? true
    if (cancelBookings && targetTenantId) {
      // Cancelar por recurring_slot_id
      await serviceClient
        .from('bookings')
        .update({
          status: 'cancelled',
          staff_notes: 'Turno cancelado por eliminación del abono fijo recurrente',
        })
        .eq('tenant_id', targetTenantId)
        .eq('recurring_slot_id', slotId)
        .not('status', 'in', '("cancelled","CANCELLED_USER","CANCELLED_CLUB","RAIN_CANCELLED")')

      // También cancelar reservas asociadas identificadas por notas
      if (slotCustomerName && slotCourtId) {
        await serviceClient
          .from('bookings')
          .update({
            status: 'cancelled',
            staff_notes: 'Turno cancelado por eliminación del abono fijo recurrente',
          })
          .eq('tenant_id', targetTenantId)
          .eq('court_id', slotCourtId)
          .ilike('staff_notes', `%ABONO FIJO: ${slotCustomerName}%`)
          .not('status', 'in', '("cancelled","CANCELLED_USER","CANCELLED_CLUB","RAIN_CANCELLED")')
      }
    }

    // 3. Eliminar de la tabla recurring_slots
    if (targetTenantId) {
      const { error: dbDeleteErr } = await serviceClient
        .from('recurring_slots')
        .delete()
        .eq('id', slotId)
        .eq('tenant_id', targetTenantId)

      if (dbDeleteErr) {
        console.warn('[deleteRecurringSlot] Error deleting from DB table:', dbDeleteErr.message)
      }
    }

    // 4. Eliminar de audit_log si existía allí
    await serviceClient
      .from('audit_log')
      .delete()
      .eq('action', 'RECURRING_SLOT')
      .eq('record_id', slotId)

    await invalidateRecurringSlotsCache(targetTenantId)
    revalidatePath('/dashboard/fijos')
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/canchas')

    return { success: true }
  } catch (err) {
    console.error('[deleteRecurringSlot] Error:', err)
    return { success: false, error: 'Error al eliminar el abono fijo' }
  }
}

/** 
 * Generar reservas automáticas en la tabla `bookings` para el mes y año dados
 * Encuentra todas las fechas en el mes que coincidan con `day_of_week`
 */
export async function generateMonthlyBookingsForSlot(
  slotId: string,
  year?: number,
  month?: number
): Promise<{ 
  success: boolean; 
  generatedCount: number; 
  alreadyExistingCount?: number; 
  message?: string; 
  error?: string 
}> {
  try {
    const supabase = await createServiceClient()
    let slot = null
    const { data: dbSlot, error: slotErr } = await supabase
      .from('recurring_slots')
      .select('*, court:courts(id, name, sport, slot_duration_minutes)')
      .eq('id', slotId)
      .maybeSingle()

    if (dbSlot) {
      slot = dbSlot
    } else {
      // Fallback: buscar en audit_log si el slot fue registrado allí
      const { data: auditRow } = await supabase
        .from('audit_log')
        .select('new_data')
        .eq('action', 'RECURRING_SLOT')
        .eq('record_id', slotId)
        .maybeSingle()

      if (auditRow?.new_data) {
        slot = auditRow.new_data as typeof dbSlot
      }
    }

    if (!slot) {
      console.error('[generateMonthlyBookingsForSlot] Error al obtener turno fijo:', slotErr)
      return { success: false, generatedCount: 0, error: 'Turno fijo no encontrado' }
    }

    const auth = await assertTenantMember(slot.tenant_id)
    if (!auth.authorized) {
      return { success: false, generatedCount: 0, error: auth.error || 'Sin permisos para generar reservas' }
    }

    const todayArg = getArgentinaTodayIso()
    const [defYear, defMonth] = todayArg.split('-').map(Number)
    const targetYear = year ?? defYear
    const targetMonth = month ?? defMonth

    // Calcular los días del mes con ese día de la semana sin riesgo de desfase por hora ni DST
    const dates: Date[] = []
    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate()

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(targetYear, targetMonth - 1, day, 12, 0, 0)
      if (d.getDay() === slot.day_of_week) {
        dates.push(d)
      }
    }

    let generatedCount = 0
    let alreadyExistingCount = 0

    // Calcular duración exacta del turno según horario asignado o configuración de la cancha
    let durationMinutes = 90
    if (slot.start_time && slot.end_time) {
      const [sh, sm] = slot.start_time.slice(0, 5).split(':').map(Number)
      const [eh, em] = slot.end_time.slice(0, 5).split(':').map(Number)
      let diff = (eh * 60 + em) - (sh * 60 + sm)
      if (diff <= 0) diff += 24 * 60 // Por si cruza medianoche
      if (diff > 0) durationMinutes = diff
    } else if (slot.court?.slot_duration_minutes) {
      durationMinutes = slot.court.slot_duration_minutes
    }

    const pricePerTurn = Math.round(slot.monthly_price / (dates.length || 4))
    const priceTotalCents = Math.round(pricePerTurn * 100)

    for (const date of dates) {
      const yearStr = date.getFullYear()
      const monthStr = String(date.getMonth() + 1).padStart(2, '0')
      const dayStr = String(date.getDate()).padStart(2, '0')
      const dateIsoStr = `${yearStr}-${monthStr}-${dayStr}`

      const startsAtLocal = `${dateIsoStr}T${slot.start_time.slice(0, 5)}:00`
      const slotStartDate = parseArgentinaDate(startsAtLocal)

      // Evitar crear reservas para turnos en el pasado
      if (slotStartDate.getTime() <= Date.now() - 60_000) {
        continue
      }

      const startsAtIso = slotStartDate.toISOString()
      const endsAtIso = new Date(slotStartDate.getTime() + durationMinutes * 60000).toISOString()
      const bookingRange = `[${startsAtIso},${endsAtIso})`

      // Verificar si ya existe una reserva activa para este horario y cancha (operador 'ov' de Postgres para solapamiento de rangos)
      const { data: existingBooking } = await supabase
        .from('bookings')
        .select('id, customer_name, status')
        .eq('tenant_id', slot.tenant_id)
        .eq('court_id', slot.court_id)
        .filter('booked_at', 'ov', bookingRange)
        .not('status', 'in', '("cancelled","CANCELLED_USER","CANCELLED_CLUB","RAIN_CANCELLED")')
        .limit(1)
        .maybeSingle()

      if (existingBooking) {
        alreadyExistingCount++
        continue
      }

      const bookingId = crypto.randomUUID()
      const staffNotes = `ABONO FIJO: ${slot.customer_name} (Mensualidad día ${slot.payment_due_day})`

      const { error: insertErr } = await supabase
        .from('bookings')
        .insert({
          id: bookingId,
          tenant_id: slot.tenant_id,
          court_id: slot.court_id,
          booked_at: bookingRange,
          status: 'confirmed',
          sport: (slot.court as { sport?: string } | null)?.sport || 'FUTBOL5',
          price_total_cents: priceTotalCents,
          deposit_cents: priceTotalCents, // Cubierto por abono mensual
          staff_deposit_amount_cents: priceTotalCents,
          payment_method: 'cash',
          paid_at: new Date().toISOString(),
          customer_name: slot.customer_name,
          customer_phone: slot.customer_phone,
          customer_email: slot.customer_email || null,
          staff_notes: staffNotes,
          recurring_slot_id: slot.id,
        })

      if (insertErr) {
        // Conflicto de solapamiento
        if (insertErr.code === '23P01') {
          console.warn(`[generateMonthlyBookingsForSlot] Conflicto de turno ya reservado para ${startsAtIso}, omitiendo...`)
          alreadyExistingCount++
          continue
        }
        console.warn('[generateMonthlyBookingsForSlot] DB insert notice:', insertErr.message)
      } else {
        generatedCount++
      }

      // Sincronizar en memoria para visualización inmediata en la grilla y portal público
      addVenueBooking({
        id: bookingId,
        court_id: slot.court_id,
        customer_name: slot.customer_name,
        customer_phone: slot.customer_phone,
        customer_email: slot.customer_email || undefined,
        starts_at: startsAtIso,
        ends_at: endsAtIso,
        status: 'CONFIRMED',
        origin: 'STAFF_MANUAL',
        total_amount_ars: pricePerTurn,
        deposit_amount_ars: pricePerTurn,
        total_paid: pricePerTurn,
        balance_due: 0,
        internal_notes: staffNotes,
        courts: {
          name: slot.court?.name || 'Cancha',
          sport: (slot.court as { sport?: string } | null)?.sport || 'FUTBOL5',
          slot_duration: durationMinutes === 60 ? 'MIN_60' : durationMinutes === 120 ? 'MIN_120' : 'MIN_90',
        },
      })
    }

    // Marcar último mes generado
    await supabase
      .from('recurring_slots')
      .update({ last_generated_month: `${targetYear}-${String(targetMonth).padStart(2, '0')}` })
      .eq('id', slotId)

    revalidatePath('/dashboard/fijos')
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/canchas')

    let message = ''
    if (generatedCount > 0) {
      message = `¡Se generaron ${generatedCount} reserva${generatedCount > 1 ? 's' : ''} en la grilla para este mes!`
      if (alreadyExistingCount > 0) {
        message += ` (${alreadyExistingCount} ya estaban agendadas)`
      }
    } else if (alreadyExistingCount > 0) {
      message = `Los turnos de este mes ya estaban reservados en la grilla (${alreadyExistingCount} reservas).`
    } else {
      message = 'No quedan fechas futuras pendientes en este mes para generar.'
    }

    return { 
      success: true, 
      generatedCount, 
      alreadyExistingCount,
      message 
    }
  } catch (err) {
    console.error('[generateMonthlyBookingsForSlot] Error:', err)
    return { success: false, generatedCount: 0, error: 'Error al generar reservas mensuales' }
  }
}

/**
 * Registra el cobro de la mensualidad de un turno fijo.
 * Guarda la marca [LAST_PAID:YYYY-MM] en notes para garantizar que el motor
 * de liberación automática sepa que el cliente pagó este mes.
 */
export async function registerRecurringSlotPaymentAction(
  tenantId: string,
  slotId: string,
  period?: string
): Promise<{ success: boolean; error?: string; period?: string }> {
  try {
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return { success: false, error: auth.error }
    }
    const supabase = await createServiceClient()
    const now = new Date()
    const targetPeriod = period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const { data: slot, error: fetchErr } = await supabase
      .from('recurring_slots')
      .select('id, notes')
      .eq('id', slotId)
      .eq('tenant_id', tenantId)
      .single()

    if (fetchErr || !slot) {
      return { success: false, error: 'Turno fijo no encontrado' }
    }

    let currentNotes = slot.notes || ''
    // Remover marcas previas del mismo o distinto período para mantener notes limpio
    currentNotes = currentNotes.replace(/\[LAST_PAID:[0-9]{4}-[0-9]{2}\]/g, '').trim()
    const updatedNotes = currentNotes ? `${currentNotes} [LAST_PAID:${targetPeriod}]` : `[LAST_PAID:${targetPeriod}]`

    const { error: updateErr } = await supabase
      .from('recurring_slots')
      .update({
        notes: updatedNotes,
        last_paid_period: targetPeriod,
        status: 'ACTIVE',
        updated_at: now.toISOString(),
      })
      .eq('id', slotId)

    if (updateErr) {
      return { success: false, error: updateErr.message }
    }

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/fijos')
    return { success: true, period: targetPeriod }
  } catch (err) {
    console.error('[registerRecurringSlotPaymentAction] Error:', err)
    return { success: false, error: 'Error al registrar pago de turno fijo' }
  }
}

/** 
 * Liberación automática de turnos fijos vencidos
 * Si la fecha actual supera el payment_due_day Y el abonado no registró el pago del mes actual,
 * se liberan ÚNICAMENTE las reservas FUTURAS del mes para la grilla pública.
 * Nunca cancela turnos pasados ni turnos de abonados que ya pagaron.
 */
export async function checkAndReleaseOverdueRecurringSlots(
  tenantId: string,
  options?: { skipAuth?: boolean }
): Promise<{ success: boolean; releasedCount: number; details: string[]; error?: string }> {
  try {
    if (!options?.skipAuth) {
      const auth = await assertTenantMember(tenantId)
      if (!auth.authorized) {
        return { success: false, releasedCount: 0, details: [], error: auth.error }
      }
    }
    const supabase = await createServiceClient()
    const todayIsoDate = getArgentinaTodayIso()
    const [tYear, tMonth, tDay] = todayIsoDate.split('-').map(Number)
    const currentDayOfMonth = tDay
    const currentPeriod = `${tYear}-${String(tMonth).padStart(2, '0')}`

    // Buscar slots activos cuyo día de corte ya venció este mes
    const { data: slots } = await supabase
      .from('recurring_slots')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'ACTIVE')
      .lt('payment_due_day', currentDayOfMonth)

    const releasedDetails: string[] = []
    let count = 0

    if (slots && slots.length > 0) {
      for (const slot of slots) {
        // BLINDAJE: Si el abonado ya pagó la cuota de este mes (columna last_paid_period o tag [LAST_PAID:YYYY-MM]), omitir
        if (slot.last_paid_period === currentPeriod || (slot.notes && slot.notes.includes(`[LAST_PAID:${currentPeriod}]`))) {
          continue
        }

        // Buscar reservas estrictamente FUTURAS vinculadas a este turno fijo
        let pendingBookings: Array<{ id: string; booked_at: unknown; staff_notes?: string | null }> = []

        const { data: bySlotId } = await supabase
          .from('bookings')
          .select('id, booked_at, staff_notes')
          .eq('tenant_id', tenantId)
          .eq('recurring_slot_id', slot.id)
          .not('status', 'in', '("cancelled","CANCELLED_USER","CANCELLED_CLUB","RAIN_CANCELLED")')

        if (bySlotId && bySlotId.length > 0) {
          pendingBookings = bySlotId
        } else {
          // Fallback para reservas creadas antes de la columna recurring_slot_id
          const { data: byNotes } = await supabase
            .from('bookings')
            .select('id, booked_at, staff_notes')
            .eq('tenant_id', tenantId)
            .eq('court_id', slot.court_id)
            .ilike('staff_notes', `%ABONO FIJO%${slot.customer_name}%`)
            .not('status', 'in', '("cancelled","CANCELLED_USER","CANCELLED_CLUB","RAIN_CANCELLED")')

          if (byNotes) {
            pendingBookings = byNotes
          }
        }

        if (pendingBookings && pendingBookings.length > 0) {
          for (const b of pendingBookings) {
            // Validar que la reserva sea del día de hoy o futura, nunca cancelar el pasado
            const bookedAtStr = String(b.booked_at || '')
            const dateMatch = bookedAtStr.match(/\d{4}-\d{2}-\d{2}/)
            const startDateStr = dateMatch ? dateMatch[0] : null
            if (startDateStr && startDateStr < todayIsoDate) {
              continue // Omitir turnos que ya se jugaron en el pasado
            }

            const cancellationNote = `Liberado por falta de pago del abono de ${currentPeriod} (venció día ${slot.payment_due_day})`
            const updatedNotes = b.staff_notes ? `${b.staff_notes} | ${cancellationNote}` : cancellationNote
            await supabase
              .from('bookings')
              .update({
                status: 'cancelled',
                staff_notes: updatedNotes,
              })
              .eq('id', b.id)

            releasedDetails.push(`${slot.customer_name} - Turno ID: ${b.id}`)
            count++
          }
        }
      }
    }

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/fijos')
    return { success: true, releasedCount: count, details: releasedDetails }
  } catch (err) {
    console.error('[checkAndReleaseOverdueRecurringSlots] Error:', err)
    return { success: false, releasedCount: 0, details: [] }
  }
}
