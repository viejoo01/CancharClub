'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Users,
  ShieldCheck,
  AlertTriangle,
  Search,
  MessageCircle,
  History,
  TrendingUp,
  X,
  Loader2,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatARS } from '@/lib/utils'
import {
  getPlayersReputation,
  getPlayerHistory,
  type PlayerSummary,
  type PlayerHistoryItem,
} from '@/actions/players.actions'
import { toast } from 'sonner'
import { useTenantId } from '@/hooks/use-tenant-id'

// tenant isolation: useTenantId hook

export default function JugadoresPage() {
  const tenantId = useTenantId()
  const [players, setPlayers] = useState<PlayerSummary[]>([])
  const [stats, setStats] = useState({
    totalPlayers: 0,
    exemplaryCount: 0,
    highRiskCount: 0,
    avgAttendanceRate: 0,
    totalRevenueTracked: 0,
  })
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [tierFilter, setTierFilter] = useState<'ALL' | 'EXEMPLARY' | 'RELIABLE' | 'HIGH_RISK'>('ALL')

  // Modal de Historial
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSummary | null>(null)
  const [history, setHistory] = useState<PlayerHistoryItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const loadData = useCallback(async (isInitial = false) => {
    if (!tenantId) return
    if (isInitial) setLoading(true)
    try {
      const res = await getPlayersReputation(tenantId, searchQuery)
      if (res.success) {
        setPlayers(res.players)
        setStats(res.stats)
      } else if (isInitial) {
        toast.error('Error al cargar datos de jugadores')
      }
    } catch {
      if (isInitial) toast.error('Error inesperado')
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [tenantId, searchQuery])

  useEffect(() => {
    if (!tenantId) return

    const timer = setTimeout(() => {
      void loadData(true)
    }, 300)

    // Sondeo continuo cada 6 segundos a la base de datos
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void loadData(false)
    }, 6000)

    const handleSync = () => void loadData(false)
    window.addEventListener('focus', handleSync)
    document.addEventListener('visibilitychange', handleSync)

    return () => {
      clearTimeout(timer)
      clearInterval(interval)
      window.removeEventListener('focus', handleSync)
      document.removeEventListener('visibilitychange', handleSync)
    }
  }, [tenantId, loadData])

  const openHistory = async (player: PlayerSummary) => {
    setSelectedPlayer(player)
    setLoadingHistory(true)
    try {
      const res = await getPlayerHistory(tenantId!, player.phone)
      if (res.success) {
        setHistory(res.history)
      } else {
        toast.error('No se pudo cargar el historial')
      }
    } catch {
      toast.error('Error al cargar historial')
    } finally {
      setLoadingHistory(false)
    }
  }

  const filteredPlayers = players.filter((p) => {
    if (tierFilter === 'ALL') return true
    if (tierFilter === 'HIGH_RISK') return p.is_high_risk || p.tier === 'HIGH_RISK'
    return p.tier === tierFilter
  })

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Directorio y Reputación de Jugadores
            </h1>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10">
              Score & Asistencia
            </Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Control de asistencia, no-shows, volumen de reservas y fidelidad por jugador.
          </p>
        </div>

        {/* Buscador */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o teléfono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-slate-900/60 border-slate-800 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Total Jugadores</p>
                <p className="text-2xl font-bold text-white mt-0.5">{stats.totalPlayers}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-sky-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Jugadores Ejemplares</p>
                <p className="text-2xl font-bold text-emerald-400 mt-0.5">{stats.exemplaryCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">90%+ de asistencia sin ausencias</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Asistencia Promedio</p>
                <p className="text-2xl font-bold text-white mt-0.5">{stats.avgAttendanceRate}%</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-purple-400" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">De todos los turnos reservados</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Jugadores en Riesgo</p>
                <p className="text-2xl font-bold text-rose-400 mt-0.5">{stats.highRiskCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Con no-shows o ausencias reiteradas</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros de Pestañas */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setTierFilter('ALL')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            tierFilter === 'ALL'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          Todos ({players.length})
        </button>
        <button
          onClick={() => setTierFilter('EXEMPLARY')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            tierFilter === 'EXEMPLARY'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          ⭐ Ejemplares ({players.filter((p) => p.tier === 'EXEMPLARY').length})
        </button>
        <button
          onClick={() => setTierFilter('RELIABLE')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            tierFilter === 'RELIABLE'
              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          👍 Confiables ({players.filter((p) => p.tier === 'RELIABLE').length})
        </button>
        <button
          onClick={() => setTierFilter('HIGH_RISK')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            tierFilter === 'HIGH_RISK'
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          ⚠️ En Riesgo ({players.filter((p) => p.is_high_risk || p.tier === 'HIGH_RISK').length})
        </button>
      </div>

      {/* Tabla de Jugadores */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="p-4 border-b border-slate-800 flex flex-row items-center justify-between">
          <CardTitle className="text-base text-white font-semibold">
            Lista de Jugadores Registrados ({filteredPlayers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mb-2" />
              <p className="text-sm">Analizando historial de reservas y reputación...</p>
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Users className="w-10 h-10 text-slate-600 mb-2" />
              <p className="text-sm font-medium">No se encontraron jugadores con ese criterio.</p>
              <p className="text-xs text-slate-500 mt-1">
                Los jugadores se registran automáticamente con cada reserva en el club.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-950/40 text-slate-400 text-xs">
                    <th className="py-3 px-4">Jugador</th>
                    <th className="py-3 px-4">Reputación</th>
                    <th className="py-3 px-4">Partidos</th>
                    <th className="py-3 px-4">No-Shows</th>
                    <th className="py-3 px-4">Total Invertido</th>
                    <th className="py-3 px-4">Última Visita</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filteredPlayers.map((player) => {
                    const initials = player.name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()

                    const waUrl = player.phone
                      ? `https://wa.me/${player.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                          `¡Hola ${player.name}! Te contactamos desde el club.`
                        )}`
                      : ''

                    return (
                      <tr key={player.phone || player.name} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-200">
                              {initials}
                            </div>
                            <div>
                              <p className="font-medium text-white">{player.name}</p>
                              <p className="text-xs text-slate-400 font-mono">{player.phone || 'Sin teléfono'}</p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {player.tier === 'EXEMPLARY' && (
                              <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                ⭐ {player.score_percentage}% Asistencia
                              </Badge>
                            )}
                            {player.tier === 'RELIABLE' && (
                              <Badge className="bg-sky-500/10 text-sky-400 border border-sky-500/30">
                                👍 {player.score_percentage}% Asistencia
                              </Badge>
                            )}
                            {player.tier === 'MODERATE' && (
                              <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                ⚖️ {player.score_percentage}% Asistencia
                              </Badge>
                            )}
                            {player.tier === 'HIGH_RISK' && (
                              <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/30">
                                ⚠️ Alto Riesgo ({player.score_percentage}%)
                              </Badge>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 font-mono text-slate-300">
                          <span className="text-emerald-400 font-bold">{player.completed_bookings}</span> / {player.total_bookings}
                        </td>

                        <td className="py-3 px-4">
                          {player.no_show_count > 0 ? (
                            <span className="text-rose-400 font-bold font-mono">
                              {player.no_show_count} falta{player.no_show_count > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs">0 faltas</span>
                          )}
                        </td>

                        <td className="py-3 px-4 font-mono text-slate-300">
                          {formatARS(player.total_spent_ars)}
                        </td>

                        <td className="py-3 px-4 text-xs text-slate-400">
                          {player.last_booking_date
                            ? new Date(player.last_booking_date).toLocaleDateString('es-AR', {
                                day: '2-digit',
                                month: 'short',
                              })
                            : '—'}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openHistory(player)}
                              className="border-slate-700 hover:bg-slate-800 text-slate-300 h-8 px-2.5"
                            >
                              <History className="w-3.5 h-3.5 mr-1" />
                              Historial
                            </Button>

                            {waUrl && (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors"
                                title="Enviar WhatsApp"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal / Panel de Historial de Jugador */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header del Modal */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>{selectedPlayer.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {selectedPlayer.tier}
                  </Badge>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Teléfono: {selectedPlayer.phone} • {selectedPlayer.total_bookings} reservas en total
                </p>
              </div>
              <button
                onClick={() => setSelectedPlayer(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenido del Modal */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-center">
                <div>
                  <p className="text-[11px] text-slate-400">Completados</p>
                  <p className="text-lg font-bold text-emerald-400">{selectedPlayer.completed_bookings}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400">No-Shows</p>
                  <p className="text-lg font-bold text-rose-400">{selectedPlayer.no_show_count}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400">Total Gastado</p>
                  <p className="text-lg font-bold text-white font-mono">{formatARS(selectedPlayer.total_spent_ars)}</p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase text-slate-400 tracking-wider mb-2">
                  Historial de Turnos Recientes
                </h4>

                {loadingHistory ? (
                  <div className="flex items-center justify-center py-8 text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mr-2" />
                    Cargando historial...
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    No hay detalle de turnos para este jugador.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {history.map((item) => {
                      const dateFormatted = new Date(item.starts_at).toLocaleDateString('es-AR', {
                        weekday: 'short',
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })

                      const isCompleted = ['COMPLETED', 'FULLY_PAID', 'CONFIRMED'].includes(item.status)
                      const isNoShow = item.status === 'NO_SHOW'

                      return (
                        <div
                          key={item.id}
                          className="p-3 bg-slate-950/40 border border-slate-800/70 rounded-xl flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-semibold text-white">{item.court_name}</p>
                            <p className="text-slate-400 mt-0.5 capitalize">{dateFormatted} hs</p>
                          </div>

                          <div className="text-right">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                isCompleted
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : isNoShow
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                  : 'bg-slate-700/30 text-slate-400'
                              }`}
                            >
                              {item.status}
                            </span>
                            <p className="text-slate-300 font-mono mt-0.5">{formatARS(item.total_amount_ars)}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedPlayer(null)}
                className="border-slate-700 text-slate-300"
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


