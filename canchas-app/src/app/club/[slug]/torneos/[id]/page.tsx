'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { 
  Trophy, 
  Calendar, 
  Share2, 
  Medal, 
  Sparkles, 
  MapPin, 
  ChevronRight, 
  ArrowLeft,
  Flame,
  Clock,
  Loader2
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getTournamentById, type TournamentWithDetails } from '@/actions/tournament.actions'
import { buildWhatsAppLink } from '@/lib/utils'

export default function PublicTournamentPage() {
  const params = useParams()
  const slug = params?.slug as string || 'club'
  const tournamentId = params?.id as string

  const [tournament, setTournament] = useState<TournamentWithDetails | null>(null)
  const [selectedCatId, setSelectedCatId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    async function fetchTournament() {
      try {
        const data = await getTournamentById(tournamentId)
        if (!ignore) {
          setTournament(data)
          if (data?.categories && data.categories.length > 0) {
            setSelectedCatId(data.categories[0].id)
          }
        }
      } catch (err) {
        console.error(err)
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    if (tournamentId) {
      fetchTournament()
    }

    return () => {
      ignore = true
    }
  }, [tournamentId])

  const activeCategory = tournament?.categories.find((c) => c.id === selectedCatId)
  const teamsMap = new Map()
  activeCategory?.teams.forEach((t) => teamsMap.set(t.id, t))

  const cuartos = activeCategory?.matches.filter((m) => m.round === 'CUARTOS') || []
  const semis = activeCategory?.matches.filter((m) => m.round === 'SEMIFINAL') || []
  const finalMatch = activeCategory?.matches.find((m) => m.round === 'FINAL')

  const shareWhatsApp = () => {
    if (!tournament) return
    const currentUrl = typeof window !== 'undefined' ? window.location.href : ''
    const text = `¡Seguí en vivo el fixture y los resultados de ${tournament.name}! ${currentUrl}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center">
      <div className="w-full max-w-4xl flex-1 flex flex-col pb-16 border-x border-slate-900 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        {/* Banner Superior */}
        <div className="relative p-6 bg-gradient-to-r from-amber-950/80 via-slate-900 to-emerald-950/80 border-b border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <Link
              href={`/club/${slug}`}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver a Reservas del Club</span>
            </Link>

            <Badge variant="outline" className="border-amber-500/40 text-amber-300 font-bold text-xs gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              Fixture en Vivo
            </Badge>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-950/50">
                <Trophy className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {tournament?.name || 'Torneo Relámpago'}
                </h1>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    {tournament?.start_date} al {tournament?.end_date}
                  </span>
                  <span>•</span>
                  <span className="text-emerald-400 font-semibold">{tournament?.sport}</span>
                </div>
              </div>
            </div>

            <Button
              size="sm"
              onClick={shareWhatsApp}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5 shadow-lg shadow-emerald-950/40"
            >
              <Share2 className="w-4 h-4" />
              <span>Compartir en WhatsApp</span>
            </Button>
          </div>
        </div>

        {/* Selector de Categorías */}
        {tournament?.categories && tournament.categories.length > 0 && (
          <div className="px-6 py-3.5 bg-slate-900/60 border-b border-slate-800 flex items-center gap-2 overflow-x-auto scrollbar-none">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">
              Categorías:
            </span>
            {tournament.categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCatId(cat.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border whitespace-nowrap ${
                  selectedCatId === cat.id
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md shadow-amber-950/30'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Contenido: Llave de Playoffs */}
        <div className="p-6 flex-1">
          {loading ? (
            <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
              <span className="text-sm font-medium">Cargando llaves del torneo...</span>
            </div>
          ) : !activeCategory || activeCategory.matches.length === 0 ? (
            <Card className="bg-slate-900/60 border-slate-800 p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 mx-auto flex items-center justify-center">
                <Trophy className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-white text-base">Cuadro en Preparación</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                La organización del club está inscribiendo parejas y armará el fixture en breve.
              </p>
            </Card>
          ) : (
            <div className="space-y-6">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Cuadro Eliminatorio • {activeCategory.name}</span>
                <span className="text-emerald-400 font-semibold">Actualización en Vivo</span>
              </div>

              {/* Bracket Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Cuartos */}
                <div className="space-y-3">
                  <div className="py-2 px-3 bg-slate-900 border border-slate-800 rounded-xl text-center text-xs font-black uppercase tracking-wider text-slate-300">
                    Cuartos de Final
                  </div>

                  {cuartos.map((m) => {
                    const teamA = m.team_a_id ? teamsMap.get(m.team_a_id) : null
                    const teamB = m.team_b_id ? teamsMap.get(m.team_b_id) : null
                    const isWinnerA = m.winner_team_id === m.team_a_id
                    const isWinnerB = m.winner_team_id === m.team_b_id

                    return (
                      <Card key={m.id} className="border-slate-800 bg-slate-900/90 shadow-md">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800/80 pb-1">
                            <span>#{m.match_number} • {m.court_name || 'Cancha'}</span>
                            <span>{m.scheduled_time || 'A definir'}</span>
                          </div>

                          <div className={`flex items-center justify-between text-xs p-1.5 rounded-lg ${
                            isWinnerA ? 'bg-emerald-950/40 text-emerald-300 font-bold' : 'text-slate-300'
                          }`}>
                            <span className="truncate">{teamA?.name || 'A definir'}</span>
                            <span className="font-mono font-black">{m.score_team_a || '-'}</span>
                          </div>

                          <div className={`flex items-center justify-between text-xs p-1.5 rounded-lg ${
                            isWinnerB ? 'bg-emerald-950/40 text-emerald-300 font-bold' : 'text-slate-300'
                          }`}>
                            <span className="truncate">{teamB?.name || 'A definir'}</span>
                            <span className="font-mono font-black">{m.score_team_b || '-'}</span>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>

                {/* Semifinales */}
                <div className="space-y-3">
                  <div className="py-2 px-3 bg-slate-900 border border-slate-800 rounded-xl text-center text-xs font-black uppercase tracking-wider text-slate-300">
                    Semifinales
                  </div>

                  {semis.map((m) => {
                    const teamA = m.team_a_id ? teamsMap.get(m.team_a_id) : null
                    const teamB = m.team_b_id ? teamsMap.get(m.team_b_id) : null
                    const isWinnerA = m.winner_team_id === m.team_a_id
                    const isWinnerB = m.winner_team_id === m.team_b_id

                    return (
                      <Card key={m.id} className="border-slate-800 bg-slate-900/90 shadow-md">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800/80 pb-1">
                            <span>Semi #{m.match_number}</span>
                            <span>{m.scheduled_time || 'A definir'}</span>
                          </div>

                          <div className={`flex items-center justify-between text-xs p-1.5 rounded-lg ${
                            isWinnerA ? 'bg-emerald-950/40 text-emerald-300 font-bold' : 'text-slate-300'
                          }`}>
                            <span className="truncate">{teamA?.name || 'Ganador Cuartos'}</span>
                            <span className="font-mono font-black">{m.score_team_a || '-'}</span>
                          </div>

                          <div className={`flex items-center justify-between text-xs p-1.5 rounded-lg ${
                            isWinnerB ? 'bg-emerald-950/40 text-emerald-300 font-bold' : 'text-slate-300'
                          }`}>
                            <span className="truncate">{teamB?.name || 'Ganador Cuartos'}</span>
                            <span className="font-mono font-black">{m.score_team_b || '-'}</span>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>

                {/* Final */}
                <div className="space-y-3">
                  <div className="py-2 px-3 bg-gradient-to-r from-amber-950/70 to-yellow-950/70 border border-amber-500/40 rounded-xl text-center text-xs font-black uppercase tracking-wider text-amber-300 shadow-md shadow-amber-950/30">
                    Gran Final
                  </div>

                  {finalMatch && (() => {
                    const teamA = finalMatch.team_a_id ? teamsMap.get(finalMatch.team_a_id) : null
                    const teamB = finalMatch.team_b_id ? teamsMap.get(finalMatch.team_b_id) : null
                    const champion = finalMatch.winner_team_id ? teamsMap.get(finalMatch.winner_team_id) : null
                    const isWinnerA = finalMatch.winner_team_id === finalMatch.team_a_id
                    const isWinnerB = finalMatch.winner_team_id === finalMatch.team_b_id

                    return (
                      <Card className="border-amber-500/40 bg-gradient-to-b from-slate-900 to-amber-950/20 shadow-xl shadow-amber-950/30">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between text-[11px] text-amber-300/80 border-b border-amber-500/20 pb-2">
                            <span className="font-bold">Por la Corona</span>
                            <span>{finalMatch.scheduled_time || 'A definir'}</span>
                          </div>

                          <div className={`flex items-center justify-between text-xs p-2 rounded-lg ${
                            isWinnerA ? 'bg-amber-500/20 text-amber-300 font-black' : 'text-slate-200'
                          }`}>
                            <span className="truncate">{teamA?.name || 'Finalista 1'}</span>
                            <span className="font-mono font-black">{finalMatch.score_team_a || '-'}</span>
                          </div>

                          <div className={`flex items-center justify-between text-xs p-2 rounded-lg ${
                            isWinnerB ? 'bg-amber-500/20 text-amber-300 font-black' : 'text-slate-200'
                          }`}>
                            <span className="truncate">{teamB?.name || 'Finalista 2'}</span>
                            <span className="font-mono font-black">{finalMatch.score_team_b || '-'}</span>
                          </div>

                          {champion && (
                            <div className="bg-amber-500/15 border border-amber-500/30 rounded-xl p-3 text-center space-y-1 mt-3">
                              <div className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center justify-center gap-1.5">
                                <Sparkles className="w-4 h-4" />
                                ¡CAMPEONES DEL TORNEO!
                              </div>
                              <div className="font-black text-base text-white">{champion.name}</div>
                              <div className="text-[11px] text-slate-300">
                                {champion.player_1} {champion.player_2 ? `& ${champion.player_2}` : ''}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div className="p-6 bg-slate-900/80 border-t border-slate-800 text-center space-y-3">
          <h4 className="text-sm font-bold text-white">¿Querés jugar un partido casual en el club?</h4>
          <Button
            asChild
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
          >
            <Link href={`/club/${slug}`}>
              <span>Ver Canchas y Reservar Turno Online</span>
              <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
