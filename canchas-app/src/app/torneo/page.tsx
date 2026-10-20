'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Trophy,
  ArrowLeft,
  Calendar,
  ChevronRight,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CancharClubIcon } from '@/components/shared/canchar-club-logo'
import { getPublicTournaments, type TournamentWithDetails } from '@/actions/tournament.actions'

export default function PublicTournamentsDirectoryPage() {
  const [tournaments, setTournaments] = useState<TournamentWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSport, setSelectedSport] = useState<string>('ALL')

  useEffect(() => {
    getPublicTournaments()
      .then((data) => setTournaments(data || []))
      .catch((err) => console.warn('Error loading tournaments:', err))
      .finally(() => setLoading(false))
  }, [])

  const filteredTournaments = tournaments.filter((t) => {
    if (selectedSport === 'ALL') return true
    return t.sport.toUpperCase().includes(selectedSport.toUpperCase())
  })

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/90 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a Inicio</span>
          </Link>

          <Link href="/" className="flex items-center gap-2">
            <CancharClubIcon className="w-7 h-7" />
            <span className="font-extrabold text-sm sm:text-base text-white tracking-tight">
              Canchar<span className="text-emerald-400">Club</span>
            </span>
          </Link>

          <Link href="/sumar-club">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8">
              Crear Torneo
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-b from-slate-900 via-slate-900/50 to-slate-950 border-b border-slate-800/80 px-4 py-12 text-center">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Torneos y Americanos de Pádel y Fútbol</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Torneos en Vivo e Inscripciones
          </h1>
          <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
            Seguí el fixture oficial, tablas de posiciones y anotá a tu pareja para los torneos de fin de semana.
          </p>

          {/* Filtro por deporte */}
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => setSelectedSport('ALL')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedSport === 'ALL'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setSelectedSport('PADEL')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedSport === 'PADEL'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              Pádel
            </button>
            <button
              onClick={() => setSelectedSport('FUTBOL')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedSport === 'FUTBOL'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              Fútbol
            </button>
          </div>
        </div>
      </div>

      {/* Main List */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
            <span className="text-sm font-medium">Buscando torneos activos...</span>
          </div>
        ) : filteredTournaments.length === 0 ? (
          <Card className="bg-slate-900/60 border-slate-800 text-center py-16 px-6 max-w-xl mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center mb-4">
              <Trophy className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">No hay torneos activos en este momento</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
              Los clubes afiliados publican periódicamente sus torneos americanos y relámpago de fin de semana.
            </p>
            <Link href="/sumar-club">
              <Button className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>¿Sos dueño de un club? Organizá tu torneo</span>
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTournaments.map((t) => {
              const totalTeams = t.categories.reduce((acc, c) => acc + c.teams.length, 0)
              const totalSlots = t.categories.reduce((acc, c) => acc + (c.max_teams || 8), 0)
              const isOpen = t.status === 'REGISTRATION'

              return (
                <div
                  key={t.id}
                  className="p-5 rounded-3xl bg-slate-900 border border-slate-800 hover:border-amber-500/50 hover:shadow-xl transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px]">
                        {t.sport.replace('_', ' ')}
                      </Badge>
                      <span className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isOpen
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-sky-500/15 text-sky-300 border border-sky-500/30 animate-pulse'
                      }`}>
                        {isOpen ? 'Inscripciones Abiertas' : 'En Curso'}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-white tracking-tight">{t.name}</h3>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span>{t.start_date} al {t.end_date}</span>
                      </p>
                    </div>

                    {/* Categorías */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-semibold text-slate-400 block">
                        Categorías ({t.categories.length}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {t.categories.map((c) => (
                          <span
                            key={c.id}
                            className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 text-[10px] border border-slate-700/80"
                          >
                            {c.name} ({c.teams.length}/{c.max_teams || 8})
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Barra de Cupos */}
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Cupos ocupados</span>
                        <span className="font-bold text-white">{totalTeams} / {totalSlots}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.round((totalTeams / (totalSlots || 1)) * 100))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Botones de acción */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center gap-2">
                    <Link href={`/torneo/${t.id}`} className="flex-1">
                      <Button
                        size="sm"
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5 h-9 rounded-xl"
                      >
                        <span>Ver Cuadro y Fixture</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-800/80 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <p>© 2026 CancharClub. Todos los derechos reservados.</p>
      </footer>
    </div>
  )
}
