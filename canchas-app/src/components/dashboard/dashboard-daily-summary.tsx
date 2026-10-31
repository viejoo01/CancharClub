'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { 
  CalendarDays, 
  DollarSign, 
  TrendingUp, 
  AlertCircle, 
  ArrowUpRight,
  Sparkles,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatARS, isAbonoBooking } from '@/lib/utils'
import type { CalendarBooking } from '@/components/dashboard/calendar-grid'
import type { QuickBookingPriceRule } from '@/components/dashboard/quick-booking-modal'

interface CourtItem {
  id: string
  name: string
  sport: string
  slot_duration: 'MIN_60' | 'MIN_90' | 'MIN_120'
  is_active: boolean
  created_at?: string | null
}

interface DashboardDailySummaryProps {
  bookings: CalendarBooking[]
  courts: CourtItem[]
  priceRules?: QuickBookingPriceRule[]
  dateIso: string
}

export function DashboardDailySummary({
  bookings = [],
  courts = [],
  priceRules = [],
  dateIso
}: DashboardDailySummaryProps) {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return localStorage.getItem('canchar_kpi_summary_collapsed') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const handleReceptionMode = (e: Event) => {
      const customEvent = e as CustomEvent<{ enabled?: boolean }>
      setIsCollapsed(prev => {
        const next = typeof customEvent.detail?.enabled === 'boolean'
          ? customEvent.detail.enabled
          : !prev
        try {
          localStorage.setItem('canchar_kpi_summary_collapsed', String(next))
        } catch {}
        return next
      })
    }
    window.addEventListener('canchar-toggle-reception-mode', handleReceptionMode)
    return () => window.removeEventListener('canchar-toggle-reception-mode', handleReceptionMode)
  }, [])

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev
      try {
        localStorage.setItem('canchar_kpi_summary_collapsed', String(next))
      } catch {}
      return next
    })
  }

  const stats = useMemo(() => {
    const isCancelled = (status: string) => 
      status === 'CANCELLED_USER' || status === 'CANCELLED_CLUB' || status === 'RAIN_CANCELLED' || status === 'CANCELLED'

    const activeBookings = bookings.filter(b => !isCancelled(b.status))
    
    const isConfirmed = (status: string) => 
      status === 'CONFIRMED' || status === 'DEPOSIT_PAID' || status === 'PARTIAL_PAID' || status === 'FULLY_PAID' || status === 'COMPLETED'
    
    const isPending = (status: string) => 
      status === 'PENDING_DEPOSIT' || status === 'SLOT_LOCKED' || status === 'PENDING'

    const isAbono = (b: CalendarBooking) => isAbonoBooking({
      is_abono: b.is_abono,
      recurring_slot_id: b.recurring_slot_id,
      internal_notes: b.internal_notes,
    })

    const regularBookings = activeBookings.filter(b => !isAbono(b))
    const abonosCount = activeBookings.filter(b => isAbono(b)).length

    const confirmedCount = activeBookings.filter(b => isConfirmed(b.status)).length
    const pendingCount = activeBookings.filter(b => isPending(b.status)).length

    const totalIncome = regularBookings.reduce((acc, b) => acc + (b.total_amount_ars || 0), 0)
    const depositsCollected = regularBookings.reduce((acc, b) => acc + (b.deposit_amount_ars || b.total_paid || 0), 0)
    const pendingToCollect = Math.max(0, totalIncome - depositsCollected)

    const activeCourtsCount = courts.filter(c => c.is_active).length || courts.length || 1
    // Estimación de slots diarios disponibles (aprox 10 turnos por cancha en horario operativo)
    const estimatedDailyCapacity = Math.max(1, activeCourtsCount * 10)
    const occupancyRate = Math.min(100, Math.round((activeBookings.length / estimatedDailyCapacity) * 100))

    const hasMissingPriceRules = priceRules.length === 0
    const hasPendingPayments = pendingCount > 0

    return {
      activeCount: activeBookings.length,
      confirmedCount,
      pendingCount,
      abonosCount,
      totalIncome,
      depositsCollected,
      pendingToCollect,
      activeCourtsCount,
      occupancyRate,
      hasMissingPriceRules,
      hasPendingPayments
    }
  }, [bookings, courts, priceRules])

  // Formato legible de fecha para el resumen
  const dateFormatted = useMemo(() => {
    try {
      const [year, month, day] = dateIso.split('-').map(Number)
      const d = new Date(year, month - 1, day)
      return d.toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      })
    } catch {
      return dateIso
    }
  }, [dateIso])

  return (
    <div className="space-y-2">
      {/* Alerta de configuración rápida si no hay precios */}
      {stats.hasMissingPriceRules && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              <strong>Atención:</strong> Aún no cargaste reglas de precios para tus canchas. Los jugadores no verán tarifas en la web pública.
            </span>
          </div>
          <Link
            href="/dashboard/precios"
            className="font-bold underline hover:text-amber-200 transition-colors shrink-0 ml-3"
          >
            Cargar Reglas &rarr;
          </Link>
        </div>
      )}

      {/* Resumen Diario: Modo Compacto de Recepción vs Modo Detallado */}
      {isCollapsed ? (
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2 rounded-2xl bg-white dark:bg-[#070b14]/90 border border-slate-200/90 dark:border-slate-800/80 shadow-xs transition-all duration-200">
          <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs">
            {/* Turnos */}
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-violet-500 shadow-xs" />
              <span className="font-bold text-slate-900 dark:text-white font-mono">
                {stats.activeCount}
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                turnos ({stats.confirmedCount} confirmados{stats.pendingCount > 0 ? `, ${stats.pendingCount} pend.` : ''})
              </span>
            </div>

            {/* Ocupación */}
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shadow-xs" />
              <span className="font-bold text-slate-900 dark:text-white font-mono">
                {stats.occupancyRate}%
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                ocupación ({stats.activeCourtsCount} {stats.activeCourtsCount === 1 ? 'cancha' : 'canchas'})
              </span>
            </div>

            {/* Previsto */}
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs" />
              <span className="font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                {formatARS(stats.totalIncome)}
              </span>
              <span className="text-slate-500 dark:text-slate-400 hidden md:inline">
                previsto (Señas: <strong className="text-slate-800 dark:text-slate-200 font-mono">{formatARS(stats.depositsCollected)}</strong> / Caja: <strong className="text-amber-700 dark:text-amber-400 font-mono">{formatARS(stats.pendingToCollect)}</strong>)
              </span>
            </div>

            {/* Alerta de Señas por Validar en Ticker */}
            {stats.pendingCount > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>{stats.pendingCount} por validar</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/dashboard/cobros"
              className="hidden sm:inline-flex px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-semibold transition-colors"
            >
              Caja
            </Link>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 text-[11px] font-bold transition-colors cursor-pointer"
              title="Expandir las 4 tarjetas de métricas diarias"
            >
              <span>Ver métricas</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Lo de hoy • Panel de Telemetría
            </span>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-semibold transition-colors cursor-pointer border border-slate-200/80 dark:border-slate-700/60"
              title="Minimizar métricas para ganar 140px de espacio vertical en la grilla de turnos"
            >
              <span>Minimizar ticker</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* Grid de 4 Cards de Resumen "Lo de hoy" */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Turnos de Hoy */}
        <Card className="bg-white dark:bg-[#070b14]/90 border-slate-200/90 dark:border-slate-800/80 shadow-xs hover:shadow-md hover:border-violet-500/30 hover:-translate-y-0.5 transition-all duration-200 p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-200/80 dark:border-violet-500/30 flex items-center justify-center shrink-0">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Turnos de Hoy
                </span>
              </div>
              <Badge variant="outline" className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 px-2 py-0.5">
                {dateFormatted.split(',')[0]}
              </Badge>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight font-mono">
                {stats.activeCount}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                reservas agendadas
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {stats.confirmedCount} confirmadas
            </span>
            {stats.pendingCount > 0 ? (
              <span className="text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {stats.pendingCount} pendientes
              </span>
            ) : (
              <span className="text-slate-400 dark:text-slate-500">0 pendientes</span>
            )}
          </div>
        </Card>

        {/* Card 2: Ocupación Estimada */}
        <Card className="bg-white dark:bg-[#070b14]/90 border-slate-200/90 dark:border-slate-800/80 shadow-xs hover:shadow-md hover:border-sky-500/30 hover:-translate-y-0.5 transition-all duration-200 p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-200/80 dark:border-sky-500/30 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Ocupación
                </span>
              </div>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {stats.activeCourtsCount} {stats.activeCourtsCount === 1 ? 'cancha' : 'canchas'}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight font-mono">
                {stats.occupancyRate}%
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                capacidad diaria
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-2">
            <div className="h-1.5 flex-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-linear-to-r from-sky-500 to-emerald-500 rounded-full transition-all duration-700"
                style={{ width: `${stats.occupancyRate}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              {stats.occupancyRate >= 70 ? 'Alta demanda' : stats.occupancyRate >= 30 ? 'Demanda media' : 'Baja demanda'}
            </span>
          </div>
        </Card>

        {/* Card 3: Ingreso Estimado Hoy */}
        <Card className="bg-white dark:bg-[#070b14]/90 border-slate-200/90 dark:border-slate-800/80 shadow-xs hover:shadow-md hover:border-emerald-500/30 hover:-translate-y-0.5 transition-all duration-200 p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-500/30 flex items-center justify-center shrink-0">
                  <DollarSign className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Ingreso Previsto Hoy
                </span>
              </div>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-500/20">
                Canchas
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-400 tracking-tight font-mono">
                {formatARS(stats.totalIncome)}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] flex-wrap gap-1">
            <span className="text-slate-600 dark:text-slate-400">
              Señas: <strong className="text-slate-900 dark:text-white font-mono">{formatARS(stats.depositsCollected)}</strong>
            </span>
            <span className="text-slate-600 dark:text-slate-400">
              Caja resto: <strong className="text-amber-700 dark:text-amber-400 font-mono">{formatARS(stats.pendingToCollect)}</strong>
            </span>
            {stats.abonosCount > 0 && (
              <span className="text-purple-700 dark:text-purple-400 font-semibold w-full text-[10px] text-right">
                +{stats.abonosCount} abono(s) mensual(es) al día
              </span>
            )}
          </div>
        </Card>

        {/* Card 4: Acciones & Atajos Rápidos */}
        <Card className="bg-white dark:bg-[#070b14]/90 border-slate-200/90 dark:border-slate-800/80 shadow-xs hover:shadow-md hover:border-amber-500/30 hover:-translate-y-0.5 transition-all duration-200 p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-200/80 dark:border-amber-500/30 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Control Rápido
                </span>
              </div>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                EN VIVO
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 font-medium">
              {stats.hasPendingPayments
                ? `${stats.pendingCount} cobro(s) a verificar en mostrador o MP.`
                : 'Turnos y estados sincronizados al instante.'}
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-2">
            <Link
              href="/dashboard/cobros"
              className="flex-1 text-center py-1.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-bold border border-slate-200/80 dark:border-slate-700 transition-colors"
            >
              Caja y Cobros
            </Link>
            <Link
              href="/dashboard/metricas"
              className="flex-1 text-center py-1.5 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-600/20 dark:hover:bg-emerald-600/30 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold transition-colors border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center gap-1"
            >
              <span>Métricas</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )}
</div>
)
}
