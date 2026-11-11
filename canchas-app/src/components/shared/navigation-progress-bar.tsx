'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * NavigationProgressBar:
 * Proporciona feedback visual instantáneo (0ms) en la parte superior de la pantalla
 * cada vez que el usuario hace clic en cualquier enlace, menú o botón de navegación,
 * eliminando la sensación de latencia o congelamiento.
 */
export function NavigationProgressBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const startProgress = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    setVisible(true)
    setProgress(18)

    // Simula avance fluido hasta 90% esperando que Next.js cargue el RSC
    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 88) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          return 88
        }
        return prev + (prev < 50 ? 15 : 6)
      })
    }, 120)
  }

  const completeProgress = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setProgress(100)

    timeoutRef.current = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 220)
  }

  // Al cambiar de ruta o parámetros, completar barra instantáneamente
  useEffect(() => {
    const t = setTimeout(() => {
      completeProgress()
    }, 0)
    return () => {
      clearTimeout(t)
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [pathname, searchParams])

  // Escuchar clics globales en enlaces para respuesta en 0ms
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('a')
      if (!target) return

      const href = target.getAttribute('href')
      const targetAttr = target.getAttribute('target')

      // Solo interceptar enlaces internos sin target _blank ni teclas modificadoras
      if (
        href &&
        href.startsWith('/') &&
        !href.startsWith('//') &&
        targetAttr !== '_blank' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        !e.altKey
      ) {
        const currentUrl = window.location.pathname + window.location.search
        // Solo disparar si la URL destino es diferente
        if (href !== currentUrl) {
          startProgress()
        }
      }
    }

    const handleCustomStart = () => startProgress()
    const handleCustomEnd = () => completeProgress()

    document.addEventListener('click', handleDocumentClick, { capture: true })
    window.addEventListener('canchar:start-nav', handleCustomStart)
    window.addEventListener('canchar:end-nav', handleCustomEnd)

    return () => {
      document.removeEventListener('click', handleDocumentClick, { capture: true })
      window.removeEventListener('canchar:start-nav', handleCustomStart)
      window.removeEventListener('canchar:end-nav', handleCustomEnd)
    }
  }, [])

  if (!visible && progress === 0) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[99999] pointer-events-none h-[3px] bg-transparent overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="h-full bg-linear-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-200 ease-out shadow-[0_0_10px_rgba(16,185,129,0.7)]"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
        }}
      />
    </div>
  )
}
