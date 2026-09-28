'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { 
  CalendarDays, 
  DollarSign, 
  TrendingUp, 
  AlertCircle, 
  ArrowUpRight,
  Sparkles,
  CreditCard
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatARS } from '@/lib/utils'
import type { CalendarBooking } from '@/components/dashboard/calendar-grid'
import type { QuickBookingPriceRule } from '@/components/dashboard/quick-booking-modal'

interface CourtItem {
  id: string
  name: string
  sport: string
  slot_duration: 'MIN_60' | 'MIN_90' | 'MIN_120'
  is_active: boolean
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
  const stats = useMemo(() => {
    const isCancelled = (status: string) => 
      status === 'CANCELLED_USER' || status === 'CANCELLED_CLUB' || status === 'RAIN_CANCELLED' || status === 'CANCELLED'

    const activeBookings = bookings.filter(b => !isCancelled(b.status))
    
    const isConfirmed = (status: string) => 
      status === 'CONFIRMED' || status === 'DEPOSIT_PAID' || status === 'PARTIAL_PAID' || status === 'FULLY_PAID' || status === 'COMPLETED'
    
    const isPending = (status: string) => 
      status === 'PENDING_DEPOSIT' || status === 'SLOT_LOCKED' || status === 'PENDING'

    const confirmedCount = activeBookings.filter(b => isConfirmed(b.status)).length
    const pendingCount = activeBookings.filter(b => isPending(b.status)).length

    const totalIncome = activeBookings.reduce((acc, b) => acc + (b.total_amount_ars || 0), 0)
    const depositsCollected = activeBookings.reduce((acc, b) => acc + (b.deposit_amount_ars || b.total_paid || 0), 0)
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

      {/* Grid de 4 Cards de Resumen "Lo de hoy" */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Turnos de Hoy */}
        <Card className="bg-slate-900/80 border-slate-800/80 backdrop-blur-md p-3.5 rounded-2xl relative overflow-hidden flex flex-col justify-between hover:border-slate-700/80 transition-all">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4 text-emerald-400" />
                Turnos de Hoy
              </span>
              <Badge variant="outline" className="text-[10px] uppercase font-bold text-slate-400 border-slate-700">
                {dateFormatted.split(',')[0]}
              </Badge>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-white tracking-tight">
                {stats.activeCount}
              </span>
              <span className="text-xs text-slate-400">
                reservas agendadas
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
            <span className="text-emerald-400 font-medium">
              ✓ {stats.confirmedCount} confirmadas
            </span>
            {stats.pendingCount > 0 ? (
              <span className="text-amber-400 font-medium">
                ⏳ {stats.pendingCount} pendientes
              </span>
            ) : (
              <span className="text-slate-500">0 pendientes</span>
            )}
          </div>
        </Card>

        {/* Card 2: Ocupación Estimada */}
        <Card className="bg-slate-900/80 border-slate-800/80 backdrop-blur-md p-3.5 rounded-2xl relative overflow-hidden flex flex-col justify-between hover:border-slate-700/80 transition-all">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-teal-400" />
                Ocupación
              </span>
              <span className="text-[11px] text-slate-500">
                {stats.activeCourtsCount} {stats.activeCourtsCount === 1 ? 'cancha activa' : 'canchas activas'}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-white tracking-tight">
                {stats.occupancyRate}%
              </span>
              <span className="text-xs text-slate-400">
                capacidad diaria
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center gap-2">
            <div className="h-1.5 flex-1 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div 
                className="h-full bg-linear-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700"
                style={{ width: `${stats.occupancyRate}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {stats.occupancyRate >= 70 ? 'Alta demanda' : stats.occupancyRate >= 30 ? 'Demanda media' : 'Baja demanda'}
            </span>
          </div>
        </Card>

        {/* Card 3: Ingreso Estimado Hoy */}
        <Card className="bg-slate-900/80 border-slate-800/80 backdrop-blur-md p-3.5 rounded-2xl relative overflow-hidden flex flex-col justify-between hover:border-slate-700/80 transition-all">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                Ingreso Previsto Hoy
              </span>
              <span className="text-[11px] text-emerald-400 font-semibold flex items-center">
                <CreditCard className="w-3 h-3 mr-0.5" />
                Canchas
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-400 tracking-tight font-mono">
                {formatARS(stats.totalIncome)}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">
              Señas: <strong className="text-white font-mono">{formatARS(stats.depositsCollected)}</strong>
            </span>
            <span className="text-slate-400">
              Caja resto: <strong className="text-amber-400 font-mono">{formatARS(stats.pendingToCollect)}</strong>
            </span>
          </div>
        </Card>

        {/* Card 4: Acciones & Atajos Rápidos */}
        <Card className="bg-slate-900/80 border-slate-800/80 backdrop-blur-md p-3.5 rounded-2xl relative overflow-hidden flex flex-col justify-between hover:border-slate-700/80 transition-all">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Control Rápido
              </span>
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/20">
                EN VIVO
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-2 font-medium">
              {stats.hasPendingPayments
                ? `${stats.pendingCount} cobro(s) a verificar en mostrador o MP.`
                : 'Turnos y estados sincronizados al instante.'}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center gap-2">
            <Link
              href="/dashboard/cobros"
              className="flex-1 text-center py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold transition-colors"
            >
              Caja y Cobros
            </Link>
            <Link
              href="/dashboard/metricas"
              className="flex-1 text-center py-1 px-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-[11px] font-bold transition-colors border border-emerald-500/30 flex items-center justify-center gap-1"
            >
              <span>Métricas</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
