// src/app/api/cron/match-reminders/route.ts
// ==============================================================================
// CRON ROUTE — Recordatorios automáticos de partidos por WhatsApp (2 horas antes)
// Busca turnos confirmados que comiencen en la ventana de las próximas 2 horas
// y envía la notificación oficial de cortesía para reducir el ausentismo (no-shows).
// ==============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { notifyMatchReminder } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  return handleMatchReminders(request)
}

export async function POST(request: NextRequest) {
  return handleMatchReminders(request)
}

async function handleMatchReminders(request: NextRequest) {
  const startTime = Date.now()

  // 1. Verificación segura con Bearer o ?secret=
  const cronAuth = verifyCronRequest(request)
  if (!cronAuth.authorized) {
    return NextResponse.json({ error: cronAuth.error || 'Unauthorized cron invocation' }, { status: 401 })
  }

  try {
    const supabase = await createServiceClient()
    const now = new Date()

    // Ventana de 2 horas (entre 90 y 150 minutos a partir de ahora)
    const windowStart = new Date(now.getTime() + 90 * 60 * 1000).toISOString()
    const windowEnd = new Date(now.getTime() + 150 * 60 * 1000).toISOString()

    // 2. Consultar turnos confirmados con datos del club y cancha
    const { data: bookings, error: bookingsErr } = await supabase
      .from('bookings')
      .select('id, tenant_id, customer_name, customer_phone, booked_at, staff_notes, status, reminder_sent_at, courts(name), tenants(name, address)')
      .eq('status', 'confirmed')
      .not('customer_phone', 'is', null)

    if (bookingsErr) {
      console.error('[Match Reminders] Error consultando reservas:', bookingsErr.message)
      return NextResponse.json({ error: 'Error al consultar reservas', detail: bookingsErr.message }, { status: 500 })
    }

    const remindersSent: Array<{
      bookingId: string
      customerName: string
      phone: string
      timeStr: string
      court: string
    }> = []

    for (const b of bookings || []) {
      if (!b.customer_phone) continue

      // Evitar envíos duplicados si ya fue notificado (columna reminder_sent_at o tag en notas)
      const notes = b.staff_notes || ''
      if (b.reminder_sent_at || notes.includes('[REMINDER_2H_SENT]')) {
        continue
      }

      // Extraer fecha y hora de inicio de booked_at (tstzrange ej: ["2026-10-13 18:00:00+00",...))
      const rangeStr = String(b.booked_at || '')
      const startMatch = rangeStr.match(/[\[\(]([^,]+),/)
      if (!startMatch || !startMatch[1]) continue

      const rawStartIso = startMatch[1].replace(/["']/g, '').trim()
      const startDate = new Date(rawStartIso)

      if (isNaN(startDate.getTime())) continue

      // Verificar que el inicio del partido caiga dentro de la ventana de ~2 horas
      if (startDate.toISOString() < windowStart || startDate.toISOString() > windowEnd) {
        continue
      }

      // Formatear hora local de inicio (Argentina UTC-3)
      const timeStr = startDate.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Argentina/Buenos_Aires',
      })

      const courtObj = Array.isArray(b.courts) ? b.courts[0] : b.courts
      const courtName = (courtObj as { name?: string } | null)?.name || 'Cancha'

      const tenantObj = Array.isArray(b.tenants) ? b.tenants[0] : b.tenants
      const clubName = (tenantObj as { name?: string; address?: string } | null)?.name || 'Tu Club'
      const address = (tenantObj as { name?: string; address?: string } | null)?.address || undefined

      // Despachar notificación
      const sendRes = await notifyMatchReminder({
        phone: b.customer_phone,
        customerName: b.customer_name || 'Jugador/a',
        clubName,
        courtName,
        timeStr,
        hoursBefore: 2,
        address,
      })

      if (sendRes.success) {
        // Marcar en la reserva para asegurar idempotencia total
        const updatedNotes = notes ? `${notes} | [REMINDER_2H_SENT]` : '[REMINDER_2H_SENT]'
        await supabase
          .from('bookings')
          .update({
            staff_notes: updatedNotes,
            reminder_sent_at: new Date().toISOString(),
          })
          .eq('id', b.id)

        remindersSent.push({
          bookingId: b.id,
          customerName: b.customer_name || 'Cliente',
          phone: b.customer_phone,
          timeStr,
          court: courtName,
        })
      }
    }

    const durationMs = Date.now() - startTime
    console.log(`[Match Reminders] Cron completado en ${durationMs}ms. ${remindersSent.length} recordatorios despachados.`)

    return NextResponse.json({
      success: true,
      action: 'match-reminders',
      remindersSentCount: remindersSent.length,
      reminders: remindersSent,
      durationMs,
      timestamp: now.toISOString(),
    })
  } catch (err: unknown) {
    console.error('[Match Reminders] Excepción no controlada en cron:', err)
    return NextResponse.json(
      { error: 'Error interno en cron match-reminders', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
