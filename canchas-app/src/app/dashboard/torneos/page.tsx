'use client'

import { useState, useEffect } from 'react'
import { 
  Trophy, 
  Plus, 
  Calendar, 
  Users, 
  Swords, 
  Share2, 
  CheckCircle2, 
  Clock, 
  Play, 
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Medal,
  Sparkles,
  Loader2,
  Copy
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
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
  updateMatchScore,
  type TournamentWithDetails 
} from '@/actions/tournament.actions'
import { toast } from 'sonner'
import type { Tournament, TournamentTeam, TournamentMatch } from '@/types/database'

const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default function TorneosDashboardPage() {
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
  const [newTourStart, setNewTourStart] = useState(new Date().toISOString().split('T')[0])
  const [newTourEnd, setNewTourEnd] = useState(new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0])
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

  useEffect(() => {
    loadTournaments()
  }, [])

  const loadTournaments = async () => {
    setLoading(true)
    try {
      const list = await getTournaments(DEMO_TENANT_ID)
      setTournaments(list)
      if (list.length > 0) {
        await loadTournamentDetails(list[0].id)
      } else {
        // Si no hay torneos en DB, inicializar mock o dejar vacío
        setSelectedTournament(null)
      }
    } catch {
      toast.error('Error al cargar torneos')
    } finally {
      setLoading(false)
    }
  }

  const loadTournamentDetails = async (id: string) => {
    try {
      const details = await getTournamentById(id)
      setSelectedTournament(details)
      if (details?.categories && details.categories.length > 0) {
        setSelectedCategoryId(details.categories[0].id)
      }
    } catch {
      toast.error('Error al cargar detalle del torneo')
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
        tenant_id: DEMO_TENANT_ID,
        name: newTourName,
        sport: newTourSport,
        format: 'PLAYOFFS',
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

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCategoryId || !player1.trim()) return

    setActionLoading(true)
    try {
      const res = await addTeamToCategory({
        category_id: selectedCategoryId,
        name: teamName.trim() || `${player1} / ${player2 || 'Invitado'}`,
        player_1: player1,
        player_2: player2,
        phone: teamPhone,
      })

      if (res.success) {
        toast.success('Pareja inscripta')
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

  const cuartosMatches = activeCategory?.matches.filter((m) => m.round === 'CUARTOS') || []
  const semisMatches = activeCategory?.matches.filter((m) => m.round === 'SEMIFINAL') || []
  const finalMatches = activeCategory?.matches.filter((m) => m.round === 'FINAL') || []

  const copyPublicLink = () => {
    if (!selectedTournament) return
    const url = `${window.location.origin}/club/central-tucuman/torneos/${selectedTournament.id}`
    navigator.clipboard.writeText(url)
    toast.success('Enlace público copiado al portapapeles')
  }

  return (
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
              Playoffs Automáticos
            </Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Organizá torneos relámpago de fin de semana, armá llaves eliminatorias y compartí resultados en vivo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedTournament && (
            <Button
              variant="outline"
              onClick={copyPublicLink}
              className="border-slate-700 bg-slate-900/80 text-slate-200 hover:text-white text-xs gap-1.5"
            >
              <Share2 className="w-4 h-4 text-amber-400" />
              <span>Link Público</span>
            </Button>
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
            Creá tu primer torneo de pádel o fútbol exprés para generar automáticamente cuadros de cuartos, semis y final.
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
            {tournaments.map((t) => (
              <button
                key={t.id}
                onClick={() => loadTournamentDetails(t.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border whitespace-nowrap ${
                  selectedTournament?.id === t.id
                    ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 shadow-md shadow-amber-950/40'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>{t.name}</span>
                <span className="text-[10px] opacity-60">({t.sport})</span>
              </button>
            ))}
          </div>

          {selectedTournament && (
            <div className="space-y-6">
              {/* Barra de Categorías y Acciones */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">
                    Categoría:
                  </span>
                  {selectedTournament.categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                        selectedCategoryId === cat.id
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {cat.name} ({cat.teams.length}/{cat.max_teams})
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsTeamOpen(true)}
                    className="border-slate-700 bg-slate-950 text-slate-300 hover:text-white text-xs gap-1"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Inscribir Pareja</span>
                  </Button>

                  <Button
                    size="sm"
                    onClick={handleGenerateBracket}
                    disabled={actionLoading}
                    className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs gap-1 shadow-md shadow-amber-950/40"
                  >
                    <Swords className="w-3.5 h-3.5" />
                    <span>Armar Cuadro (Playoffs)</span>
                  </Button>
                </div>
              </div>

              {/* Vista del Cuadro de Playoffs Eliminatorio */}
              {activeCategory && activeCategory.matches.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                      <Medal className="w-4 h-4 text-amber-400" />
                      Llave Eliminatoria en Vivo: {activeCategory.name}
                    </h3>
                    <span className="text-xs text-slate-400">
                      Hacé click en &ldquo;Cargar Marcador&rdquo; para clasificar automáticamente al ganador
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Columna Cuartos de Final */}
                    <div className="space-y-3">
                      <div className="bg-slate-900/90 border border-slate-800 rounded-xl py-2 px-3 text-xs font-black uppercase tracking-wider text-slate-300 text-center flex items-center justify-center gap-1.5">
                        <span>Cuartos de Final</span>
                        <Badge variant="secondary" className="text-[10px] h-4">4 Llaves</Badge>
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

                              {/* Equipo A */}
                              <div className={`flex items-center justify-between text-xs p-1.5 rounded-lg ${
                                m.winner_team_id === m.team_a_id ? 'bg-emerald-950/40 text-emerald-300 font-bold' : 'text-slate-200'
                              }`}>
                                <span className="truncate">{teamA?.name || 'A definir / Libre'}</span>
                                <span className="font-mono font-black">{m.score_team_a || '-'}</span>
                              </div>

                              {/* Equipo B */}
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

                    {/* Columna Semifinales */}
                    <div className="space-y-3">
                      <div className="bg-slate-900/90 border border-slate-800 rounded-xl py-2 px-3 text-xs font-black uppercase tracking-wider text-slate-300 text-center flex items-center justify-center gap-1.5">
                        <span>Semifinales</span>
                        <Badge variant="secondary" className="text-[10px] h-4">2 Llaves</Badge>
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

                              {/* Equipo A */}
                              <div className={`flex items-center justify-between text-xs p-1.5 rounded-lg ${
                                m.winner_team_id === m.team_a_id ? 'bg-emerald-950/40 text-emerald-300 font-bold' : 'text-slate-200'
                              }`}>
                                <span className="truncate">{teamA?.name || 'Ganador Cuartos'}</span>
                                <span className="font-mono font-black">{m.score_team_a || '-'}</span>
                              </div>

                              {/* Equipo B */}
                              <div className={`flex items-center justify-between text-xs p-1.5 rounded-lg ${
                                m.winner_team_id === m.team_b_id ? 'bg-emerald-950/40 text-emerald-300 font-bold' : 'text-slate-200'
                              }`}>
                                <span className="truncate">{teamB?.name || 'Ganador Cuartos'}</span>
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

                              {/* Equipo A */}
                              <div className={`flex items-center justify-between text-xs p-2 rounded-lg ${
                                m.winner_team_id === m.team_a_id ? 'bg-amber-500/20 text-amber-300 font-black' : 'text-slate-200'
                              }`}>
                                <span className="truncate">{teamA?.name || 'Finalista 1'}</span>
                                <span className="font-mono font-black">{m.score_team_a || '-'}</span>
                              </div>

                              {/* Equipo B */}
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
                      Hay {activeCategory?.teams.length || 0} parejas inscriptas en {activeCategory?.name}
                    </h4>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Inscribí al menos 2 parejas para armar el cuadro eliminatorio automático con cruces de playoffs.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <Button
                      size="sm"
                      onClick={() => setIsTeamOpen(true)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Inscribir Pareja
                    </Button>
                    {(activeCategory?.teams.length || 0) >= 2 && (
                      <Button
                        size="sm"
                        onClick={handleGenerateBracket}
                        className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"
                      >
                        <Swords className="w-3.5 h-3.5 mr-1" />
                        Armar Llave
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
        <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Trophy className="w-5 h-5 text-amber-400" />
              Nuevo Torneo Exprés
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Configurá el torneo y las categorías que jugarán este fin de semana.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTournament} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-300">Nombre del Torneo</Label>
              <Input
                placeholder="Ej. Torneo Apertura Pádel Central 2026"
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
                  onChange={(e) => setNewTourSport(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-800 bg-slate-900 px-3 text-xs text-slate-200"
                >
                  <option value="PADEL">Pádel</option>
                  <option value="FUTBOL_5">Fútbol 5</option>
                  <option value="TENIS">Tenis</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Formato</Label>
                <input
                  value="Playoffs Eliminatorios (Cuartos -> Semis -> Final)"
                  disabled
                  className="w-full h-9 rounded-md border border-slate-800 bg-slate-900/50 px-3 text-xs text-slate-400 cursor-not-allowed"
                />
              </div>
            </div>

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
                placeholder="4ta Caballeros, 6ta Damas, Suma 11"
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

      {/* Modal: Inscribir Pareja */}
      <Dialog open={isTeamOpen} onOpenChange={setIsTeamOpen}>
        <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Users className="w-5 h-5 text-emerald-400" />
              Inscribir Pareja / Equipo
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Categoría: <span className="font-bold text-emerald-400">{activeCategory?.name}</span>
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddTeam} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-300">Nombre de la Pareja / Equipo</Label>
              <Input
                placeholder="Ej. Los Reyes del Revés (opcional)"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="bg-slate-900 border-slate-800 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-300">Jugador 1</Label>
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

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-300">WhatsApp de Contacto</Label>
              <Input
                placeholder="+54 9 381 ..."
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
                {actionLoading ? 'Inscribiendo...' : 'Guardar Inscripción'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Cargar Marcador */}
      <Dialog open={isScoreOpen} onOpenChange={setIsScoreOpen}>
        <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-slate-100">
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
                  placeholder="Ej: 6 6"
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
                  placeholder="Ej: 4 2"
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
                <option value="">-- Partido en juego / Sin ganador --</option>
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
  )
}
