'use server'
// src/actions/notifications.actions.ts
// ==============================================================================
// SERVER ACTIONS — Historial de Notificaciones y Alertas del Club
// ==============================================================================
// Agrega y consolida en un único flujo cronológico:
// 1. Turnos reservados (online, mostrador, turnos fijos)
// 2. Pagos y señas recibidos (Mercado Pago, transferencia, efectivo en caja)
// 3. Alertas enviadas de turnos (protocolo de lluvia, lista de espera, cancelaciones)
// 4. Alertas del sistema y cobros automáticos
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { resolveEffectiveTenantId, assertTenantMember } from '@/lib/auth-security'
import type {
  ClubNotification,
  NotificationCategory,
  NotificationType,
  NotificationsStats,
} from '@/types/notifications'

function parsePostgresDateRange(rangeStr?: string | null): { startIso: string; timeLabel: string; dateLabel: string } {
  if (!rangeStr) {
    return { startIso: '', timeLabel: '', dateLabel: '' }
  }
  const match = rangeStr.match(/\["?(.*?)"?,\s*"?(.*?)"?\)/)
  if (match && match[1]) {
    const raw = match[1].replace(' ', 'T')
    const d = new Date(raw)
    if (!isNaN(d.getTime())) {
      const timeLabel = d.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Argentina/Buenos_Aires',
      })
      const dateLabel = d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'America/Argentina/Buenos_Aires',
      })
      return { startIso: d.toISOString(), timeLabel, dateLabel }
    }
  }
  return { startIso: '', timeLabel: '', dateLabel: '' }
}

/**
 * Obtiene el estado de lectura persistido (IDs leídos y fecha de corte masiva).
 */
async function getReadState(tenantId: string): Promise<{ readIds: Set<string>; markedAllReadAt: number | null }> {
  try {
    const supabase = await createServiceClient()
    const { data } = await supabase
      .from('audit_log')
      .select('new_data')
      .eq('tenant_id', tenantId)
      .eq('action', 'NOTIFICATIONS_READ_STATE')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data?.new_data) {
      const parsed = data.new_data as { readIds?: string[]; markedAllReadAt?: string }
      return {
        readIds: new Set(Array.isArray(parsed.readIds) ? parsed.readIds : []),
        markedAllReadAt: parsed.markedAllReadAt ? new Date(parsed.markedAllReadAt).getTime() : null,
      }
    }
  } catch (err) {
    console.warn('[getReadState] Warning reading state:', err)
  }
  return { readIds: new Set(), markedAllReadAt: null }
}

/**
 * Persiste el estado de lectura en audit_log de manera segura.
 */
async function saveReadState(
  tenantId: string,
  state: { readIds: string[]; markedAllReadAt?: string | null }
): Promise<void> {
  try {
    const supabase = await createServiceClient()
    await supabase.from('audit_log').insert({
      tenant_id: tenantId,
      action: 'NOTIFICATIONS_READ_STATE',
      table_name: 'notifications',
      record_id: tenantId,
      new_data: state,
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('[saveReadState] Warning saving state:', err)
  }
}

/**
 * Registra explícitamente una notificación en el log del club.
 */
export async function recordClubNotification(params: {
  tenantId: string
  type: NotificationType
  category: NotificationCategory
  title: string
  message: string
  metadata?: Record<string, unknown>
  createdAt?: string
}): Promise<ClubNotification | null> {
  try {
    const notificationId = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    const notif: ClubNotification = {
      id: notificationId,
      tenant_id: params.tenantId,
      type: params.type,
      category: params.category,
      title: params.title,
      message: params.message,
      created_at: params.createdAt || new Date().toISOString(),
      read: false,
      metadata: params.metadata || {},
    }

    const supabase = await createServiceClient()
    await supabase.from('audit_log').insert({
      tenant_id: params.tenantId,
      action: 'CLUB_NOTIFICATION',
      table_name: 'notifications',
      record_id: notificationId,
      new_data: notif,
      created_at: notif.created_at,
    })

    return notif
  } catch (err) {
    console.warn('[recordClubNotification] Warning recording notification:', err)
    return null
  }
}

// Cache en memoria en servidor para notificaciones recientes (25s)
const notifsCache = new Map<string, { data: { notifications: ClubNotification[]; stats: NotificationsStats }; expiresAt: number }>()

interface RawNotifsCacheEntry {
  notificationsWithReadState: ClubNotification[]
  stats: NotificationsStats
  expiresAt: number
}
const rawNotifsCache = new Map<string, RawNotifsCacheEntry>()

export async function invalidateClubNotificationsCache(tenantId?: string | null) {
  if (tenantId) {
    rawNotifsCache.delete(tenantId)
    for (const key of Array.from(notifsCache.keys())) {
      if (key.startsWith(tenantId)) {
        notifsCache.delete(key)
      }
    }
  } else {
    rawNotifsCache.clear()
    notifsCache.clear()
  }
}

/**
 * Consulta y consolida todo el historial de notificaciones y alertas del club.
 */
export async function getClubNotificationsAction(params?: {
  tenantId?: string
  category?: NotificationCategory
  limit?: number
  search?: string
  unreadOnly?: boolean
  bypassCache?: boolean
}): Promise<{
  notifications: ClubNotification[]
  stats: NotificationsStats
}> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(params?.tenantId)
    if (!effectiveTenantId) {
      return {
        notifications: [],
        stats: { total: 0, unread: 0, bookingsCount: 0, paymentsCount: 0, alertsCount: 0, systemCount: 0 },
      }
    }

    const cacheKey = `${effectiveTenantId}_${params?.category || 'ALL'}_${params?.limit || 100}_${params?.search || ''}_${Boolean(params?.unreadOnly)}`
    if (!params?.bypassCache) {
      const cached = notifsCache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data
      }
    }

    const auth = await assertTenantMember(effectiveTenantId)
    if (!auth.authorized) {
      return {
        notifications: [],
        stats: { total: 0, unread: 0, bookingsCount: 0, paymentsCount: 0, alertsCount: 0, systemCount: 0 },
      }
    }

    let notificationsWithReadState: ClubNotification[] = []
    let stats: NotificationsStats = { total: 0, unread: 0, bookingsCount: 0, paymentsCount: 0, alertsCount: 0, systemCount: 0 }

    const cachedRaw = !params?.bypassCache ? rawNotifsCache.get(effectiveTenantId) : null
    if (cachedRaw && cachedRaw.expiresAt > Date.now()) {
      notificationsWithReadState = cachedRaw.notificationsWithReadState
      stats = cachedRaw.stats
    } else {
      const supabase = await createServiceClient()

      // 1. Obtener canchas para asociar nombres rápidamente
      const { data: courtsData } = await supabase
        .from('courts')
        .select('id, name, sport')
        .eq('tenant_id', effectiveTenantId)

      const courtMap = new Map<string, { name: string; sport: string }>()
      ;(courtsData || []).forEach(c => {
        courtMap.set(c.id, { name: c.name, sport: c.sport })
      })

    // 2. Consultar fuentes de datos en paralelo
    const [auditNotifsRes, bookingsRes, waitlistsRes, creditsRes, tenantRes] = await Promise.all([
      // A. Notificaciones explícitas
      supabase
        .from('audit_log')
        .select('id, record_id, new_data, created_at')
        .eq('tenant_id', effectiveTenantId)
        .eq('action', 'CLUB_NOTIFICATION')
        .order('created_at', { ascending: false })
        .limit(60),

      // B. Reservas recientes (últimos 30 días o hasta 80)
      supabase
        .from('bookings')
        .select('id, tenant_id, court_id, booked_at, status, sport, price_total_cents, deposit_cents, payment_method, paid_at, customer_name, customer_phone, customer_email, staff_notes, recurring_slot_id, created_at, updated_at')
        .eq('tenant_id', effectiveTenantId)
        .order('created_at', { ascending: false })
        .limit(80),

      // C. Lista de espera con alertas enviadas
      supabase
        .from('waitlists')
        .select('id, court_id, date, time_slot, customer_name, customer_phone, status, notified_at, priority_expires_at, created_at')
        .eq('tenant_id', effectiveTenantId)
        .order('created_at', { ascending: false })
        .limit(40),

      // D. Saldos a favor y créditos por protocolo climático
      supabase
        .from('customer_credits')
        .select('id, customer_name, customer_phone, amount_ars, status, reason, source_booking_id, created_at')
        .eq('tenant_id', effectiveTenantId)
        .order('created_at', { ascending: false })
        .limit(30),

      // E. Metadatos de suscripción / débito automático del inquilino
      supabase
        .from('tenants')
        .select('description, name')
        .eq('id', effectiveTenantId)
        .maybeSingle(),
    ])

    const { readIds, markedAllReadAt } = await getReadState(effectiveTenantId)

    const rawNotifications: ClubNotification[] = []
    const explicitIdsSeen = new Set<string>()

    // 3. Procesar notificaciones explícitas guardadas en audit_log
    if (auditNotifsRes.data) {
      for (const row of auditNotifsRes.data) {
        if (row.new_data && typeof row.new_data === 'object') {
          const n = row.new_data as ClubNotification
          if (n.id && n.title) {
            explicitIdsSeen.add(n.id)
            if (n.metadata?.booking_id) {
              explicitIdsSeen.add(`booking-created-${n.metadata.booking_id}`)
              explicitIdsSeen.add(`payment-received-${n.metadata.booking_id}`)
              explicitIdsSeen.add(`booking-cancelled-${n.metadata.booking_id}`)
            }
            rawNotifications.push({
              ...n,
              id: n.id,
              created_at: n.created_at || row.created_at,
            })
          }
        }
      }
    }

    // 4. Sintetizar reservas históricas reales
    if (bookingsRes.data) {
      for (const b of bookingsRes.data) {
        // Los turnos periódicos de abonados fijos no deben emitir notificaciones individuales
        // de "Turno Reservado" ni falsos "Pago / Seña Recibida" por cada turno semanal generado.
        const isAbonoTurn = Boolean(
          (b as { recurring_slot_id?: string | null }).recurring_slot_id ||
          b.payment_method === 'abono_fijo' ||
          (b.staff_notes && b.staff_notes.toUpperCase().includes('ABONO FIJO'))
        )
        if (isAbonoTurn) {
          continue
        }

        const court = courtMap.get(b.court_id)
        const courtName = court?.name || 'Cancha'
        const sportName = court?.sport || b.sport || 'Cancha'
        const totalArs = Math.round((Number(b.price_total_cents) || 0) / 100)
        const depositArs = Math.round((Number(b.deposit_cents) || 0) / 100)
        const { timeLabel, dateLabel } = parsePostgresDateRange(b.booked_at)
        const customerName = b.customer_name?.trim() || 'Cliente'
        const customerPhone = b.customer_phone?.trim() || ''

        const createdId = `booking-created-${b.id}`
        if (!explicitIdsSeen.has(createdId)) {
          rawNotifications.push({
            id: createdId,
            tenant_id: effectiveTenantId,
            type: 'BOOKING_CREATED',
            category: 'BOOKINGS',
            title: 'Turno Reservado',
            message: `${customerName} reservó ${courtName} para el ${dateLabel || 'día programado'} a las ${timeLabel || 'horario fijado'} hs ($${totalArs.toLocaleString('es-AR')}).`,
            created_at: b.created_at,
            read: false,
            metadata: {
              booking_id: b.id,
              customer_name: customerName,
              customer_phone: customerPhone,
              customer_email: b.customer_email || undefined,
              court_name: courtName,
              sport: sportName,
              amount_ars: totalArs,
              booked_date: dateLabel,
              booked_time: timeLabel,
              payment_method: b.payment_method || 'PENDIENTE',
            },
          })
        }

        // Pago recibido
        const paymentId = `payment-received-${b.id}`
        if (!explicitIdsSeen.has(paymentId) && (depositArs > 0 || b.paid_at || b.status === 'confirmed')) {
          const methodLabel =
            b.payment_method === 'mercadopago'
              ? 'Mercado Pago'
              : b.payment_method === 'bank_transfer'
              ? 'Transferencia Bancaria'
              : b.payment_method === 'cash'
              ? 'Efectivo en Caja'
              : 'Cobro Registrado'

          const effectiveAmount = depositArs > 0 ? depositArs : totalArs
          rawNotifications.push({
            id: paymentId,
            tenant_id: effectiveTenantId,
            type: 'PAYMENT_RECEIVED',
            category: 'PAYMENTS',
            title: 'Pago / Seña Recibida',
            message: `Se recibió un cobro de $${effectiveAmount.toLocaleString('es-AR')} (${methodLabel}) de ${customerName} para ${courtName}.`,
            created_at: b.paid_at || b.created_at,
            read: false,
            metadata: {
              booking_id: b.id,
              customer_name: customerName,
              customer_phone: customerPhone,
              court_name: courtName,
              sport: sportName,
              amount_ars: effectiveAmount,
              payment_method: methodLabel,
            },
          })
        }

        // Turno cancelado o suspendido por lluvia
        const cancelledId = `booking-cancelled-${b.id}`
        if (
          !explicitIdsSeen.has(cancelledId) &&
          (b.status === 'cancelled' || b.status === 'CANCELLED_CLUB' || b.status === 'CANCELLED_USER' || b.status === 'RAIN_CANCELLED')
        ) {
          const isRain = b.status === 'RAIN_CANCELLED' || (b.staff_notes || '').toLowerCase().includes('lluvia') || (b.staff_notes || '').toLowerCase().includes('climático')
          rawNotifications.push({
            id: cancelledId,
            tenant_id: effectiveTenantId,
            type: isRain ? 'WEATHER_ALERT' : 'BOOKING_CANCELLED',
            category: 'ALERTS',
            title: isRain ? 'Turno Suspendido por Lluvia' : 'Turno Cancelado',
            message: isRain
              ? `Turno de ${customerName} en ${courtName} (${dateLabel} ${timeLabel}) fue suspendido por protocolo de mal tiempo.`
              : `Turno de ${customerName} en ${courtName} (${dateLabel} ${timeLabel}) fue cancelado.`,
            created_at: b.updated_at || b.created_at,
            read: false,
            metadata: {
              booking_id: b.id,
              customer_name: customerName,
              customer_phone: customerPhone,
              court_name: courtName,
              sport: sportName,
              reason: isRain ? 'Protocolo Climático' : 'Cancelación de turno',
            },
          })
        }
      }
    }

    // 5. Sintetizar lista de espera
    if (waitlistsRes.data) {
      for (const w of waitlistsRes.data) {
        if (w.status === 'NOTIFIED' || w.notified_at) {
          const court = w.court_id ? courtMap.get(w.court_id) : undefined
          const wlId = `waitlist-notified-${w.id}`
          if (!explicitIdsSeen.has(wlId)) {
            rawNotifications.push({
              id: wlId,
              tenant_id: effectiveTenantId,
              type: 'WAITLIST_NOTIFIED',
              category: 'ALERTS',
              title: 'Alerta de Cupo Enviada a Lista de Espera',
              message: `Se notificó a ${w.customer_name} con 10 min de prioridad exclusiva para el turno ${w.date} ${w.time_slot} hs${court ? ` en ${court.name}` : ''}.`,
              created_at: w.notified_at || w.created_at,
              read: false,
              metadata: {
                waitlist_id: w.id,
                customer_name: w.customer_name,
                customer_phone: w.customer_phone,
                court_name: court?.name,
                booked_date: w.date,
                booked_time: w.time_slot,
              },
            })
          }
        }
      }
    }

    // 6. Sintetizar créditos por lluvia
    if (creditsRes.data) {
      for (const cr of creditsRes.data) {
        const crId = `credit-issued-${cr.id}`
        if (!explicitIdsSeen.has(crId)) {
          rawNotifications.push({
            id: crId,
            tenant_id: effectiveTenantId,
            type: 'WEATHER_ALERT',
            category: 'ALERTS',
            title: 'Saldo a Favor Acreditado (Lluvia)',
            message: `Se acreditaron $${Number(cr.amount_ars).toLocaleString('es-AR')} a favor de ${cr.customer_name} (${cr.reason}).`,
            created_at: cr.created_at,
            read: false,
            metadata: {
              customer_name: cr.customer_name,
              customer_phone: cr.customer_phone,
              amount_ars: Number(cr.amount_ars),
              reason: cr.reason,
            },
          })
        }
      }
    }

    // 7. Sintetizar alertas de débito automático si existen en description
    if (tenantRes.data?.description) {
      try {
        const meta = JSON.parse(tenantRes.data.description)
        if (Array.isArray(meta.auto_debit_alerts)) {
          for (const d of meta.auto_debit_alerts) {
            const debitId = `autodebit-${d.id}`
            if (!explicitIdsSeen.has(debitId)) {
              rawNotifications.push({
                id: debitId,
                tenant_id: effectiveTenantId,
                type: 'AUTODEBIT_ALERT',
                category: 'SYSTEM',
                title: d.type === 'FAILED' ? '⚠️ Intento de Pago Mensual Fallido' : '💳 Pago Mensual Realizado',
                message: d.title || (d.type === 'FAILED' ? 'Intento de cobro automático no completado.' : 'Abono mensual procesado exitosamente.'),
                created_at: d.createdAt,
                read: d.dismissed || false,
                metadata: {
                  status_badge: d.type,
                  reason: d.detail,
                },
              })
            }
          }
        }
      } catch {}
    }

    // 8. Aplicar estado de lectura a todas las notificaciones
    notificationsWithReadState = rawNotifications.map(n => {
      const createdTime = new Date(n.created_at).getTime()
      const isMarkedMassive = markedAllReadAt !== null && createdTime <= markedAllReadAt
      const isIndividuallyRead = readIds.has(n.id)
      const read = Boolean(n.read || isMarkedMassive || isIndividuallyRead)
      return {
        ...n,
        read,
      }
    })

    // 9. Ordenar cronológicamente (más recientes primero)
    notificationsWithReadState.sort((a, b) => {
      const timeA = new Date(a.created_at).getTime()
      const timeB = new Date(b.created_at).getTime()
      return timeB - timeA
    })

    // 10. Calcular estadísticas globales del club
    stats = {
      total: notificationsWithReadState.length,
      unread: notificationsWithReadState.filter(n => !n.read).length,
      bookingsCount: notificationsWithReadState.filter(n => n.category === 'BOOKINGS').length,
      paymentsCount: notificationsWithReadState.filter(n => n.category === 'PAYMENTS').length,
      alertsCount: notificationsWithReadState.filter(n => n.category === 'ALERTS').length,
      systemCount: notificationsWithReadState.filter(n => n.category === 'SYSTEM').length,
    }

    rawNotifsCache.set(effectiveTenantId, {
      notificationsWithReadState,
      stats,
      expiresAt: Date.now() + 25000,
    })
  }

  // 11. Aplicar filtros solicitados
  let filtered = notificationsWithReadState

    if (params?.category && params.category !== 'ALL') {
      filtered = filtered.filter(n => n.category === params.category)
    }

    if (params?.unreadOnly) {
      filtered = filtered.filter(n => !n.read)
    }

    if (params?.search && params.search.trim().length > 0) {
      const q = params.search.trim().toLowerCase()
      filtered = filtered.filter(n => {
        return (
          n.title.toLowerCase().includes(q) ||
          n.message.toLowerCase().includes(q) ||
          n.metadata?.customer_name?.toLowerCase().includes(q) ||
          n.metadata?.customer_phone?.toLowerCase().includes(q) ||
          n.metadata?.court_name?.toLowerCase().includes(q)
        )
      })
    }

    if (params?.limit && params.limit > 0) {
      filtered = filtered.slice(0, params.limit)
    }

    const result = {
      notifications: filtered,
      stats,
    }
    notifsCache.set(cacheKey, { data: result, expiresAt: Date.now() + 15000 })

    return result
  } catch (err) {
    console.error('[getClubNotificationsAction] Error fetching notifications:', err)
    return {
      notifications: [],
      stats: { total: 0, unread: 0, bookingsCount: 0, paymentsCount: 0, alertsCount: 0, systemCount: 0 },
    }
  }
}

/**
 * Marca una notificación individual como leída.
 */
export async function markNotificationAsReadAction(
  notificationId: string,
  tenantId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) return { success: false, error: 'Club no especificado' }

    const { readIds, markedAllReadAt } = await getReadState(effectiveTenantId)
    readIds.add(notificationId)

    await saveReadState(effectiveTenantId, {
      readIds: Array.from(readIds),
      markedAllReadAt: markedAllReadAt ? new Date(markedAllReadAt).toISOString() : null,
    })

    await invalidateClubNotificationsCache(effectiveTenantId)
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/notificaciones')
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al marcar como leída'
    return { success: false, error: msg }
  }
}

/**
 * Marca todas las notificaciones del club como leídas.
 */
export async function markAllNotificationsAsReadAction(
  tenantId?: string
): Promise<{ success: boolean; markedAllReadAt?: string; error?: string }> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) return { success: false, error: 'Club no especificado' }

    const markedAllReadAt = new Date(Date.now() + 5000).toISOString()
    await saveReadState(effectiveTenantId, {
      readIds: [],
      markedAllReadAt,
    })

    await invalidateClubNotificationsCache(effectiveTenantId)
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/notificaciones')
    return { success: true, markedAllReadAt }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al marcar todas como leídas'
    return { success: false, error: msg }
  }
}

/**
 * Emite una notificación de prueba para comprobar el sonido y la interfaz.
 */
export async function sendTestNotificationAction(
  tenantId?: string,
  testType: 'BOOKING' | 'PAYMENT' | 'WEATHER' = 'BOOKING'
): Promise<{ success: boolean; notification?: ClubNotification; error?: string }> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) return { success: false, error: 'Club no especificado' }

    const now = new Date()
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

    let notif: ClubNotification | null = null

    if (testType === 'PAYMENT') {
      notif = await recordClubNotification({
        tenantId: effectiveTenantId,
        type: 'PAYMENT_RECEIVED',
        category: 'PAYMENTS',
        title: 'Pago Recibido (Prueba)',
        message: `Se registró un pago de $15.000 (Transferencia) de Martín Palermo a las ${timeStr} hs.`,
        metadata: {
          customer_name: 'Martín Palermo',
          customer_phone: '5491122334455',
          court_name: 'Cancha 1 (Fútbol 5)',
          amount_ars: 15000,
          payment_method: 'Transferencia Bancaria',
        },
      })
    } else if (testType === 'WEATHER') {
      notif = await recordClubNotification({
        tenantId: effectiveTenantId,
        type: 'WEATHER_ALERT',
        category: 'ALERTS',
        title: 'Alerta Climática (Prueba)',
        message: `Protocolo de lluvia ejecutado para 3 turnos. Alertas enviadas por WhatsApp con saldo a favor.`,
        metadata: {
          affected_count: 3,
          credited_total_ars: 45000,
          reason: 'Lluvia intensa en zona norte',
        },
      })
    } else {
      notif = await recordClubNotification({
        tenantId: effectiveTenantId,
        type: 'BOOKING_CREATED',
        category: 'BOOKINGS',
        title: 'Turno Reservado (Prueba)',
        message: `Román Riquelme reservó Cancha 2 (Pádel) para hoy a las 20:00 hs ($28.000).`,
        metadata: {
          customer_name: 'Román Riquelme',
          customer_phone: '5491199887766',
          court_name: 'Cancha 2 (Pádel)',
          amount_ars: 28000,
          booked_time: '20:00',
        },
      })
    }

    await invalidateClubNotificationsCache(effectiveTenantId)
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/notificaciones')
    return { success: true, notification: notif || undefined }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al emitir alerta de prueba'
    return { success: false, error: msg }
  }
}
