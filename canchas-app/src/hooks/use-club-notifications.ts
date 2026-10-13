'use client'

// src/hooks/use-club-notifications.ts
// ==============================================================================
// HOOK PERSONALIZADO: GESTIÓN DE NOTIFICACIONES Y ALERTAS EN TIEMPO REAL
// ==============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import type { ClubNotification, NotificationCategory, NotificationsStats } from '@/types/notifications'
import {
  getClubNotificationsAction,
  markNotificationAsReadAction,
  markAllNotificationsAsReadAction,
  sendTestNotificationAction,
} from '@/actions/notifications.actions'

// Síntesis de sonido de timbre con Web Audio API (alta fidelidad y bajo consumo)
export function playChimeSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const now = ctx.currentTime

    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()

    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(659.25, now) // E5
    osc1.frequency.exponentialRampToValueAtTime(987.77, now + 0.12) // B5

    osc2.type = 'triangle'
    osc2.frequency.setValueAtTime(1318.5, now) // E6

    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.28, now + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(ctx.destination)

    osc1.start(now)
    osc2.start(now)
    osc1.stop(now + 0.5)
    osc2.stop(now + 0.5)
  } catch {
    // Si el navegador bloquea audio antes de la primera interacción, ignorar
  }
}

interface UseClubNotificationsOptions {
  tenantId?: string | null
  category?: NotificationCategory
  initialLimit?: number
  autoRefreshIntervalMs?: number
}

// Helpers de sincronización local para lectura inmediata e indestructible
function getLocalReadState(tenantId?: string | null): { readIds: Set<string>; markedAllReadAt: number | null } {
  if (typeof window === 'undefined') return { readIds: new Set(), markedAllReadAt: null }
  try {
    const raw = localStorage.getItem(`canchar_read_state_${tenantId || 'default'}`)
    if (raw) {
      const parsed = JSON.parse(raw) as { readIds?: string[]; markedAllReadAt?: number | null }
      return {
        readIds: new Set(Array.isArray(parsed.readIds) ? parsed.readIds : []),
        markedAllReadAt: typeof parsed.markedAllReadAt === 'number' ? parsed.markedAllReadAt : null,
      }
    }
  } catch {}
  return { readIds: new Set(), markedAllReadAt: null }
}

function saveLocalReadState(
  tenantId: string | null | undefined,
  state: { readIds: string[]; markedAllReadAt: number | null }
) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(
      `canchar_read_state_${tenantId || 'default'}`,
      JSON.stringify(state)
    )
  } catch {}
}

function applyReadStateToNotifications(
  notifs: ClubNotification[],
  readState: { readIds: Set<string>; markedAllReadAt: number | null }
): ClubNotification[] {
  return notifs.map(n => {
    const createdTime = new Date(n.created_at).getTime()
    const isMarkedMassive = readState.markedAllReadAt !== null && createdTime <= readState.markedAllReadAt
    const isIndividuallyRead = readState.readIds.has(n.id)
    return {
      ...n,
      read: Boolean(n.read || isMarkedMassive || isIndividuallyRead),
    }
  })
}

const cachedNotifsByTenant = new Map<string, { notifications: ClubNotification[]; stats: NotificationsStats }>()

export function useClubNotifications({
  tenantId,
  category = 'ALL',
  initialLimit = 100,
  autoRefreshIntervalMs = 30000,
}: UseClubNotificationsOptions = {}) {
  const cacheKey = `${tenantId || 'default'}_${category}`
  const initialCached = cachedNotifsByTenant.get(cacheKey)
  const initialLocalRead = getLocalReadState(tenantId)

  const [notifications, setNotifications] = useState<ClubNotification[]>(() => {
    if (!initialCached) return []
    return applyReadStateToNotifications(initialCached.notifications, initialLocalRead)
  })

  const [stats, setStats] = useState<NotificationsStats>(() => {
    if (!initialCached) {
      return {
        total: 0,
        unread: 0,
        bookingsCount: 0,
        paymentsCount: 0,
        alertsCount: 0,
        systemCount: 0,
      }
    }
    const merged = applyReadStateToNotifications(initialCached.notifications, initialLocalRead)
    const unread = merged.filter(n => !n.read).length
    return {
      ...initialCached.stats,
      unread,
    }
  })

  const [loading, setLoading] = useState(() => !initialCached)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('canchar_push_sound')
        if (saved !== null) return saved === 'true'
      } catch {}
    }
    return true
  })

  // Guardar en ref para evitar closures obsoletos en listeners
  const soundEnabledRef = useRef(soundEnabled)
  useEffect(() => {
    soundEnabledRef.current = soundEnabled
  }, [soundEnabled])

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const nextVal = !prev
      try {
        localStorage.setItem('canchar_push_sound', String(nextVal))
      } catch {}
      if (nextVal) {
        playChimeSound()
        toast.success('Sonido de avisos activado')
      } else {
        toast.info('Sonido de avisos silenciado')
      }
      return nextVal
    })
  }, [])

  // Cargar notificaciones
  const loadNotifications = useCallback(
    async (isBackground = false) => {
      if (!isBackground && !cachedNotifsByTenant.has(cacheKey)) {
        setLoading(true)
      }
      try {
        const res = await getClubNotificationsAction({
          tenantId: tenantId || undefined,
          category,
          limit: initialLimit,
        })
        const currentLocal = getLocalReadState(tenantId)
        const mergedNotifs = applyReadStateToNotifications(res.notifications, currentLocal)
        const unreadCount = mergedNotifs.filter(n => !n.read).length
        const mergedStats: NotificationsStats = {
          ...res.stats,
          unread: unreadCount,
        }

        cachedNotifsByTenant.set(cacheKey, { notifications: mergedNotifs, stats: mergedStats })
        setNotifications(mergedNotifs)
        setStats(mergedStats)
      } catch (err) {
        console.error('Error loading notifications:', err)
      } finally {
        setLoading(false)
      }
    },
    [tenantId, category, initialLimit, cacheKey]
  )

  useEffect(() => {
    const isBackground = Boolean(initialCached)
    const timer = setTimeout(() => {
      void loadNotifications(isBackground)
    }, 0)
    return () => clearTimeout(timer)
  }, [loadNotifications, initialCached])

  // Polling suave en segundo plano
  useEffect(() => {
    if (!autoRefreshIntervalMs) return
    const interval = setInterval(() => {
      void loadNotifications(true)
    }, autoRefreshIntervalMs)
    return () => clearInterval(interval)
  }, [autoRefreshIntervalMs, loadNotifications])

  // Escuchar BroadcastChannel para sincronización en tiempo real entre pestañas/componentes
  useEffect(() => {
    let bcBookings: BroadcastChannel | null = null
    let bcNotifs: BroadcastChannel | null = null

    const handleNewEvent = () => {
      if (soundEnabledRef.current) {
        playChimeSound()
      }
      void loadNotifications(true)
    }

    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bcBookings = new BroadcastChannel('canchar_bookings')
        bcBookings.onmessage = (e) => {
          if (e.data?.type === 'BOOKING_CONFIRMED' || e.data?.type === 'NEW_BOOKING') {
            handleNewEvent()
          }
        }

        bcNotifs = new BroadcastChannel('canchar_notifications')
        bcNotifs.onmessage = (e) => {
          if (e.data?.type === 'ALL_READ') {
            // Actualización instantánea silenciosa
            setNotifications(prev => prev.map(n => ({ ...n, read: true })))
            setStats(prev => ({ ...prev, unread: 0 }))
          } else if (e.data?.type === 'READ_ITEM' && e.data?.id) {
            const itemId = e.data.id as string
            setNotifications(prev =>
              prev.map(n => (n.id === itemId ? { ...n, read: true } : n))
            )
            setStats(prev => ({
              ...prev,
              unread: Math.max(0, prev.unread - 1),
            }))
          } else {
            handleNewEvent()
          }
        }
      }
    } catch {}

    const handleCustomTrigger = () => {
      if (soundEnabledRef.current) playChimeSound()
      void loadNotifications(true)
    }

    window.addEventListener('trigger-notification', handleCustomTrigger)

    return () => {
      try {
        bcBookings?.close()
        bcNotifs?.close()
      } catch {}
      window.removeEventListener('trigger-notification', handleCustomTrigger)
    }
  }, [loadNotifications])

  // Marcar una como leída
  const markAsRead = useCallback(
    async (id: string) => {
      // 1. Optimista instantáneo en componente
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      )
      setStats(prev => ({
        ...prev,
        unread: Math.max(0, prev.unread - 1),
      }))

      // 2. Persistir inmediatamente en localStorage
      const local = getLocalReadState(tenantId)
      local.readIds.add(id)
      saveLocalReadState(tenantId, {
        readIds: Array.from(local.readIds),
        markedAllReadAt: local.markedAllReadAt,
      })

      // 3. Actualizar todas las entradas en memoria del club
      const prefix = tenantId || 'default'
      for (const [key, val] of cachedNotifsByTenant.entries()) {
        if (key.startsWith(prefix)) {
          const updated = val.notifications.map(n => (n.id === id ? { ...n, read: true } : n))
          const unread = updated.filter(n => !n.read).length
          cachedNotifsByTenant.set(key, {
            notifications: updated,
            stats: { ...val.stats, unread },
          })
        }
      }

      // 4. Notificar a otras pestañas
      try {
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          const bc = new BroadcastChannel('canchar_notifications')
          bc.postMessage({ type: 'READ_ITEM', id, tenantId })
          bc.close()
        }
      } catch {}

      // 5. Persistir en servidor
      try {
        await markNotificationAsReadAction(id, tenantId || undefined)
      } catch (err) {
        console.error('Error marking as read:', err)
      }
    },
    [tenantId]
  )

  // Marcar todas como leídas
  const markAllAsRead = useCallback(async () => {
    // 1. Optimista instantáneo en componente
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setStats(prev => ({ ...prev, unread: 0 }))

    toast.success('Todas las notificaciones fueron marcadas como leídas')

    // 2. Persistir inmediatamente en localStorage
    const cutoffTime = Date.now() + 5000
    saveLocalReadState(tenantId, {
      readIds: [],
      markedAllReadAt: cutoffTime,
    })

    // 3. Actualizar todas las entradas de memoria del club
    const prefix = tenantId || 'default'
    for (const [key, val] of cachedNotifsByTenant.entries()) {
      if (key.startsWith(prefix)) {
        cachedNotifsByTenant.set(key, {
          notifications: val.notifications.map(n => ({ ...n, read: true })),
          stats: { ...val.stats, unread: 0 },
        })
      }
    }

    // 4. Notificar a otras pestañas
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('canchar_notifications')
        bc.postMessage({ type: 'ALL_READ', tenantId, cutoffTime })
        bc.close()
      }
    } catch {}

    // 5. Persistir en servidor
    try {
      await markAllNotificationsAsReadAction(tenantId || undefined)
    } catch (err) {
      console.error('Error marking all as read:', err)
    }
  }, [tenantId])

  // Emitir alerta de prueba
  const sendTestNotification = useCallback(
    async (type: 'BOOKING' | 'PAYMENT' | 'WEATHER' = 'BOOKING') => {
      if (soundEnabledRef.current) {
        playChimeSound()
      }
      try {
        const res = await sendTestNotificationAction(tenantId || undefined, type)
        if (res.success && res.notification) {
          toast.success('¡Alerta de prueba emitida exitosamente!')
          setNotifications(prev => [res.notification!, ...prev])
          setStats(prev => ({
            ...prev,
            total: prev.total + 1,
            unread: prev.unread + 1,
          }))
        }
      } catch {
        toast.error('Error al emitir alerta de prueba')
      }
    },
    [tenantId]
  )

  return {
    notifications,
    stats,
    unreadCount: stats.unread,
    loading,
    soundEnabled,
    toggleSound,
    markAsRead,
    markAllAsRead,
    sendTestNotification,
    refresh: loadNotifications,
  }
}
