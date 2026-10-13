'use client'

// src/app/dashboard/notificaciones/page.tsx
// ==============================================================================
// HISTORIAL DE NOTIFICACIONES Y ALERTAS DEL CLUB
// Turnos reservados, pagos recibidos, alertas enviadas por clima, lista de espera
// ==============================================================================

import { useState, useMemo } from 'react'
import {
  Bell,
  BellRing,
  CalendarDays,
  Wallet,
  CloudRain,
  Clock,
  Search,
  CheckCheck,
  Check,
  Sparkles,
  Volume2,
  VolumeX,
  MessageSquare,
  RefreshCw,
  XCircle,
  ShieldAlert,
  ChevronRight,
  Copy,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useClubNotifications } from '@/hooks/use-club-notifications'
import { useTenantId } from '@/hooks/use-tenant-id'
import type { ClubNotification, NotificationCategory, NotificationType } from '@/types/notifications'
import { toast } from 'sonner'
import Link from 'next/link'

function formatFullDate(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Argentina/Buenos_Aires',
    }) + ' hs'
  } catch {
    return isoString
  }
}

function getRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Hace instantes'
    if (diffMins < 60) return `Hace ${diffMins} min`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `Hace ${diffHours} h`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return 'Ayer'
    if (diffDays < 7) return `Hace ${diffDays} días`
    return new Date(isoString).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'short',
      timeZone: 'America/Argentina/Buenos_Aires',
    })
  } catch {
    return ''
  }
}

function getVisualProps(type: NotificationType) {
  switch (type) {
    case 'BOOKING_CREATED':
    case 'BOOKING_CONFIRMED':
      return {
        icon: CalendarDays,
        border: 'border-l-emerald-500',
        iconBg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        label: 'Turno Reservado',
      }
    case 'PAYMENT_RECEIVED':
      return {
        icon: Wallet,
        border: 'border-l-teal-500',
        iconBg: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
        badge: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
        label: 'Pago Recibido',
      }
    case 'WEATHER_ALERT':
      return {
        icon: CloudRain,
        border: 'border-l-sky-500',
        iconBg: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
        badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
        label: 'Alerta Climática',
      }
    case 'WAITLIST_NOTIFIED':
      return {
        icon: Clock,
        border: 'border-l-amber-500',
        iconBg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        label: 'Lista de Espera',
      }
    case 'BOOKING_CANCELLED':
      return {
        icon: XCircle,
        border: 'border-l-rose-500',
        iconBg: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
        badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        label: 'Cancelación',
      }
    case 'AUTODEBIT_ALERT':
      return {
        icon: ShieldAlert,
        border: 'border-l-indigo-500',
        iconBg: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
        badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
        label: 'Sistema / Abono',
      }
    default:
      return {
        icon: Sparkles,
        border: 'border-l-slate-600',
        iconBg: 'bg-slate-800 text-slate-300 border-slate-700',
        badge: 'bg-slate-800 text-slate-300 border-slate-700',
        label: 'Notificación',
      }
  }
}

export default function NotificationsPage() {
  const tenantId = useTenantId()
  const {
    notifications,
    stats,
    unreadCount,
    loading,
    soundEnabled,
    toggleSound,
    markAsRead,
    markAllAsRead,
    sendTestNotification,
    refresh,
  } = useClubNotifications({ tenantId, initialLimit: 120 })

  const [categoryFilter, setCategoryFilter] = useState<NotificationCategory>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [dateRange, setDateRange] = useState<'ALL' | 'TODAY' | '7DAYS' | '30DAYS'>('ALL')
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    await refresh()
    setIsRefreshing(false)
    toast.success('Historial actualizado')
  }

  // Filtrado reactivo en cliente para máxima velocidad y respuesta instantánea
  const filteredList = useMemo(() => {
    return notifications.filter(n => {
      // 1. Filtro por categoría
      if (categoryFilter !== 'ALL' && n.category !== categoryFilter) return false

      // 2. Filtro solo no leídas
      if (unreadOnly && n.read) return false

      // 3. Filtro por rango de fechas
      if (dateRange !== 'ALL') {
        const itemDate = new Date(n.created_at)
        const itemTime = itemDate.getTime()
        const now = new Date()
        if (dateRange === 'TODAY') {
          const isSameDay =
            itemDate.getFullYear() === now.getFullYear() &&
            itemDate.getMonth() === now.getMonth() &&
            itemDate.getDate() === now.getDate()
          if (!isSameDay) return false
        } else if (dateRange === '7DAYS') {
          const diffDays = (now.getTime() - itemTime) / (1000 * 60 * 60 * 24)
          if (diffDays > 7) return false
        } else if (dateRange === '30DAYS') {
          const diffDays = (now.getTime() - itemTime) / (1000 * 60 * 60 * 24)
          if (diffDays > 30) return false
        }
      }

      // 4. Búsqueda de texto
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim()
        const matchTitle = n.title.toLowerCase().includes(q)
        const matchMsg = n.message.toLowerCase().includes(q)
        const matchCustomer = n.metadata?.customer_name?.toLowerCase().includes(q)
        const matchPhone = n.metadata?.customer_phone?.toLowerCase().includes(q)
        const matchCourt = n.metadata?.court_name?.toLowerCase().includes(q)
        if (!matchTitle && !matchMsg && !matchCustomer && !matchPhone && !matchCourt) {
          return false
        }
      }

      return true
    })
  }, [notifications, categoryFilter, unreadOnly, dateRange, searchQuery])

  const copyNotificationDetail = (n: ClubNotification) => {
    const text = `${n.title}\n${n.message}\nFecha: ${formatFullDate(n.created_at)}`
    void navigator.clipboard.writeText(text)
    toast.success('Detalle copiado al portapapeles')
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* ─── ENCABEZADO PRINCIPAL ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-linear-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-950/40">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <span>Historial de Notificaciones y Alertas</span>
                {unreadCount > 0 && (
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs px-2 py-0.5">
                    {unreadCount} nuevas
                  </Badge>
                )}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Registro cronológico en vivo de turnos reservados, pagos recibidos, cancelaciones y alertas climáticas.
              </p>
            </div>
          </div>
        </div>

        {/* Acciones Rápidas del Encabezado */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleSound}
            className={`text-xs rounded-xl border transition-colors cursor-pointer gap-1.5 ${
              soundEnabled
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/50'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Sonido Activo' : 'Sonido Silenciado'}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="text-xs border-slate-800 bg-slate-900 text-slate-300 hover:text-white rounded-xl gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>

          {unreadCount > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={() => void markAllAsRead()}
              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md gap-1.5 cursor-pointer"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Marcar Todo Leído</span>
            </Button>
          )}

          {/* Menú para emitir alerta de prueba */}
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void sendTestNotification('BOOKING')}
              className="text-xs border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-700 rounded-xl gap-1.5 cursor-pointer"
              title="Disparar aviso simulado de turno para validar funcionamiento"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline">Probar Alerta</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ─── TARJETAS DE MÉTRICAS / KPIS DEL HISTORIAL ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Notificaciones */}
        <div
          onClick={() => {
            setCategoryFilter('ALL')
            setUnreadOnly(false)
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            categoryFilter === 'ALL' && !unreadOnly
              ? 'bg-slate-900/90 border-slate-700 ring-1 ring-slate-600'
              : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-900/80'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Total Historial</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1.5 font-mono">{stats.total}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Eventos registrados</div>
        </div>

        {/* Turnos Reservados */}
        <div
          onClick={() => {
            setCategoryFilter('BOOKINGS')
            setUnreadOnly(false)
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            categoryFilter === 'BOOKINGS'
              ? 'bg-emerald-950/30 border-emerald-500/40 ring-1 ring-emerald-500/50'
              : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-900/80'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-semibold">Turnos</span>
            <CalendarDays className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-white mt-1.5 font-mono">{stats.bookingsCount}</div>
          <div className="text-[11px] text-emerald-400/80 mt-0.5">Reservas cargadas</div>
        </div>

        {/* Pagos Recibidos */}
        <div
          onClick={() => {
            setCategoryFilter('PAYMENTS')
            setUnreadOnly(false)
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            categoryFilter === 'PAYMENTS'
              ? 'bg-teal-950/30 border-teal-500/40 ring-1 ring-teal-500/50'
              : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-900/80'
          }`}
        >
          <div className="flex items-center justify-between text-teal-400">
            <span className="text-xs font-semibold">Pagos y Señas</span>
            <Wallet className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-white mt-1.5 font-mono">{stats.paymentsCount}</div>
          <div className="text-[11px] text-teal-400/80 mt-0.5">Cobros procesados</div>
        </div>

        {/* Alertas de Turnos Enviadas */}
        <div
          onClick={() => {
            setCategoryFilter('ALERTS')
            setUnreadOnly(false)
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            categoryFilter === 'ALERTS'
              ? 'bg-sky-950/30 border-sky-500/40 ring-1 ring-sky-500/50'
              : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-900/80'
          }`}
        >
          <div className="flex items-center justify-between text-sky-400">
            <span className="text-xs font-semibold">Alertas Enviadas</span>
            <CloudRain className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-white mt-1.5 font-mono">{stats.alertsCount}</div>
          <div className="text-[11px] text-sky-400/80 mt-0.5">Clima y lista de espera</div>
        </div>

        {/* Sin Leer */}
        <div
          onClick={() => setUnreadOnly(prev => !prev)}
          className={`col-span-2 sm:col-span-1 p-4 rounded-2xl border transition-all cursor-pointer ${
            unreadOnly
              ? 'bg-amber-950/30 border-amber-500/40 ring-1 ring-amber-500/50'
              : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-900/80'
          }`}
        >
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-xs font-semibold">No Leídas</span>
            <Bell className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-white mt-1.5 font-mono">{stats.unread}</div>
          <div className="text-[11px] text-amber-400/80 mt-0.5">Pendientes de revisión</div>
        </div>
      </div>

      {/* ─── BARRA DE HERRAMIENTAS: BÚSQUEDA Y FILTROS ─── */}
      <div className="p-4 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Input de Búsqueda */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Buscar por cliente, teléfono, cancha o palabra clave..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-slate-950/80 border-slate-800 text-xs text-white rounded-xl placeholder:text-slate-500 focus:border-emerald-500/60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Filtro de Rango Temporal */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[11px] text-slate-400 font-semibold mr-1 hidden sm:inline">Período:</span>
            <button
              type="button"
              onClick={() => setDateRange('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                dateRange === 'ALL'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              Todo
            </button>
            <button
              type="button"
              onClick={() => setDateRange('TODAY')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                dateRange === 'TODAY'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setDateRange('7DAYS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                dateRange === '7DAYS'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              Últimos 7 días
            </button>
            <button
              type="button"
              onClick={() => setDateRange('30DAYS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                dateRange === '30DAYS'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              Este mes
            </button>
          </div>
        </div>

        {/* Pestañas de Categoría */}
        <div className="flex items-center justify-between border-t border-slate-800/80 pt-3 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setCategoryFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                categoryFilter === 'ALL'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              Todas ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('BOOKINGS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
                categoryFilter === 'BOOKINGS'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-850'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Turnos ({stats.bookingsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('PAYMENTS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
                categoryFilter === 'PAYMENTS'
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                  : 'text-slate-400 hover:text-teal-300 hover:bg-slate-850'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Pagos ({stats.paymentsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('ALERTS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
                categoryFilter === 'ALERTS'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-slate-400 hover:text-sky-300 hover:bg-slate-850'
              }`}
            >
              <CloudRain className="w-3.5 h-3.5" />
              <span>Alertas Enviadas ({stats.alertsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('SYSTEM')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
                categoryFilter === 'SYSTEM'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                  : 'text-slate-400 hover:text-indigo-300 hover:bg-slate-850'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Sistema ({stats.systemCount})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setUnreadOnly(prev => !prev)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                unreadOnly
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${unreadOnly ? 'bg-amber-400' : 'bg-slate-600'}`} />
              <span>Solo No Leídas ({stats.unread})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── LISTADO DE NOTIFICACIONES ─── */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800 space-y-3">
            <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Cargando historial de notificaciones y alertas...</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-slate-900/50 border border-slate-800 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 mx-auto">
              <Bell className="w-5 h-5 opacity-40" />
            </div>
            <h3 className="text-sm font-bold text-slate-200">No se encontraron notificaciones</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No hay alertas que coincidan con los filtros seleccionados. Probá limpiar la búsqueda o cambiar la categoría.
            </p>
            <div className="pt-2 flex items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCategoryFilter('ALL')
                  setSearchQuery('')
                  setUnreadOnly(false)
                  setDateRange('ALL')
                }}
                className="text-xs border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-750 rounded-xl"
              >
                Limpiar Filtros
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void sendTestNotification('BOOKING')}
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generar Notificación de Prueba</span>
              </Button>
            </div>
          </div>
        ) : (
          filteredList.map(notif => {
            const visual = getVisualProps(notif.type)
            const Icon = visual.icon
            const phone = notif.metadata?.customer_phone

            return (
              <div
                key={notif.id}
                className={`p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800/90 border-l-4 ${
                  visual.border
                } transition-all duration-150 hover:bg-slate-900 hover:border-slate-700/80 space-y-3 relative ${
                  !notif.read ? 'ring-1 ring-emerald-500/20 shadow-lg shadow-emerald-950/20' : 'opacity-95'
                }`}
              >
                {/* Cabecera de la tarjeta */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${visual.iconBg}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`${visual.badge} text-[10px] py-0 px-2 font-bold tracking-wider uppercase`}>
                          {visual.label}
                        </Badge>
                        {!notif.read && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.2 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Nuevo
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400 font-medium font-mono">
                          {formatFullDate(notif.created_at)}
                        </span>
                        <span className="text-[11px] text-slate-500 hidden sm:inline">
                          ({getRelativeTime(notif.created_at)})
                        </span>
                      </div>
                      <h3 className="text-sm sm:text-base font-bold text-white mt-1 leading-snug">
                        {notif.title}
                      </h3>
                    </div>
                  </div>

                  {/* Acciones de tarjeta individuales */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => void copyNotificationDetail(notif)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Copiar detalles"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void markAsRead(notif.id)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer text-xs ${
                        notif.read
                          ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                          : 'text-emerald-400 hover:bg-emerald-950/60'
                      }`}
                      title={notif.read ? 'Leída' : 'Marcar como leída'}
                    >
                      {notif.read ? <Check className="w-3.5 h-3.5" /> : <CheckCheck className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Mensaje descriptivo */}
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pl-1 sm:pl-13">
                  {notif.message}
                </p>

                {/* Ficha contextual de metadatos (Cliente, Cancha, Monto, WhatsApp) */}
                <div className="pl-1 sm:pl-13 flex items-center justify-between gap-3 pt-1 border-t border-slate-800/60 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    {notif.metadata?.customer_name && (
                      <span className="font-semibold text-slate-200 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                        {notif.metadata.customer_name}
                      </span>
                    )}

                    {notif.metadata?.court_name && (
                      <span className="text-slate-300 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        {notif.metadata.court_name}
                      </span>
                    )}

                    {typeof notif.metadata?.amount_ars === 'number' && notif.metadata.amount_ars > 0 && (
                      <span className="font-bold font-mono bg-emerald-950/60 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-500/30">
                        ${notif.metadata.amount_ars.toLocaleString('es-AR')}
                      </span>
                    )}

                    {notif.metadata?.payment_method && (
                      <span className="text-slate-400 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800 text-[11px]">
                        {notif.metadata.payment_method}
                      </span>
                    )}

                    {notif.metadata?.booked_date && (
                      <span className="text-slate-400 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800 text-[11px]">
                        Turno: {notif.metadata.booked_date} {notif.metadata.booked_time ? `${notif.metadata.booked_time} hs` : ''}
                      </span>
                    )}
                  </div>

                  {/* Botones de acción directa */}
                  <div className="flex items-center gap-2">
                    {phone && (
                      <a
                        href={`https://wa.me/${phone.replace(/[^\d]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-xs font-semibold text-emerald-300 hover:bg-emerald-900 hover:text-white transition-colors shadow-xs"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Abrir WhatsApp</span>
                      </a>
                    )}

                    <Link
                      href="/dashboard"
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-medium text-slate-300 hover:text-white transition-colors"
                    >
                      <span>Ver Calendario</span>
                      <ChevronRight className="w-3 h-3 text-slate-400" />
                    </Link>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
