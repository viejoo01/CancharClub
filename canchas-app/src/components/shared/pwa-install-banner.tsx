'use client'

import { useState, useEffect } from 'react'
import { Download, X, Smartphone, Share, PlusSquare, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isIosModalOpen, setIsIosModalOpen] = useState(false)
  
  // Inicialización limpia del entorno cliente
  const [isIosDevice] = useState(() => {
    if (typeof window === 'undefined') return false
    const ua = window.navigator.userAgent.toLowerCase()
    return /iphone|ipad|ipod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream
  })

  const [isStandaloneApp] = useState(() => {
    if (typeof window === 'undefined') return false
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean })?.standalone === true
    )
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (isStandaloneApp) {
      return
    }

    // 1. Chequeo de enfriamiento de descarte (7 días)
    const checkCooldown = () => {
      const dismissedUntil = localStorage.getItem('canchar_pwa_dismissed_until')
      if (dismissedUntil) {
        const until = parseInt(dismissedUntil, 10)
        if (Date.now() < until) {
          return false
        }
      }
      return true
    }

    // 2. Capturar evento de instalación de navegadores Chromium (Android, Chrome, Edge)
    const installHandler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      if (checkCooldown()) {
        setIsVisible(true)
      }
    }

    window.addEventListener('beforeinstallprompt', installHandler)

    // 3. Escuchar evento global para invocar la instalación desde cualquier botón de la UI
    const triggerHandler = () => {
      if (isStandaloneApp) {
        toast.success('¡CancharClub ya está instalado en tu dispositivo!')
        return
      }

      if (isIosDevice) {
        setIsIosModalOpen(true)
      } else if (deferredPrompt) {
        deferredPrompt.prompt().then(() => {
          return deferredPrompt.userChoice
        }).then((choice) => {
          if (choice.outcome === 'accepted') {
            setIsVisible(false)
            toast.success('¡App instalada con éxito!')
          }
          setDeferredPrompt(null)
        }).catch(() => {})
      } else {
        setIsVisible(true)
      }
    }

    window.addEventListener('open-pwa-install-dialog', triggerHandler)

    // En iOS Safari, si no está instalada y no se descartó en los últimos 7 días, sugerir instalación suavemente tras 4 segundos
    let iosTimer: NodeJS.Timeout | null = null
    if (isIosDevice && !isStandaloneApp && checkCooldown()) {
      iosTimer = setTimeout(() => {
        setIsVisible(true)
      }, 4000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', installHandler)
      window.removeEventListener('open-pwa-install-dialog', triggerHandler)
      if (iosTimer) clearTimeout(iosTimer)
    }
  }, [deferredPrompt, isStandaloneApp, isIosDevice])

  // Acción cuando el usuario toca "Instalar" en el banner
  const handleInstallClick = async () => {
    if (isIosDevice) {
      setIsVisible(false)
      setIsIosModalOpen(true)
      return
    }

    if (!deferredPrompt) {
      toast.info('Para instalar en esta computadora, tocá el ícono de instalar en la barra de direcciones de tu navegador.')
      return
    }

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setIsVisible(false)
        toast.success('¡App instalada con éxito!')
      }
      setDeferredPrompt(null)
    } catch {
      setIsVisible(false)
    }
  }

  // Descartar temporalmente por 7 días
  const handleDismiss = () => {
    setIsVisible(false)
    const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000
    localStorage.setItem('canchar_pwa_dismissed_until', String(sevenDaysFromNow))
  }

  return (
    <>
      {/* ─── BANNER FLOTANTE INFERIOR ─── */}
      {isVisible && !isStandaloneApp && (
        <aside
          aria-label="Instalación de CancharClub"
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
          <div className="p-4 rounded-2xl bg-slate-900/95 border border-emerald-500/30 shadow-2xl shadow-emerald-950/60 backdrop-blur-md flex items-center justify-between gap-3 text-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shrink-0 shadow-md shadow-emerald-950/40">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-white truncate">Instalá la App de CancharClub</h4>
                <p className="text-[11px] text-slate-400 leading-tight">
                  {isIosDevice 
                    ? 'Acceso directo en 1 toque en tu iPhone.' 
                    : 'Acceso en 1 toque y soporte de turnos sin conexión.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                onClick={handleInstallClick}
                className="h-8 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold gap-1 rounded-xl shadow cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Instalar</span>
              </Button>
              <button
                type="button"
                onClick={handleDismiss}
                className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-800 cursor-pointer"
                title="Cerrar por 7 días"
                aria-label="Cerrar notificación"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* ─── MODAL GUÍA DE INSTALACIÓN PASO A PASO PARA IPHONE / IPAD (IOS) ─── */}
      {isIosModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-pwa-title"
        >
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 space-y-5 animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200">
            {/* Cabecera */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-950/50">
                  <Smartphone className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 id="ios-pwa-title" className="text-base font-bold text-white">Instalar en tu iPhone</h3>
                  <p className="text-xs text-slate-400">Funciona en pantalla completa sin Safari</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsIosModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Cerrar guía"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pasos visuales e intuitivos */}
            <div className="space-y-3.5 text-xs text-slate-300">
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                <div className="w-6 h-6 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0 text-sky-400 font-bold">
                  1
                </div>
                <div className="flex-1">
                  <p className="leading-snug">
                    Tocá el botón <strong className="text-white">Compartir</strong> en la barra inferior de Safari.
                  </p>
                  <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800 text-[11px] text-sky-400 font-medium">
                    <Share className="w-3.5 h-3.5" />
                    <span>Ícono con flecha hacia arriba</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400 font-bold">
                  2
                </div>
                <div className="flex-1">
                  <p className="leading-snug">
                    Deslizá las opciones hacia abajo y seleccioná <strong className="text-white">&quot;Agregar a pantalla de inicio&quot;</strong>.
                  </p>
                  <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800 text-[11px] text-emerald-400 font-medium">
                    <PlusSquare className="w-3.5 h-3.5" />
                    <span>Agregar a inicio</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-400 font-bold">
                  3
                </div>
                <div className="flex-1">
                  <p className="leading-snug">
                    Tocá <strong className="text-white">&quot;Agregar&quot;</strong> en la esquina superior derecha.
                  </p>
                  <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800 text-[11px] text-amber-300 font-medium">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Listo: el ícono aparecerá junto a tus apps</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Botón de cierre */}
            <Button
              onClick={() => setIsIosModalOpen(false)}
              className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow cursor-pointer"
            >
              Entendido
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
