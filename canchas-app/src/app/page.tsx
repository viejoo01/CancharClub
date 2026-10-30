'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  CalendarCheck,
  Building2,
  ChevronRight,
  Search,
  MapPin,
  Star,
  Zap,
  Coffee,
  Loader2,
  Navigation,
  Trophy,
  ShieldCheck,
  Smartphone,
  X,
  ArrowUpRight,
  Sparkles,
  Users,
} from 'lucide-react'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { formatARS, buildWhatsAppLink } from '@/lib/utils'
import { CancharClubLogo, CancharClubIcon } from '@/components/shared/canchar-club-logo'
import { toast } from 'sonner'

// Modales cargados diferidos para optimización de Core Web Vitals
const PlayerBookingsModal = dynamic(
  () => import('@/components/public/player-bookings-modal').then((mod) => mod.PlayerBookingsModal),
  { ssr: false }
)
const ClubLoginModal = dynamic(
  () => import('@/components/public/club-login-modal').then((mod) => mod.ClubLoginModal),
  { ssr: false }
)
const RegisterClubModal = dynamic(
  () => import('@/components/public/register-club-modal').then((mod) => mod.RegisterClubModal),
  { ssr: false }
)

import {
  type SportCategory,
  type ClubData,
  normalizeToSportCategory,
  extractCoordsFromGoogleMapsUrl,
} from '@/config/clubs-catalog'
import { getPublicClubs } from '@/actions/club.actions'

// ─── ÍCONOS VECTORIALES DEPORTIVOS EN ALTA DEFINICIÓN ─────────────────────────

function PadelRacketIcon({ className = 'w-12 h-12' }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <ellipse cx="48" cy="32" rx="19" ry="24" transform="rotate(35 48 32)" fill="#93C5FD" stroke="#0F172A" strokeWidth="3" />
      <ellipse cx="48" cy="32" rx="15" ry="20" transform="rotate(35 48 32)" fill="#C7D2FE" />
      <circle cx="43" cy="25" r="1.6" fill="#0F172A" />
      <circle cx="49" cy="22" r="1.6" fill="#0F172A" />
      <circle cx="54" cy="27" r="1.6" fill="#0F172A" />
      <circle cx="41" cy="32" r="1.6" fill="#0F172A" />
      <circle cx="47" cy="31" r="1.6" fill="#0F172A" />
      <circle cx="53" cy="34" r="1.6" fill="#0F172A" />
      <circle cx="44" cy="38" r="1.6" fill="#0F172A" />
      <circle cx="50" cy="39" r="1.6" fill="#0F172A" />
      <path d="M36 49L21 68C19.5 70 16 69.5 14.5 68C13 66.5 13.5 63 15.5 61.5L30 43" fill="#0F172A" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" />
      <line x1="18" y1="65" x2="26" y2="55" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
      <circle cx="21" cy="40" r="7" fill="#BEF264" stroke="#0F172A" strokeWidth="2.5" />
      <path d="M17 36C20 38 20 42 17 44" stroke="#65A30D" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function FutbolBallIcon({ className = 'w-12 h-12' }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="40" cy="40" r="28" fill="#FFFFFF" stroke="#0F172A" strokeWidth="3.2" />
      <polygon points="40,29 49,36 46,47 34,47 31,36" fill="#0F172A" />
      <line x1="40" y1="29" x2="40" y2="12" stroke="#0F172A" strokeWidth="3" />
      <line x1="49" y1="36" x2="65" y2="28" stroke="#0F172A" strokeWidth="3" />
      <line x1="46" y1="47" x2="59" y2="60" stroke="#0F172A" strokeWidth="3" />
      <line x1="34" y1="47" x2="21" y2="60" stroke="#0F172A" strokeWidth="3" />
      <line x1="31" y1="36" x2="15" y2="28" stroke="#0F172A" strokeWidth="3" />
      <path d="M33 13C37 12 43 12 47 13L40 20Z" fill="#0F172A" />
      <path d="M64 25C67 29 68 35 68 39L59 36Z" fill="#0F172A" />
      <path d="M57 62C53 66 47 68 40 68L44 57Z" fill="#0F172A" />
      <path d="M16 25C13 29 12 35 12 39L21 36Z" fill="#0F172A" />
      <path d="M23 62C27 66 33 68 40 68L36 57Z" fill="#0F172A" />
    </svg>
  )
}

function TenisRacketIcon({ className = 'w-12 h-12' }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="48" cy="32" r="22" fill="#FEF08A" stroke="#0F172A" strokeWidth="3" />
      <line x1="34" y1="22" x2="62" y2="22" stroke="#CA8A04" strokeWidth="1.5" />
      <line x1="28" y1="32" x2="68" y2="32" stroke="#CA8A04" strokeWidth="1.5" />
      <line x1="34" y1="42" x2="62" y2="42" stroke="#CA8A04" strokeWidth="1.5" />
      <line x1="38" y1="18" x2="38" y2="46" stroke="#CA8A04" strokeWidth="1.5" />
      <line x1="48" y1="12" x2="48" y2="52" stroke="#CA8A04" strokeWidth="1.5" />
      <line x1="58" y1="18" x2="58" y2="46" stroke="#CA8A04" strokeWidth="1.5" />
      <path d="M33 48L17 67C15.5 68.5 13 68 11.5 66.5C10 65 10.5 62.5 12 61L27 43" fill="#B45309" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" />
      <circle cx="21" cy="40" r="7" fill="#CCFF00" stroke="#0F172A" strokeWidth="2.5" />
      <path d="M17 36C20 38 20 42 17 44" stroke="#84CC16" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function BasquetBallIcon({ className = 'w-12 h-12' }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="40" cy="40" r="28" fill="#F97316" stroke="#0F172A" strokeWidth="3.2" />
      <line x1="12" y1="40" x2="68" y2="40" stroke="#0F172A" strokeWidth="3" />
      <line x1="40" y1="12" x2="40" y2="68" stroke="#0F172A" strokeWidth="3" />
      <path d="M22 17C31 28 31 52 22 63" stroke="#0F172A" strokeWidth="3" />
      <path d="M58 17C49 28 49 52 58 63" stroke="#0F172A" strokeWidth="3" />
    </svg>
  )
}

// Configuración de los deportes disponibles
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
    tagline: 'F5, F7 y F11 sintético',
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
  },
]

export default function HomePage() {
  const [selectedSport, setSelectedSport] = useState<SportCategory | null>(null)
  const [selectedSubSport, setSelectedSubSport] = useState<'ALL' | 'FUTBOL5' | 'FUTBOL7' | 'FUTBOL11'>('ALL')
  const [selectedCity, setSelectedCity] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [sortByDistance, setSortByDistance] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const [filterTechada, setFilterTechada] = useState(false)
  const [filterIluminacion, setFilterIluminacion] = useState(false)
  const [filterCantina, setFilterCantina] = useState(false)

  // Estados de modales
  const [isReservasModalOpen, setIsReservasModalOpen] = useState(false)
  const [isClubLoginModalOpen, setIsClubLoginModalOpen] = useState(false)
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)

  // Datos de clubes
  const [clubs, setClubs] = useState<ClubData[]>([])
  const [isLoadingClubs, setIsLoadingClubs] = useState(true)

  useEffect(() => {
    getPublicClubs()
      .then((data) => {
        setClubs(data || [])
      })
      .catch((err) => {
        console.warn('Error cargando clubes públicos:', err)
      })
      .finally(() => {
        setIsLoadingClubs(false)
      })
  }, [])

  // Lista única de ciudades ordenadas alfabéticamente
  const availableCities = useMemo(() => {
    const set = new Set<string>()
    clubs.forEach((c) => {
      if (c.city && c.city.trim()) {
        set.add(c.city.trim())
      }
    })
    return Array.from(set).sort()
  }, [clubs])

  // Cálculo de distancia en km mediante la fórmula de Haversine
  const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return Math.round(R * c * 10) / 10
  }

  const handleToggleLocation = () => {
    if (sortByDistance) {
      setSortByDistance(false)
      return
    }
    if (userCoords) {
      setSortByDistance(true)
      return
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('Tu navegador no soporta geolocalización')
      return
    }
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        setSortByDistance(true)
        setIsLocating(false)
        toast.success('Ubicación detectada. Ordenando clubes por cercanía.')
      },
      (err) => {
        setIsLocating(false)
        console.warn('Geolocation error:', err)
        toast.error('No se pudo acceder a tu ubicación. Podés elegir tu zona en los filtros.')
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  // Filtrado y ordenamiento dinámico
  const filteredClubs = useMemo(() => {
    let result = clubs.filter((club: ClubData) => {
      // Filtro por deporte
      const matchesSport = selectedSport
        ? club.sports.some((s) => normalizeToSportCategory(s) === normalizeToSportCategory(selectedSport))
        : true

      // Filtro por sub-deporte / formato
      const matchesSubSport =
        selectedSport === 'FUTBOL' && selectedSubSport !== 'ALL'
          ? club.courts.some((c) => {
              const s = (c.specificSport || c.sport || '').toUpperCase()
              const f = c.features.join(' ').toLowerCase()
              if (selectedSubSport === 'FUTBOL11') return s.includes('11') || f.includes('11')
              if (selectedSubSport === 'FUTBOL7') return s.includes('7') || f.includes('7')
              if (selectedSubSport === 'FUTBOL5') return s.includes('5') || f.includes('5')
              return true
            })
          : true

      // Filtro por ciudad
      const matchesCity = selectedCity === 'ALL' || club.city.toLowerCase() === selectedCity.toLowerCase()

      // Filtro por características
      if (filterTechada && !club.isIndoor) return false
      if (filterIluminacion && !club.hasLighting) return false
      if (filterCantina && !club.hasCantina) return false

      // Búsqueda textual por nombre, dirección, barrio o canchas
      const term = searchTerm.toLowerCase().trim()
      const matchesSearch =
        !term ||
        club.name.toLowerCase().includes(term) ||
        club.city.toLowerCase().includes(term) ||
        club.address.toLowerCase().includes(term) ||
        club.courts.some(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            c.features.some((feat) => feat.toLowerCase().includes(term))
        )

      return matchesSport && matchesSubSport && matchesCity && matchesSearch
    })

    if (sortByDistance && userCoords) {
      result = [...result].sort((a, b) => {
        const coordsA = a.coords || extractCoordsFromGoogleMapsUrl(a.googleMapsUrl)
        const coordsB = b.coords || extractCoordsFromGoogleMapsUrl(b.googleMapsUrl)
        const distA = coordsA ? calculateDistanceKm(userCoords.lat, userCoords.lon, coordsA.lat, coordsA.lon) : 9999
        const distB = coordsB ? calculateDistanceKm(userCoords.lat, userCoords.lon, coordsB.lat, coordsB.lon) : 9999
        return distA - distB
      })
    }

    return result
  }, [
    clubs,
    selectedSport,
    selectedSubSport,
    selectedCity,
    searchTerm,
    filterTechada,
    filterIluminacion,
    filterCantina,
    sortByDistance,
    userCoords,
  ])

  const clearAllFilters = () => {
    setSelectedSport(null)
    setSelectedSubSport('ALL')
    setSelectedCity('ALL')
    setSearchTerm('')
    setFilterTechada(false)
    setFilterIluminacion(false)
    setFilterCantina(false)
    setSortByDistance(false)
  }

  const hasActiveFilters =
    Boolean(selectedSport) ||
    selectedCity !== 'ALL' ||
    Boolean(searchTerm) ||
    filterTechada ||
    filterIluminacion ||
    filterCantina ||
    sortByDistance

  const whatsappDirectUrl = buildWhatsAppLink(
    '543816839320',
    'Hola! Quisiera sumar mi club o consultar sobre el sistema CancharClub.'
  )

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] text-slate-900 dark:text-slate-100 selection:bg-emerald-500 selection:text-white transition-colors duration-200 flex flex-col font-sans">
      
      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 1. NAVBAR SUPERIOR GLASSMORPHIC (ALTA FIDELIDAD)                      */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/85 dark:bg-[#070b14]/85 border-b border-slate-200/80 dark:border-slate-800/80 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          
          {/* Logo CancharClub */}
          <Link
            href="/"
            onClick={clearAllFilters}
            className="flex items-center gap-2 group cursor-pointer focus-visible:outline-emerald-500 rounded-xl"
          >
            <CancharClubLogo iconSize="md" showText={true} />
          </Link>

          {/* Acciones Rápidas de Navegación */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Mis Reservas */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReservasModalOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors shadow-2xs"
            >
              <CalendarCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Mis reservas</span>
            </Button>

            {/* Torneos en vivo */}
            <Link
              href="/torneo"
              className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-xs transition-colors shadow-2xs"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <span>Torneos</span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            </Link>

            {/* Acceso Clubes */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsClubLoginModalOpen(true)}
              className="hidden lg:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Acceso Clubes</span>
            </Button>

            {/* Sumá tu Club (CTA Principal) */}
            <Link href="/sumar-club">
              <Button
                size="sm"
                className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm hover:shadow-md transition-all gap-1.5 cursor-pointer"
              >
                <span>Sumá tu club</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            </Link>

            {/* Selector de Tema Nítido (Claro / Oscuro) */}
            <div className="pl-1 border-l border-slate-200 dark:border-slate-800">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 2. HERO PRINCIPAL & DECK DE DESCUBRIMIENTO                             */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-8 pb-10 sm:pt-12 sm:pb-14 border-b border-slate-200/70 dark:border-slate-800/80 bg-linear-to-b from-white via-slate-50 to-slate-100/60 dark:from-[#090e1a] dark:via-[#070b14] dark:to-[#050810]">
        
        {/* Resplandor ambiental de fondo */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(16,185,129,0.12),transparent)] dark:bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(16,185,129,0.18),transparent)] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col items-center text-center">
          
          {/* Badge superior dinámico */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold mb-4 shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Turnos en vivo con seña automática por Mercado Pago</span>
          </div>

          {/* Título Principal */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 dark:text-white max-w-4xl leading-[1.12]">
            Tu cancha lista en segundos.{' '}
            <span className="bg-linear-to-r from-emerald-600 via-teal-500 to-emerald-500 bg-clip-text text-transparent">
              Sin vueltas.
            </span>
          </h1>

          <p className="mt-3 sm:mt-4 text-sm sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl font-normal leading-relaxed">
            Elegí tu deporte, consultá horarios en tiempo real en complejos deportivos de Argentina y asegurá tu turno con confirmación al instante.
          </p>

          {/* ────────────────────────────────────────────────────────────────── */}
          {/* BUSCADOR HERO INTEGRADO (PRO MAX SEARCH BAR)                       */}
          {/* ────────────────────────────────────────────────────────────────── */}
          <div className="w-full max-w-3xl mt-8 p-2 sm:p-2.5 rounded-2xl sm:rounded-3xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-black/40 flex flex-col sm:flex-row items-center gap-2 transition-all">
            
            {/* Input de búsqueda */}
            <div className="relative w-full flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Buscá por club, barrio, calle..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-8 h-12 text-sm rounded-xl sm:rounded-2xl border-0 bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

            {/* Selector de Ciudad */}
            <div className="w-full sm:w-auto flex items-center gap-2">
              <div className="relative w-full sm:w-48">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 pointer-events-none" />
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full h-11 sm:h-12 pl-8 pr-7 text-xs sm:text-sm font-semibold rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 appearance-none focus:outline-emerald-500 cursor-pointer"
                >
                  <option value="ALL">Todas las zonas</option>
                  {availableCities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>

              {/* Botón Cerca de Mí */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleToggleLocation}
                disabled={isLocating}
                className={`h-11 sm:h-12 px-3.5 rounded-xl sm:rounded-2xl border text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  sortByDistance
                    ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                }`}
                title="Ordenar complejos por distancia a tu ubicación"
              >
                {isLocating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Navigation
                    className={`w-3.5 h-3.5 ${
                      sortByDistance ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  />
                )}
                <span className="hidden md:inline ml-1.5">
                  {sortByDistance ? 'Cerca de mí' : 'Geolocalizar'}
                </span>
              </Button>
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────────────── */}
          {/* SELECTOR VISUAL DE DEPORTES (CARDS INTERACTIVAS)                   */}
          {/* ────────────────────────────────────────────────────────────────── */}
          <div className="w-full max-w-4xl mt-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {SPORTS_LIST.map((sport) => {
                const isSelected = selectedSport === sport.id
                return (
                  <button
                    key={sport.id}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedSport(null)
                        setSelectedSubSport('ALL')
                      } else {
                        setSelectedSport(sport.id)
                        setSelectedSubSport('ALL')
                      }
                    }}
                    className={`group relative p-4 sm:p-5 rounded-2xl sm:rounded-3xl border text-center transition-all duration-200 cursor-pointer flex flex-col items-center justify-between ${
                      isSelected
                        ? 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500 text-slate-900 dark:text-white shadow-lg shadow-emerald-500/15 ring-2 ring-emerald-500/30'
                        : 'bg-white dark:bg-slate-900/80 border-slate-200/90 dark:border-slate-800/80 hover:border-emerald-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200 shadow-2xs hover:shadow-md'
                    }`}
                  >
                    <div className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                      {sport.renderIcon({ className: 'w-14 h-14 sm:w-16 sm:h-16 drop-shadow-sm' })}
                    </div>

                    <div className="mt-3">
                      <span className="font-extrabold text-base sm:text-lg block tracking-tight">
                        {sport.name}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block mt-0.5">
                        {sport.tagline}
                      </span>
                    </div>

                    {isSelected && (
                      <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Sub-filtro de Modalidades de Fútbol si está seleccionado */}
          {selectedSport === 'FUTBOL' && (
            <div className="w-full max-w-xl mt-4 flex items-center justify-center gap-2 flex-wrap animate-fade-in">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">
                Modalidad:
              </span>
              {[
                { id: 'ALL', label: 'Todas' },
                { id: 'FUTBOL11', label: 'Fútbol 11' },
                { id: 'FUTBOL7', label: 'Fútbol 7' },
                { id: 'FUTBOL5', label: 'Fútbol 5' },
              ].map((sub) => {
                const active = selectedSubSport === sub.id
                return (
                  <button
                    key={sub.id}
                    onClick={() => setSelectedSubSport(sub.id as 'ALL' | 'FUTBOL5' | 'FUTBOL7' | 'FUTBOL11')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      active
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-emerald-500/50'
                    }`}
                  >
                    {sub.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 3. CATÁLOGO DE CLUBES & GRILLA DE DISPONIBILIDAD                      */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 w-full">
        
        {/* Barra de Filtros Rápida y Contador */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>Complejos Deportivos Disponibles</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                {filteredClubs.length} {filteredClubs.length === 1 ? 'club' : 'clubes'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {selectedSport
                ? `Mostrando canchas de ${SPORTS_LIST.find((s) => s.id === selectedSport)?.name}`
                : 'Turnos actualizados en tiempo real listos para señar online'}
              {selectedCity !== 'ALL' && ` • Zona: ${selectedCity}`}
            </p>
          </div>

          {/* Chips de Amenidades y Limpiar Filtros */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFilterTechada(!filterTechada)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                filterTechada
                  ? 'border-emerald-500 bg-emerald-500 text-white shadow-2xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              Techada
            </button>

            <button
              onClick={() => setFilterIluminacion(!filterIluminacion)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                filterIluminacion
                  ? 'border-amber-500 bg-amber-500 text-white shadow-2xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Luces LED</span>
            </button>

            <button
              onClick={() => setFilterCantina(!filterCantina)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                filterCantina
                  ? 'border-emerald-500 bg-emerald-500 text-white shadow-2xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <Coffee className="w-3 h-3" />
              <span>Cantina / Bar</span>
            </button>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="h-8 px-2.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 font-semibold"
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        </div>

        {/* ────────────────────────────────────────────────────────────────── */}
        {/* LISTADO / GRILLA DE CLUBES                                         */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <div className="mt-8">
          {isLoadingClubs ? (
            /* Skeleton Loading sin parpadeo */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 p-6 space-y-4 animate-pulse"
                >
                  <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded-lg w-3/4" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-lg w-1/2" />
                  <div className="flex gap-2 pt-2">
                    <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded-md w-16" />
                    <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded-md w-20" />
                  </div>
                  <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-xl w-full mt-4" />
                </div>
              ))}
            </div>
          ) : filteredClubs.length === 0 ? (
            /* Estado Vacío Elegante */
            <div className="py-16 text-center max-w-md mx-auto p-8 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
                <Search className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                No encontramos complejos con esos filtros
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Probá cambiando la zona geográfica, restableciendo los filtros de características o buscando por otro término.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllFilters}
                className="rounded-xl border-slate-200 dark:border-slate-800 text-xs font-bold"
              >
                Ver todos los complejos
              </Button>
            </div>
          ) : (
            /* Cards de Clubes Pro Max */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredClubs.map((club) => {
                const clubCoords = club.coords || extractCoordsFromGoogleMapsUrl(club.googleMapsUrl)
                const distanceKm =
                  userCoords && clubCoords
                    ? calculateDistanceKm(userCoords.lat, userCoords.lon, clubCoords.lat, clubCoords.lon)
                    : null

                return (
                  <article
                    key={club.id}
                    className="group rounded-3xl bg-white dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800/80 hover:border-emerald-500/60 dark:hover:border-emerald-500/50 hover:shadow-xl dark:hover:shadow-emerald-950/20 transition-all duration-300 p-6 flex flex-col justify-between"
                  >
                    <div>
                      {/* Cabecera del Club: Nombre, Rating y Distancia */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                              {club.name}
                            </h3>
                            <Badge className="bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 text-[10px] px-1.5 py-0 font-bold">
                              Verificado
                            </Badge>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>
                              {club.address}, {club.city}
                            </span>
                          </div>
                        </div>

                        {/* Rating y Reseñas */}
                        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs font-bold shrink-0">
                          <Star className="w-3 h-3 fill-amber-500" />
                          <span>{club.rating || '4.9'}</span>
                          <span className="text-[10px] opacity-75">({club.reviewsCount || '32'})</span>
                        </div>
                      </div>

                      {/* Distancia geolocalizada si está disponible */}
                      {distanceKm !== null && (
                        <div className="mt-2.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-200 dark:border-sky-500/30">
                            <Navigation className="w-2.5 h-2.5" />a {distanceKm} km de tu ubicación
                          </span>
                        </div>
                      )}

                      {/* Tags de Deportes y Amenidades */}
                      <div className="flex flex-wrap gap-1.5 mt-4 text-[11px]">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                          {club.courtsCount} Canchas
                        </span>

                        {club.sports.map((sp) => (
                          <span
                            key={sp}
                            className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 font-semibold"
                          >
                            {sp}
                          </span>
                        ))}

                        {club.isIndoor && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                            Techada
                          </span>
                        )}

                        {club.hasLighting && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 font-medium flex items-center gap-1">
                            <Zap className="w-2.5 h-2.5 text-amber-500" /> Luces LED
                          </span>
                        )}

                        {club.hasCantina && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium flex items-center gap-1">
                            <Coffee className="w-2.5 h-2.5" /> Cantina
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Footer de la Card: Precio y Botón de Reserva */}
                    <div className="pt-5 mt-5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                          Turno desde
                        </span>
                        <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">
                          {formatARS(club.startingPrice)}
                        </span>
                      </div>

                      <Link
                        href={`/club/${club.slug}${
                          selectedSport
                            ? `?sport=${selectedSport}${selectedSubSport !== 'ALL' ? `&format=${selectedSubSport}` : ''}`
                            : ''
                        }`}
                        className="cursor-pointer"
                      >
                        <Button
                          size="sm"
                          className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 group-hover:scale-[1.02] transition-all gap-1.5"
                        >
                          <span>Ver turnos</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 4. SUPERPODERES CANCHARCLUB (VALOR DIFERENCIAL)                        */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 border-t border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-[#070b14]/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Diseñado para jugar sin complicaciones
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-2">
              Tecnología de punta pensada para deportistas y complejos de alto rendimiento.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Seña Automática Mercado Pago</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Confirmación bancaria en tiempo real. Tu turno queda reservado sin necesidad de enviar comprobantes manuales.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400">
                <Users className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Split Payment entre Amigos</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Dividí el valor de la cancha en partes iguales mediante un enlace compartido para que cada jugador abone su parte.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <Trophy className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Torneos y Fixtures en Vivo</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Inscripción de parejas, zonas clasificatorias y llaves eliminatorias actualizadas en tiempo real desde la web.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                <Smartphone className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">PWA sin descargas obligatorias</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Accedé desde cualquier navegador o instalalo en tu pantalla de inicio en un toque con velocidad nativa.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 5. BANNER B2B PARA DUEÑOS DE CLUBES (HIGH-CONVERTING)                 */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <section className="py-12 border-t border-slate-200 dark:border-slate-800 bg-linear-to-r from-emerald-950/20 via-slate-900 to-slate-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="p-8 sm:p-12 rounded-3xl bg-slate-900/90 border border-emerald-500/30 shadow-2xl relative overflow-hidden flex flex-col lg:flex-row items-center justify-between gap-8">
            
            <div className="space-y-3 text-left max-w-2xl relative z-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
                <Building2 className="w-3.5 h-3.5" />
                <span>Para administradores y dueños de complejos</span>
              </div>
              <h3 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                Llevá la gestión de tu club al siguiente nivel
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Automatizá el cobro de señas por Mercado Pago directo a tu cuenta bancaria, encendé luces con domótica, controlá caja ciega y terminá con los turnos colgados. Probá CancharClub 15 días gratis.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto relative z-10 shrink-0">
              <Link href="/sumar-club" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-12 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/25 transition-all cursor-pointer"
                >
                  Sumá tu club ahora →
                </Button>
              </Link>
              <a
                href={whatsappDirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto"
              >
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto h-12 px-6 rounded-2xl border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-white font-bold text-sm transition-all"
                >
                  Hablar por WhatsApp
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 6. FOOTER INSTITUCIONAL                                               */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <footer className="w-full border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#070b14] py-8 text-xs text-slate-500 dark:text-slate-400 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          
          <div className="flex items-center gap-3">
            <CancharClubIcon className="w-6 h-6" />
            <p>© 2026 CancharClub. El software deportivo de Argentina.</p>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold">
            <Link href="/torneo" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              Torneos
            </Link>
            <Link href="/sumar-club" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              Dueños de Clubes
            </Link>
            <button
              onClick={() => setIsReservasModalOpen(true)}
              className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
            >
              Mis Reservas
            </button>
            <button
              onClick={() => setIsClubLoginModalOpen(true)}
              className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
            >
              Ingreso Socios
            </button>
          </div>
        </div>
      </footer>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* MODALES DEL SISTEMA (CARGA DIFERIDA CON NEXT/DYNAMIC)                  */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <PlayerBookingsModal open={isReservasModalOpen} onOpenChange={setIsReservasModalOpen} />
      <ClubLoginModal
        open={isClubLoginModalOpen}
        onOpenChange={setIsClubLoginModalOpen}
        onOpenRegister={() => setIsRegisterModalOpen(true)}
      />
      <RegisterClubModal open={isRegisterModalOpen} onOpenChange={setIsRegisterModalOpen} />
    </div>
  )
}
