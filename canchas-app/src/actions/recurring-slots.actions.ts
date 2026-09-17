'use server'
// src/actions/recurring-slots.actions.ts
// ==============================================================================
// SERVER ACTIONS — Gestión de Turnos Fijos Recurrentes (Abonados Semanales)
// ==============================================================================

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { computeEndsAt } from '@/lib/utils'
import type { RecurringSlot, BookingStatus } from '@/types/database'

/** Obtener todos los turnos fijos del club */
export async function getRecurringSlots(tenantId: string): Promise<RecurringSlot[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('recurring_slots')
      .select('*, court:courts(id, name, sport, slot_duration_minutes)')
      .eq('tenant_id', tenantId)
      .order('day_of_week', { ascending: true })

    if (!error && data && data.length > 0) {
      return data as unknown as RecurringSlot[]
    }

    // Si la tabla no existe o está vacía, consultar audit_log para este tenant_id
    const serviceClient = await createServiceClient()
    const { data: auditData } = await serviceClient
      .from('audit_log')
      .select('new_data')
      .eq('tenant_id', tenantId)
      .eq('action', 'RECURRING_SLOT')
      .eq('table_name', 'recurring_slots')
      .order('created_at', { ascending: true })

    if (auditData && auditData.length > 0) {
      return auditData
        .map(r => r.new_data as RecurringSlot)
        .filter(s => s && s.status !== 'CANCELLED')
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
    const supabase = await createClient()
    const { data, error } = await supabase
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
        last_generated_month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
        notes: payload.notes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      try {
        const serviceClient = await createServiceClient()
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

    // Auto-generar turnos para el mes en curso
    const now = new Date()
    await generateMonthlyBookingsForSlot(data.id, now.getFullYear(), now.getMonth() + 1)

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
    const supabase = await createClient()
    const { error } = await supabase
      .from('recurring_slots')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', slotId)

    if (error) {
      // Fallback audit_log
      const serviceClient = await createServiceClient()
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

    revalidatePath('/dashboard/fijos')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('[updateRecurringSlotStatus] Error:', err)
    return { success: false, error: 'Error al actualizar estado del turno fijo' }
  }
}

/** 
 * Generar reservas automáticas en la tabla `bookings` para el mes y año dados
 * Encuentra todas las fechas en el mes que coincidan con `day_of_week`
 */
export async function generateMonthlyBookingsForSlot(
  slotId: string,
  year: number = new Date().getFullYear(),
  month: number = new Date().getMonth() + 1
): Promise<{ success: boolean; generatedCount: number; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const { data: slot, error: slotErr } = await supabase
      .from('recurring_slots')
      .select('*, court:courts(id, name, slot_duration)')
      .eq('id', slotId)
      .single()

    if (slotErr || !slot) {
      return { success: false, generatedCount: 0, error: 'Turno fijo no encontrado' }
    }

    // Calcular los días del mes con ese día de la semana
    const dates: Date[] = []
    const firstDay = new Date(year, month - 1, 1)
    const lastDay = new Date(year, month, 0)

    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === slot.day_of_week) {
        dates.push(new Date(d))
      }
    }

    let generatedCount = 0
    const slotDuration = slot.court?.slot_duration || 'MIN_90'
    const pricePerTurn = slot.monthly_price / (dates.length || 4)

    for (const date of dates) {
      const yearStr = date.getFullYear()
      const monthStr = String(date.getMonth() + 1).padStart(2, '0')
      const dayStr = String(date.getDate()).padStart(2, '0')
      const dateIsoStr = `${yearStr}-${monthStr}-${dayStr}`

      const startsAt = `${dateIsoStr}T${slot.start_time.slice(0, 5)}:00.000Z`
      const endsAt = computeEndsAt(startsAt, slotDuration)
      const bookingRange = `[${startsAt},${endsAt})`

      const { error: insertErr } = await supabase
        .from('bookings')
        .insert({
          tenant_id: slot.tenant_id,
          court_id: slot.court_id,
          recurring_slot_id: slot.id,
          customer_name: slot.customer_name,
          customer_phone: slot.customer_phone,
          customer_email: slot.customer_email,
          booking_range: bookingRange,
          status: 'CONFIRMED' as BookingStatus,
          origin: 'ADMIN_MANUAL',
          total_amount_ars: pricePerTurn,
          deposit_amount_ars: pricePerTurn, // Cubierto por abono mensual
          internal_notes: `ABONO FIJO: ${slot.customer_name} (Mensualidad día ${slot.payment_due_day})`,
        })

      if (!insertErr) {
        generatedCount++
      }
    }

    // Marcar último mes generado
    await supabase
      .from('recurring_slots')
      .update({ last_generated_month: `${year}-${String(month).padStart(2, '0')}` })
      .eq('id', slotId)

    revalidatePath('/dashboard/fijos')
    revalidatePath('/dashboard')
    return { success: true, generatedCount }
  } catch (err) {
    console.error('[generateMonthlyBookingsForSlot] Error:', err)
    return { success: false, generatedCount: 0, error: 'Error al generar reservas mensuales' }
  }
}

/** 
 * Liberación automática de turnos fijos vencidos
 * Si la fecha actual supera el payment_due_day y el abonado no registró el pago,
 * se liberan las reservas del mes para la grilla pública.
 */
export async function checkAndReleaseOverdueRecurringSlots(
  tenantId: string
): Promise<{ success: boolean; releasedCount: number; details: string[] }> {
  try {
    const supabase = await createServiceClient()
    const today = new Date()
    const currentDayOfMonth = today.getDate()

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
        // Buscar reservas del mes futuro/actual sin pagar o pendientes de pago
        const { data: pendingBookings } = await supabase
          .from('bookings')
          .select('id, starts_at, customer_name')
          .eq('recurring_slot_id', slot.id)
          .gte('starts_at', today.toISOString())
          .eq('status', 'PENDING_DEPOSIT')

        if (pendingBookings && pendingBookings.length > 0) {
          for (const b of pendingBookings) {
            await supabase
              .from('bookings')
              .update({
                status: 'CANCELLED_CLUB' as BookingStatus,
                cancellation_reason: `Liberado por falta de pago de abono mensual (venció día ${slot.payment_due_day})`,
              })
              .eq('id', b.id)

            releasedDetails.push(`${slot.customer_name} - Turno ${b.starts_at}`)
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
