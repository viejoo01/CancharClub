'use client'

import { useState, useEffect, use, useCallback } from 'react'
import Link from 'next/link'
import {
  Trophy,
  Share2,
  Users,
  ArrowLeft,
  Loader2,
  Flame,
  Radio,
  MapPin,
  UserPlus,
  CheckCircle2,
  Sparkles,
  Phone,
  CreditCard,
  Clock,
  Medal,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  getTournamentById,
  addTeamToCategory,
  createTournamentRegistrationPaymentPreference,
  joinTournamentWaitlist,
  getClubTournamentRanking,
  type TournamentWithDetails,
  type ClubPlayerRanking,
} from '@/actions/tournament.actions'
import type { TournamentMatch, TournamentTeam } from '@/types/database'
import { toast } from 'sonner'
import { buildWhatsAppLink } from '@/lib/utils'

export default function PublicTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [tournament, setTournament] = useState<TournamentWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCatId, setSelectedCatId] = useState<string>('')

  // Modal de Inscripción Pública
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [regCategory, setRegCategory] = useState('')
  const [regTeamName, setRegTeamName] = useState('')
  const [regPlayer1, setRegPlayer1] = useState('')
  const [regPlayer2, setRegPlayer2] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regLoading, setRegLoading] = useState(false)
  const [regSuccess, setRegSuccess] = useState(false)
  const [regTeamId, setRegTeamId] = useState<string | null>(null)
  const [mpLoading, setMpLoading] = useState(false)

  // Modal de Lista de Espera
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false)
  const [waitlistCategory, setWaitlistCategory] = useState('')
  const [waitlistTeamName, setWaitlistTeamName] = useState('')
  const [waitlistPlayer1, setWaitlistPlayer1] = useState('')
  const [waitlistPlayer2, setWaitlistPlayer2] = useState('')
  const [waitlistPhone, setWaitlistPhone] = useState('')
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistSuccess, setWaitlistSuccess] = useState<{ position: number } | null>(null)

  // Modal de Ranking del Club
  const [isRankingOpen, setIsRankingOpen] = useState(false)
  const [rankingList, setRankingList] = useState<ClubPlayerRanking[]>([])
  const [rankingLoading, setRankingLoading] = useState(false)

  const loadTournament = useCallback(async () => {
    try {
      const data = await getTournamentById(id)
      if (data) {
        setTournament(data)
        if (!selectedCatId && data.categories.length > 0) {
          setSelectedCatId(data.categories[0].id)
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [id, selectedCatId])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadTournament()
    }, 0)
    // Auto-refresh cada 30 segundos para actualización en vivo de marcadores
    const interval = setInterval(() => {
      loadTournament()
    }, 30000)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [loadTournament])

  const selectedCategory = tournament?.categories.find((c) => c.id === selectedCatId)
  const teamsMap = new Map<string, TournamentTeam>()
  selectedCategory?.teams.forEach((t) => teamsMap.set(t.id, t))

  const matches = selectedCategory?.matches || []
  const dieciseisavos = matches.filter((m) => m.round === 'DIECISEISAVOS')
  const octavos = matches.filter((m) => m.round === 'OCTAVOS')
  const cuartos = matches.filter((m) => m.round === 'CUARTOS')
  const semis = matches.filter((m) => m.round === 'SEMIFINAL')
  const finalMatch = matches.find((m) => m.round === 'FINAL')

  const groupAMatches = matches.filter((m) => m.round === 'GRUPO_A')
  const groupBMatches = matches.filter((m) => m.round === 'GRUPO_B')
  const hasGroups = groupAMatches.length > 0 || groupBMatches.length > 0

  const handleShare = () => {
    if (typeof window !== 'undefined') {
      const url = window.location.href
      navigator.clipboard.writeText(url)
      toast.success('¡Enlace copiado al portapapeles!')

      const waText = `¡Seguí el fixture y los resultados en vivo del torneo *${tournament?.name}* acá!: ${url}`
      window.open(buildWhatsAppLink(null, waText), '_blank')
    }
  }

  // Cálculo de tabla de posiciones de un grupo
  const computeStandings = (groupMatches: TournamentMatch[]) => {
    const table = new Map<
      string,
      { team: TournamentTeam; pj: number; pg: number; pp: number; pts: number }
    >()

    groupMatches.forEach((m) => {
      if (m.team_a_id && !table.has(m.team_a_id)) {
        const team = teamsMap.get(m.team_a_id)
        if (team) table.set(m.team_a_id, { team, pj: 0, pg: 0, pp: 0, pts: 0 })
      }
      if (m.team_b_id && !table.has(m.team_b_id)) {
        const team = teamsMap.get(m.team_b_id)
        if (team) table.set(m.team_b_id, { team, pj: 0, pg: 0, pp: 0, pts: 0 })
      }

      if (m.status === 'FINISHED' && m.winner_team_id) {
        const rowA = m.team_a_id ? table.get(m.team_a_id) : null
        const rowB = m.team_b_id ? table.get(m.team_b_id) : null

        if (rowA) rowA.pj++
        if (rowB) rowB.pj++

        if (m.winner_team_id === m.team_a_id) {
          if (rowA) {
            rowA.pg++
            rowA.pts += 2
          }
          if (rowB) rowB.pp++
        } else if (m.winner_team_id === m.team_b_id) {
          if (rowB) {
            rowB.pg++
            rowB.pts += 2
          }
          if (rowA) rowA.pp++
        }
      }
    })

    return Array.from(table.values()).sort((a, b) => b.pts - a.pts || b.pg - a.pg)
  }

  const handleRegisterTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regCategory || !regTeamName.trim() || !regPlayer1.trim() || !regPhone.trim()) {
      toast.error('Completá los datos obligatorios')
      return
    }

    setRegLoading(true)
    try {
      const res = await addTeamToCategory({
        category_id: regCategory,
        name: regTeamName.trim(),
        player_1: regPlayer1.trim(),
        player_2: regPlayer2.trim() || undefined,
        phone: regPhone.trim(),
      })

      if (res.success) {
        toast.success('¡Inscripción registrada con éxito!')
        setRegSuccess(true)
        if (res.team?.id) {
          setRegTeamId(res.team.id)
        }
        await loadTournament()
      } else {
        toast.error(res.error || 'No se pudo completar la inscripción')
      }
    } catch {
      toast.error('Error al registrar inscripción')
    } finally {
      setRegLoading(false)
    }
  }

  const handlePayWithMercadoPago = async () => {
    if (!regTeamId) return
    setMpLoading(true)
    try {
      const res = await createTournamentRegistrationPaymentPreference(regTeamId)
      if (res.success && res.init_point) {
        window.location.href = res.init_point
      } else {
        toast.error(res.error || 'No se pudo generar la preferencia de Mercado Pago')
      }
    } catch {
      toast.error('Error de conexión con Mercado Pago')
    } finally {
      setMpLoading(false)
    }
  }

  const handleJoinWaitlist = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!waitlistCategory || !waitlistTeamName.trim() || !waitlistPlayer1.trim() || !waitlistPhone.trim()) {
      toast.error('Completá los datos obligatorios')
      return
    }

    setWaitlistLoading(true)
    try {
      const res = await joinTournamentWaitlist({
        category_id: waitlistCategory,
        name: waitlistTeamName.trim(),
        player_1: waitlistPlayer1.trim(),
        player_2: waitlistPlayer2.trim() || undefined,
        phone: waitlistPhone.trim(),
      })

      if (res.success && res.position) {
        setWaitlistSuccess({ position: res.position })
        toast.success(`¡Anotado en lista de espera! Posición #${res.position}`)
        await loadTournament()
      } else {
        toast.error(res.error || 'No se pudo registrar en la lista de espera')
      }
    } catch {
      toast.error('Error de red al registrar en lista de espera')
    } finally {
      setWaitlistLoading(false)
    }
  }

  const handleOpenRanking = async () => {
    if (!tournament?.tenant_id) return
    setIsRankingOpen(true)
    setRankingLoading(true)
    try {
      const data = await getClubTournamentRanking(tournament.tenant_id, tournament.sport)
      setRankingList(data)
    } catch {
      toast.error('Error al cargar el ranking del club')
    } finally {
      setRankingLoading(false)
    }
  }

  const handleResetModal = () => {
    setIsRegisterOpen(false)
    setRegSuccess(false)
    setRegTeamName('')
    setRegPlayer1('')
    setRegPlayer2('')
    setRegPhone('')
    setRegTeamId(null)
  }

  const handleResetWaitlistModal = () => {
    setIsWaitlistOpen(false)
    setWaitlistSuccess(null)
    setWaitlistTeamName('')
    setWaitlistPlayer1('')
    setWaitlistPlayer2('')
    setWaitlistPhone('')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-400 mb-3" />
        <p className="text-sm font-medium">Cargando cuadro del torneo en vivo...</p>
      </div>
    )
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 p-4">
        <Trophy className="w-12 h-12 text-slate-600 mb-3" />
        <h2 className="text-xl font-bold text-white">Torneo no encontrado</h2>
        <p className="text-sm text-slate-500 mt-1">El enlace puede haber caducado o el torneo fue archivado.</p>
        <Link href="/" className="mt-4">
          <Button variant="outline" className="border-slate-800 text-white">
            Volver al Inicio
          </Button>
        </Link>
      </div>
    )
  }

  const isFoot = tournament.sport === 'FUTBOL_5' || tournament.sport === 'FUTBOL_7' || tournament.sport === 'FUTBOL_11'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Barra superior con branding CancharClub */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/90 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>CancharClub</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-semibold text-emerald-400 animate-pulse">
              <Radio className="w-3 h-3 text-emerald-400" />
              En Vivo
            </span>

            <Button
              size="sm"
              variant="outline"
              onClick={handleOpenRanking}
              className="border-amber-500/30 bg-amber-950/20 hover:bg-amber-900/40 text-amber-300 font-semibold h-8 text-xs gap-1.5"
            >
              <Medal className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Ranking del Club</span>
              <span className="sm:hidden">Ranking</span>
            </Button>

            <Button
              size="sm"
              onClick={() => {
                setRegCategory(selectedCatId || tournament.categories[0]?.id || '')
                setIsRegisterOpen(true)
              }}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold h-8 text-xs shadow-md shadow-amber-950/40"
            >
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              {isFoot ? 'Inscribir Equipo' : 'Inscribir Pareja'}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleShare}
              className="border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 font-semibold h-8 text-xs"
            >
              <Share2 className="w-3.5 h-3.5 mr-1.5" />
              Compartir
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Header del Torneo */}
      <div className="bg-gradient-to-b from-slate-900 via-slate-900/60 to-slate-950 border-b border-slate-800/80 px-4 py-8">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              {tournament.sport}
            </Badge>
            <Badge variant="outline" className="border-slate-700 text-slate-300">
              {tournament.status === 'IN_PROGRESS' ? 'En Curso' : tournament.status}
            </Badge>
            {hasGroups && (
              <Badge className="bg-purple-500/10 text-purple-400 border border-purple-500/30">
                Fase de Grupos + Playoffs
              </Badge>
            )}
          </div>

          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-amber-400 shrink-0" />
              <span>{tournament.name}</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Cuadro oficial, tablas de posiciones y marcadores en tiempo real.
            </p>
          </div>

          {/* Banner de Inscripción Abierta */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-amber-300">Inscripciones Abiertas</span>
                <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px] border-emerald-500/40">
                  Cupos Limitados
                </Badge>
                {selectedCategory?.entry_fee_ars && selectedCategory.entry_fee_ars > 0 ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 font-semibold text-[10px] border border-emerald-500/30">
                    Inscripción: ${selectedCategory.entry_fee_ars.toLocaleString('es-AR')} ARS
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-slate-300">
                {selectedCategory
                  ? `${selectedCategory.name}: ${selectedCategory.teams.length} / ${selectedCategory.max_teams || 8} ${isFoot ? 'equipos' : 'parejas'} anotadas`
                  : `Inscribí a tu ${isFoot ? 'equipo' : 'pareja'} online y asegurá tu lugar en el cuadro oficial`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedCategory && selectedCategory.teams.length >= (selectedCategory.max_teams || 8) ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setWaitlistCategory(selectedCategory.id)
                    setIsWaitlistOpen(true)
                  }}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shrink-0 shadow-md gap-1"
                >
                  <Clock className="w-3.5 h-3.5" />
                  Lista de Espera
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    setRegCategory(selectedCatId || tournament.categories[0]?.id || '')
                    setIsRegisterOpen(true)
                  }}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shrink-0 shadow-md"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                  {isFoot ? 'Anotar Equipo' : 'Anotar Pareja'}
                </Button>
              )}
            </div>
          </div>

          {/* Selector de Categorías */}
          {tournament.categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="text-xs text-slate-400 font-medium mr-1">Categorías:</span>
              {tournament.categories.map((cat) => {
                const isFoot = tournament.sport === 'FUTBOL_5' || tournament.sport === 'FUTBOL_7' || tournament.sport === 'FUTBOL_11'
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCatId(cat.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      selectedCatId === cat.id
                        ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                        : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60'
                    }`}
                  >
                    {cat.name} ({cat.teams.length} {isFoot ? 'equipos' : 'parejas'})
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        {/* Tablas de Posiciones de Grupos si aplica */}
        {hasGroups && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400" />
              <span>Fase de Grupos</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Grupo A */}
              {groupAMatches.length > 0 && (
                <Card className="bg-slate-900/60 border-slate-800">
                  <CardHeader className="p-4 border-b border-slate-800 bg-slate-950/40">
                    <CardTitle className="text-sm font-bold text-white flex items-center justify-between">
                      <span>Zona A</span>
                      <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px]">
                        Clasifican 2 a Semis
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/20">
                          <th className="py-2.5 px-3">Pos</th>
                          <th className="py-2.5 px-3">Equipo</th>
                          <th className="py-2.5 px-3 text-center">PJ</th>
                          <th className="py-2.5 px-3 text-center">PG</th>
                          <th className="py-2.5 px-3 text-center">PP</th>
                          <th className="py-2.5 px-3 text-right font-bold text-emerald-400">Pts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50 font-mono">
                        {computeStandings(groupAMatches).map((row, idx) => (
                          <tr key={row.team.id} className={idx < 2 ? 'bg-emerald-500/5' : ''}>
                            <td className="py-2.5 px-3 text-slate-400">#{idx + 1}</td>
                            <td className="py-2.5 px-3 font-sans font-medium text-white">{row.team.name}</td>
                            <td className="py-2.5 px-3 text-center text-slate-300">{row.pj}</td>
                            <td className="py-2.5 px-3 text-center text-emerald-400">{row.pg}</td>
                            <td className="py-2.5 px-3 text-center text-rose-400">{row.pp}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-400">{row.pts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}

              {/* Grupo B */}
              {groupBMatches.length > 0 && (
                <Card className="bg-slate-900/60 border-slate-800">
                  <CardHeader className="p-4 border-b border-slate-800 bg-slate-950/40">
                    <CardTitle className="text-sm font-bold text-white flex items-center justify-between">
                      <span>Zona B</span>
                      <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px]">
                        Clasifican 2 a Semis
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/20">
                          <th className="py-2.5 px-3">Pos</th>
                          <th className="py-2.5 px-3">Equipo</th>
                          <th className="py-2.5 px-3 text-center">PJ</th>
                          <th className="py-2.5 px-3 text-center">PG</th>
                          <th className="py-2.5 px-3 text-center">PP</th>
                          <th className="py-2.5 px-3 text-right font-bold text-emerald-400">Pts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50 font-mono">
                        {computeStandings(groupBMatches).map((row, idx) => (
                          <tr key={row.team.id} className={idx < 2 ? 'bg-emerald-500/5' : ''}>
                            <td className="py-2.5 px-3 text-slate-400">#{idx + 1}</td>
                            <td className="py-2.5 px-3 font-sans font-medium text-white">{row.team.name}</td>
                            <td className="py-2.5 px-3 text-center text-slate-300">{row.pj}</td>
                            <td className="py-2.5 px-3 text-center text-emerald-400">{row.pg}</td>
                            <td className="py-2.5 px-3 text-center text-rose-400">{row.pp}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-400">{row.pts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Llave Eliminatoria (Playoffs) */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span>Cuadro Eliminatorio (Playoffs)</span>
          </h2>

          <div className="flex flex-col lg:flex-row gap-6 overflow-x-auto pb-4 items-start min-w-0">
            {/* Columna Dieciseisavos */}
            {dieciseisavos.length > 0 && (
              <div className="space-y-4 w-full lg:min-w-65 lg:flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 text-center">
                  16avos de Final
                </p>
                <div className="space-y-3">
                  {dieciseisavos.map((match) => (
                    <MatchCard key={match.id} match={match} teamsMap={teamsMap} />
                  ))}
                </div>
              </div>
            )}

            {/* Columna Octavos */}
            {octavos.length > 0 && (
              <div className="space-y-4 w-full lg:min-w-65 lg:flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 text-center">
                  Octavos de Final
                </p>
                <div className="space-y-3">
                  {octavos.map((match) => (
                    <MatchCard key={match.id} match={match} teamsMap={teamsMap} />
                  ))}
                </div>
              </div>
            )}

            {/* Columna Cuartos */}
            {cuartos.length > 0 && (
              <div className="space-y-4 w-full lg:min-w-65 lg:flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 text-center">
                  Cuartos de Final
                </p>
                <div className="space-y-3">
                  {cuartos.map((match) => (
                    <MatchCard key={match.id} match={match} teamsMap={teamsMap} />
                  ))}
                </div>
              </div>
            )}

            {/* Columna Semifinales */}
            <div className="space-y-4 w-full lg:min-w-65 lg:flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 text-center">
                Semifinales
              </p>
              <div className="space-y-3">
                {semis.map((match) => (
                  <MatchCard key={match.id} match={match} teamsMap={teamsMap} />
                ))}
              </div>
            </div>

            {/* Columna Gran Final */}
            <div className="space-y-4 w-full lg:min-w-65 lg:flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-400 text-center flex items-center justify-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                Gran Final
              </p>
              {finalMatch ? (
                <div className="p-1 rounded-2xl bg-linear-to-r from-amber-500/30 via-emerald-500/30 to-amber-500/30 shadow-xl">
                  <MatchCard match={finalMatch} teamsMap={teamsMap} isFinal />
                </div>
              ) : (
                <div className="p-8 border border-dashed border-slate-800 rounded-2xl text-center text-slate-500 text-xs">
                  A definir tras semifinales
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Modal: Inscripción Pública al Torneo */}
      <Dialog open={isRegisterOpen} onOpenChange={(open) => {
        if (!open) handleResetModal()
        else setIsRegisterOpen(true)
      }}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto w-[95vw] sm:w-full bg-slate-950 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Trophy className="w-5 h-5 text-amber-400" />
              <span>Inscripción al Torneo</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              {regSuccess 
                ? '¡Tu inscripción ha sido registrada exitosamente!'
                : `Completá los datos para sumarte al cuadro oficial de ${tournament.name}.`}
            </DialogDescription>
          </DialogHeader>

          {regSuccess ? (
            <div className="py-4 space-y-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h4 className="text-base font-bold text-white">
                  {isFoot ? '¡Equipo inscripto con éxito!' : '¡Pareja inscripta con éxito!'}
                </h4>
                <p className="text-xs text-slate-300">
                  <strong className="text-white">{regTeamName}</strong> ya figura en el listado de inscriptos.
                </p>
              </div>

              {(() => {
                const catObj = tournament.categories.find(c => c.id === regCategory)
                return catObj?.entry_fee_ars && catObj.entry_fee_ars > 0 ? (
                  <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">Inscripción oficial:</span>
                      <Badge className="bg-emerald-500/20 text-emerald-400 font-bold border-emerald-500/30">
                        ${catObj.entry_fee_ars.toLocaleString('es-AR')} ARS
                      </Badge>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      Aboná online ahora mismo con Mercado Pago para confirmar tu lugar en el torneo de forma inmediata.
                    </p>
                    <Button
                      onClick={handlePayWithMercadoPago}
                      disabled={mpLoading || !regTeamId}
                      className="w-full bg-[#009ee3] hover:bg-[#0082ba] text-white font-bold text-xs gap-1.5 shadow-md shadow-sky-950/40"
                    >
                      {mpLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CreditCard className="w-4 h-4" />
                      )}
                      Pagar con Mercado Pago
                    </Button>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-1">
                    <p className="font-semibold text-white">Siguiente paso:</p>
                    <p className="text-slate-400">
                      Enviá un mensaje al club por WhatsApp para coordinar el pago o la confirmación de asistencia.
                    </p>
                  </div>
                )
              })()}

              <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  onClick={() => {
                    const catObj = tournament.categories.find(c => c.id === regCategory)
                    const text = `¡Hola! Acabamos de inscribirnos online al torneo *${tournament.name}* en la categoría *${catObj?.name || 'Oficial'}*.\n\n*Equipo:* ${regTeamName}\n*Jugadores:* ${regPlayer1} y ${regPlayer2 || 'A confirmar'}\n*Tel:* ${regPhone}\n\n¿Por qué medio podemos coordinar la confirmación?`
                    window.open(buildWhatsAppLink(null, text), '_blank')
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5"
                >
                  <Phone className="w-4 h-4" />
                  Avisar al Club por WhatsApp
                </Button>
                <Button
                  variant="outline"
                  onClick={handleResetModal}
                  className="w-full border-slate-800 text-slate-300"
                >
                  Cerrar
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleRegisterTeam} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Categoría</Label>
                <select
                  value={regCategory}
                  onChange={(e) => setRegCategory(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-800 bg-slate-900 px-3 text-xs text-slate-200"
                  required
                >
                  {tournament.categories.map((cat) => {
                    const limit = cat.max_teams || 8
                    const isFull = cat.teams.length >= limit
                    const feeStr = cat.entry_fee_ars && cat.entry_fee_ars > 0 ? ` — $${cat.entry_fee_ars.toLocaleString('es-AR')}` : ''
                    return (
                      <option key={cat.id} value={cat.id} disabled={isFull}>
                        {cat.name} ({cat.teams.length}/{limit} {isFoot ? 'equipos' : 'parejas'}{feeStr}) {isFull ? '— COMPLETO' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">
                  {isFoot ? 'Nombre del Equipo' : 'Nombre de la Pareja'}
                </Label>
                <Input
                  placeholder={isFoot ? 'Ej. Los Galácticos FC' : 'Ej. González / Martínez'}
                  value={regTeamName}
                  onChange={(e) => setRegTeamName(e.target.value)}
                  required
                  className="bg-slate-900 border-slate-800 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-300">
                    {isFoot ? 'Capitán / Jugador 1' : 'Jugador 1'}
                  </Label>
                  <Input
                    placeholder="Nombre y Apellido"
                    value={regPlayer1}
                    onChange={(e) => setRegPlayer1(e.target.value)}
                    required
                    className="bg-slate-900 border-slate-800 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-300">
                    {isFoot ? 'Subcapitán (opcional)' : 'Jugador 2'}
                  </Label>
                  <Input
                    placeholder="Nombre y Apellido"
                    value={regPlayer2}
                    onChange={(e) => setRegPlayer2(e.target.value)}
                    required={!isFoot}
                    className="bg-slate-900 border-slate-800 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">WhatsApp de Contacto</Label>
                <Input
                  type="tel"
                  placeholder="Ej. +54 9 11 1234-5678"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  required
                  className="bg-slate-900 border-slate-800 text-xs"
                />
                <p className="text-[11px] text-slate-500">
                  Recibirás las notificaciones de fixture, horarios y confirmación de pago por este número.
                </p>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetModal}
                  className="border-slate-800 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={regLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                >
                  {regLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Confirmar Inscripción'
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Lista de Espera Pública */}
      <Dialog open={isWaitlistOpen} onOpenChange={setIsWaitlistOpen}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto w-[95vw] sm:w-full bg-slate-950 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Clock className="w-5 h-5 text-amber-400" />
              Lista de Espera del Torneo
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              El cupo principal está lleno. Anotate y serás notificado automáticamente por WhatsApp apenas se libere un lugar.
            </DialogDescription>
          </DialogHeader>

          {waitlistSuccess ? (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center space-y-2">
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs px-2.5 py-1">
                  Posición #{waitlistSuccess.position} en espera
                </Badge>
                <p className="text-sm font-bold text-white">
                  ¡Registro en lista de espera confirmado!
                </p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Si algún equipo cancela o se libera un cupo en esta categoría, el sistema te enviará una notificación instantánea a tu WhatsApp.
                </p>
              </div>

              <DialogFooter>
                <Button
                  onClick={handleResetWaitlistModal}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs"
                >
                  Entendido
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleJoinWaitlist} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Categoría</Label>
                <select
                  value={waitlistCategory}
                  onChange={(e) => setWaitlistCategory(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-800 bg-slate-900 px-3 text-xs text-slate-200"
                  required
                >
                  <option value="">-- Seleccionar Categoría --</option>
                  {tournament.categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({cat.teams.length}/{cat.max_teams || 8})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">
                  {isFoot ? 'Nombre del Equipo' : 'Nombre de la Pareja'}
                </Label>
                <Input
                  placeholder={isFoot ? 'Ej. Los Galácticos FC' : 'Ej. González / Martínez'}
                  value={waitlistTeamName}
                  onChange={(e) => setWaitlistTeamName(e.target.value)}
                  required
                  className="bg-slate-900 border-slate-800 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-300">
                    {isFoot ? 'Capitán / Jugador 1' : 'Jugador 1'}
                  </Label>
                  <Input
                    placeholder="Nombre y Apellido"
                    value={waitlistPlayer1}
                    onChange={(e) => setWaitlistPlayer1(e.target.value)}
                    required
                    className="bg-slate-900 border-slate-800 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-300">
                    {isFoot ? 'Subcapitán (opcional)' : 'Jugador 2'}
                  </Label>
                  <Input
                    placeholder="Nombre y Apellido"
                    value={waitlistPlayer2}
                    onChange={(e) => setWaitlistPlayer2(e.target.value)}
                    required={!isFoot}
                    className="bg-slate-900 border-slate-800 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">WhatsApp para recibir el aviso</Label>
                <Input
                  type="tel"
                  placeholder="Ej. +54 9 11 1234-5678"
                  value={waitlistPhone}
                  onChange={(e) => setWaitlistPhone(e.target.value)}
                  required
                  className="bg-slate-900 border-slate-800 text-xs"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetWaitlistModal}
                  className="border-slate-800 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={waitlistLoading}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs"
                >
                  {waitlistLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Anotarme en Lista de Espera'
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Ranking Oficial del Club */}
      <Dialog open={isRankingOpen} onOpenChange={setIsRankingOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto w-[95vw] sm:w-full bg-slate-950 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Medal className="w-5 h-5 text-amber-400" />
              Ranking Oficial del Club
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Puntuación acumulada en torneos oficiales CancharClub para {tournament.sport.replace('_', ' ')}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {rankingLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                <span className="text-xs">Cargando posiciones del club...</span>
              </div>
            ) : rankingList.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 space-y-2">
                <Trophy className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-white">Aún no hay puntuaciones acumuladas</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Los puntos se computan automáticamente con los partidos disputados y campeonatos de torneos oficiales del club.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {rankingList.map((rank) => (
                  <div
                    key={rank.name}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                      rank.rank === 1
                        ? 'bg-amber-500/10 border-amber-500/40'
                        : rank.rank === 2
                        ? 'bg-slate-800/60 border-slate-600'
                        : rank.rank === 3
                        ? 'bg-amber-900/15 border-amber-800/40'
                        : 'bg-slate-900/50 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs font-mono shrink-0 ${
                          rank.rank === 1
                            ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                            : rank.rank === 2
                            ? 'bg-slate-300 text-slate-950'
                            : rank.rank === 3
                            ? 'bg-amber-700 text-white'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        #{rank.rank}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                          {rank.name}
                          {rank.partner && <span className="text-slate-400 font-normal">/ {rank.partner}</span>}
                          {rank.titles_count > 0 && (
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[9px] px-1 py-0 font-bold flex items-center gap-1">
                              <Trophy className="w-2.5 h-2.5" />
                              {rank.titles_count} {rank.titles_count === 1 ? 'título' : 'títulos'}
                            </Badge>
                          )}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {rank.tournaments_played} {rank.tournaments_played === 1 ? 'torneo jugado' : 'torneos jugados'} • {rank.matches_won} victorias ({rank.win_rate_pct}% efectividad)
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-sm font-black text-emerald-400 font-mono">
                        {rank.points}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 ml-1">pts</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRankingOpen(false)}
              className="border-slate-800 text-slate-300 text-xs"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MatchCard({
  match,
  teamsMap,
  isFinal = false,
}: {
  match: TournamentMatch
  teamsMap: Map<string, TournamentTeam>
  isFinal?: boolean
}) {
  const teamA = match.team_a_id ? teamsMap.get(match.team_a_id) : null
  const teamB = match.team_b_id ? teamsMap.get(match.team_b_id) : null

  const isWinnerA = match.winner_team_id && match.winner_team_id === match.team_a_id
  const isWinnerB = match.winner_team_id && match.winner_team_id === match.team_b_id

  return (
    <div
      className={`p-3.5 rounded-xl border transition-all ${
        isFinal
          ? 'bg-slate-900 border-amber-500/40'
          : match.status === 'PLAYING'
          ? 'bg-slate-900/90 border-emerald-500/60 shadow-lg shadow-emerald-500/5'
          : 'bg-slate-900/60 border-slate-800'
      }`}
    >
      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2 border-b border-slate-800/70 pb-1.5">
        <span className="font-mono">Partido #{match.match_number}</span>
        <div className="flex items-center gap-1.5">
          {match.status === 'PLAYING' && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold animate-pulse">
              EN JUEGO
            </span>
          )}
          {match.status === 'FINISHED' && (
            <span className="text-slate-500 text-[10px]">FINALIZADO</span>
          )}
          <span>{match.scheduled_time}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {/* Equipo A */}
        <div
          className={`flex items-center justify-between p-2 rounded-lg text-xs transition-colors ${
            isWinnerA
              ? 'bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/30'
              : 'text-slate-200'
          }`}
        >
          <span className="truncate pr-2">
            {teamA ? teamA.name : <span className="text-slate-500 italic">Por Definir</span>}
          </span>
          <span className="font-mono font-bold text-slate-300">
            {match.score_team_a || '—'}
          </span>
        </div>

        {/* Equipo B */}
        <div
          className={`flex items-center justify-between p-2 rounded-lg text-xs transition-colors ${
            isWinnerB
              ? 'bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/30'
              : 'text-slate-200'
          }`}
        >
          <span className="truncate pr-2">
            {teamB ? teamB.name : <span className="text-slate-500 italic">Por Definir</span>}
          </span>
          <span className="font-mono font-bold text-slate-300">
            {match.score_team_b || '—'}
          </span>
        </div>
      </div>

      {match.court_name && (
        <div className="mt-2 pt-1 text-[10px] text-slate-500 flex items-center gap-1">
          <MapPin className="w-3 h-3 text-slate-600" />
          <span>{match.court_name}</span>
        </div>
      )}
    </div>
  )
}
