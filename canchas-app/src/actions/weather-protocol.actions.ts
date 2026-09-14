'use server'
// src/actions/weather-protocol.actions.ts
// ==============================================================================
// SERVER ACTIONS — Protocolo Climático y Saldo a Favor (Cancelación por Lluvia)
// ==============================================================================

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { formatARS, formatTime, buildWhatsAppLink } from '@/lib/utils'
import { notifyRainCancellation } from '@/lib/whatsapp'
import type { CustomerCredit, BookingStatus } from '@/types/database'

export interface RainCancellationResult {
  success: boolean
  cancelledBookingsCount: number
  totalCreditedArs: number
  notifications: Array<{
    bookingId: string
    customerName: string
    customerPhone: string
    courtName: string
    time: string
    creditedAmount: number
    whatsAppUrl: string
    messageText: string
  }>
  error?: string
}

/** 
 * Ejecuta la cancelación masiva por lluvia / mal tiempo
 * Convierte automáticamente las señas pagadas en saldo a favor (customer_credits)
 */
export async function executeRainCancellation(params: {
  tenantId: string
  date: string             // "YYYY-MM-DD"
  timeFrom: string         // "18:00"
  timeTo: string           // "23:59"
  courtIds: string[]       // Array con IDs de canchas afectadas (descubiertas)
  reason?: string
}): Promise<RainCancellationResult> {
  try {
    const supabase = await createServiceClient()
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', params.tenantId)
      .single()

    const clubName = tenant?.name || 'CancharClub'

    // 1. Obtener reservas del día
    const startWindow = `${params.date}T${params.timeFrom}:00.000Z`
    const endWindow = `${params.date}T${params.timeTo}:00.000Z`

    const { data: bookings, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, customer_name, customer_phone, deposit_amount_ars, total_amount_ars, starts_at, court_id, court:courts(name)')
      .eq('tenant_id', params.tenantId)
      .in('court_id', params.courtIds)
      .filter('booking_range', 'ov', `[${startWindow},${endWindow}]`)
      .not('status', 'in', '("CANCELLED_USER","CANCELLED_CLUB","RAIN_CANCELLED")')

    if (fetchErr) {
      console.warn('[executeRainCancellation] Fetch warning:', fetchErr.message)
    }

    const targetBookings = bookings || []
    let totalCreditedArs = 0
    const notifications: RainCancellationResult['notifications'] = []

    for (const b of targetBookings) {
      const courtName = (b.court as unknown as { name: string })?.name || 'Cancha'
      const timeStr = formatTime(b.starts_at)
      const creditedAmount = Number(b.deposit_amount_ars) || 0

      // 2. Si tenía seña, insertar saldo a favor en customer_credits
      if (creditedAmount > 0 && b.customer_phone) {
        await supabase
          .from('customer_credits')
          .insert({
            tenant_id: params.tenantId,
            customer_phone: b.customer_phone,
            customer_name: b.customer_name,
            amount_ars: creditedAmount,
            status: 'AVAILABLE',
            source_booking_id: b.id,
            reason: params.reason || 'Suspensión por lluvia / mal tiempo',
            expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          })

        totalCreditedArs += creditedAmount
      }

      // 3. Actualizar estado de la reserva a RAIN_CANCELLED
      await supabase
        .from('bookings')
        .update({
          status: 'RAIN_CANCELLED' as BookingStatus,
          cancellation_reason: params.reason || 'Protocolo Climático: Suspensión por lluvia',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', b.id)

      // 4. Preparar mensaje y enlace de WhatsApp
      const creditMsg = creditedAmount > 0
        ? `La seña de ${formatARS(creditedAmount)} ya quedó acreditada como saldo a tu favor para tu próxima reserva.`
        : 'Podés reprogramar tu turno cuando el clima lo permita.'

      const messageText = `Hola ${b.customer_name}, te escribimos de ${clubName}. Debido a las condiciones climáticas, tu turno en ${courtName} a las ${timeStr} fue suspendido por lluvia. ${creditMsg} ¡Gracias por tu comprensión!`

      const whatsAppUrl = b.customer_phone
        ? buildWhatsAppLink(b.customer_phone, messageText)
        : ''

      if (b.customer_phone) {
        notifyRainCancellation({
          phone: b.customer_phone,
          customerName: b.customer_name,
          clubName,
          courtName,
          timeStr,
          creditAmountARS: creditedAmount,
        }).catch((err: unknown) => console.error('[RainWhatsApp Error]', err))
      }

      notifications.push({
        bookingId: b.id,
        customerName: b.customer_name,
        customerPhone: b.customer_phone || '',
        courtName,
        time: timeStr,
        creditedAmount,
        whatsAppUrl,
        messageText,
      })
    }

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/caja')

    return {
      success: true,
      cancelledBookingsCount: targetBookings.length,
      totalCreditedArs,
      notifications,
    }
  } catch (err) {
    console.error('[executeRainCancellation] Error:', err)
    return {
      success: false,
      cancelledBookingsCount: 0,
      totalCreditedArs: 0,
      notifications: [],
      error: 'Error al ejecutar el protocolo climático',
    }
  }
}

/** Consultar créditos disponibles de un jugador */
export async function getCustomerCredits(
  tenantId: string,
  customerPhone: string
): Promise<CustomerCredit[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('customer_credits')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('customer_phone', customerPhone)
      .eq('status', 'AVAILABLE')
      .gt('expires_at', new Date().toISOString())

    if (error) return []
    return (data as CustomerCredit[]) || []
  } catch {
    return []
  }
}
