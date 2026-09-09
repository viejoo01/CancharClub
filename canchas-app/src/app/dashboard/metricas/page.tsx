'use client'

import { useState } from 'react'
import { 
  BarChart3, 
  TrendingUp, 
  Flame, 
  Calendar, 
  Coffee, 
  DollarSign, 
  Users, 
  ShieldCheck, 
  Layers, 
  ArrowUpRight,
  Info
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatARS } from '@/lib/utils'

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const HOURS = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '19:30', '21:00', '22:30']

// Matriz de ocupación promedio (Día x Hora en %)
const OCCUPANCY_HEATMAP: number[][] = [
  // Lun: mañana baja, tarde media, noche pico
  [15, 20, 15, 30, 45, 80, 95, 90, 60],
  // Mar
  [20, 25, 20, 35, 50, 85, 98, 95, 65],
  // Mié
  [15, 30, 25, 40, 55, 90, 100, 98, 70],
  // Jue
  [25, 35, 30, 45, 60, 95, 100, 100, 75],
  // Vie: viernes tarde y noche a tope
  [30, 40, 35, 50, 75, 100, 100, 100, 90],
  // Sáb: todo el día alta demanda
  [75, 90, 85, 80, 85, 95, 100, 95, 80],
  // Dom: tarde y noche fuerte
  [60, 75, 70, 65, 75, 85, 90, 85, 50],
]

export default function MetricasPage() {
  const [selectedCell, setSelectedCell] = useState<{ day: string; hour: string; pct: number } | null>({
    day: 'Jueves',
    hour: '21:00',
    pct: 100
  })

  const getHeatmapColor = (pct: number) => {
    if (pct >= 90) return 'bg-emerald-500 text-slate-950 font-extrabold shadow-sm shadow-emerald-500/50'
    if (pct >= 70) return 'bg-emerald-600/90 text-white font-bold'
    if (pct >= 50) return 'bg-emerald-700/60 text-emerald-200 font-semibold'
    if (pct >= 30) return 'bg-emerald-900/40 text-emerald-300'
    return 'bg-slate-900/80 text-slate-500'
  }

  const courtBreakdown = [
    { name: 'Cancha 2 (Techada)', sport: 'Pádel', occupancy: 94, revenue: 1280000, color: 'bg-emerald-500' },
    { name: 'Cancha 1 (Panorámica)', sport: 'Pádel', occupancy: 88, revenue: 1150000, color: 'bg-teal-500' },
    { name: 'Fútbol 5 (Sintético)', sport: 'Fútbol 5', occupancy: 75, revenue: 912000, color: 'bg-sky-500' },
    { name: 'Cancha 3 (Blindex)', sport: 'Pádel', occupancy: 72, revenue: 810000, color: 'bg-indigo-500' },
  ]

  const totalCourtsRevenue = courtBreakdown.reduce((acc, c) => acc + c.revenue, 0)
  const cantinaRevenue = 912000
  const totalRevenue = totalCourtsRevenue + cantinaRevenue

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs tracking-wider uppercase mb-1">
          <BarChart3 className="w-4 h-4" />
          Inteligencia de Negocio & Rendimiento (Mejora 5)
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Panel de Métricas y Analítica Avanzada
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Mapa de calor de ocupación por horario, ticket promedio cruzado de canchas vs cantina y retención.
        </p>
      </div>

      {/* KPI Cards de Rendimiento Superior */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900/60 border-slate-800 p-4 rounded-2xl">
          <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
            <span>Facturación Total del Mes</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {formatARS(totalRevenue)}
          </div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1 font-semibold">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>+18.4% vs mes anterior</span>
          </div>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800 p-4 rounded-2xl">
          <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
            <span>Ticket Promedio por Turno</span>
            <TrendingUp className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {formatARS(14450)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Cancha ({formatARS(12000)}) + Cantina ({formatARS(2450)})
          </div>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800 p-4 rounded-2xl">
          <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
            <span>Ocupación Prime (18 a 00 hs)</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-amber-400 mt-1">
            96.2%
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Prácticamente sin turnos ociosos
          </div>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800 p-4 rounded-2xl">
          <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
            <span>Protección Señas (No-Shows)</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">
            {formatARS(340000)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Retenidos por cancelaciones de último momento
          </div>
        </Card>
      </div>

      {/* HEATMAP DE OCUPACIÓN */}
      <Card className="bg-slate-900/80 border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-400" />
              <CardTitle className="text-lg text-white">
                Mapa de Calor de Ocupación Semanal (Heatmap)
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-400 mt-1">
              Visualizá qué franjas horarias y días tienen mayor demanda para ajustar precios dinámicos.
            </CardDescription>
          </div>

          {selectedCell && (
            <div className="px-4 py-2 rounded-xl bg-slate-950 border border-emerald-500/30 text-xs flex items-center gap-3">
              <span className="text-slate-300">
                <strong>{selectedCell.day}</strong> a las <strong>{selectedCell.hour} hs</strong>
              </span>
              <Badge className="bg-emerald-500 text-slate-950 font-black">
                {selectedCell.pct}% Ocupado
              </Badge>
            </div>
          )}
        </div>

        {/* Tabla / Matriz Heatmap */}
        <div className="mt-6 overflow-x-auto">
          <div className="min-w-[650px] space-y-2">
            {/* Header Horas */}
            <div className="grid grid-cols-10 gap-2 text-center text-[11px] font-bold text-slate-400 pb-2">
              <div className="text-left font-semibold text-slate-500">Día</div>
              {HOURS.map(h => (
                <div key={h}>{h}</div>
              ))}
            </div>

            {/* Filas de Días */}
            {DAYS.map((day, dayIdx) => (
              <div key={day} className="grid grid-cols-10 gap-2 items-center">
                <div className="text-xs font-bold text-slate-300 truncate pr-2">
                  {day}
                </div>
                {HOURS.map((hour, hourIdx) => {
                  const pct = OCCUPANCY_HEATMAP[dayIdx][hourIdx]
                  const colorClass = getHeatmapColor(pct)

                  return (
                    <button
                      key={hour}
                      onClick={() => setSelectedCell({ day, hour, pct })}
                      className={`h-9 rounded-xl flex items-center justify-center text-[11px] transition-all hover:scale-105 ${colorClass}`}
                      title={`${day} ${hour} hs: ${pct}% ocupación`}
                    >
                      {pct}%
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Leyenda Heatmap */}
          <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-slate-500" />
              <span>Hacé click en cualquier celda para consultar detalles.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px]">Baja</span>
              <div className="w-4 h-4 rounded bg-slate-900 border border-slate-800" />
              <div className="w-4 h-4 rounded bg-emerald-900/60" />
              <div className="w-4 h-4 rounded bg-emerald-700" />
              <div className="w-4 h-4 rounded bg-emerald-500" />
              <span className="text-[11px]">Pico (100%)</span>
            </div>
          </div>
        </div>
      </Card>

      {/* RENTABILIDAD POR CANCHA & DESGLOSE CANTINA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rendimiento por Cancha */}
        <Card className="bg-slate-900/80 border-slate-800 rounded-3xl p-6 shadow-xl">
          <CardHeader className="p-0 pb-4 border-b border-slate-800">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Rentabilidad por Cancha</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Ingresos brutos y tasa de ocupación mensual de cada cancha
            </CardDescription>
          </CardHeader>

          <div className="pt-5 space-y-4">
            {courtBreakdown.map((court) => (
              <div key={court.name} className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-200">
                    {court.name} <span className="text-slate-500 text-[11px]">({court.sport})</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">{court.occupancy}% ocup.</span>
                    <span className="font-bold text-emerald-400 font-mono">{formatARS(court.revenue)}</span>
                  </div>
                </div>
                {/* Barra de progreso visual */}
                <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className={`h-full ${court.color} rounded-full transition-all duration-500`}
                    style={{ width: `${court.occupancy}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Desglose Cancha vs Cantina */}
        <Card className="bg-slate-900/80 border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <CardHeader className="p-0 pb-4 border-b border-slate-800">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Coffee className="w-4 h-4 text-teal-400" />
              <span>Fuentes de Ingresos: Turnos vs Cantina</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Impacto del consumo cruzado en la rentabilidad neta del complejo
            </CardDescription>
          </CardHeader>

          <div className="py-6 space-y-4">
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-sm">
                  78%
                </div>
                <div>
                  <div className="font-bold text-xs text-white">Alquiler de Canchas y Turnos</div>
                  <div className="text-[11px] text-slate-400">Reservas web y mostrador</div>
                </div>
              </div>
              <div className="font-extrabold text-sm text-emerald-400 font-mono">
                {formatARS(totalCourtsRevenue)}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center font-black text-sm">
                  22%
                </div>
                <div>
                  <div className="font-bold text-xs text-white">Cantina, Bebidas y Paletas</div>
                  <div className="text-[11px] text-slate-400">Ventas en mostrador y pedidos QR</div>
                </div>
              </div>
              <div className="font-extrabold text-sm text-teal-400 font-mono">
                {formatARS(cantinaRevenue)}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 leading-relaxed">
            💡 <strong>Tip de negocio CancharClub:</strong> Los pedidos QR en cancha aumentaron el ticket promedio de cantina en un <strong>35%</strong> al permitir que los jugadores pidan sin abandonar el partido.
          </div>
        </Card>
      </div>
    </div>
  )
}
