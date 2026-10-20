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
  type TournamentWithDetails,
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

  const handleResetModal = () => {
    setIsRegisterOpen(false)
    setRegSuccess(false)
    setRegTeamName('')
    setRegPlayer1('')
    setRegPlayer2('')
    setRegPhone('')
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
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-amber-300">Inscripciones Abiertas</span>
                <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px] border-emerald-500/40">
                  Cupos Limitados
                </Badge>
              </div>
              <p className="text-xs text-slate-300">
                {selectedCategory
                  ? `${selectedCategory.name}: ${selectedCategory.teams.length} / ${selectedCategory.max_teams || 8} ${isFoot ? 'equipos' : 'parejas'} anotadas`
                  : `Inscribí a tu ${isFoot ? 'equipo' : 'pareja'} online y asegurá tu lugar en el cuadro oficial`}
              </p>
            </div>
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

          <div className={`grid grid-cols-1 ${cuartos.length > 0 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-6 items-center`}>
            {/* Columna Cuartos */}
            {cuartos.length > 0 && (
              <div className="space-y-4">
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
            <div className="space-y-4">
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
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-400 text-center flex items-center justify-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                Gran Final
              </p>
              {finalMatch ? (
                <div className="p-1 rounded-2xl bg-gradient-to-r from-amber-500/30 via-emerald-500/30 to-amber-500/30 shadow-xl">
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
                <h4 className="text-base font-bold text-white">¡Anotados con Éxito!</h4>
                <p className="text-xs text-slate-300">
                  La pareja <strong className="text-white">{regTeamName}</strong> ya figura en el listado de inscriptos.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-1">
                <p className="font-semibold text-white">Siguiente paso:</p>
                <p className="text-slate-400">
                  Enviá un mensaje al club por WhatsApp para coordinar el pago de la seña/inscripción y asegurar el lugar.
                </p>
              </div>

              <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  onClick={() => {
                    const catObj = tournament.categories.find(c => c.id === regCategory)
                    const text = `¡Hola! Acabamos de inscribirnos online al torneo *${tournament.name}* en la categoría *${catObj?.name || 'Oficial'}*.\n\n*Equipo:* ${regTeamName}\n*Jugadores:* ${regPlayer1} y ${regPlayer2 || 'A confirmar'}\n*Tel:* ${regPhone}\n\n¿Por qué medio podemos abonar la seña de la inscripción?`
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
                    return (
                      <option key={cat.id} value={cat.id} disabled={isFull}>
                        {cat.name} ({cat.teams.length}/{limit} {isFoot ? 'equipos' : 'parejas'}) {isFull ? '— COMPLETO' : ''}
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
                  El club se comunicará por WhatsApp para validar y coordinar la seña.
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
