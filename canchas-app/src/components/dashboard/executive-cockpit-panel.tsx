'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { 
  Wallet, 
  CreditCard, 
  Banknote, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ArrowUpRight, 
  Coffee, 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  Loader2 
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatARS, formatTime, isAbonoBooking } from '@/lib/utils'
import type { CalendarBooking } from '@/components/dashboard/calendar-grid'
import type { DailyCashReport } from '@/actions/analytics.actions'
import type { CourtOrder } from '@/actions/cantina.actions'
import { confirmBookingDeposit } from '@/actions/booking.actions'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface CourtItem {
  id: string
  name: string
  sport: string
}

interface ExecutiveCockpitPanelProps {
  bookings: CalendarBooking[]
  courts?: CourtItem[]
  cashReport: DailyCashReport | null
  dailyOrders?: CourtOrder[]
  tenantId?: string
  dateIso?: string
  isOpen: boolean
  onToggle: () => void
  onRefresh?: () => void
}

export function ExecutiveCockpitPanel({
  bookings = [],
  courts = [],
  cashReport,
  dailyOrders = [],
  isOpen,
  onToggle,
  onRefresh
}: ExecutiveCockpitPanelProps) {
  const router = useRouter()
  const [approvingBookingId, setApprovingBookingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const getCourtName = (booking: CalendarBooking) => {
    if (booking.courts) {
      if (Array.isArray(booking.courts)) {
        return booking.courts[0]?.name || 'Cancha'
      }
      return booking.courts.name || 'Cancha'
    }
    const found = courts.find(c => c.id === booking.court_id)
    return found?.name || 'Cancha'
  }

  // 1. Cálculos de Caja y Saldos en vivo
  const totalRecaudadoCaja = cashReport?.totalGeneral ?? bookings.reduce((acc, b) => {
    return acc + (b.deposit_amount_ars > 0 ? b.deposit_amount_ars : 0)
  }, 0)

  const efectivoEnCaja = cashReport?.totalCash ?? 0
  const digitalMPyTransf = (cashReport?.totalTransfer ?? 0) + (cashReport?.totalMP ?? 0)
  
  // Saldo total pendiente de cobro en cancha hoy
  const saldoPendienteEnCancha = bookings.reduce((acc, b) => {
    const isAbono = isAbonoBooking({
      recurring_slot_id: b.recurring_slot_id,
      staff_notes: b.internal_notes,
    })
    if (isAbono) return acc
    return acc + (b.balance_due > 0 ? b.balance_due : 0)
  }, 0)

  // 2. Cola de Señas pendientes de validación
  const pendingValidationBookings = bookings.filter((b) => {
    const isPendingDeposit = String(b.status) === 'PENDING_DEPOSIT' || String(b.status) === 'PENDING'
    const isOnlineTransferPending = 
      b.origin === 'ONLINE_PORTAL' &&
      b.internal_notes?.toUpperCase().includes('TRANSFER') &&
      !b.internal_notes?.includes('Seña verificada y aprobada')
    const isStaffValidationNeeded = b.internal_notes?.includes('[VALIDAR TRANSFERENCIA]')

    const isAbono = isAbonoBooking({
      recurring_slot_id: b.recurring_slot_id,
      staff_notes: b.internal_notes,
    })

    return (isPendingDeposit || isOnlineTransferPending || isStaffValidationNeeded) && !isAbono
  })

  // 3. Próximos turnos de la jornada
  const upcomingBookings = [...bookings]
    .filter(b => String(b.status) !== 'cancelled')
    .sort((a, b) => (a.starts_at || '').localeCompare(b.starts_at || ''))
    .slice(0, 5)

  // 4. Cantina del día
  const cantinaTotalArs = dailyOrders.reduce((acc, o) => acc + (o.total_ars || 0), 0)
  const cantinaPendingOrders = dailyOrders.filter(o => o.status === 'PENDING' || o.status === 'PREPARING')

  // Acción de aprobación directa de seña con 1 clic
  const handleApproveDeposit = async (booking: CalendarBooking) => {
    setApprovingBookingId(booking.id)
    try {
      const res = await confirmBookingDeposit(booking.id)
      if (res.success) {
        toast.success(`Seña de ${booking.customer_name} aprobada correctamente`, {
          description: `Turno confirmado en ${getCourtName(booking)} (${formatTime(booking.starts_at)} hs).`,
        })
        startTransition(() => {
          onRefresh?.()
          router.refresh()
        })
      } else {
        toast.error('No se pudo aprobar la seña', {
          description: res.error || 'Revisá la conexión con la base de datos.',
        })
      }
    } catch {
      toast.error('Error de red al aprobar la seña')
    } finally {
      setApprovingBookingId(null)
    }
  }

  // Clic en un turno para seleccionarlo en la grilla
  const handleSelectBookingInGrid = (booking: CalendarBooking) => {
    window.dispatchEvent(
      new CustomEvent('canchar-select-booking', {
        detail: { booking, bookingId: booking.id }
      })
    )
  }

  if (!isOpen) {
    return (
      <aside 
        className="hidden xl:flex flex-col items-center justify-start py-6 px-2 w-14 bg-white dark:bg-[#070b14]/90 border-l border-slate-200/90 dark:border-slate-800/80 rounded-r-2xl shadow-lg transition-all duration-300"
        aria-label="Panel Ejecutivo Contraído"
      >
        <button
          type="button"
          onClick={onToggle}
          className="p-2.5 rounded-xl bg-slate-100 hover:bg-emerald-50 dark:bg-slate-900 dark:hover:bg-emerald-950/60 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-800 hover:border-emerald-300 transition-all cursor-pointer group shadow-xs"
          title="Abrir Panel Ejecutivo 70/30 (Atajo: Tecla E)"
        >
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        </button>

        <div className="mt-8 flex flex-col items-center gap-6">
          <div className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Panel Ejecutivo
          </div>

          {pendingValidationBookings.length > 0 && (
            <div 
              onClick={onToggle}
              className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/40 flex items-center justify-center font-bold text-xs cursor-pointer animate-bounce shadow-xs"
              title={`${pendingValidationBookings.length} señas por validar`}
            >
              {pendingValidationBookings.length}
            </div>
          )}
        </div>
      </aside>
    )
  }

  return (
    <aside 
      className="w-full xl:w-[380px] 2xl:w-[410px] shrink-0 flex flex-col gap-4 bg-white dark:bg-[#070b14]/95 border border-slate-200/90 dark:border-slate-800/80 rounded-2xl p-4 shadow-xl dark:shadow-2xl backdrop-blur-xl transition-all duration-300 overflow-y-auto max-h-[calc(100vh-140px)] custom-scrollbar"
      aria-label="Panel Ejecutivo & Financiero"
    >
      {/* Header del Panel */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
            Panel Ejecutivo
          </h3>
          <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
            EN VIVO
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg cursor-pointer"
            title="Contraer Panel a Pantalla Completa (Tecla E)"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* SECCIÓN 1: Caja y Recaudación Diaria */}
      <div className="rounded-xl p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/60 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Caja del Día
          </span>
          <Link
            href="/dashboard/caja"
            className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-0.5 group"
          >
            <span>Arqueo</span>
            <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>

        <div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight font-mono">
            {formatARS(totalRecaudadoCaja)}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Total recaudado acreditado en el club hoy
          </p>
        </div>

        {/* Desglose de ingresos */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800/60 text-xs">
          <div className="bg-white dark:bg-slate-950/80 p-2 rounded-lg border border-slate-200/60 dark:border-slate-800/60">
            <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
              <Banknote className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span>Efectivo</span>
            </div>
            <div className="text-xs font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
              {formatARS(efectivoEnCaja)}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-950/80 p-2 rounded-lg border border-slate-200/60 dark:border-slate-800/60">
            <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
              <CreditCard className="w-3 h-3 text-sky-600 dark:text-sky-400" />
              <span>MP / Banco</span>
            </div>
            <div className="text-xs font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
              {formatARS(digitalMPyTransf)}
            </div>
          </div>
        </div>

        {/* Alerta de saldo pendiente por cobrar */}
        {saldoPendienteEnCancha > 0 && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-semibold">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Restan cobrar en cancha:</span>
            </span>
            <span className="font-mono font-bold text-amber-900 dark:text-amber-200">
              {formatARS(saldoPendienteEnCancha)}
            </span>
          </div>
        )}
      </div>

      {/* SECCIÓN 2: Cola de Validación de Señas (WhatsApp / Portal) */}
      <div className="rounded-xl p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/60 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            Validación de Señas
          </span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pendingValidationBookings.length > 0 ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'}`}>
            {pendingValidationBookings.length} {pendingValidationBookings.length === 1 ? 'pendiente' : 'pendientes'}
          </span>
        </div>

        {pendingValidationBookings.length === 0 ? (
          <div className="py-4 px-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-500/20 text-center flex flex-col items-center justify-center gap-1 text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-bold">¡Sin señas pendientes!</span>
            <span className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80">Todos los turnos del día están confirmados o saldados.</span>
          </div>
        ) : (
          <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
            {pendingValidationBookings.map((b) => {
              const isApproving = approvingBookingId === b.id

              return (
                <div 
                  key={b.id}
                  className="p-2.5 rounded-xl bg-white dark:bg-slate-950/90 border border-amber-300 dark:border-amber-500/30 hover:border-amber-400 transition-all shadow-xs flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                        {b.customer_name}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{getCourtName(b)}</span>
                        <span>•</span>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{formatTime(b.starts_at)} hs</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-black text-amber-600 dark:text-amber-400 font-mono block">
                        {formatARS(b.deposit_amount_ars)}
                      </span>
                      <span className="text-[9px] uppercase font-bold text-amber-600/80 dark:text-amber-400/80">
                        Transferida
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                    <Button
                      type="button"
                      size="sm"
                      disabled={isApproving}
                      onClick={() => handleApproveDeposit(b)}
                      className="flex-1 h-7 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg cursor-pointer gap-1"
                    >
                      {isApproving ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Aprobando...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3 h-3 stroke-[2.5]" />
                          <span>Aprobar Seña</span>
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectBookingInGrid(b)}
                      className="h-7 px-2 text-[10px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                      title="Ver detalles del turno en pantalla"
                    >
                      Ver
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* SECCIÓN 3: Próximos Turnos (Check-in Express en Mostrador) */}
      <div className="rounded-xl p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/60 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            Check-in Express
          </span>
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            {upcomingBookings.length} próximos
          </span>
        </div>

        {upcomingBookings.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-2">No hay turnos registrados para hoy.</p>
        ) : (
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
            {upcomingBookings.map((b) => {
              const isFullyPaid = b.balance_due <= 0

              return (
                <div
                  key={b.id}
                  onClick={() => handleSelectBookingInGrid(b)}
                  className="p-2 rounded-lg bg-white dark:bg-slate-950/80 border border-slate-200/60 dark:border-slate-800/60 hover:border-emerald-400/50 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/20 transition-all cursor-pointer flex items-center justify-between gap-2 group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-black text-slate-900 dark:text-white">
                        {formatTime(b.starts_at)}
                      </span>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {b.customer_name}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {getCourtName(b)}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {isFullyPaid ? (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <Check className="w-2.5 h-2.5" />
                        Saldado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        Debe {formatARS(b.balance_due)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* SECCIÓN 4: Cantina & Comandas en Cancha */}
      <div className="rounded-xl p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/60 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Coffee className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            Cantina Express
          </span>
          <Link
            href="/dashboard/cantina"
            className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
          >
            <span>Ir a POS</span>
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="flex items-center justify-between bg-white dark:bg-slate-950/80 p-2 rounded-lg border border-slate-200/60 dark:border-slate-800/60">
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Ventas del día:</div>
            <div className="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">{formatARS(cantinaTotalArs)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Comandas activas:</div>
            <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{cantinaPendingOrders.length} en preparación</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
