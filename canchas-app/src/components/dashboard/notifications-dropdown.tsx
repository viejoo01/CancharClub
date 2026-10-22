'use client'

// src/components/dashboard/notifications-dropdown.tsx
// ==============================================================================
// CENTRO DE NOTIFICACIONES Y ALERTAS EN TIEMPO REAL (HEADER)
// ==============================================================================

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  Bell,
  BellRing,
  Volume2,
  VolumeX,
  Check,
  CheckCheck,
  CalendarDays,
  Wallet,
  CloudRain,
  Clock,
  Sparkles,
  MessageSquare,
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  XCircle,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { buildWhatsAppLink } from '@/lib/utils'
import { useClubNotifications } from '@/hooks/use-club-notifications'
import type { NotificationCategory, NotificationType } from '@/types/notifications'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

interface NotificationsDropdownProps {
  tenantId?: string | null
}

function getRelativeTimeLabel(dateIso: string): string {
  try {
    const diffMs = Date.now() - new Date(dateIso).getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Hace instantes'
    if (diffMins < 60) return `Hace ${diffMins} min`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `Hace ${diffHours} h`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return 'Ayer'
    if (diffDays < 7) return `Hace ${diffDays} días`
    return new Date(dateIso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
  } catch {
    return ''
  }
}

function getNotificationVisuals(type: NotificationType) {
  switch (type) {
    case 'BOOKING_CREATED':
    case 'BOOKING_CONFIRMED':
      return {
        icon: CalendarDays,
        bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        badgeLabel: 'Turno',
      }
    case 'PAYMENT_RECEIVED':
      return {
        icon: Wallet,
        bg: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
        badgeBg: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
        badgeLabel: 'Pago',
      }
    case 'WEATHER_ALERT':
      return {
        icon: CloudRain,
        bg: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
        badgeBg: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
        badgeLabel: 'Clima',
      }
    case 'WAITLIST_NOTIFIED':
      return {
        icon: Clock,
        bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        badgeLabel: 'Espera',
      }
    case 'BOOKING_CANCELLED':
      return {
        icon: XCircle,
        bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
        badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        badgeLabel: 'Cancelado',
      }
    case 'AUTODEBIT_ALERT':
      return {
        icon: ShieldAlert,
        bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
        badgeBg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
        badgeLabel: 'Sistema',
      }
    case 'STOCK_ALERT':
      return {
        icon: AlertTriangle,
        bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        badgeLabel: 'Stock',
      }
    default:
      return {
        icon: Sparkles,
        bg: 'bg-slate-500/10 text-slate-300 border-slate-700',
        badgeBg: 'bg-slate-800 text-slate-300 border-slate-700',
        badgeLabel: 'Aviso',
      }
  }
}

export function NotificationsDropdown({ tenantId }: NotificationsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedTab, setSelectedTab] = useState<NotificationCategory>('ALL')
  const [showPushModal, setShowPushModal] = useState(false)
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission
    }
    return 'default'
  })
  const menuRef = useRef<HTMLDivElement>(null)

  const {
    notifications,
    stats,
    unreadCount,
    soundEnabled,
    toggleSound,
    markAsRead,
    markAllAsRead,
    sendTestNotification,
  } = useClubNotifications({ tenantId, initialLimit: 40 })

  // Cerrar al hacer click afuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleRequestPush = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Este navegador no soporta notificaciones de escritorio')
      return
    }
    try {
      const res = await Notification.requestPermission()
      setPushPermission(res)
      if (res === 'granted') {
        toast.success('¡Notificaciones de escritorio activadas!')
        try {
          new Notification('Avisos de CancharClub Activos', {
            body: 'Recibirás avisos de nuevos turnos, señas y alertas en vivo.',
            icon: '/icon-192.png',
          })
        } catch {}
        setShowPushModal(false)
      } else if (res === 'denied') {
        toast.error('Permiso bloqueado. Habilitalo desde los ajustes del navegador.')
      }
    } catch {
      toast.error('Error al solicitar permiso de notificaciones')
    }
  }

  // Filtrar según la pestaña seleccionada
  const filteredNotifications = notifications.filter(n => {
    if (selectedTab === 'ALL') return true
    return n.category === selectedTab
  })

  return (
    <div className="relative" ref={menuRef}>
      {/* Botón Campana con Contador */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`relative p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
          unreadCount > 0
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400 hover:bg-emerald-900/50 hover:border-emerald-500/60 shadow-xs shadow-emerald-950/40'
            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
        }`}
        aria-label={`Notificaciones y alertas (${unreadCount} sin leer)`}
        aria-expanded={isOpen}
      >
        {unreadCount > 0 ? (
          <BellRing className="w-4 h-4 text-emerald-400 animate-pulse" />
        ) : (
          <Bell className="w-4 h-4 text-slate-300" />
        )}

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-extrabold text-slate-950 ring-2 ring-slate-950 shadow-sm animate-in zoom-in-75">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover flotante del Centro de Notificaciones */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-85 sm:w-105 max-w-[calc(100vw-24px)] rounded-3xl bg-slate-900/95 border border-slate-800/90 shadow-2xl backdrop-blur-xl z-50 overflow-hidden flex flex-col max-h-[82vh] animate-in fade-in zoom-in-95 duration-150">
          {/* Encabezado */}
          <div className="p-3 sm:p-3.5 border-b border-slate-800/80 bg-slate-950/70 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <Bell className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate">
                  Notificaciones
                </h3>
                {unreadCount > 0 && (
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] py-0 px-1.5 h-4 font-mono font-bold shrink-0">
                    {unreadCount} nuevas
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Marcar todas como leídas */}
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void markAllAsRead()
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-lg transition-colors cursor-pointer"
                  title="Marcar todas como leídas"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Marcar leídas</span>
                </button>
              )}

              {/* Toggle de Sonido */}
              <button
                type="button"
                onClick={toggleSound}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer text-xs ${
                  soundEnabled
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
                title={soundEnabled ? 'Sonido de timbre activado' : 'Sonido silenciado'}
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>

              {/* Botón de configuración Push */}
              <button
                type="button"
                onClick={() => setShowPushModal(true)}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer text-xs ${
                  pushPermission === 'granted'
                    ? 'bg-slate-800 text-emerald-400 border-slate-700 hover:bg-slate-750'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
                title="Ajustes de alertas de escritorio"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Filtros rápidos por Categoría */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-800/60 bg-slate-950/30 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedTab('ALL')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shrink-0 ${
                selectedTab === 'ALL'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Todas ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab('BOOKINGS')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shrink-0 ${
                selectedTab === 'BOOKINGS'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Turnos ({stats.bookingsCount})
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab('PAYMENTS')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shrink-0 ${
                selectedTab === 'PAYMENTS'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Pagos ({stats.paymentsCount})
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab('ALERTS')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shrink-0 ${
                selectedTab === 'ALERTS'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Alertas ({stats.alertsCount})
            </button>
          </div>

          {/* Lista de Notificaciones */}
          <div className="overflow-y-auto divide-y divide-slate-800/60 flex-1">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-slate-800/50 border border-slate-700/60 flex items-center justify-center text-slate-400 mx-auto">
                  <Bell className="w-4 h-4 opacity-50" />
                </div>
                <p className="text-xs font-semibold text-slate-300">No hay notificaciones en esta categoría</p>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  Las nuevas reservas, pagos o alertas climáticas aparecerán aquí automáticamente en tiempo real.
                </p>
                <button
                  type="button"
                  onClick={() => void sendTestNotification('BOOKING')}
                  className="text-[11px] text-emerald-400 hover:underline pt-2 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Emitir notificación de prueba</span>
                </button>
              </div>
            ) : (
              filteredNotifications.slice(0, 8).map(notif => {
                const visuals = getNotificationVisuals(notif.type)
                const IconComponent = visuals.icon
                const phone = notif.metadata?.customer_phone

                return (
                  <div
                    key={notif.id}
                    onClick={() => {
                      if (!notif.read) void markAsRead(notif.id)
                    }}
                    className={`p-3 sm:p-3.5 transition-colors cursor-pointer flex items-start gap-3 hover:bg-slate-800/50 relative group ${
                      !notif.read ? 'bg-emerald-950/20' : 'opacity-90'
                    }`}
                  >
                    {/* Icono con badge visual */}
                    <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${visuals.bg}`}>
                      <IconComponent className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge className={`${visuals.badgeBg} text-[9px] py-0 px-1 font-bold tracking-wider uppercase`}>
                            {visuals.badgeLabel}
                          </Badge>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {getRelativeTimeLabel(notif.created_at)}
                          </span>
                        </div>

                        {/* Botón explícito o indicador de visto */}
                        {!notif.read ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              void markAsRead(notif.id)
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-emerald-400 hover:text-emerald-200 hover:bg-emerald-500/20 transition-all cursor-pointer"
                            title="Marcar como vista"
                          >
                            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-xs shadow-emerald-400/80" />
                            <span className="hidden group-hover:inline">Marcar vista</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-600 flex items-center gap-0.5" title="Notificación vista">
                            <Check className="w-3 h-3 text-slate-500" />
                          </span>
                        )}
                      </div>

                      <h4 className="text-xs font-bold text-white mt-1 leading-snug truncate">
                        {notif.title}
                      </h4>

                      <p className="text-[11px] text-slate-300/90 mt-0.5 leading-relaxed line-clamp-2">
                        {notif.message}
                      </p>

                      {/* Chips y Acciones Rápidas */}
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {phone && (
                          <a
                            href={buildWhatsAppLink(phone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-[10px] font-medium text-emerald-300 hover:bg-emerald-900/60 transition-colors"
                          >
                            <MessageSquare className="w-3 h-3 text-emerald-400" />
                            <span>WhatsApp</span>
                          </a>
                        )}

                        {typeof notif.metadata?.amount_ars === 'number' && notif.metadata.amount_ars > 0 && (
                          <span className="text-[10px] font-mono font-bold text-white bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                            ${notif.metadata.amount_ars.toLocaleString('es-AR')}
                          </span>
                        )}

                        {notif.metadata?.court_name && (
                          <span className="text-[10px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded">
                            {notif.metadata.court_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Pie de Popover: Enlace a Historial Completo */}
          <div className="p-3 bg-slate-950/80 border-t border-slate-800/80 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => void sendTestNotification('BOOKING')}
              className="text-[11px] text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-1 cursor-pointer font-medium"
            >
              <Sparkles className="w-3 h-3" />
              <span>Probar Alerta</span>
            </button>

            <Link
              href="/dashboard/notificaciones"
              onClick={() => setIsOpen(false)}
              className="text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1.5 cursor-pointer py-1 px-2 rounded-lg hover:bg-slate-850"
            >
              <span>Ver Todo el Historial</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Modal de Configuración de Notificaciones de Escritorio */}
      <Dialog open={showPushModal} onOpenChange={setShowPushModal}>
        <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-slate-100">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-2">
              <BellRing className="w-6 h-6" />
            </div>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <span>Avisos de Escritorio y Mostrador</span>
              <Badge className={pushPermission === 'granted' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]' : 'bg-slate-800 text-slate-400 text-[10px]'}>
                {pushPermission === 'granted' ? 'HABILITADAS' : 'DESACTIVADAS'}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Configurá las alertas sonoras y de escritorio para enterarte en tiempo real de nuevas reservas online o pagos de señas cuando tenés la pestaña en segundo plano.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-200">Campanilla Sonora de Mostrador</div>
                <div className="text-[11px] text-slate-400">
                  Sintetiza un timbre cristalino al ingresar turnos o pagos.
                </div>
              </div>
              <button
                type="button"
                onClick={toggleSound}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
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

            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-200">Permisos del Navegador</div>
                <div className="text-[11px] text-slate-400">
                  {pushPermission === 'granted'
                    ? 'Permiso concedido para avisos de escritorio de Windows / Chrome.'
                    : pushPermission === 'denied'
                    ? 'Bloqueado. Habilitalo desde el candado de la URL.'
                    : 'Permiso pendiente de confirmación en este navegador.'}
                </div>
              </div>
              {pushPermission === 'granted' && (
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
              onClick={() => void sendTestNotification('BOOKING')}
              className="text-xs border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800 rounded-xl"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 mr-1.5" />
              <span>Probar Alerta Sonora</span>
            </Button>

            {pushPermission !== 'granted' ? (
              <Button
                type="button"
                size="sm"
                onClick={handleRequestPush}
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md"
              >
                <BellRing className="w-3.5 h-3.5 mr-1.5" />
                <span>Permitir en Navegador</span>
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowPushModal(false)}
                className="text-xs text-slate-400 hover:text-white rounded-xl"
              >
                Listo
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
