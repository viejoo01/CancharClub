'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export interface UseCalendarShortcutsOptions {
  onNewBooking: () => void
  onScrollToNow: () => void
}

/**
 * Hook para gestionar los atajos de teclado rápidos para la recepción del club:
 * - [N]: Nuevo Turno
 * - [C]: Ir a Cantina
 * - [F]: Ir a Caja
 * - [T]: Desplazarse al horario actual en la grilla
 */
export function useCalendarShortcuts({
  onNewBooking,
  onScrollToNow,
}: UseCalendarShortcutsOptions) {
  const router = useRouter()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        onNewBooking()
        toast.info('Atajo [N]: Nuevo Turno', { duration: 1500 })
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        toast.info('Atajo [C]: Ir a Cantina', { duration: 1500 })
        router.push('/dashboard/cantina')
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        toast.info('Atajo [F]: Ir a Caja', { duration: 1500 })
        router.push('/dashboard/caja')
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        onScrollToNow()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [router, onNewBooking, onScrollToNow])
}
