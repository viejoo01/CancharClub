'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  Trophy, 
  Plus, 
  Users, 
  Swords, 
  Share2, 
  ExternalLink,
  Medal,
  Sparkles,
  Loader2,
  Phone,
  Trash2,
  Shield,
  Settings2,
  CheckCircle2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
  getTournaments, 
  getTournamentById, 
  createTournament, 
  addTeamToCategory, 
  generatePlayoffBracket, 
  generateGroupStageAndPlayoffs,
  updateMatchScore,
  updateTournamentFormat,
  advanceGroupWinnersToPlayoffs,
  deleteTeam,
  type TournamentWithDetails 
} from '@/actions/tournament.actions'
import { toast } from 'sonner'
import { useTenantId } from '@/hooks/use-tenant-id'
import { PlanFeatureGuard } from '@/components/dashboard/plan-feature-guard'
import type { Tournament, TournamentTeam, TournamentMatch } from '@/types/database'

interface GroupStandingRow {
  teamId: string
  name: string
  pj: number
  pg: number
  pp: number
  sf: number
  sc: number
  dif: number
  pts: number
}

// Helpers para distinguir fútbol vs pádel/tenis
const isFootballSport = (sport?: string) => {
  return sport === 'FUTBOL_5' || sport === 'FUTBOL_7' || sport === 'FUTBOL_11'
}

const getParticipantLabel = (sport?: string, plural = false) => {
  const isFoot = isFootballSport(sport)
  if (plural) return isFoot ? 'equipos' : 'parejas'
  return isFoot ? 'equipo' : 'pareja'
}

const getParticipantLabelCapitalized = (sport?: string, plural = false) => {
  const isFoot = isFootballSport(sport)
  if (plural) return isFoot ? 'Equipos' : 'Parejas'
  return isFoot ? 'Equipo' : 'Pareja'
}

// Cálculo automático de Tabla de Posiciones de Fase de Grupos
function computeGroupStandings(matches: TournamentMatch[], allTeams: TournamentTeam[]): GroupStandingRow[] {
  const groupTeamIds = new Set<string>()
  matches.forEach(m => {
    if (m.team_a_id) groupTeamIds.add(m.team_a_id)
    if (m.team_b_id) groupTeamIds.add(m.team_b_id)
  })

  const rows: GroupStandingRow[] = Array.from(groupTeamIds).map(id => {
    const team = allTeams.find(t => t.id === id)
    return {
      teamId: id,
      name: team?.name || 'Equipo',
      pj: 0,
      pg: 0,
      pp: 0,
      sf: 0,
      sc: 0,
      dif: 0,
      pts: 0,
    }
  })

  const map = new Map(rows.map(r => [r.teamId, r]))

  matches.forEach(m => {
    if (m.status !== 'FINISHED' || !m.team_a_id || !m.team_b_id) return
    const tA = map.get(m.team_a_id)
    const tB = map.get(m.team_b_id)
    if (!tA || !tB) return

    const scoreA = Number(m.score_team_a) || 0
    const scoreB = Number(m.score_team_b) || 0

    tA.pj += 1
    tB.pj += 1
    tA.sf += scoreA
    tA.sc += scoreB
    tB.sf += scoreB
    tB.sc += scoreA

    if (m.winner_team_id === m.team_a_id || scoreA > scoreB) {
      tA.pg += 1
      tA.pts += 3
      tB.pp += 1
    } else if (m.winner_team_id === m.team_b_id || scoreB > scoreA) {
      tB.pg += 1
      tB.pts += 3
      tA.pp += 1
    } else {
      tA.pts += 1
      tB.pts += 1
    }
  })

  rows.forEach(r => {
    r.dif = r.sf - r.sc
  })

  return rows.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    if (b.dif !== a.dif) return b.dif - a.dif
    return b.sf - a.sf
  })
}

export default function TorneosDashboardPage() {
  const tenantId = useTenantId()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedTournament, setSelectedTournament] = useState<TournamentWithDetails | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // Modales
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isTeamOpen, setIsTeamOpen] = useState(false)
  const [isScoreOpen, setIsScoreOpen] = useState(false)
  const [selectedMatch, setSelectedMatch] = useState<TournamentMatch | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Form crear torneo
  const [newTourName, setNewTourName] = useState('')
  const [newTourSport, setNewTourSport] = useState('PADEL')
  const [newTourFormat, setNewTourFormat] = useState<'PLAYOFFS' | 'GROUPS_AND_PLAYOFFS'>('GROUPS_AND_PLAYOFFS')
  const [newTourStart, setNewTourStart] = useState(() => new Date().toISOString().split('T')[0])
  const [newTourEnd, setNewTourEnd] = useState(() => new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0])
  const [newTourCats, setNewTourCats] = useState('4ta Caballeros, 6ta Damas, Suma 11')

  // Form inscribir equipo
  const [teamName, setTeamName] = useState('')
  const [player1, setPlayer1] = useState('')
  const [player2, setPlayer2] = useState('')
  const [teamPhone, setTeamPhone] = useState('')

  // Form marcador
  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')
  const [winnerId, setWinnerId] = useState('')

  const isCurrentFootball = isFootballSport(selectedTournament?.sport)

  const loadTournamentDetails = useCallback(async (id: string, showToastOnError = false) => {
    try {
      const details = await getTournamentById(id)
      setSelectedTournament(details)
      if (details?.categories && details.categories.length > 0) {
        setSelectedCategoryId((prev) => {
          if (prev && details.categories.some((c) => c.id === prev)) return prev
          return details.categories[0].id
        })
      }
    } catch {
      if (showToastOnError) toast.error('Error al cargar detalle del torneo')
    }
  }, [])

  const loadTournaments = useCallback(async (isInitial = false) => {
    if (!tenantId) return
    try {
      const list = await getTournaments(tenantId)
      setTournaments(list)
      if (list.length > 0) {
        setSelectedTournament((prev) => {
          const currentId = prev?.id && list.some((t) => t.id === prev.id) ? prev.id : list[0].id
          loadTournamentDetails(currentId, isInitial)
          return prev
        })
      } else {
        setSelectedTournament(null)
      }
    } catch {
      if (isInitial) toast.error('Error al cargar torneos')
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [tenantId, loadTournamentDetails])

  useEffect(() => {
    if (!tenantId) return

    const run = async () => {
      try {
        await loadTournaments(true)
      } catch {}
    }
    void run()

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void loadTournaments(false)
    }, 60000)

    const handleSync = () => void loadTournaments(false)
    window.addEventListener('focus', handleSync)
    document.addEventListener('visibilitychange', handleSync)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleSync)
      document.removeEventListener('visibilitychange', handleSync)
    }
  }, [tenantId, loadTournaments])

  const handleSportChange = (sport: string) => {
    setNewTourSport(sport)
    if (isFootballSport(sport)) {
      if (newTourCats === '4ta Caballeros, 6ta Damas, Suma 11' || !newTourCats.trim()) {
        setNewTourCats('Libre, Senior +35, Femenino')
      }
    } else if (sport === 'PADEL') {
      if (newTourCats === 'Libre, Senior +35, Femenino' || !newTourCats.trim()) {
        setNewTourCats('4ta Caballeros, 6ta Damas, Suma 11')
      }
    }
  }

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTourName.trim()) return

    setActionLoading(true)
    try {
      const cats = newTourCats
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
        .map((name) => ({ name, max_teams: 8 }))

      const res = await createTournament({
        tenant_id: tenantId!,
        name: newTourName,
        sport: newTourSport,
        format: newTourFormat,
        start_date: newTourStart,
        end_date: newTourEnd,
        categories: cats,
      })

      if (res.success && res.tournament_id) {
        toast.success('¡Torneo creado exitosamente!')
        setIsCreateOpen(false)
        setNewTourName('')
        await loadTournaments()
        await loadTournamentDetails(res.tournament_id)
      } else {
        toast.error(res.error || 'No se pudo crear el torneo')
      }
    } catch {
      toast.error('Error de red al crear torneo')
    } finally {
      setActionLoading(false)
    }
  }

  const handleFormatChange = async (newFormat: 'PLAYOFFS' | 'GROUPS_AND_PLAYOFFS') => {
    if (!selectedTournament) return
    setActionLoading(true)
    try {
      const res = await updateTournamentFormat(selectedTournament.id, newFormat)
      if (res.success) {
        toast.success(`Formato actualizado a: ${newFormat === 'GROUPS_AND_PLAYOFFS' ? 'Fase de Grupos + Playoffs' : 'Eliminación Directa'}`)
        await loadTournamentDetails(selectedTournament.id)
      } else {
        toast.error(res.error || 'Error al actualizar formato')
      }
    } catch {
      toast.error('Error al actualizar formato')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCategoryId) return

    const isFoot = isFootballSport(selectedTournament?.sport)
    if (isFoot) {
      if (!teamName.trim() || !player1.trim()) {
        toast.error('Completá el nombre del equipo y el delegado/capitán')
        return
      }
    } else {
      if (!player1.trim()) {
        toast.error('Ingresá el nombre del Jugador 1')
        return
      }
    }

    setActionLoading(true)
    try {
      const finalName = teamName.trim() || (isFoot ? `${player1} FC` : `${player1} / ${player2 || 'Invitado'}`)
      const res = await addTeamToCategory({
        category_id: selectedCategoryId,
        name: finalName,
        player_1: player1.trim(),
        player_2: player2.trim(),
        phone: teamPhone.trim(),
      })

      if (res.success) {
        toast.success(isFoot ? '¡Equipo inscripto exitosamente!' : '¡Pareja inscripta!')
        setIsTeamOpen(false)
        setTeamName('')
        setPlayer1('')
        setPlayer2('')
        setTeamPhone('')
        if (selectedTournament) {
          await loadTournamentDetails(selectedTournament.id)
        }
      } else {
        toast.error(res.error || 'Error al inscribir')
      }
    } catch {
      toast.error('Error inesperado')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteTeam = async (teamId: string, teamLabel: string) => {
    const isFoot = isFootballSport(selectedTournament?.sport)
    const entity = isFoot ? 'equipo' : 'pareja'
    if (!confirm(`¿Eliminar la inscripción del ${entity} "${teamLabel}"? Se quitará de la lista y de los partidos no jugados.`)) {
      return
    }

    setActionLoading(true)
    try {
      const res = await deleteTeam(teamId)
      if (res.success) {
        toast.success(`Inscripción de "${teamLabel}" eliminada`)
        if (selectedTournament) {
          await loadTournamentDetails(selectedTournament.id)
        }
      } else {
        toast.error(res.error || 'Error al eliminar')
      }
    } catch {
      toast.error('Error al eliminar inscripción')
    } finally {
      setActionLoading(false)
    }
  }

  const handleGenerateBracket = async () => {
    if (!selectedCategoryId) return
    setActionLoading(true)
    try {
      const res = await generatePlayoffBracket(selectedCategoryId)
      if (res.success) {
        toast.success(`¡Cuadro generado con ${res.matchesCount} partidos!`)
        if (selectedTournament) {
          await loadTournamentDetails(selectedTournament.id)
        }
      } else {
        toast.error(res.error || 'Error al armar el cuadro')
      }
    } catch {
      toast.error('Error al generar cuadro')
    } finally {
      setActionLoading(false)
    }
  }

  const handleGenerateGroups = async () => {
    if (!selectedCategoryId) return
    setActionLoading(true)
    try {
      const res = await generateGroupStageAndPlayoffs(selectedCategoryId)
      if (res.success) {
        toast.success(`¡Fase de grupos y playoffs generados (${res.matchesCount} partidos)!`)
        if (selectedTournament) {
          await loadTournamentDetails(selectedTournament.id)
        }
      } else {
        toast.error(res.error || 'Error al armar grupos')
      }
    } catch {
      toast.error('Error al generar fase de grupos')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSaveScore = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedMatch || !selectedCategoryId) return

    setActionLoading(true)
    try {
      const res = await updateMatchScore({
        matchId: selectedMatch.id,
        categoryId: selectedCategoryId,
        score_team_a: scoreA,
        score_team_b: scoreB,
        winner_team_id: winnerId,
        status: winnerId ? 'FINISHED' : 'PLAYING',
      })

      if (res.success) {
        toast.success('¡Marcador actualizado! El cuadro avanzó automáticamente.')
        setIsScoreOpen(false)
        setSelectedMatch(null)
        if (selectedTournament) {
          await loadTournamentDetails(selectedTournament.id)
        }
      } else {
        toast.error(res.error || 'Error al guardar marcador')
      }
    } catch {
      toast.error('Error de red')
    } finally {
      setActionLoading(false)
    }
  }

  const activeCategory = selectedTournament?.categories.find(
    (c) => c.id === selectedCategoryId
  )

  const teamsMap = new Map<string, TournamentTeam>()
  activeCategory?.teams.forEach((t) => teamsMap.set(t.id, t))

  const grupoAMatches = activeCategory?.matches.filter((m) => m.round === 'GRUPO_A') || []
  const grupoBMatches = activeCategory?.matches.filter((m) => m.round === 'GRUPO_B') || []
  const cuartosMatches = activeCategory?.matches.filter((m) => m.round === 'CUARTOS') || []
  const semisMatches = activeCategory?.matches.filter((m) => m.round === 'SEMIFINAL') || []
  const finalMatches = activeCategory?.matches.filter((m) => m.round === 'FINAL') || []
  const hasGroupMatches = grupoAMatches.length > 0 || grupoBMatches.length > 0

  const standingsA = computeGroupStandings(grupoAMatches, activeCategory?.teams || [])
  const standingsB = computeGroupStandings(grupoBMatches, activeCategory?.teams || [])

  const handleAdvanceQualifiers = async () => {
    if (!selectedCategoryId || !activeCategory) return
    if (standingsA.length < 2 || standingsB.length < 2) {
      toast.error('Se necesitan al menos 2 equipos con partidos disputados en cada zona')
      return
    }
    setActionLoading(true)
    try {
      const res = await advanceGroupWinnersToPlayoffs(selectedCategoryId, {
        firstAId: standingsA[0]?.teamId,
        secondAId: standingsA[1]?.teamId,
        firstBId: standingsB[0]?.teamId,
        secondBId: standingsB[1]?.teamId,
      })
      if (res.success) {
        toast.success('¡1° y 2° de cada zona clasificados a las Semifinales!')
        await loadTournamentDetails(selectedTournament!.id)
      } else {
        toast.error(res.error || 'Error al clasificar equipos')
      }
    } catch {
      toast.error('Error de red al clasificar a semifinales')
    } finally {
      setActionLoading(false)
    }
  }

  const copyPublicLink = () => {
    if (!selectedTournament) return
    const url = `${window.location.origin}/torneo/${selectedTournament.id}`
    navigator.clipboard.writeText(url)
    toast.success('¡Enlace público copiado al portapapeles!')
  }

  return (
    <PlanFeatureGuard feature="torneos_expres" featureTitle="Torneos y Cuadros Exprés">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <Trophy className="w-6 h-6 text-amber-400" />
                Torneos y Cuadros Exprés
              </h1>
              <Badge variant="outline" className="border-amber-500/30 text-amber-400 font-semibold text-xs">
                Fútbol & Pádel
              </Badge>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Organizá torneos relámpago de fútbol y pádel: fase de grupos, cruces eliminatorios y resultados en vivo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {selectedTournament && (
              <>
                <Button
                  variant="outline"
                  onClick={copyPublicLink}
                  className="border-slate-700 bg-slate-900/80 text-slate-200 hover:text-white text-xs gap-1.5"
                >
                  <Share2 className="w-4 h-4 text-amber-400" />
                  <span>Link Público</span>
                </Button>
                <a
                  href={`/torneo/${selectedTournament.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border border-slate-700 bg-slate-900/80 text-slate-200 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ver en Vivo</span>
                </a>
              </>
            )}
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5 shadow-lg shadow-emerald-950/40"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Torneo</span>
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
            <span className="text-sm font-medium">Cargando torneos...</span>
          </div>
        ) : tournaments.length === 0 ? (
          <Card className="bg-slate-900/60 border-slate-800 text-center py-16 px-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center mb-4">
              <Trophy className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Aún no hay torneos creados</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
              Creá tu primer torneo relámpago de fútbol o pádel con fase de grupos o eliminación directa modificable.
            </p>
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
            >
              <Plus className="w-4 h-4 mr-2" />
              Crear Torneo Ahora
            </Button>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Selector de Torneos Activos */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              {tournaments.map((t) => {
                const isFoot = isFootballSport(t.sport)
                return (
                  <button
                    key={t.id}
                    onClick={() => loadTournamentDetails(t.id)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border whitespace-nowrap ${
                      selectedTournament?.id === t.id
                        ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 shadow-md shadow-amber-950/40'
                        : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isFoot ? <Shield className="w-3.5 h-3.5 text-emerald-400" /> : <Trophy className="w-3.5 h-3.5 text-amber-400" />}
                    <span>{t.name}</span>
                    <span className="text-[10px] opacity-75">
                      ({t.sport.replace('_', ' ')})
                    </span>
                  </button>
                )
              })}
            </div>

            {selectedTournament && (
              <div className="space-y-6">
                {/* Barra de Control: Categoría, Formato Modificable y Acciones */}
                <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                  {/* Selector de Categorías */}
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">
                      Categoría:
                    </span>
                    {selectedTournament.categories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategoryId(cat.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border whitespace-nowrap ${
                          selectedCategoryId === cat.id
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {cat.name} ({cat.teams.length}/{cat.max_teams} {getParticipantLabel(selectedTournament.sport, true)})
                      </button>
                    ))}
                  </div>

                  {/* Selector y Acciones de Formato */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Conmutador de formato modificable */}
                    <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                      <span className="text-[11px] font-bold text-slate-400 px-2 flex items-center gap-1">
                        <Settings2 className="w-3 h-3 text-slate-500" />
                        Formato:
                      </span>
                      <button
                        type="button"
                        onClick={() => handleFormatChange('GROUPS_AND_PLAYOFFS')}
                        disabled={actionLoading}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                          selectedTournament.format === 'GROUPS_AND_PLAYOFFS'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Grupos + Playoffs
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFormatChange('PLAYOFFS')}
                        disabled={actionLoading}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                          selectedTournament.format === 'PLAYOFFS'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Playoffs Directo
                      </button>
                    </div>

                    {/* Botón Inscribir dinámico */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsTeamOpen(true)}
                      className="border-emerald-600/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50 hover:text-white text-xs gap-1 font-bold"
                    >
                      <Plus className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Inscribir {getParticipantLabelCapitalized(selectedTournament.sport)}</span>
                    </Button>

                    {/* Botones de generación de fixture */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleGenerateGroups}
                      disabled={actionLoading}
                      title="Genera Zonas A y B con todos contra todos y cuadro a Semifinales"
                      className="border-slate-700 bg-slate-950 hover:bg-slate-900 text-slate-300 font-bold text-xs gap-1"
                    >
                      <Users className="w-3.5 h-3.5 text-amber-400" />
                      <span>Armar Grupos</span>
                    </Button>

                    <Button
                      size="sm"
                      onClick={handleGenerateBracket}
                      disabled={actionLoading}
                      title="Genera cuadro de eliminación directa según cantidad de participantes"
                      className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs gap-1 shadow-md shadow-amber-950/40"
                    >
                      <Swords className="w-3.5 h-3.5" />
                      <span>Armar Playoffs</span>
                    </Button>
                  </div>
                </div>

                {/* Lista de Equipos / Parejas Inscriptos */}
                {activeCategory && (
                  <Card className="bg-slate-900/70 border-slate-800">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          {isCurrentFootball ? (
                            <Shield className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Users className="w-4 h-4 text-amber-400" />
                          )}
                          <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                            {getParticipantLabelCapitalized(selectedTournament.sport, true)} Inscriptos ({activeCategory.teams.length}/{activeCategory.max_teams})
                          </span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => setIsTeamOpen(true)}
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1 self-start sm:self-auto"
                        >
                          <Plus className="w-3 h-3" />
                          Anotar {getParticipantLabelCapitalized(selectedTournament.sport)}
                        </Button>
                      </div>

                      {activeCategory.teams.length === 0 ? (
                        <div className="text-center py-6 text-slate-500 text-xs">
                          No hay {getParticipantLabel(selectedTournament.sport, true)} inscriptos en esta categoría todavía. Hacé click en &ldquo;Anotar {getParticipantLabelCapitalized(selectedTournament.sport)}&rdquo; para sumar participantes.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                          {activeCategory.teams.map((t, idx) => (
                            <div
                              key={t.id}
                              className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 transition-colors flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-slate-500 font-mono">#{idx + 1}</span>
                                  <p className="text-xs font-bold text-white truncate">{t.name}</p>
                                </div>
                                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                  {isCurrentFootball ? (
                                    <>
                                      <span className="text-emerald-400 font-medium">Cap:</span> {t.player_1}
                                      {t.player_2 && <span className="text-slate-500"> • {t.player_2}</span>}
                                    </>
                                  ) : (
                                    <>
                                      {t.player_1} {t.player_2 ? `/ ${t.player_2}` : ''}
                                    </>
                                  )}
                                </p>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {t.phone && (
                                  <a
                                    href={`https://wa.me/${t.phone.replace(/[^0-9]/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Contactar por WhatsApp"
                                    className="p-1.5 rounded-lg bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/60 hover:text-white transition-colors border border-emerald-800/40"
                                  >
                                    <Phone className="w-3 h-3" />
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTeam(t.id, t.name)}
                                  title={`Eliminar ${getParticipantLabel(selectedTournament.sport)}`}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Vista Fase de Grupos (si existen) */}
                {hasGroupMatches && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-emerald-950/30 via-slate-900/60 to-slate-900/80 p-3.5 rounded-2xl border border-emerald-500/20">
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                          <Users className="w-4 h-4 text-emerald-400" />
                          Fase de Grupos en Vivo: {activeCategory?.name}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Zonas todos contra todos. Cargá los resultados para actualizar la tabla de posiciones en tiempo real.
                        </p>
                      </div>

                      {standingsA.length >= 2 && standingsB.length >= 2 && (
                        <Button
                          size="sm"
                          onClick={handleAdvanceQualifiers}
                          disabled={actionLoading}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5 shadow-md shadow-emerald-950/40 shrink-0"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Clasificar 1° y 2° a Semifinales</span>
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Zona A */}
                      <Card className="bg-slate-900/80 border-slate-800">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">Zona A</span>
                            <Badge variant="secondary" className="text-[10px]">{grupoAMatches.length} partidos</Badge>
                          </div>

                          {/* Tabla de Posiciones Zona A */}
                          {standingsA.length > 0 && (
                            <div className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden text-xs">
                              <div className="grid grid-cols-12 bg-slate-900/90 px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <span className="col-span-1">#</span>
                                <span className="col-span-5">{getParticipantLabelCapitalized(selectedTournament.sport)}</span>
                                <span className="col-span-1 text-center">PJ</span>
                                <span className="col-span-1 text-center">PG</span>
                                <span className="col-span-1 text-center">PP</span>
                                <span className="col-span-1 text-center">DIF</span>
                                <span className="col-span-2 text-right font-black text-emerald-400">PTS</span>
                              </div>
                              <div className="divide-y divide-slate-800/60">
                                {standingsA.map((row: GroupStandingRow, idx: number) => (
                                  <div key={row.teamId} className={`grid grid-cols-12 px-3 py-1.5 text-[11px] items-center ${idx < 2 ? 'bg-emerald-950/20' : ''}`}>
                                    <span className="col-span-1 font-bold text-slate-400">{idx + 1}</span>
                                    <span className="col-span-5 font-semibold text-white truncate">{row.name}</span>
                                    <span className="col-span-1 text-center text-slate-300 font-mono">{row.pj}</span>
                                    <span className="col-span-1 text-center text-emerald-400 font-mono">{row.pg}</span>
                                    <span className="col-span-1 text-center text-slate-400 font-mono">{row.pp}</span>
                                    <span className="col-span-1 text-center text-slate-300 font-mono">{row.dif > 0 ? `+${row.dif}` : row.dif}</span>
                                    <span className="col-span-2 text-right font-black text-emerald-400 font-mono">{row.pts}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="space-y-2">
                            {grupoAMatches.map((m) => {
                              const teamA = m.team_a_id ? teamsMap.get(m.team_a_id) : null
                              const teamB = m.team_b_id ? teamsMap.get(m.team_b_id) : null
                              const isFinished = m.status === 'FINISHED'
                              return (
                                <div key={m.id} className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                                    <span>Partido #{m.match_number}</span>
                                    <span className={isFinished ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                                      {isFinished ? 'Finalizado' : 'Pendiente'}
                                    </span>
                                  </div>
                                  <div className="space-y-1 text-xs">
                                    <div className={`flex justify-between ${m.winner_team_id === m.team_a_id ? 'text-emerald-400 font-bold' : 'text-slate-200'}`}>
                                      <span className="truncate">{teamA?.name || 'Equipo A'}</span>
                                      <span className="font-mono font-black">{m.score_team_a || '-'}</span>
                                    </div>
                                    <div className={`flex justify-between ${m.winner_team_id === m.team_b_id ? 'text-emerald-400 font-bold' : 'text-slate-200'}`}>
                                      <span className="truncate">{teamB?.name || 'Equipo B'}</span>
                                      <span className="font-mono font-black">{m.score_team_b || '-'}</span>
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedMatch(m)
                                      setScoreA(m.score_team_a || '')
                                      setScoreB(m.score_team_b || '')
                                      setWinnerId(m.winner_team_id || '')
                                      setIsScoreOpen(true)
                                    }}
                                    className="w-full h-6 text-[11px] border-slate-700 text-slate-300 hover:text-white"
                                  >
                                    {isFinished ? 'Modificar Marcador' : 'Cargar Marcador'}
                                  </Button>
                                </div>
                              )
                            })}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Zona B */}
                      <Card className="bg-slate-900/80 border-slate-800">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <span className="text-xs font-black text-amber-400 uppercase tracking-wider">Zona B</span>
                            <Badge variant="secondary" className="text-[10px]">{grupoBMatches.length} partidos</Badge>
                          </div>

                          {/* Tabla de Posiciones Zona B */}
                          {standingsB.length > 0 && (
                            <div className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden text-xs">
                              <div className="grid grid-cols-12 bg-slate-900/90 px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <span className="col-span-1">#</span>
                                <span className="col-span-5">{getParticipantLabelCapitalized(selectedTournament.sport)}</span>
                                <span className="col-span-1 text-center">PJ</span>
                                <span className="col-span-1 text-center">PG</span>
                                <span className="col-span-1 text-center">PP</span>
                                <span className="col-span-1 text-center">DIF</span>
                                <span className="col-span-2 text-right font-black text-amber-400">PTS</span>
                              </div>
                              <div className="divide-y divide-slate-800/60">
                                {standingsB.map((row: GroupStandingRow, idx: number) => (
                                  <div key={row.teamId} className={`grid grid-cols-12 px-3 py-1.5 text-[11px] items-center ${idx < 2 ? 'bg-amber-950/20' : ''}`}>
                                    <span className="col-span-1 font-bold text-slate-400">{idx + 1}</span>
                                    <span className="col-span-5 font-semibold text-white truncate">{row.name}</span>
                                    <span className="col-span-1 text-center text-slate-300 font-mono">{row.pj}</span>
                                    <span className="col-span-1 text-center text-amber-400 font-mono">{row.pg}</span>
                                    <span className="col-span-1 text-center text-slate-400 font-mono">{row.pp}</span>
                                    <span className="col-span-1 text-center text-slate-300 font-mono">{row.dif > 0 ? `+${row.dif}` : row.dif}</span>
                                    <span className="col-span-2 text-right font-black text-amber-400 font-mono">{row.pts}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="space-y-2">
                            {grupoBMatches.map((m) => {
                              const teamA = m.team_a_id ? teamsMap.get(m.team_a_id) : null
                              const teamB = m.team_b_id ? teamsMap.get(m.team_b_id) : null
                              const isFinished = m.status === 'FINISHED'
                              return (
                                <div key={m.id} className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                                    <span>Partido #{m.match_number}</span>
                                    <span className={isFinished ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                                      {isFinished ? 'Finalizado' : 'Pendiente'}
                                    </span>
                                  </div>
                                  <div className="space-y-1 text-xs">
                                    <div className={`flex justify-between ${m.winner_team_id === m.team_a_id ? 'text-emerald-400 font-bold' : 'text-slate-200'}`}>
                                      <span className="truncate">{teamA?.name || 'Equipo A'}</span>
                                      <span className="font-mono font-black">{m.score_team_a || '-'}</span>
                                    </div>
                                    <div className={`flex justify-between ${m.winner_team_id === m.team_b_id ? 'text-emerald-400 font-bold' : 'text-slate-200'}`}>
                                      <span className="truncate">{teamB?.name || 'Equipo B'}</span>
                                      <span className="font-mono font-black">{m.score_team_b || '-'}</span>
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedMatch(m)
                                      setScoreA(m.score_team_a || '')
                                      setScoreB(m.score_team_b || '')
                                      setWinnerId(m.winner_team_id || '')
                                      setIsScoreOpen(true)
                                    }}
                                    className="w-full h-6 text-[11px] border-slate-700 text-slate-300 hover:text-white"
                                  >
                                    {isFinished ? 'Modificar Marcador' : 'Cargar Marcador'}
                                  </Button>
                                </div>
                              )
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}

                {/* Vista del Cuadro de Playoffs Eliminatorio */}
                {activeCategory && activeCategory.matches.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                        <Medal className="w-4 h-4 text-amber-400" />
                        Llave Eliminatoria en Vivo: {activeCategory.name}
                      </h3>
                      <span className="text-xs text-slate-400">
                        Cargá el resultado para clasificar automáticamente al ganador
                      </span>
                    </div>

                    <div className={`grid grid-cols-1 ${cuartosMatches.length > 0 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
                      {/* Columna Cuartos de Final (solo si existen cuartos) */}
                      {cuartosMatches.length > 0 && (
                        <div className="space-y-3">
                          <div className="bg-slate-900/90 border border-slate-800 rounded-xl py-2 px-3 text-xs font-black uppercase tracking-wider text-slate-300 text-center flex items-center justify-center gap-1.5">
                            <span>Cuartos de Final</span>
                            <Badge variant="secondary" className="text-[10px] h-4">{cuartosMatches.length} Llaves</Badge>
                          </div>

                          {cuartosMatches.map((m) => {
                            const teamA = m.team_a_id ? teamsMap.get(m.team_a_id) : null
                            const teamB = m.team_b_id ? teamsMap.get(m.team_b_id) : null
                            const isFinished = m.status === 'FINISHED'

                            return (
                              <Card
                                key={m.id}
                                className={`border-slate-800 transition-all ${
                                  isFinished ? 'bg-slate-900/50' : 'bg-slate-900 hover:border-slate-700'
                                }`}
                              >
                                <CardContent className="p-3 space-y-2">
                                  <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800/80 pb-1.5">
                                    <span>Partido #{m.match_number}</span>
                                    <span>{m.scheduled_time || 'A definir'}</span>
                                  </div>

                                  <div className={`flex items-center justify-between text-xs p-1.5 rounded-lg ${
                                    m.winner_team_id === m.team_a_id ? 'bg-emerald-950/40 text-emerald-300 font-bold' : 'text-slate-200'
                                  }`}>
                                    <span className="truncate">{teamA?.name || 'A definir / Libre'}</span>
                                    <span className="font-mono font-black">{m.score_team_a || '-'}</span>
                                  </div>

                                  <div className={`flex items-center justify-between text-xs p-1.5 rounded-lg ${
                                    m.winner_team_id === m.team_b_id ? 'bg-emerald-950/40 text-emerald-300 font-bold' : 'text-slate-200'
                                  }`}>
                                    <span className="truncate">{teamB?.name || 'A definir / Libre'}</span>
                                    <span className="font-mono font-black">{m.score_team_b || '-'}</span>
                                  </div>

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedMatch(m)
                                      setScoreA(m.score_team_a || '')
                                      setScoreB(m.score_team_b || '')
                                      setWinnerId(m.winner_team_id || '')
                                      setIsScoreOpen(true)
                                    }}
                                    className="w-full h-7 text-[11px] border-slate-700 text-slate-300 hover:text-white"
                                  >
                                    {isFinished ? 'Modificar Marcador' : 'Cargar Marcador'}
                                  </Button>
                                </CardContent>
                              </Card>
                            )
                          })}
                        </div>
                      )}

                      {/* Columna Semifinales */}
                      <div className="space-y-3">
                        <div className="bg-slate-900/90 border border-slate-800 rounded-xl py-2 px-3 text-xs font-black uppercase tracking-wider text-slate-300 text-center flex items-center justify-center gap-1.5">
                          <span>Semifinales</span>
                          <Badge variant="secondary" className="text-[10px] h-4">{semisMatches.length} Llaves</Badge>
                        </div>

                        {semisMatches.map((m) => {
                          const teamA = m.team_a_id ? teamsMap.get(m.team_a_id) : null
                          const teamB = m.team_b_id ? teamsMap.get(m.team_b_id) : null
                          const isFinished = m.status === 'FINISHED'

                          return (
                            <Card
                              key={m.id}
                              className={`border-slate-800 transition-all ${
                                isFinished ? 'bg-slate-900/50' : 'bg-slate-900 hover:border-slate-700'
                              }`}
                            >
                              <CardContent className="p-3 space-y-2">
                                <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800/80 pb-1.5">
                                  <span>Semi #{m.match_number}</span>
                                  <span>{m.scheduled_time || 'A definir'}</span>
                                </div>

                                <div className={`flex items-center justify-between text-xs p-1.5 rounded-lg ${
                                  m.winner_team_id === m.team_a_id ? 'bg-emerald-950/40 text-emerald-300 font-bold' : 'text-slate-200'
                                }`}>
                                  <span className="truncate">{teamA?.name || 'Clasificado 1'}</span>
                                  <span className="font-mono font-black">{m.score_team_a || '-'}</span>
                                </div>

                                <div className={`flex items-center justify-between text-xs p-1.5 rounded-lg ${
                                  m.winner_team_id === m.team_b_id ? 'bg-emerald-950/40 text-emerald-300 font-bold' : 'text-slate-200'
                                }`}>
                                  <span className="truncate">{teamB?.name || 'Clasificado 2'}</span>
                                  <span className="font-mono font-black">{m.score_team_b || '-'}</span>
                                </div>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedMatch(m)
                                    setScoreA(m.score_team_a || '')
                                    setScoreB(m.score_team_b || '')
                                    setWinnerId(m.winner_team_id || '')
                                    setIsScoreOpen(true)
                                  }}
                                  className="w-full h-7 text-[11px] border-slate-700 text-slate-300 hover:text-white"
                                >
                                  {isFinished ? 'Modificar Marcador' : 'Cargar Marcador'}
                                </Button>
                              </CardContent>
                            </Card>
                          )
                        })}
                      </div>

                      {/* Columna Gran Final */}
                      <div className="space-y-3">
                        <div className="bg-gradient-to-r from-amber-950/60 to-yellow-950/60 border border-amber-500/40 rounded-xl py-2 px-3 text-xs font-black uppercase tracking-wider text-amber-300 text-center flex items-center justify-center gap-1.5 shadow-md shadow-amber-950/30">
                          <Trophy className="w-3.5 h-3.5 text-amber-400" />
                          <span>Gran Final</span>
                        </div>

                        {finalMatches.map((m) => {
                          const teamA = m.team_a_id ? teamsMap.get(m.team_a_id) : null
                          const teamB = m.team_b_id ? teamsMap.get(m.team_b_id) : null
                          const isFinished = m.status === 'FINISHED'
                          const champion = m.winner_team_id ? teamsMap.get(m.winner_team_id) : null

                          return (
                            <Card
                              key={m.id}
                              className="border-amber-500/40 bg-gradient-to-b from-slate-900 to-amber-950/20 shadow-lg shadow-amber-950/20"
                            >
                              <CardContent className="p-3.5 space-y-3">
                                <div className="flex items-center justify-between text-[11px] text-amber-300/80 border-b border-amber-500/20 pb-2">
                                  <span className="font-bold">Por el Título</span>
                                  <span>{m.scheduled_time || 'A definir'}</span>
                                </div>

                                <div className={`flex items-center justify-between text-xs p-2 rounded-lg ${
                                  m.winner_team_id === m.team_a_id ? 'bg-amber-500/20 text-amber-300 font-black' : 'text-slate-200'
                                }`}>
                                  <span className="truncate">{teamA?.name || 'Finalista 1'}</span>
                                  <span className="font-mono font-black">{m.score_team_a || '-'}</span>
                                </div>

                                <div className={`flex items-center justify-between text-xs p-2 rounded-lg ${
                                  m.winner_team_id === m.team_b_id ? 'bg-amber-500/20 text-amber-300 font-black' : 'text-slate-200'
                                }`}>
                                  <span className="truncate">{teamB?.name || 'Finalista 2'}</span>
                                  <span className="font-mono font-black">{m.score_team_b || '-'}</span>
                                </div>

                                {champion && (
                                  <div className="bg-amber-500/15 border border-amber-500/30 rounded-xl p-2.5 text-center space-y-1">
                                    <div className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center justify-center gap-1">
                                      <Sparkles className="w-3 h-3" />
                                      ¡Campeones!
                                    </div>
                                    <div className="font-black text-sm text-white">{champion.name}</div>
                                  </div>
                                )}

                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedMatch(m)
                                    setScoreA(m.score_team_a || '')
                                    setScoreB(m.score_team_b || '')
                                    setWinnerId(m.winner_team_id || '')
                                    setIsScoreOpen(true)
                                  }}
                                  className="w-full h-8 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white"
                                >
                                  {isFinished ? 'Editar Campeón / Score' : 'Definir Campeón'}
                                </Button>
                              </CardContent>
                            </Card>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <Card className="bg-slate-900/60 border-slate-800 p-8 text-center space-y-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-800/80 text-slate-400 mx-auto flex items-center justify-center">
                      <Users className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-white text-sm">
                        Hay {activeCategory?.teams.length || 0} {getParticipantLabel(selectedTournament.sport, true)} inscriptos en {activeCategory?.name}
                      </h4>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        Inscribí al menos 2 {getParticipantLabel(selectedTournament.sport, true)} para armar la llave eliminatoria o 4 para fase de grupos.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <Button
                        size="sm"
                        onClick={() => setIsTeamOpen(true)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Anotar {getParticipantLabelCapitalized(selectedTournament.sport)}
                      </Button>
                      {(activeCategory?.teams.length || 0) >= 4 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleGenerateGroups}
                          className="border-amber-500/40 bg-amber-950/20 hover:bg-amber-950/40 text-amber-300 font-bold text-xs"
                        >
                          <Users className="w-3.5 h-3.5 mr-1" />
                          Armar Grupos + Playoffs
                        </Button>
                      )}
                      {(activeCategory?.teams.length || 0) >= 2 && (
                        <Button
                          size="sm"
                          onClick={handleGenerateBracket}
                          className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"
                        >
                          <Swords className="w-3.5 h-3.5 mr-1" />
                          Armar Playoffs Directo
                        </Button>
                      )}
                    </div>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}

        {/* Modal: Crear Torneo */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto w-[95vw] sm:w-full bg-slate-950 border-slate-800 text-slate-100">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Trophy className="w-5 h-5 text-amber-400" />
                Nuevo Torneo Relámpago
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Configurá el torneo, el deporte (fútbol o pádel), formato y categorías.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateTournament} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Nombre del Torneo</Label>
                <Input
                  placeholder="Ej. Torneo Relámpago Apertura 2026"
                  value={newTourName}
                  onChange={(e) => setNewTourName(e.target.value)}
                  required
                  className="bg-slate-900 border-slate-800 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-300">Deporte</Label>
                  <select
                    value={newTourSport}
                    onChange={(e) => handleSportChange(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-800 bg-slate-900 px-3 text-xs text-slate-200"
                  >
                    <option value="PADEL">Pádel</option>
                    <option value="FUTBOL_5">Fútbol 5</option>
                    <option value="FUTBOL_7">Fútbol 7</option>
                    <option value="FUTBOL_11">Fútbol 11</option>
                    <option value="TENIS">Tenis</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-300">Formato</Label>
                  <select
                    value={newTourFormat}
                    onChange={(e) => setNewTourFormat(e.target.value as 'PLAYOFFS' | 'GROUPS_AND_PLAYOFFS')}
                    className="w-full h-9 rounded-md border border-slate-800 bg-slate-900 px-3 text-xs text-slate-200"
                  >
                    <option value="GROUPS_AND_PLAYOFFS">Fase de Grupos + Playoffs</option>
                    <option value="PLAYOFFS">Solo Eliminación Directa</option>
                  </select>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                {newTourFormat === 'GROUPS_AND_PLAYOFFS'
                  ? '⚡ Grupos + Playoffs: Los equipos se dividen en Zona A y Zona B, juegan fase de grupos y los mejores clasifican a Semifinales y Final.'
                  : '⚡ Solo Eliminación Directa: Cuadro tradicional de playoffs (Cuartos / Semis y Final) a partido único.'}
                <span className="block text-emerald-400 font-semibold mt-1">
                  * Podrás modificar el formato en cualquier momento desde la gestión del torneo.
                </span>
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-300">Fecha Inicio</Label>
                  <Input
                    type="date"
                    value={newTourStart}
                    onChange={(e) => setNewTourStart(e.target.value)}
                    required
                    className="bg-slate-900 border-slate-800 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-300">Fecha Fin</Label>
                  <Input
                    type="date"
                    value={newTourEnd}
                    onChange={(e) => setNewTourEnd(e.target.value)}
                    required
                    className="bg-slate-900 border-slate-800 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Categorías (Separadas por coma)</Label>
                <Input
                  placeholder="Ej. Libre, Senior +35, Femenino"
                  value={newTourCats}
                  onChange={(e) => setNewTourCats(e.target.value)}
                  required
                  className="bg-slate-900 border-slate-800 text-xs"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  className="border-slate-800 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={actionLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  {actionLoading ? 'Creando...' : 'Crear Torneo'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal: Inscribir Equipo / Pareja */}
        <Dialog open={isTeamOpen} onOpenChange={setIsTeamOpen}>
          <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto w-[95vw] sm:w-full bg-slate-950 border-slate-800 text-slate-100">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                {isCurrentFootball ? (
                  <Shield className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Users className="w-5 h-5 text-emerald-400" />
                )}
                Inscribir {getParticipantLabelCapitalized(selectedTournament?.sport)}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Categoría: <span className="font-bold text-emerald-400">{activeCategory?.name}</span>
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleAddTeam} className="space-y-4 py-2">
              {isCurrentFootball ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-300">Nombre del Equipo *</Label>
                    <Input
                      placeholder="Ej. Los Galácticos FC, La Reserva, Aston Birra"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      required
                      className="bg-slate-900 border-slate-800 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-300">Capitán / Delegado *</Label>
                      <Input
                        placeholder="Nombre y Apellido"
                        value={player1}
                        onChange={(e) => setPlayer1(e.target.value)}
                        required
                        className="bg-slate-900 border-slate-800 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-300">Subcapitán (Opcional)</Label>
                      <Input
                        placeholder="Nombre y Apellido"
                        value={player2}
                        onChange={(e) => setPlayer2(e.target.value)}
                        className="bg-slate-900 border-slate-800 text-xs"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-300">Nombre de la Pareja (Opcional)</Label>
                    <Input
                      placeholder="Ej. Los Reyes del Revés"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      className="bg-slate-900 border-slate-800 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-300">Jugador 1 *</Label>
                      <Input
                        placeholder="Nombre y Apellido"
                        value={player1}
                        onChange={(e) => setPlayer1(e.target.value)}
                        required
                        className="bg-slate-900 border-slate-800 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-300">Jugador 2</Label>
                      <Input
                        placeholder="Nombre y Apellido"
                        value={player2}
                        onChange={(e) => setPlayer2(e.target.value)}
                        className="bg-slate-900 border-slate-800 text-xs"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">WhatsApp de Contacto *</Label>
                <Input
                  placeholder="+54 9 381 1234567"
                  value={teamPhone}
                  onChange={(e) => setTeamPhone(e.target.value)}
                  required
                  className="bg-slate-900 border-slate-800 text-xs"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsTeamOpen(false)}
                  className="border-slate-800 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={actionLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  {actionLoading ? 'Inscribiendo...' : `Inscribir ${getParticipantLabelCapitalized(selectedTournament?.sport)}`}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal: Cargar Marcador */}
        <Dialog open={isScoreOpen} onOpenChange={setIsScoreOpen}>
          <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto w-[95vw] sm:w-full bg-slate-950 border-slate-800 text-slate-100">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Swords className="w-5 h-5 text-amber-400" />
                Cargar Marcador del Partido
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Ronda: {selectedMatch?.round} • Partido #{selectedMatch?.match_number}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveScore} className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-300 truncate block">
                    {selectedMatch?.team_a_id ? teamsMap.get(selectedMatch.team_a_id)?.name : 'Equipo A'}
                  </Label>
                  <Input
                    placeholder={isCurrentFootball ? 'Ej: 3' : 'Ej: 6 6'}
                    value={scoreA}
                    onChange={(e) => setScoreA(e.target.value)}
                    className="bg-slate-950 border-slate-800 font-mono font-bold text-center"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-300 truncate block">
                    {selectedMatch?.team_b_id ? teamsMap.get(selectedMatch.team_b_id)?.name : 'Equipo B'}
                  </Label>
                  <Input
                    placeholder={isCurrentFootball ? 'Ej: 1' : 'Ej: 4 2'}
                    value={scoreB}
                    onChange={(e) => setScoreB(e.target.value)}
                    className="bg-slate-950 border-slate-800 font-mono font-bold text-center"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Ganador del Partido</Label>
                <select
                  value={winnerId}
                  onChange={(e) => setWinnerId(e.target.value)}
                  className="w-full h-10 rounded-md border border-slate-800 bg-slate-900 px-3 text-xs text-slate-200"
                >
                  <option value="">-- Partido en juego / Empate o Sin ganador --</option>
                  {selectedMatch?.team_a_id && (
                    <option value={selectedMatch.team_a_id}>
                      {teamsMap.get(selectedMatch.team_a_id)?.name} (Avanza a siguiente ronda)
                    </option>
                  )}
                  {selectedMatch?.team_b_id && (
                    <option value={selectedMatch.team_b_id}>
                      {teamsMap.get(selectedMatch.team_b_id)?.name} (Avanza a siguiente ronda)
                    </option>
                  )}
                </select>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsScoreOpen(false)}
                  className="border-slate-800 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={actionLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  {actionLoading ? 'Guardando...' : 'Guardar y Avanzar Llave'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </PlanFeatureGuard>
  )
}
