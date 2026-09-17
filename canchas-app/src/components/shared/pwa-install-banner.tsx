'use client'

import { useState, useEffect } from 'react'
import { Download, X, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Registrar service worker y purgar cachés obsoletas
    if ('serviceWorker' in navigator && typeof window !== 'undefined') {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.update()
        }
      })
      if ('caches' in window) {
        caches.keys().then((names) => {
          for (const name of names) {
            if (name !== 'cancharclub-v2-live') {
              caches.delete(name)
            }
          }
        })
      }
      if (process.env.NODE_ENV === 'production') {
        navigator.serviceWorker
          .register('/sw.js')
          .catch((err) => console.log('SW registration failed:', err))
      }
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Solo mostrar si no se descartó recientemente
      const dismissed = localStorage.getItem('canchar_pwa_dismissed')
      if (!dismissed) {
        setIsVisible(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setIsVisible(false)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setIsVisible(false)
    localStorage.setItem('canchar_pwa_dismissed', 'true')
  }

  if (!isVisible) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="p-4 rounded-2xl bg-slate-900/95 border border-emerald-500/30 shadow-2xl shadow-emerald-950/60 backdrop-blur-md flex items-center justify-between gap-3 text-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shrink-0 shadow-md shadow-emerald-950/40">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Instalá CancharClub</h4>
            <p className="text-[11px] text-slate-400">Accedé a tus turnos en 1 segundo desde tu pantalla de inicio.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            onClick={handleInstall}
            className="h-8 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold gap-1 rounded-xl shadow"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Instalar</span>
          </Button>
          <button
            onClick={handleDismiss}
            className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
