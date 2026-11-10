'use client'

import React from 'react'
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  CloudRain 
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface CalendarHeaderToolbarProps {
  formattedDateTitle: string
  onToday: () => void
  onPrevDay: () => void
  onNextDay: () => void
  onScrollToNow: () => void
  sports: string[]
  selectedSport: string
  onSelectSport: (sport: string) => void
  schedule: { opening_time: string; closing_time: string }
  onOpenScheduleModal: () => void
  onOpenRainModal: () => void
  hasCourts: boolean
  gridDensity: 'normal' | 'compact'
  onChangeGridDensity: (density: 'normal' | 'compact') => void
  getSportColorDot: (sport: string) => string
  formatSportName: (sport: string) => string
}

/**
 * Barra de Control Unificada y Minimalista para la Grilla de Turnos
 * estilo Linear / Apple Calendar.
 */
export const CalendarHeaderToolbar = React.memo(function CalendarHeaderToolbar({
  formattedDateTitle,
  onToday,
  onPrevDay,
  onNextDay,
  onScrollToNow,
  sports,
  selectedSport,
  onSelectSport,
  schedule,
  onOpenScheduleModal,
  onOpenRainModal,
  hasCourts,
  gridDensity,
  onChangeGridDensity,
  getSportColorDot,
  formatSportName,
}: CalendarHeaderToolbarProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 px-3.5 py-2 rounded-2xl bg-white/90 dark:bg-[#0E1526]/90 border border-slate-200/80 dark:border-white/[0.08] backdrop-blur-md shadow-2xs shrink-0">
      {/* Navegación de Fecha con Segmented Control */}
      <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onToday} 
          className="text-xs h-8 px-3 rounded-xl bg-slate-100/80 dark:bg-white/[0.05] border-slate-200/80 dark:border-white/[0.08] text-slate-800 dark:text-slate-100 hover:bg-slate-200/80 dark:hover:bg-white/[0.1] font-semibold cursor-pointer transition-all shadow-2xs"
        >
          Hoy
        </Button>
        
        <div className="flex items-center bg-slate-100/70 dark:bg-white/[0.04] rounded-xl border border-slate-200/80 dark:border-white/[0.08] p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={onPrevDay}
            className="p-1.5 hover:bg-white dark:hover:bg-white/[0.08] rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all cursor-pointer"
            aria-label="Día anterior"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <div className="px-3 py-1 text-xs font-bold text-slate-900 dark:text-white capitalize flex items-center gap-2 select-none">
            <CalendarIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="tracking-tight">{formattedDateTitle}</span>
          </div>
          <button
            type="button"
            onClick={onNextDay}
            className="p-1.5 hover:bg-white dark:hover:bg-white/[0.08] rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all cursor-pointer"
            aria-label="Día siguiente"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onScrollToNow}
          className="text-xs h-8 px-2.5 rounded-xl text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10 gap-1.5 cursor-pointer font-medium transition-colors"
          title="Ir a hora actual"
        >
          <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="hidden sm:inline">Ahora</span>
        </Button>
      </div>

      {/* Filtros por Deporte - Segmented Pills */}
      <div className="flex items-center gap-1 bg-slate-100/70 dark:bg-white/[0.04] p-1 rounded-xl border border-slate-200/80 dark:border-white/[0.08] overflow-x-auto no-scrollbar shadow-2xs">
        <button
          type="button"
          onClick={() => onSelectSport('ALL')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 ${
            selectedSport === 'ALL'
              ? 'bg-emerald-600 text-white shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/[0.05]'
          }`}
        >
          Todas
        </button>
        {sports.map((sp) => (
          <button
            type="button"
            key={sp}
            onClick={() => onSelectSport(sp)}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 inline-flex items-center gap-1.5 ${
              selectedSport === sp
                ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/[0.05]'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${getSportColorDot(sp)}`} />
            <span>{formatSportName(sp)}</span>
          </button>
        ))}
      </div>

      {/* Acciones Secundarias Limpias */}
      <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenScheduleModal}
          className="text-xs h-8 px-2.5 rounded-xl border border-slate-200/70 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.03] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.08] gap-1.5 cursor-pointer font-medium transition-all"
          title="Configurar horario de apertura y cierre"
        >
          <Clock className="w-3 h-3 text-slate-400" />
          <span className="hidden md:inline font-mono text-[11px]">{schedule.opening_time} - {schedule.closing_time} hs</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenRainModal}
          className="text-xs h-8 px-2.5 rounded-xl border border-sky-200/70 dark:border-sky-500/20 bg-sky-50/50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-100/70 dark:hover:bg-sky-500/20 gap-1.5 cursor-pointer font-medium transition-all"
          title="Protocolo Lluvia"
        >
          <CloudRain className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          <span className="hidden md:inline">Lluvia</span>
        </Button>

        {hasCourts && (
          <div className="flex items-center gap-0.5 bg-slate-100/70 dark:bg-white/[0.04] p-0.5 rounded-xl border border-slate-200/80 dark:border-white/[0.08] shadow-2xs">
            <button
              type="button"
              onClick={() => onChangeGridDensity('compact')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                gridDensity === 'compact'
                  ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
              title="Modo Compacto"
            >
              Compacto
            </button>
            <button
              type="button"
              onClick={() => onChangeGridDensity('normal')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                gridDensity === 'normal'
                  ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
              title="Modo Cómodo"
            >
              Cómodo
            </button>
          </div>
        )}
      </div>
    </div>
  )
})
