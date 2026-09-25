'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * AppAutoUpdater
 * Garantiza que ni dueños de clubes ni jugadores queden atrapados en versiones cacheadas u obsoletas.
 * 
 * Funcionalidades:
 * 1. Recuperación automática ante ChunkLoadError (cuando hay un nuevo deploy y un chunk cambió de hash).
 * 2. Purga total y proactiva de Service Workers y CacheStorage residuales.
 * 3. Revalidación automática cuando el usuario vuelve a enfocar la pestaña (evita turnos o precios desactualizados).
 */
export function AppAutoUpdater() {
  const router = useRouter()

  useEffect(() => {
    // 1. Purga activa de Service Workers y Cache Storage
    if (typeof window !== 'undefined') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) {
            reg.unregister().catch(() => {})
          }
        }).catch(() => {})
      }

      if ('caches' in window) {
        caches.keys().then((keys) => {
          for (const key of keys) {
            caches.delete(key).catch(() => {})
          }
        }).catch(() => {})
      }
    }

    // 2. Auto-recuperación ante despliegues en producción (ChunkLoadError)
    const handleChunkError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const message = 'message' in event ? event.message : (event.reason?.message || String(event.reason || ''))
      
      const isChunkError = 
        message.includes('Loading chunk') ||
        message.includes('Failed to fetch dynamically imported module') ||
        message.includes('missing in the manifest') ||
        message.includes('Load failed') ||
        message.includes('ChunkLoadError')

      if (isChunkError) {
        const lastReload = sessionStorage.getItem('canchar_last_chunk_reload')
        const now = Date.now()
        // Evitar bucles infinitos: máximo 1 reload cada 15 segundos
        if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
          sessionStorage.setItem('canchar_last_chunk_reload', String(now))
          console.warn('[CancharClub] Se detectó una nueva versión desplegada. Actualizando automáticamente...')
          window.location.reload()
        }
      }
    }

    window.addEventListener('error', handleChunkError)
    window.addEventListener('unhandledrejection', handleChunkError)

    // 3. Revalidar datos al volver a la pestaña (cuando un usuario vuelve de WhatsApp o de otra app)
    let lastActiveTime = Date.now()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now()
        // Si estuvo inactivo más de 3 minutos, revalidar el estado de turnos y canchas
        if (now - lastActiveTime > 3 * 60 * 1000) {
          router.refresh()
        }
        lastActiveTime = now
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('error', handleChunkError)
      window.removeEventListener('unhandledrejection', handleChunkError)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [router])

  return null
}
