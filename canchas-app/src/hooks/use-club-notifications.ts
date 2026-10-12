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

export function useClubNotifications({
  tenantId,
  category = 'ALL',
  initialLimit = 100,
  autoRefreshIntervalMs = 30000,
}: UseClubNotificationsOptions = {}) {
  const [notifications, setNotifications] = useState<ClubNotification[]>([])
  const [stats, setStats] = useState<NotificationsStats>({
    total: 0,
    unread: 0,
    bookingsCount: 0,
    paymentsCount: 0,
    alertsCount: 0,
    systemCount: 0,
  })
  const [loading, setLoading] = useState(true)
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
      if (!isBackground) setLoading(true)
      try {
        const res = await getClubNotificationsAction({
          tenantId: tenantId || undefined,
          category,
          limit: initialLimit,
        })
        setNotifications(res.notifications)
        setStats(res.stats)
      } catch (err) {
        console.error('Error loading notifications:', err)
      } finally {
        if (!isBackground) setLoading(false)
      }
    },
    [tenantId, category, initialLimit]
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadNotifications()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadNotifications])

  // Polling suave en segundo plano
  useEffect(() => {
    if (!autoRefreshIntervalMs) return
    const interval = setInterval(() => {
      void loadNotifications(true)
    }, autoRefreshIntervalMs)
    return () => clearInterval(interval)
  }, [autoRefreshIntervalMs, loadNotifications])

  // Escuchar BroadcastChannel para actualizaciones instantáneas en vivo (0ms)
  useEffect(() => {
    let bcBookings: BroadcastChannel | null = null
    let bcNotifs: BroadcastChannel | null = null

    const handleEvent = () => {
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
            handleEvent()
          }
        }

        bcNotifs = new BroadcastChannel('canchar_notifications')
        bcNotifs.onmessage = () => {
          handleEvent()
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
      // Optimista en UI
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      )
      setStats(prev => ({
        ...prev,
        unread: Math.max(0, prev.unread - 1),
      }))

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
    // Optimista en UI
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setStats(prev => ({ ...prev, unread: 0 }))

    toast.success('Todas las notificaciones fueron marcadas como leídas')

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
