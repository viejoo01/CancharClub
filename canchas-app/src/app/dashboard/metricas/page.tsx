'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTenantId } from '@/hooks/use-tenant-id'
import { getClubAnalytics, type ClubAnalyticsData } from '@/actions/club.actions'
import { 
  BarChart3, 
  TrendingUp, 
  Flame, 
  Coffee, 
  DollarSign, 
  ShieldCheck, 
  Layers, 
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Trophy,
  Loader2
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatARS } from '@/lib/utils'

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const HOURS = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '19:30', '21:00', '22:30']
const COURT_COLORS = ['bg-emerald-500', 'bg-teal-500', 'bg-sky-500', 'bg-indigo-500', 'bg-amber-500', 'bg-purple-500']

export default function MetricasPage() {
  const tenantId = useTenantId()
  const [analytics, setAnalytics] = useState<ClubAnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  const [selectedCell, setSelectedCell] = useState<{ day: string; hour: string; pct: number } | null>(null)

  useEffect(() => {
    if (!tenantId) return
    let isMounted = true

    getClubAnalytics(tenantId)
      .then(data => {
        if (isMounted) {
          setAnalytics(data)
          setLoading(false)
        }
      })
      .catch(err => {
        console.error('[MetricasPage] Error al cargar analítica:', err)
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [tenantId])

  const getHeatmapColor = (pct: number) => {
    if (pct >= 85) return 'bg-emerald-500 text-slate-950 font-extrabold shadow-sm shadow-emerald-500/50'
    if (pct >= 60) return 'bg-emerald-600/90 text-white font-bold'
    if (pct >= 40) return 'bg-emerald-700/60 text-emerald-200 font-semibold'
    if (pct >= 15) return 'bg-emerald-900/40 text-emerald-300'
    return 'bg-slate-900/80 text-slate-500'
  }

  const heatmapMatrix = useMemo(() => {
    if (!analytics || !analytics.occupancyHeatmap || analytics.occupancyHeatmap.length === 0) {
      return Array.from({ length: 7 }, () => Array(9).fill(0))
    }
    return analytics.occupancyHeatmap
  }, [analytics])

  const courtsBreakdown = useMemo(() => {
    if (!analytics || !analytics.courts || analytics.courts.length === 0) {
      return []
    }
    return analytics.courts.map((c, i) => ({
      ...c,
      color: COURT_COLORS[i % COURT_COLORS.length]
    }))
  }, [analytics])

  const totalRevenue = analytics?.totalRevenue || 0
  const courtsRevenue = analytics?.courtsRevenue || 0
  const cantinaRevenue = analytics?.cantinaRevenue || 0
  const totalBookings = analytics?.bookingsCount || 0
  const avgTicket = analytics?.avgTicket || 0
  const primeOccupancy = analytics?.occupancyPrimePct || 0
  const noShowsProtected = analytics?.noShowsProtected || 0
  const growthPct = analytics?.revenueGrowthPct || 0

  const courtsSharePct = totalRevenue > 0 ? Math.round((courtsRevenue / totalRevenue) * 100) : 100
  const cantinaSharePct = totalRevenue > 0 ? Math.round((cantinaRevenue / totalRevenue) * 100) : 0

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        <p className="text-sm text-slate-400">
          Calculando métricas y consolidando ocupación del complejo...
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs tracking-wider uppercase mb-1">
          <BarChart3 className="w-4 h-4" />
          Inteligencia de Negocio & Rendimiento en Tiempo Real
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Panel de Métricas y Analítica Avanzada
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Datos consolidados de los últimos 30 días: ocupación horaria, rentabilidad de canchas y ticket cruzado con cantina.
            </p>
          </div>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-xs px-3 py-1 shrink-0 self-start sm:self-auto">
            Últimos 30 días
          </Badge>
        </div>
      </div>

      {/* KPI Cards de Rendimiento Superior */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Facturación Total */}
        <Card className="bg-slate-900/60 border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
            <span>Facturación Total (30d)</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white mt-1 font-mono">
            {formatARS(totalRevenue)}
          </div>
          <div className="text-[11px] flex items-center gap-1 mt-1 font-semibold">
            {growthPct >= 0 ? (
              <span className="text-emerald-400 flex items-center gap-0.5">
                <ArrowUpRight className="w-3.5 h-3.5" />
                +{growthPct}% vs período anterior
              </span>
            ) : (
              <span className="text-rose-400 flex items-center gap-0.5">
                <ArrowDownRight className="w-3.5 h-3.5" />
                {growthPct}% vs período anterior
              </span>
            )}
          </div>
        </Card>

        {/* Card 2: Ticket Promedio */}
        <Card className="bg-slate-900/60 border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
            <span>Ticket Promedio Turno</span>
            <TrendingUp className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-extrabold text-white mt-1 font-mono">
            {formatARS(avgTicket)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Basado en {totalBookings} {totalBookings === 1 ? 'turno concretado' : 'turnos concretados'}
          </div>
        </Card>

        {/* Card 3: Ocupación Prime */}
        <Card className="bg-slate-900/60 border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
            <span>Ocupación Prime (18 a 00 hs)</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-amber-400 mt-1">
            {primeOccupancy}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {primeOccupancy >= 80 ? 'Franja horaria de máxima demanda' : 'Capacidad disponible en turnos nocturnos'}
          </div>
        </Card>

        {/* Card 4: Protección Señas */}
        <Card className="bg-slate-900/60 border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
            <span>Protección Señas (No-Shows)</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1 font-mono">
            {formatARS(noShowsProtected)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Señas cobradas por turnos cancelados o inasistencias
          </div>
        </Card>
      </div>

      {/* HEATMAP DE OCUPACIÓN REAL */}
      <Card className="bg-slate-900/80 border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-400" />
              <CardTitle className="text-lg text-white">
                Mapa de Calor de Ocupación Semanal (Heatmap Real)
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-400 mt-1">
              Frecuencia histórica real calculada a partir de los turnos reservados en los últimos 30 días.
            </CardDescription>
          </div>

          {selectedCell && (
            <div className="px-4 py-2 rounded-xl bg-slate-950 border border-emerald-500/30 text-xs flex items-center gap-3">
              <span className="text-slate-300">
                <strong>{selectedCell.day}</strong> a las <strong>{selectedCell.hour} hs</strong>
              </span>
              <Badge className="bg-emerald-500 text-slate-950 font-black">
                {selectedCell.pct}% Ocupación
              </Badge>
            </div>
          )}
        </div>

        {/* Tabla / Matriz Heatmap */}
        <div className="flex items-center justify-between text-xs text-slate-400 sm:hidden mt-4">
          <span>👉 Deslizá horizontalmente para ver todas las horas</span>
        </div>
        <div className="mt-2 sm:mt-6 overflow-x-auto touch-momentum">
          <div className="min-w-162.5 space-y-2">
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
                  const pct = heatmapMatrix[dayIdx]?.[hourIdx] ?? 0
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
          <div className="mt-6 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-slate-500" />
              <span>Hacé click en cualquier celda para consultar detalles puntuales.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px]">Baja (0%)</span>
              <div className="w-4 h-4 rounded bg-slate-900 border border-slate-800" />
              <div className="w-4 h-4 rounded bg-emerald-900/40" />
              <div className="w-4 h-4 rounded bg-emerald-700/60" />
              <div className="w-4 h-4 rounded bg-emerald-600/90" />
              <div className="w-4 h-4 rounded bg-emerald-500" />
              <span className="text-[11px]">Alta (&ge;85%)</span>
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
              Ingresos generados y tasa de ocupación calculada en los últimos 30 días
            </CardDescription>
          </CardHeader>

          <div className="pt-5 space-y-4">
            {courtsBreakdown.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                No hay canchas registradas o activas aún.
              </div>
            ) : (
              courtsBreakdown.map((court) => (
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
                      style={{ width: `${Math.max(court.occupancy, 2)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Desglose Cancha vs Cantina */}
        <Card className="bg-slate-900/80 border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <CardHeader className="p-0 pb-4 border-b border-slate-800">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Coffee className="w-4 h-4 text-teal-400" />
              <span>Fuentes de Ingresos: Canchas vs Cantina</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Comparativa de ingresos por alquiler de canchas y ventas de cantina
            </CardDescription>
          </CardHeader>

          <div className="py-6 space-y-4">
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-sm">
                  {courtsSharePct}%
                </div>
                <div>
                  <div className="font-bold text-xs text-white">Alquiler de Canchas y Turnos</div>
                  <div className="text-[11px] text-slate-400">Cobro de reservas y señas</div>
                </div>
              </div>
              <div className="font-extrabold text-sm text-emerald-400 font-mono">
                {formatARS(courtsRevenue)}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center font-black text-sm">
                  {cantinaSharePct}%
                </div>
                <div>
                  <div className="font-bold text-xs text-white">Cantina, Bebidas y Kiosco</div>
                  <div className="text-[11px] text-slate-400">Ventas en mostrador y pedidos QR</div>
                </div>
              </div>
              <div className="font-extrabold text-sm text-teal-400 font-mono">
                {formatARS(cantinaRevenue)}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 leading-relaxed">
            💡 <strong>Análisis automático:</strong> Los datos se actualizan en tiempo real con cada reserva confirmada y cada pedido despachado en cantina.
          </div>
        </Card>
      </div>

      {/* TOP JUGADORES FRECUENTES */}
      {analytics?.topPlayers && analytics.topPlayers.length > 0 && (
        <Card className="bg-slate-900/80 border-slate-800 rounded-3xl p-6 shadow-xl">
          <CardHeader className="p-0 pb-4 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Jugadores Más Frecuentes (Top Clientes)</span>
              </CardTitle>
              <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10 text-xs">
                Fidelidad
              </Badge>
            </div>
            <CardDescription className="text-xs text-slate-400">
              Jugadores que más turnos reservaron en los últimos 30 días
            </CardDescription>
          </CardHeader>

          <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {analytics.topPlayers.map((player, idx) => (
              <div 
                key={player.name + idx}
                className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                    idx === 0 ? 'bg-amber-500 text-slate-950' : idx === 1 ? 'bg-slate-300 text-slate-950' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    #{idx + 1}
                  </span>
                  <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">
                    {player.bookingsCount} {player.bookingsCount === 1 ? 'turno' : 'turnos'}
                  </Badge>
                </div>
                <div>
                  <h4 className="font-bold text-xs text-white truncate" title={player.name}>
                    {player.name}
                  </h4>
                  <p className="text-[11px] text-emerald-400 font-mono mt-0.5 font-bold">
                    {formatARS(player.totalSpent)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
