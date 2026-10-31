'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { CalendarGrid, type CalendarBooking } from '@/components/dashboard/calendar-grid'
import { DashboardDailySummary } from '@/components/dashboard/dashboard-daily-summary'
import { ExecutiveCockpitPanel } from '@/components/dashboard/executive-cockpit-panel'
import type { QuickBookingPriceRule } from '@/components/dashboard/quick-booking-modal'
import type { DailyCashReport } from '@/actions/analytics.actions'
import type { CourtOrder } from '@/actions/cantina.actions'
import type { ClubScheduleConfig } from '@/lib/time-slots'
import { 
  Columns3, 
  Maximize2 
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'

interface CourtItem {
  id: string
  name: string
  sport: string
  slot_duration: 'MIN_60' | 'MIN_90' | 'MIN_120'
  is_active: boolean
  created_at?: string | null
}

interface ExecutiveSplitDashboardProps {
  tenantId: string
  tenantSlug: string
  tenantName: string
  courts: CourtItem[]
  hasBankConfigured: boolean
  initialBookings: CalendarBooking[]
  initialDate: string
  initialVenueId: string
  initialSchedule?: ClubScheduleConfig
  priceRules: QuickBookingPriceRule[]
  cashReport: DailyCashReport | null
  dailyOrders?: CourtOrder[]
}

export function ExecutiveSplitDashboard({
  tenantId,
  tenantSlug,
  tenantName,
  courts,
  hasBankConfigured,
  initialBookings,
  initialDate,
  initialVenueId,
  initialSchedule,
  priceRules,
  cashReport,
  dailyOrders = []
}: ExecutiveSplitDashboardProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const bookings = initialBookings
  const selectedDate = initialDate

  // Estado del Panel Ejecutivo (por defecto abierto en pantallas grandes)
  const [isExecutivePanelOpen, setIsExecutivePanelOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    try {
      const saved = localStorage.getItem('canchar_executive_panel_open')
      return saved !== null ? saved === 'true' : true
    } catch {
      return true
    }
  })

  // Vista activa en pantallas pequeñas (Mobile / Tablet)
  const [mobileActiveTab, setMobileActiveTab] = useState<'GRID' | 'COCKPIT'>('GRID')

  const toggleExecutivePanel = useCallback(() => {
    setIsExecutivePanelOpen((prev) => {
      const next = !prev
      try {
        localStorage.setItem('canchar_executive_panel_open', String(next))
      } catch {
        // Ignorar fallo de almacenamiento
      }
      return next
    })
  }, [])

  // Listener para atajo de teclado E (Toggle Panel Ejecutivo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isInput =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement)?.isContentEditable
      if (isInput) return

      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault()
        toggleExecutivePanel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleExecutivePanel])

  // Listener para evento custom de alternar panel
  useEffect(() => {
    const handleCustomToggle = () => toggleExecutivePanel()
    window.addEventListener('canchar-toggle-executive-panel', handleCustomToggle)
    return () => window.removeEventListener('canchar-toggle-executive-panel', handleCustomToggle)
  }, [toggleExecutivePanel])

  const pendingValidationsCount = bookings.filter((b) => {
    return (
      (String(b.status) === 'PENDING_DEPOSIT' ||
       String(b.status) === 'PENDING' ||
       (b.origin === 'ONLINE_PORTAL' &&
        b.internal_notes?.toUpperCase().includes('TRANSFER') &&
        !b.internal_notes?.includes('Seña verificada y aprobada'))) &&
      !b.recurring_slot_id
    )
  }).length

  const handleRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh()
    })
  }, [router])

  return (
    <div className="flex flex-col h-full space-y-3.5 w-full">
      {/* Barra de Título Superior con Selector de Modo de Pantalla */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Panel de Control
            </h2>
            <Badge 
              variant="outline" 
              className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 px-2 py-0.5"
            >
              Executive Split
            </Badge>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Supervisión simultánea de canchas, caja en mostrador y validación de transferencias en vivo.
          </p>
        </div>

        {/* Controles de Vista de Pantalla para Encargados */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Tabs visibles solo en mobile/tablet */}
          <div className="flex xl:hidden items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setMobileActiveTab('GRID')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                mobileActiveTab === 'GRID'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Grilla Canchas
            </button>
            <button
              type="button"
              onClick={() => setMobileActiveTab('COCKPIT')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                mobileActiveTab === 'COCKPIT'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Caja & Señas</span>
              {pendingValidationsCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-bold">
                  {pendingValidationsCount}
                </span>
              )}
            </button>
          </div>

          {/* Toggle Modo Split 70/30 en Desktop */}
          <div className="hidden xl:flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => !isExecutivePanelOpen && toggleExecutivePanel()}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                isExecutivePanelOpen
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-900'
              }`}
              title="Modo Executive Split: Grilla 70% + Feed Lateral Financiero 30% (Atajo: Tecla E)"
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Executive Split 70/30</span>
              <kbd className="px-1 py-0.2 rounded bg-black/20 text-white/90 text-[9px] font-mono">E</kbd>
            </button>

            <button
              type="button"
              onClick={() => isExecutivePanelOpen && toggleExecutivePanel()}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                !isExecutivePanelOpen
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-900'
              }`}
              title="Maximizar a Pantalla Completa: 100% de ancho para las canchas"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Pantalla Completa</span>
            </button>
          </div>
        </div>
      </div>

      {/* Ticker Diario de Telemetría Superior */}
      <DashboardDailySummary
        bookings={bookings}
        courts={courts}
        priceRules={priceRules}
        dateIso={selectedDate}
      />

      {/* Layout Principal Asimétrico (Split 70/30) */}
      <div className="flex flex-col xl:flex-row items-start gap-3.5 w-full flex-1 min-h-0">
        {/* Columna Izquierda: Grilla Interactiva de Canchas (70% - 75% o 100%) */}
        <div 
          className={`w-full min-w-0 transition-all duration-300 ${
            mobileActiveTab === 'COCKPIT' ? 'hidden xl:block' : 'block'
          } ${
            isExecutivePanelOpen ? 'flex-1' : 'w-full'
          }`}
        >
          <CalendarGrid
            tenantId={tenantId}
            courts={courts}
            initialBookings={bookings}
            initialDate={selectedDate}
            initialVenueId={initialVenueId}
            initialSchedule={initialSchedule}
            priceRules={priceRules}
            onRefresh={handleRefresh}
          />
        </div>

        {/* Columna Derecha: Panel Ejecutivo y Financiero (25% - 30%) */}
        <div className={`w-full xl:w-auto shrink-0 ${mobileActiveTab === 'GRID' ? 'hidden xl:block' : 'block'}`}>
          <ExecutiveCockpitPanel
            bookings={bookings}
            courts={courts}
            cashReport={cashReport}
            dailyOrders={dailyOrders}
            tenantId={tenantId}
            dateIso={selectedDate}
            isOpen={isExecutivePanelOpen}
            onToggle={toggleExecutivePanel}
            onRefresh={handleRefresh}
          />
        </div>
      </div>
    </div>
  )
}
