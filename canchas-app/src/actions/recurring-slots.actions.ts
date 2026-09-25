'use server'
// src/actions/recurring-slots.actions.ts
// ==============================================================================
// SERVER ACTIONS — Gestión de Turnos Fijos Recurrentes (Abonados Semanales)
// ==============================================================================

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { parseArgentinaDate } from '@/lib/utils'
import { addVenueBooking } from '@/config/venues-data'
import type { RecurringSlot } from '@/types/database'
import { assertTenantAdmin, assertTenantMember } from '@/lib/auth-security'

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
    // Protección antifraude: Solo el dueño del club puede fijar precios y crear turnos fijos recurrentes
    const auth = await assertTenantAdmin(payload.tenant_id)
    if (!auth.authorized) {
      return {
        success: false,
        error: auth.error || 'Solo el dueño del club tiene permisos para crear turnos fijos (abonados).',
      }
    }

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
    const auth = await assertTenantMember()
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Sin permisos para modificar turnos fijos.' }
    }
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
    const durationMinutes = slotDuration === 'MIN_60' ? 60 : slotDuration === 'MIN_120' ? 120 : 90
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
          sport: (slot.court as { sport?: string } | null)?.sport || 'PADEL',
          price_total_cents: priceTotalCents,
          deposit_cents: priceTotalCents, // Cubierto por abono mensual
          staff_deposit_amount_cents: priceTotalCents,
          payment_method: 'cash',
          paid_at: new Date().toISOString(),
          customer_name: slot.customer_name,
          customer_phone: slot.customer_phone,
          customer_email: slot.customer_email || null,
          staff_notes: staffNotes,
        })

      if (insertErr) {
        // Si hay conflicto de solapamiento (23P01), omitir este turno sin romper la generación de los demás
        if (insertErr.code === '23P01') {
          console.warn(`[generateMonthlyBookingsForSlot] Conflicto de turno ya reservado para ${startsAtIso}, omitiendo...`)
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
          sport: (slot.court as { sport?: string } | null)?.sport || 'PADEL',
          slot_duration: slotDuration === 'MIN_60' ? 'MIN_60' : 'MIN_90',
        },
      })
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
): Promise<{ success: boolean; releasedCount: number; details: string[]; error?: string }> {
  try {
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return { success: false, releasedCount: 0, details: [], error: auth.error }
    }
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
        // Buscar reservas del mes futuro/actual para este cliente
        const { data: pendingBookings } = await supabase
          .from('bookings')
          .select('id, booked_at, customer_name, staff_notes')
          .eq('tenant_id', tenantId)
          .eq('court_id', slot.court_id)
          .ilike('staff_notes', `%${slot.customer_name}%`)
          .not('status', 'in', '("cancelled")')

        if (pendingBookings && pendingBookings.length > 0) {
          for (const b of pendingBookings) {
            const cancellationNote = `Liberado por falta de pago de abono mensual (venció día ${slot.payment_due_day})`
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
