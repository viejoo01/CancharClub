'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  BarChart3, 
  Flame, 
  TrendingUp, 
  AlertTriangle, 
  DollarSign, 
  Calendar, 
  Lightbulb, 
  MessageCircle,
  Loader2,
  Printer,
  FileSpreadsheet
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatARS } from '@/lib/utils'
import { getOccupancyReport, type OccupancyReportData, type PricingRecommendation } from '@/actions/analytics.actions'
import { exportToCsv, printCleanPdfReport } from '@/lib/export'
import { toast } from 'sonner'
import { useTenantId } from '@/hooks/use-tenant-id'

// tenant isolation: useTenantId hook

const SLOTS_HEADER = [
  { key: 'MANANA', label: 'Mañana', range: '08:00 - 13:00' },
  { key: 'SIESTA', label: 'Siesta', range: '13:00 - 17:00' },
  { key: 'TARDE', label: 'Tarde', range: '17:00 - 20:00' },
  { key: 'NOCHE', label: 'Noche', range: '20:00 - 00:00' },
]

const DAYS_HEADER = [
  'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'
]

export default function ReportesPage() {
  const tenantId = useTenantId()
  const [data, setData] = useState<OccupancyReportData | null>(null)
  const [loading, setLoading] = useState(true)

  const loadReport = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getOccupancyReport(tenantId!)
      setData(res)
    } catch {
      toast.error('Error al cargar reporte de ocupación')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    getOccupancyReport(tenantId!)
      .then((res) => {
        if (isMounted) {
          setData(res)
          setLoading(false)
        }
      })
      .catch(() => {
        if (isMounted) {
          toast.error('Error al cargar reporte de ocupación')
          setLoading(false)
        }
      })
    return () => {
      isMounted = false
    }
  }, [])

  const handleExportCsv = () => {
    if (!data) return
    const headers = ['Franja Horaria', ...DAYS_HEADER]
    const rows = SLOTS_HEADER.map((slot) => {
      const dayValues = DAYS_HEADER.map((dayName) => {
        const cell = data.heatmap.find((h) => h.dayName === dayName && h.slotKey === slot.key)
        return cell ? `${cell.occupancyPct}%` : '0%'
      })
      return [slot.label, ...dayValues]
    })
    exportToCsv({
      title: 'Reporte de Ocupación Semanal',
      filename: `reporte-ocupacion-${new Date().toISOString().split('T')[0]}.csv`,
      headers,
      rows,
    })
    toast.success('Reporte CSV exportado')
  }

  const handlePrintPdf = () => {
    if (!data) return
    const headers = ['Franja Horaria', ...DAYS_HEADER]
    const rows = SLOTS_HEADER.map((slot) => {
      const dayValues = DAYS_HEADER.map((dayName) => {
        const cell = data.heatmap.find((h) => h.dayName === dayName && h.slotKey === slot.key)
        return cell ? `${cell.occupancyPct}%` : '0%'
      })
      return [slot.label, ...dayValues]
    })
    printCleanPdfReport({
      title: 'Reporte de Ocupación y Demanda',
      subtitle: 'Club Pádel Central - Mapa de Ocupación Semanal',
      headers,
      rows,
      summaryKpis: [
        { label: 'Ocupación Promedio', value: `${data.weeklyAverageOccupancy}%` },
        { label: 'Horario Pico', value: data.peakSlot },
        { label: 'Horarios Muertos', value: `${data.deadHoursCount} franjas` }
      ]
    })
  }

  const getCellColor = (pct: number) => {
    if (pct >= 80) return 'bg-emerald-500/25 border-emerald-500/60 text-emerald-300'
    if (pct >= 55) return 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
    if (pct >= 30) return 'bg-amber-500/20 border-amber-500/50 text-amber-300'
    return 'bg-rose-500/15 border-rose-500/40 text-rose-300'
  }

  const handleSharePromoWhatsApp = (rec: PricingRecommendation) => {
    const text = `🔥 *${rec.suggestedPromoTitle}* en Club Pádel Central!\n\n` +
      `📅 Válido: ${rec.days}\n` +
      `⏰ Horario: ${rec.slotLabel}\n` +
      `💵 *Tarifa Promocional: ${formatARS(rec.suggestedPriceArs)}* (Antes ${formatARS(rec.standardPriceArs)})\n\n` +
      `¡Reservá tu cancha ahora antes de que se agoten los turnos!\n` +
      `👉 ${window.location.origin}/club/central-tucuman`

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-emerald-400" />
              Analítica de Ocupación y Precios Inteligentes
            </h1>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 font-semibold text-xs">
              Algoritmo de Demanda
            </Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Visualizá el mapa de calor semanal de tus canchas, detectá horarios muertos y aplicá tarifas dinámicas recomendadas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCsv}
            disabled={loading || !data}
            className="border-slate-700 bg-slate-900/80 text-slate-200 hover:text-white text-xs gap-1.5 h-10"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Excel / CSV</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handlePrintPdf}
            disabled={loading || !data}
            className="border-slate-700 bg-slate-900/80 text-slate-200 hover:text-white text-xs gap-1.5 h-10"
          >
            <Printer className="w-3.5 h-3.5 text-blue-400" />
            <span>PDF</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={loadReport}
            disabled={loading}
            className="border-slate-700 bg-slate-900/80 text-slate-200 hover:text-white text-xs h-10"
          >
            Actualizar Métricas
          </Button>
        </div>
      </div>

      {loading || !data ? (
        <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          <span className="text-sm font-medium">Calculando mapa de calor de ocupación...</span>
        </div>
      ) : (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-slate-900/70 border-slate-800 p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
                <span>Ocupación Promedio</span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black text-white">
                {data.weeklyAverageOccupancy}%
              </div>
              <p className="text-[11px] text-slate-400">
                Basado en últimos 30 días de reservas
              </p>
            </Card>

            <Card className="bg-slate-900/70 border-slate-800 p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
                <span>Horario Más Demandado</span>
                <Flame className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-lg font-black text-amber-300 truncate">
                Noche (20 a 00 hs)
              </div>
              <p className="text-[11px] text-emerald-400 font-semibold">
                92% de ocupación promedio
              </p>
            </Card>

            <Card className="bg-slate-900/70 border-slate-800 p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
                <span>Horarios Muertos</span>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-2xl font-black text-rose-400">
                {data.deadHoursCount} franjas
              </div>
              <p className="text-[11px] text-slate-400">
                Ocupación crítica menor al 28%
              </p>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold">
                <span>Potencial de Ingreso</span>
                <DollarSign className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black text-white">
                +{formatARS(data.projectedRevenueRecoveryArs)}
              </div>
              <p className="text-[11px] text-emerald-300/80 font-medium">
                Recuperación mensual estimada
              </p>
            </Card>
          </div>

          {/* Gráfico Heatmap de Ocupación */}
          <Card className="bg-slate-900/70 border-slate-800 p-6 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  Mapa de Calor Semanal (Heatmap por Franja Horaria)
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Porcentaje de horas ocupadas respecto a la capacidad total de canchas del club.
                </CardDescription>
              </div>

              {/* Leyenda */}
              <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-300 overflow-x-auto pb-1">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-rose-500/40 border border-rose-500/60" />
                  &lt; 30% Muerto
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-amber-500/40 border border-amber-500/60" />
                  30-55% Medio
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-cyan-500/40 border border-cyan-500/60" />
                  55-80% Alto
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-emerald-500/40 border border-emerald-500/60" />
                  &gt; 80% Pico
                </span>
              </div>
            </div>

            {/* Matriz Heatmap */}
            {/* Hint de scroll para mobile */}
            <div className="md:hidden mb-2">
              <span className="inline-flex items-center gap-1 bg-slate-800/80 rounded-lg px-2 py-1 border border-slate-700/60 text-[11px] text-slate-300">
                &larr; Deslizá para ver el mapa completo &rarr;
              </span>
            </div>

            <div className="overflow-x-auto pb-2 touch-momentum">
              <div className="min-w-[650px] space-y-2">
                {/* Header Días */}
                <div className="grid grid-cols-[140px_repeat(7,1fr)] gap-2 text-center text-xs font-bold text-slate-400 pb-1 border-b border-slate-800">
                  <div className="text-left font-bold text-slate-500">Franja Horaria</div>
                  {DAYS_HEADER.map((d) => (
                    <div key={d}>{d}</div>
                  ))}
                </div>

                {/* Filas por Franja */}
                {SLOTS_HEADER.map((slot) => (
                  <div key={slot.key} className="grid grid-cols-[140px_repeat(7,1fr)] gap-2 items-center">
                    <div className="text-xs">
                      <div className="font-bold text-slate-200">{slot.label}</div>
                      <div className="text-[10px] text-slate-500">{slot.range}</div>
                    </div>

                    {DAYS_HEADER.map((dayName) => {
                      // Buscar celda en heatmap
                      const cell = data.heatmap.find(
                        (h) => h.dayName === dayName && h.slotKey === slot.key
                      )
                      const pct = cell ? cell.occupancyPct : 0
                      const isDead = cell ? cell.isDeadHour : false

                      return (
                        <div
                          key={`${slot.key}-${dayName}`}
                          className={`h-16 rounded-xl border p-2 flex flex-col items-center justify-center transition-all ${getCellColor(
                            pct
                          )}`}
                        >
                          <span className="font-black text-sm">{pct}%</span>
                          {isDead && (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-rose-400 mt-0.5">
                              Muerto
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Radar de Horarios Muertos y Recomendaciones Inteligentes */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">
                Recomendaciones Automatizadas de Precios y Promociones
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.recommendations.map((rec) => (
                <Card
                  key={rec.id}
                  className="bg-slate-900/80 border-slate-800 flex flex-col justify-between hover:border-amber-500/40 transition-all shadow-lg"
                >
                  <CardHeader className="p-4 pb-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-rose-500/15 border-rose-500/30 text-rose-300 text-[10px] font-bold">
                        {rec.currentOccupancy}% Ocupación
                      </Badge>
                      <Badge className="bg-emerald-500/15 border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
                        -{rec.discountPct}% Sugerido
                      </Badge>
                    </div>
                    <CardTitle className="text-sm font-bold text-white pt-1">
                      {rec.slotLabel}
                    </CardTitle>
                    <CardDescription className="text-xs text-amber-300/90 font-medium">
                      {rec.days}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-4 pt-1 space-y-3 flex-1 flex flex-col justify-between">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {rec.rationale}
                    </p>

                    <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Tarifa Estándar:</span>
                        <span className="line-through text-slate-500">{formatARS(rec.standardPriceArs)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-emerald-400">Tarifa Sugerida:</span>
                        <span className="text-emerald-300 text-sm font-black">{formatARS(rec.suggestedPriceArs)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/80 text-slate-400">
                        <span>Recuperación Semanal:</span>
                        <span className="text-white font-bold">+{formatARS(rec.projectedWeeklyRevenueArs)}</span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleSharePromoWhatsApp(rec)}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5 shadow-md shadow-emerald-950/30"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Difundir Promo por WhatsApp</span>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}


