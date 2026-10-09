'use client'

import { useState, useEffect } from 'react'
import { Bell, BellRing, Volume2, Sparkles, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

// Síntesis de sonido de alerta de mostrador con Web Audio API de alto rendimiento
function playCounterAlertChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const now = ctx.currentTime

    // Dos tonos armónicos tipo timbre de recepción de club (E5 -> B5)
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()

    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(659.25, now) // E5
    osc1.frequency.exponentialRampToValueAtTime(987.77, now + 0.12) // B5

    osc2.type = 'triangle'
    osc2.frequency.setValueAtTime(1318.5, now) // E6

    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.3, now + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(ctx.destination)

    osc1.start(now)
    osc2.start(now)
    osc1.stop(now + 0.5)
    osc2.stop(now + 0.5)
  } catch {
    // Si el navegador bloquea audio sin interacción previa, ignorar
  }
}

export function PushNotificationsToggle() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSupported, setIsSupported] = useState(false)
  const [isOpenModal, setIsOpenModal] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setIsSupported(true)
        setPermission(Notification.permission)
        const savedSound = localStorage.getItem('canchar_push_sound')
        if (savedSound !== null) {
          setSoundEnabled(savedSound === 'true')
        }
      }
    }, 0)

    // Escuchar eventos globales de reservas entrantes vía BroadcastChannel
    let bc: BroadcastChannel | null = null
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('canchar_bookings')
        bc.onmessage = (event) => {
          if (event.data?.type === 'BOOKING_CONFIRMED' || event.data?.type === 'NEW_BOOKING') {
            if (Notification.permission === 'granted') {
              try {
                new Notification('⚽ ¡Nueva Reserva Confirmada!', {
                  body: event.data.customer_name 
                    ? `${event.data.customer_name} confirmó su turno en el club.`
                    : 'Ingresó una nueva reserva en el calendario.',
                  icon: '/icon-192.png',
                  badge: '/icon.svg',
                })
              } catch {}
            }
            playCounterAlertChime()
          }
        }
      }
    } catch {}

    return () => {
      clearTimeout(timer)
      try {
        bc?.close()
      } catch {}
    }
  }, [])

  const handleRequestPermission = async () => {
    if (!isSupported) {
      toast.error('Tu navegador no soporta notificaciones de escritorio')
      return
    }

    try {
      const result = await Notification.requestPermission()
      setPermission(result)

      if (result === 'granted') {
        toast.success('¡Notificaciones Push de Mostrador activadas!', {
          description: 'Recibirás avisos instantáneos con sonido ante nuevas reservas.',
        })

        if (soundEnabled) {
          playCounterAlertChime()
        }

        try {
          new Notification('🔔 ¡Notificaciones de Mostrador Activas!', {
            body: 'CancharClub te avisará al instante con sonido cuando un jugador reserve un turno.',
            icon: '/icon-192.png',
          })
        } catch {}

        setIsOpenModal(false)
      } else if (result === 'denied') {
        toast.error('Permiso bloqueado en el navegador. Activá las notificaciones desde el candado de la barra de direcciones.')
      }
    } catch {
      toast.error('Error al solicitar permiso de notificaciones')
    }
  }

  const handleTestAlert = () => {
    if (soundEnabled) {
      playCounterAlertChime()
    }
    if (permission === 'granted') {
      try {
        new Notification('🔔 Prueba de Alerta - CancharClub', {
          body: 'El sistema de avisos y notificaciones en tiempo real está 100% operativo.',
          icon: '/icon-192.png',
        })
      } catch {}
    }
    toast.success('¡Alerta de prueba emitida!')
  }

  const toggleSound = () => {
    const nextVal = !soundEnabled
    setSoundEnabled(nextVal)
    localStorage.setItem('canchar_push_sound', String(nextVal))
    if (nextVal) {
      playCounterAlertChime()
      toast.success('Sonido de mostrador habilitado')
    } else {
      toast.info('Sonido de mostrador silenciado')
    }
  }

  if (!isSupported) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpenModal(true)}
        className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
          permission === 'granted'
            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/40 hover:border-emerald-500/50'
            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
        }`}
        title={
          permission === 'granted'
            ? 'Notificaciones de escritorio y sonido activas'
            : 'Activar notificaciones de mostrador'
        }
      >
        {permission === 'granted' ? (
          <>
            <BellRing className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="hidden xl:inline text-[11px] font-bold text-emerald-300">Push Activo</span>
          </>
        ) : (
          <>
            <Bell className="w-4 h-4 text-slate-400" />
            <span className="hidden xl:inline text-[11px] text-slate-400">Activar Avisos</span>
          </>
        )}
      </button>

      {/* Modal de Configuración y Prueba de Notificaciones */}
      <Dialog open={isOpenModal} onOpenChange={setIsOpenModal}>
        <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-slate-100">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-2">
              <BellRing className="w-6 h-6" />
            </div>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <span>Notificaciones de Mostrador</span>
              <Badge className={permission === 'granted' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]' : 'bg-slate-800 text-slate-400 text-[10px]'}>
                {permission === 'granted' ? 'HABILITADAS' : 'DESACTIVADAS'}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Recibí alertas sonoras y de escritorio en tiempo real cada vez que un cliente complete una reserva online o haga un pedido de cantina.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-slate-200">Campanilla Sonora de Mostrador</span>
                </div>
                <button
                  type="button"
                  onClick={toggleSound}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    soundEnabled ? 'bg-emerald-600' : 'bg-slate-800'
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                      soundEnabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Sintetiza un timbre cristalino al ingresar turnos confirmados, ideal si tenés la pestaña en segundo plano.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-200">Estado del Navegador</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {permission === 'granted'
                    ? 'Permiso concedido para avisos de escritorio.'
                    : permission === 'denied'
                    ? 'Bloqueado. Habilitalo desde la configuración del navegador.'
                    : 'Requiere que autorices el permiso del navegador.'}
                </div>
              </div>
              {permission === 'granted' && (
                <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4" />
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestAlert}
              className="text-xs border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800 rounded-xl"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 mr-1.5" />
              <span>Probar Alerta Ahora</span>
            </Button>

            {permission !== 'granted' ? (
              <Button
                type="button"
                size="sm"
                onClick={handleRequestPermission}
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md"
              >
                <BellRing className="w-3.5 h-3.5 mr-1.5" />
                <span>Permitir Notificaciones</span>
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setIsOpenModal(false)}
                className="text-xs text-slate-400 hover:text-white rounded-xl"
              >
                Listo
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
