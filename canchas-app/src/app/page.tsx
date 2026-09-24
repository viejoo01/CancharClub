'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Calendar,
  CalendarCheck,
  Building2,
  ChevronRight,
  Search,
  ArrowLeft,
  MapPin,
  Star,
  Zap,
  Coffee,
  Loader2
} from 'lucide-react'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { formatARS } from '@/lib/utils'
import { PlayerBookingsModal } from '@/components/public/player-bookings-modal'
import { ClubLoginModal } from '@/components/public/club-login-modal'
import { RegisterClubModal } from '@/components/public/register-club-modal'
import { CancharClubIcon } from '@/components/shared/canchar-club-logo'

import { type SportCategory, type ClubData, normalizeToSportCategory } from '@/config/clubs-catalog'
import { getPublicClubs } from '@/actions/club.actions'


// Componentes de Íconos Vectoriales Estilizados (Fieles a la Referencia)

function PadelRacketIcon({ className = "w-16 h-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Racket Head */}
      <ellipse cx="48" cy="32" rx="19" ry="24" transform="rotate(35 48 32)" fill="#93C5FD" stroke="#0F172A" strokeWidth="3.5"/>
      <ellipse cx="48" cy="32" rx="15" ry="20" transform="rotate(35 48 32)" fill="#C7D2FE"/>
      {/* Padel Holes */}
      <circle cx="43" cy="25" r="1.8" fill="#0F172A"/>
      <circle cx="49" cy="22" r="1.8" fill="#0F172A"/>
      <circle cx="54" cy="27" r="1.8" fill="#0F172A"/>
      <circle cx="41" cy="32" r="1.8" fill="#0F172A"/>
      <circle cx="47" cy="31" r="1.8" fill="#0F172A"/>
      <circle cx="53" cy="34" r="1.8" fill="#0F172A"/>
      <circle cx="44" cy="38" r="1.8" fill="#0F172A"/>
      <circle cx="50" cy="39" r="1.8" fill="#0F172A"/>
      {/* Throat & Handle */}
      <path d="M36 49L21 68C19.5 70 16 69.5 14.5 68C13 66.5 13.5 63 15.5 61.5L30 43" fill="#0F172A" stroke="#0F172A" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="18" y1="65" x2="26" y2="55" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round"/>
      {/* Ball */}
      <circle cx="21" cy="40" r="7.5" fill="#BEF264" stroke="#0F172A" strokeWidth="3"/>
      <path d="M17 36C20 38 20 42 17 44" stroke="#65A30D" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function FutbolBallIcon({ className = "w-16 h-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="40" cy="40" r="28" fill="#FFFFFF" stroke="#0F172A" strokeWidth="3.8"/>
      {/* Center Pentagon */}
      <polygon points="40,29 49,36 46,47 34,47 31,36" fill="#0F172A"/>
      {/* Radiation lines */}
      <line x1="40" y1="29" x2="40" y2="12" stroke="#0F172A" strokeWidth="3.5"/>
      <line x1="49" y1="36" x2="65" y2="28" stroke="#0F172A" strokeWidth="3.5"/>
      <line x1="46" y1="47" x2="59" y2="60" stroke="#0F172A" strokeWidth="3.5"/>
      <line x1="34" y1="47" x2="21" y2="60" stroke="#0F172A" strokeWidth="3.5"/>
      <line x1="31" y1="36" x2="15" y2="28" stroke="#0F172A" strokeWidth="3.5"/>
      {/* Outer Patches */}
      <path d="M33 13C37 12 43 12 47 13L40 20Z" fill="#0F172A"/>
      <path d="M64 25C67 29 68 35 68 39L59 36Z" fill="#0F172A"/>
      <path d="M57 62C53 66 47 68 40 68L44 57Z" fill="#0F172A"/>
      <path d="M16 25C13 29 12 35 12 39L21 36Z" fill="#0F172A"/>
      <path d="M23 62C27 66 33 68 40 68L36 57Z" fill="#0F172A"/>
    </svg>
  )
}

function TenisRacketIcon({ className = "w-16 h-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="48" cy="32" r="22" fill="#FEF08A" stroke="#0F172A" strokeWidth="3.5"/>
      {/* Grid */}
      <line x1="34" y1="22" x2="62" y2="22" stroke="#CA8A04" strokeWidth="1.5"/>
      <line x1="28" y1="32" x2="68" y2="32" stroke="#CA8A04" strokeWidth="1.5"/>
      <line x1="34" y1="42" x2="62" y2="42" stroke="#CA8A04" strokeWidth="1.5"/>
      <line x1="38" y1="18" x2="38" y2="46" stroke="#CA8A04" strokeWidth="1.5"/>
      <line x1="48" y1="12" x2="48" y2="52" stroke="#CA8A04" strokeWidth="1.5"/>
      <line x1="58" y1="18" x2="58" y2="46" stroke="#CA8A04" strokeWidth="1.5"/>
      {/* Handle */}
      <path d="M33 48L17 67C15.5 68.5 13 68 11.5 66.5C10 65 10.5 62.5 12 61L27 43" fill="#B45309" stroke="#0F172A" strokeWidth="3.5" strokeLinecap="round"/>
      {/* Ball */}
      <circle cx="21" cy="40" r="7.5" fill="#CCFF00" stroke="#0F172A" strokeWidth="3"/>
      <path d="M17 36C20 38 20 42 17 44" stroke="#84CC16" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function BasquetBallIcon({ className = "w-16 h-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="40" cy="40" r="28" fill="#F97316" stroke="#0F172A" strokeWidth="3.8"/>
      {/* Basket Lines */}
      <line x1="12" y1="40" x2="68" y2="40" stroke="#0F172A" strokeWidth="3.5"/>
      <line x1="40" y1="12" x2="40" y2="68" stroke="#0F172A" strokeWidth="3.5"/>
      <path d="M22 17C31 28 31 52 22 63" stroke="#0F172A" strokeWidth="3.5"/>
      <path d="M58 17C49 28 49 52 58 63" stroke="#0F172A" strokeWidth="3.5"/>
    </svg>
  )
}

// Configuración de los deportes principales
const SPORTS_LIST: {
  id: SportCategory
  name: string
  iconEmoji: string
  renderIcon: (props: { className?: string }) => React.ReactNode
  tagline: string
}[] = [
  {
    id: 'PADEL',
    name: 'Pádel',
    iconEmoji: '🎾',
    renderIcon: (props) => <PadelRacketIcon {...props} />,
    tagline: 'Techadas y blindex',
  },
  {
    id: 'FUTBOL',
    name: 'Fútbol',
    iconEmoji: '⚽',
    renderIcon: (props) => <FutbolBallIcon {...props} />,
    tagline: 'F5, F7 y F11',
  },
  {
    id: 'TENIS',
    name: 'Tenis',
    iconEmoji: '🎾',
    renderIcon: (props) => <TenisRacketIcon {...props} />,
    tagline: 'Polvo de ladrillo',
  },
  {
    id: 'BASQUET',
    name: 'Básquet',
    iconEmoji: '🏀',
    renderIcon: (props) => <BasquetBallIcon {...props} />,
    tagline: 'Parquet flotante',
  }
]

export default function HomePage() {
  const [selectedSport, setSelectedSport] = useState<SportCategory | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isReservasModalOpen, setIsReservasModalOpen] = useState(false)
  const [isClubLoginModalOpen, setIsClubLoginModalOpen] = useState(false)
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)
  const [clubs, setClubs] = useState<ClubData[]>([])
  const [isLoadingClubs, setIsLoadingClubs] = useState(true)

  useEffect(() => {
    getPublicClubs()
      .then((data) => {
        setClubs(data || [])
      })
      .catch((err) => {
        console.warn('Error loading public clubs:', err)
      })
      .finally(() => {
        setIsLoadingClubs(false)
      })
  }, [])

  // Filtrado de clubes según deporte seleccionado y término de búsqueda
  const filteredClubs = clubs.filter((club: ClubData) => {
    const matchesSport = selectedSport
      ? club.sports.some((s) => normalizeToSportCategory(s) === normalizeToSportCategory(selectedSport))
      : true
    const matchesSearch = 
      club.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      club.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      club.address.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesSport && matchesSearch
  })

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 sm:p-6 transition-colors duration-200">
      
      {/* Botón flotante para alternar tema */}
      <div className="w-full max-w-sm sm:max-w-xl lg:max-w-3xl flex justify-end pt-2 pb-1">
        <ThemeToggle />
      </div>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* VISTA 1: MENÚ INICIAL DE SELECCIÓN (ESTILO EXACTO A LA REFERENCIA)     */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {!selectedSport ? (
        <main className="w-full max-w-sm sm:max-w-xl lg:max-w-3xl my-auto flex flex-col items-center text-center space-y-6 sm:space-y-8 animate-fade-in py-4 sm:py-8">
          
          {/* Logo / Encabezado superior */}
          <div className="flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-2xl mb-3 shadow-xl shadow-emerald-950/40 flex items-center justify-center hover:scale-105 transition-all duration-300">
              <CancharClubIcon className="w-16 h-16 drop-shadow-md" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-1.5">
              <span>Canchar</span><span className="text-emerald-400 font-black">Club</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1 font-normal">
              ¿Qué querés jugar hoy?
            </p>
          </div>

          {/* Tarjetas de Deportes (Estilo idéntico a la referencia) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 sm:gap-4 w-full">
            {SPORTS_LIST.map((sport) => (
              <button
                key={sport.id}
                onClick={() => setSelectedSport(sport.id)}
                className="group p-5 sm:p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm hover:shadow-md hover:border-emerald-500/50 transition-all duration-200 flex flex-col items-center justify-center text-center space-y-3 cursor-pointer"
              >
                <div className="w-16 h-16 flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                  {sport.renderIcon({ className: "w-16 h-16 drop-shadow-sm" })}
                </div>
                <span className="font-bold text-base text-white">
                  {sport.name}
                </span>
              </button>
            ))}
          </div>

          {/* Menú inferior con separadores (Fiel a la captura) */}
          <div className="w-full max-w-sm sm:max-w-md bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden divide-y divide-slate-800 shadow-sm text-left">
            <button
              onClick={() => setIsReservasModalOpen(true)}
              className="w-full px-4 py-3.5 min-h-12 flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-300 hover:bg-slate-800/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <CalendarCheck className="w-4 h-4 text-slate-400" />
                <span>Mis reservas</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              onClick={() => setIsClubLoginModalOpen(true)}
              className="w-full px-4 py-3.5 min-h-12 flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-300 hover:bg-slate-800/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Building2 className="w-4 h-4 text-slate-400" />
                <span>Acceso clubes</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Opción "¿Sos dueño de un club? Sumá tu club →" (Fiel a la captura) */}
          <div className="pt-2 text-center text-sm text-slate-500 dark:text-slate-400">
            ¿Sos dueño de un club?{' '}
            <Link
              href="/sumar-club"
              className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              Sumá tu club →
            </Link>
          </div>
        </main>
      ) : (
        /* ────────────────────────────────────────────────────────────────────── */
        /* VISTA 2: LISTADO DE CLUBES FILTRADOS POR DEPORTE                      */
        /* ────────────────────────────────────────────────────────────────────── */
        <main className="w-full max-w-4xl my-auto py-6 space-y-6 animate-fade-in">
          
          {/* Barra Superior con botón Volver */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedSport(null)}
                className="rounded-xl border-slate-800 bg-slate-900 text-slate-100 text-xs font-semibold gap-1.5 min-h-10 sm:min-h-9"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Volver
              </Button>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
                  <span>Canchas de {SPORTS_LIST.find(s => s.id === selectedSport)?.name}</span>
                  <span className="text-xl">{SPORTS_LIST.find(s => s.id === selectedSport)?.iconEmoji}</span>
                </h2>
                <p className="text-xs text-slate-400">
                  {filteredClubs.length} complejos disponibles para reservar turnos online
                </p>
              </div>
            </div>

            {/* Buscador Rápido y Mis Reservas */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar por club, barrio..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs rounded-xl bg-slate-900 border-slate-800 text-slate-100"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReservasModalOpen(true)}
                className="min-h-10 sm:min-h-9 px-3 rounded-xl border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-100 text-xs font-semibold gap-1.5 shrink-0"
              >
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                <span>Mis reservas</span>
              </Button>
            </div>
          </div>

          {/* Selector de Deporte Rápido (Tabs / Pills) */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar touch-momentum pb-1">
            <span className="text-xs text-slate-400 font-semibold mr-1">Deporte:</span>
            {SPORTS_LIST.map(sport => (
              <button
                key={sport.id}
                onClick={() => setSelectedSport(sport.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                  selectedSport === sport.id
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                    : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
                }`}
              >
                <span>{sport.iconEmoji}</span>
                <span>{sport.name}</span>
              </button>
            ))}
          </div>

          {/* Grilla de Clubes */}
          {isLoadingClubs ? (
            <div className="p-12 text-center bg-slate-900/60 rounded-3xl border border-slate-800 space-y-3 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
              <p className="text-xs text-slate-400">Cargando complejos disponibles...</p>
            </div>
          ) : filteredClubs.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/60 rounded-3xl border border-slate-800 space-y-3">
              <div className="text-4xl">🔍</div>
              <h3 className="font-bold text-base text-slate-100">
                {searchTerm
                  ? `No se encontraron complejos para "${searchTerm}"`
                  : 'No hay complejos disponibles en esta categoría'}
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {searchTerm
                  ? 'Probá buscando por otro término o limpiá el filtro para ver todos los clubes.'
                  : 'Sé el primero en publicar turnos para este deporte sumando tu club a CancharClub.'}
              </p>
              {searchTerm && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchTerm('')}
                  className="text-xs rounded-xl border-slate-800 text-slate-100"
                >
                  Limpiar búsqueda
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredClubs.map(club => (
                <div
                  key={club.id}
                  className="p-5 rounded-3xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:shadow-xl transition-all flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-bold text-base text-white">
                            {club.name}
                          </h3>
                          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] px-1.5 py-0">
                            Verificado
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                          <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>{club.address}, {club.city}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1 text-xs font-bold text-amber-500 justify-end">
                          <Star className="w-3.5 h-3.5 fill-amber-500" />
                          <span>{club.rating}</span>
                          <span className="text-slate-400 font-normal text-[10px]">({club.reviewsCount})</span>
                        </div>
                      </div>
                    </div>

                    {/* Características / Tags */}
                    <div className="flex flex-wrap gap-1.5 mt-3 text-[11px]">
                      <Badge variant="outline" className="border-slate-800 text-slate-300">
                        {club.courtsCount} Canchas
                      </Badge>
                      {club.isIndoor && (
                        <Badge variant="outline" className="border-slate-800 text-slate-300">
                          Techada
                        </Badge>
                      )}
                      {club.hasLighting && (
                        <Badge variant="outline" className="border-slate-800 text-slate-300 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-500" /> Iluminación LED
                        </Badge>
                      )}
                      {club.hasCantina && (
                        <Badge variant="outline" className="border-slate-800 text-slate-300 flex items-center gap-1">
                          <Coffee className="w-3 h-3 text-emerald-500" /> Cantina
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Precios y Botón de Reserva */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-slate-400 block font-medium">Turno desde:</span>
                      <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                        {formatARS(club.startingPrice)}
                      </span>
                    </div>

                    <Link href={`/club/${club.slug}${selectedSport ? `?sport=${selectedSport}` : ''}`}>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 gap-1.5 min-h-10"
                      >
                        <span>Reservar Cancha</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer de navegación */}
          <div className="pt-4 flex flex-col items-center gap-3 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedSport(null)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              ← Volver a elegir otro deporte
            </Button>

            {/* Opción "¿Sos dueño de un club? Sumá tu club →" */}
            <div className="text-sm text-slate-500 dark:text-slate-400">
              ¿Sos dueño de un club?{' '}
              <Link
                href="/sumar-club"
                className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                Sumá tu club →
              </Link>
            </div>
          </div>
        </main>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: MIS RESERVAS (JUGADORES)                                       */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <PlayerBookingsModal
        open={isReservasModalOpen}
        onOpenChange={setIsReservasModalOpen}
      />

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: ACCESO CLUBES                                                  */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <ClubLoginModal
        open={isClubLoginModalOpen}
        onOpenChange={setIsClubLoginModalOpen}
        onOpenRegister={() => setIsRegisterModalOpen(true)}
      />

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: REGISTRAR / SUMAR CLUB                                         */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <RegisterClubModal
        open={isRegisterModalOpen}
        onOpenChange={setIsRegisterModalOpen}
      />

      {/* Footer copyright */}
      <footer className="w-full max-w-xl text-center py-6 text-xs text-slate-500">
        <p>© 2026 CancharClub. Todos los derechos reservados.</p>
      </footer>
    </div>
  )
}
