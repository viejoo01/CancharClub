'use client'

import { useState } from 'react'
import { 
  Plus, 
  Sparkles, 
  Loader2, 
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { SportType, SlotDuration, CourtSurface } from '@/types/database'

export interface CourtPreset {
  name: string
  sport: SportType
  slot_duration: SlotDuration
  surface: CourtSurface
  has_lighting: boolean
  is_indoor: boolean
  description: string
  tag: string
}

const DEFAULT_PRESETS: CourtPreset[] = [
  {
    name: 'Cancha 1 (Pádel Cristal)',
    sport: 'PADEL',
    slot_duration: 'MIN_90',
    surface: 'CRISTAL',
    has_lighting: true,
    is_indoor: false,
    description: 'Cristal panorámico • Turnos 90 min • Luces LED',
    tag: 'Más Popular',
  },
  {
    name: 'Cancha 1 (Fútbol 5)',
    sport: 'FUTBOL5',
    slot_duration: 'MIN_60',
    surface: 'CESPED_SINTETICO',
    has_lighting: true,
    is_indoor: false,
    description: 'Césped sintético • Turnos 60 min • Luces LED',
    tag: 'Fútbol Rápido',
  },
  {
    name: 'Cancha 1 (Tenis Polvo)',
    sport: 'TENIS',
    slot_duration: 'MIN_90',
    surface: 'POLVO_LADRILLO',
    has_lighting: true,
    is_indoor: false,
    description: 'Polvo de ladrillo • Turnos 90 min • Luces LED',
    tag: 'Tenis Club',
  },
  {
    name: 'Cancha 1 (Fútbol 7)',
    sport: 'FUTBOL7',
    slot_duration: 'MIN_60',
    surface: 'CESPED_SINTETICO',
    has_lighting: true,
    is_indoor: false,
    description: 'Césped sintético • Turnos 60 min • Luces LED',
    tag: 'Competitivo',
  },
]

interface EmptyCourtsStateProps {
  onAddCourt: () => void
  onQuickPreset?: (preset: CourtPreset) => Promise<void> | void
  clubSlug?: string
  isCreating?: boolean
}

export function EmptyCourtsState({
  onAddCourt,
  onQuickPreset,
  clubSlug,
  isCreating = false,
}: EmptyCourtsStateProps) {
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number | null>(null)

  const handlePresetClick = async (preset: CourtPreset, index: number) => {
    if (!onQuickPreset || isCreating) return
    setSelectedPresetIndex(index)
    try {
      await onQuickPreset(preset)
    } finally {
      setSelectedPresetIndex(null)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-b from-slate-900/95 via-[#0B0F19]/95 to-slate-950 p-6 sm:p-10 shadow-2xl shadow-emerald-950/30 backdrop-blur-xl text-center space-y-8 animate-in fade-in-50 zoom-in-95 duration-200">
      {/* Luces de fondo ambientales */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-10 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-10 w-60 h-60 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header con Bienvenida y Badge */}
      <div className="relative z-10 max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>¡Bienvenido a CancharClub! Tu club ya está registrado</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Configurá la primera cancha de tu complejo
        </h2>

        <p className="text-sm text-slate-300 leading-relaxed max-w-xl mx-auto">
          Para activar la <strong>grilla diaria de turnos</strong>, el control de caja y tu <strong>portal público de reservas online</strong>, cargá tu primera cancha o elegí una plantilla rápida.
        </p>
      </div>

      {/* Blueprint Visual de Cancha con Estilo Stadium Scoreboard */}
      <div className="relative z-10 max-w-2xl mx-auto">
        <div className="relative rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 via-slate-900/90 to-[#0A101D] p-5 overflow-hidden shadow-inner group">
          {/* Gráfico SVG de Pista Táctica */}
          <svg
            className="w-full h-36 sm:h-44 opacity-80 transition-opacity duration-300 group-hover:opacity-100"
            viewBox="0 0 500 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="blueprintPitch" x1="0" y1="0" x2="500" y2="200" gradientUnits="userSpaceOnUse">
                <stop stopColor="#064e3b" stopOpacity="0.4" />
                <stop offset="0.5" stopColor="#065f46" stopOpacity="0.2" />
                <stop offset="1" stopColor="#022c22" stopOpacity="0.5" />
              </linearGradient>
              <linearGradient id="lineGlow" x1="0" y1="0" x2="500" y2="0" gradientUnits="userSpaceOnUse">
                <stop stopColor="#10b981" stopOpacity="0.8" />
                <stop offset="0.5" stopColor="#34d399" stopOpacity="0.9" />
                <stop offset="1" stopColor="#10b981" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Césped / Superficie */}
            <rect x="10" y="10" width="480" height="180" rx="14" fill="url(#blueprintPitch)" stroke="url(#lineGlow)" strokeWidth="2" strokeDasharray="6 3" />

            {/* Líneas tácticas de juego */}
            {/* Línea media */}
            <line x1="250" y1="10" x2="250" y2="190" stroke="#34d399" strokeWidth="2" strokeOpacity="0.7" />

            {/* Red Central */}
            <line x1="248" y1="10" x2="248" y2="190" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.6" strokeDasharray="3 3" />
            <line x1="252" y1="10" x2="252" y2="190" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.6" strokeDasharray="3 3" />

            {/* Círculo / Área central */}
            <circle cx="250" cy="100" r="32" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.6" />
            <circle cx="250" cy="100" r="3" fill="#34d399" />

            {/* Áreas laterales (Pádel / Fútbol) */}
            <rect x="25" y="30" width="90" height="140" rx="6" stroke="#10b981" strokeWidth="1.2" strokeOpacity="0.5" fill="rgba(16, 185, 129, 0.05)" />
            <rect x="385" y="30" width="90" height="140" rx="6" stroke="#10b981" strokeWidth="1.2" strokeOpacity="0.5" fill="rgba(16, 185, 129, 0.05)" />

            {/* Líneas de saque de pádel / tenis */}
            <line x1="160" y1="30" x2="160" y2="170" stroke="#34d399" strokeWidth="1" strokeOpacity="0.4" />
            <line x1="340" y1="30" x2="340" y2="170" stroke="#34d399" strokeWidth="1" strokeOpacity="0.4" />
            <line x1="160" y1="100" x2="248" y2="100" stroke="#34d399" strokeWidth="1" strokeOpacity="0.4" />
            <line x1="252" y1="100" x2="340" y2="100" stroke="#34d399" strokeWidth="1" strokeOpacity="0.4" />

            {/* Torres de iluminación LED en las 4 esquinas */}
            <circle cx="20" cy="20" r="6" fill="#34d399" fillOpacity="0.3" stroke="#10b981" strokeWidth="1.5" />
            <circle cx="20" cy="20" r="2.5" fill="#ffffff" />
            <circle cx="480" cy="20" r="6" fill="#34d399" fillOpacity="0.3" stroke="#10b981" strokeWidth="1.5" />
            <circle cx="480" cy="20" r="2.5" fill="#ffffff" />
            <circle cx="20" cy="180" r="6" fill="#34d399" fillOpacity="0.3" stroke="#10b981" strokeWidth="1.5" />
            <circle cx="20" cy="180" r="2.5" fill="#ffffff" />
            <circle cx="480" cy="180" r="6" fill="#34d399" fillOpacity="0.3" stroke="#10b981" strokeWidth="1.5" />
            <circle cx="480" cy="180" r="2.5" fill="#ffffff" />
          </svg>

          {/* Badges superpuestos sobre el blueprint */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <div className="px-4 py-2 rounded-xl bg-slate-950/85 border border-emerald-500/40 shadow-xl backdrop-blur-md flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-xs font-bold text-white tracking-wide">
                Espacio listo para asignar tu primera cancha
              </span>
            </div>
            <div className="mt-2 text-[11px] text-emerald-300/80 font-mono flex items-center gap-2">
              <span>Fútbol</span>
              <span>•</span>
              <span>Pádel</span>
              <span>•</span>
              <span>Tenis</span>
              <span>•</span>
              <span>Básquet</span>
            </div>
          </div>
        </div>
      </div>

      {/* Plantillas Rápidas con 1 Clic */}
      {onQuickPreset && (
        <div className="relative z-10 max-w-4xl mx-auto space-y-3">
          <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Plantillas Rápidas (Creá tu cancha en 1 clic)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {DEFAULT_PRESETS.map((preset, index) => {
              const isSelected = selectedPresetIndex === index && isCreating
              return (
                <div
                  key={preset.name}
                  className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-left hover:border-emerald-500/40 hover:bg-slate-900 transition-all shadow-xs flex flex-col justify-between space-y-3 group"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[9px] px-1.5 py-0 font-bold">
                        {preset.tag}
                      </Badge>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {preset.slot_duration === 'MIN_90' ? '90 min' : '60 min'}
                      </span>
                    </div>
                    <div className="font-bold text-sm text-white group-hover:text-emerald-400 transition-colors">
                      {preset.name}
                    </div>
                    <div className="text-[11px] text-slate-400 leading-snug">
                      {preset.description}
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    disabled={isCreating}
                    onClick={() => handlePresetClick(preset, index)}
                    className="w-full h-8 text-xs font-bold rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {isSelected ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Creando...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Cargar Esta</span>
                      </>
                    )}
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Botón Principal Manual */}
      <div className="relative z-10 flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <Button
          type="button"
          onClick={onAddCourt}
          disabled={isCreating}
          className="w-full sm:w-auto h-12 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-sm shadow-xl shadow-emerald-950/50 cursor-pointer transition-all active:scale-[0.98] border border-emerald-400/30 flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Crear Cancha Personalizada</span>
        </Button>
      </div>

      {/* Roadmap de 3 Pasos para Puesta en Marcha */}
      <div className="relative z-10 max-w-3xl mx-auto pt-4 border-t border-slate-800/80">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3 text-center">
          Circuito de Puesta en Marcha del Club
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
          {/* Paso 1: Canchas */}
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">
                1
              </span>
              <span className="text-xs font-bold text-emerald-300">Cargar Canchas</span>
              <Badge className="ml-auto bg-emerald-500/20 text-emerald-300 border-0 text-[9px] px-1.5 py-0 font-bold">
                Paso Actual
              </Badge>
            </div>
            <p className="text-[11px] text-slate-300 pl-7">
              Definí deporte, tipo de superficie, duración de turnos e iluminación.
            </p>
          </div>

          {/* Paso 2: Horarios */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 font-bold text-xs flex items-center justify-center shrink-0">
                2
              </span>
              <span className="text-xs font-bold text-slate-300">Horarios y Precios</span>
            </div>
            <p className="text-[11px] text-slate-400 pl-7">
              Configurá franjas de apertura, tarifas diurnas/nocturnas y seña mínima.
            </p>
          </div>

          {/* Paso 3: Portal Público */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 font-bold text-xs flex items-center justify-center shrink-0">
                3
              </span>
              <span className="text-xs font-bold text-slate-300">Reservas Online</span>
            </div>
            <p className="text-[11px] text-slate-400 pl-7 truncate">
              {clubSlug ? `cancharclub.com.ar/club/${clubSlug}` : 'Portal público con cobros automáticos'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
