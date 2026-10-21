'use client'

import { useState, useEffect } from 'react'
import {
  Download,
  X,
  Smartphone,
  Share,
  PlusSquare,
  CheckCircle,
  Trophy,
  Building2,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false)
  const [isIosModalOpen, setIsIosModalOpen] = useState(false)

  // Rol predeterminado sugerido según contexto de navegación inicial
  const [selectedRole, setSelectedRole] = useState<'player' | 'club'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('canchar_user_role')
      if (saved === 'club' || saved === 'player') return saved
      if (
        window.location.pathname.startsWith('/dashboard') ||
        window.location.pathname.startsWith('/auth') ||
        window.location.pathname.startsWith('/superadmin')
      ) {
        return 'club'
      }
    }
    return 'player'
  })

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

      // Abrir el selector de perfil antes de instalar
      setIsRoleModalOpen(true)
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

  // Descartar temporalmente por 7 días
  const handleDismiss = () => {
    setIsVisible(false)
    const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000
    localStorage.setItem('canchar_pwa_dismissed_until', String(sevenDaysFromNow))
  }

  // Al hacer clic en "Instalar" desde el banner flotante, abrimos el selector de perfil
  const handleOpenRoleModal = () => {
    setIsVisible(false)
    setIsRoleModalOpen(true)
  }

  // Al confirmar el rol en el modal de selección
  const handleConfirmRoleAndInstall = async (role: 'player' | 'club') => {
    // 1. Guardar preferencia en localStorage y Cookie para el enrutador /app
    localStorage.setItem('canchar_user_role', role)
    document.cookie = `canchar_user_role=${role}; path=/; max-age=31536000; SameSite=Lax`

    // 2. Actualizar el link del manifiesto en el DOM para navegadores que admiten manifiestos dinámicos
    try {
      const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null
      if (manifestLink) {
        manifestLink.href = `/api/manifest?role=${role}`
      }
    } catch {
      // Fallback silencioso
    }

    setIsRoleModalOpen(false)

    // 3. Flujo en iOS Safari
    if (isIosDevice) {
      // En iOS Safari el acceso directo se crea sobre la URL activa del navegador.
      // Sincronizamos la URL activa para que guarde el punto de entrada correcto.
      if (role === 'player' && (window.location.pathname.startsWith('/auth') || window.location.pathname.startsWith('/dashboard'))) {
        window.history.pushState({}, '', '/')
      } else if (role === 'club' && window.location.pathname === '/') {
        window.history.pushState({}, '', '/auth/login')
      }
      setIsIosModalOpen(true)
      return
    }

    // 4. Flujo en Chromium / Android con prompt nativo
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice
        if (outcome === 'accepted') {
          toast.success(
            role === 'player'
              ? '¡App instalada con éxito para Jugadores!'
              : '¡App de gestión de Club instalada con éxito!'
          )
        }
        setDeferredPrompt(null)
      } catch {
        // Manejo silencioso si el usuario cancela
      }
      return
    }

    // 5. Flujo en Escritorio / Navegador sin evento deferredPrompt directo
    toast.info(
      `Perfil ${role === 'player' ? 'Jugador' : 'Club'} configurado. Tocá el ícono de instalar en la barra de direcciones de tu navegador para añadirla a tu pantalla.`
    )
  }

  return (
    <>
      {/* ─── BANNER FLOTANTE INFERIOR ─── */}
      {isVisible && !isStandaloneApp && !isRoleModalOpen && !isIosModalOpen && (
        <aside
          aria-label="Instalación de CancharClub"
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
          <div className="p-4 rounded-2xl bg-slate-900/95 border border-emerald-500/30 shadow-2xl shadow-emerald-950/60 backdrop-blur-md flex items-center justify-between gap-3 text-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shrink-0 shadow-md shadow-emerald-950/40">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-white truncate">Instalá la App de CancharClub</h4>
                <p className="text-[11px] text-slate-400 leading-tight">
                  {isIosDevice
                    ? 'Elegí tu perfil y agregalo a tu pantalla de inicio.'
                    : 'Elegí si sos Jugador o Club y tené acceso directo.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                onClick={handleOpenRoleModal}
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

      {/* ─── MODAL DE ELECCIÓN DE PERFIL ANTES DE DESCARGAR/INSTALAR ─── */}
      {isRoleModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="role-modal-title"
        >
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 space-y-5 animate-in zoom-in-95 duration-200">
            {/* Header del modal */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-linear-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-950/50">
                  <Smartphone className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 id="role-modal-title" className="text-base font-bold text-white">
                    Instalar CancharClub
                  </h3>
                  <p className="text-xs text-slate-400">¿Cómo vas a usar la app en este celular?</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRoleModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Cerrar selector"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Opciones interactivas de rol */}
            <div className="space-y-3">
              {/* Opción 1: Soy Jugador */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setSelectedRole('player')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSelectedRole('player')
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer relative text-left ${
                  selectedRole === 'player'
                    ? 'bg-emerald-950/30 border-emerald-500/80 shadow-md shadow-emerald-950/40 ring-1 ring-emerald-500/50'
                    : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        selectedRole === 'player'
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">Soy Jugador</h4>
                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                          Reservas
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-300 mt-0.5 leading-snug">
                        Buscá canchas, reservá turnos online, consultá torneos y accedé a tus reservas sin iniciar sesión como club.
                      </p>
                    </div>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border mt-0.5 ${
                      selectedRole === 'player'
                        ? 'bg-emerald-500 border-emerald-400 text-white'
                        : 'border-slate-700 bg-slate-800'
                    }`}
                  >
                    {selectedRole === 'player' && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </div>
                </div>
              </div>

              {/* Opción 2: Soy Club / Dueño */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setSelectedRole('club')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSelectedRole('club')
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer relative text-left ${
                  selectedRole === 'club'
                    ? 'bg-sky-950/30 border-sky-500/80 shadow-md shadow-sky-950/40 ring-1 ring-sky-500/50'
                    : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        selectedRole === 'club'
                          ? 'bg-sky-600 text-white shadow-md shadow-sky-950/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">Soy Club / Dueño</h4>
                        <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/30 text-[10px]">
                          Administración
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-300 mt-0.5 leading-snug">
                        Gestioná la grilla de turnos de tu complejo, cobro de señas por Mercado Pago, caja diaria y clientes.
                      </p>
                    </div>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border mt-0.5 ${
                      selectedRole === 'club'
                        ? 'bg-sky-500 border-sky-400 text-white'
                        : 'border-slate-700 bg-slate-800'
                    }`}
                  >
                    {selectedRole === 'club' && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </div>
                </div>
              </div>
            </div>

            {/* Botón de confirmación e instalación */}
            <div className="pt-1">
              <Button
                onClick={() => handleConfirmRoleAndInstall(selectedRole)}
                className={`w-full h-11 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99] ${
                  selectedRole === 'player'
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/50'
                    : 'bg-sky-600 hover:bg-sky-500 shadow-sky-950/50'
                }`}
              >
                <Download className="w-4 h-4" />
                <span>
                  {selectedRole === 'player'
                    ? 'Instalar como Jugador'
                    : 'Instalar como Club / Dueño'}
                </span>
              </Button>
              <p className="text-center text-[11px] text-slate-400 mt-2">
                Podés alternar tu perfil en cualquier momento desde la app.
              </p>
            </div>
          </div>
        </div>
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
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg ${
                    selectedRole === 'player'
                      ? 'bg-linear-to-tr from-emerald-500 to-teal-400 shadow-emerald-950/50'
                      : 'bg-linear-to-tr from-sky-500 to-teal-400 shadow-sky-950/50'
                  }`}
                >
                  <Smartphone className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 id="ios-pwa-title" className="text-base font-bold text-white">
                    Instalar en tu iPhone
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] text-slate-400">Perfil:</span>
                    <Badge
                      className={`text-[10px] font-semibold ${
                        selectedRole === 'player'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                      }`}
                    >
                      {selectedRole === 'player' ? 'Jugador' : 'Club / Dueño'}
                    </Badge>
                  </div>
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
                    Deslizá las opciones hacia abajo y seleccioná{' '}
                    <strong className="text-white">&quot;Agregar a pantalla de inicio&quot;</strong>.
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
                    <span>
                      {selectedRole === 'player'
                        ? 'Se creará el acceso directo para reservas de canchas'
                        : 'Se creará el acceso directo para gestionar tu club'}
                    </span>
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
