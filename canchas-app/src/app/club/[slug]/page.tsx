'use client'

import { useState, useMemo, useEffect, use } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { 
  MapPin, 
  Phone, 
  Clock, 
  Calendar as CalendarIcon, 
  ChevronRight, 
  Sparkles,
  ShieldCheck,
  Trophy,
  Zap,
  AlertCircle,
  ArrowLeft,
  Star,
  Coffee,
  Car,
  Bell,
  Droplets,
  Video,
  Flame,
  Wifi,
  Navigation,
  ExternalLink,
  Copy,
  Check
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatARS, getArgentinaTodayIso, getArgentinaTimeStr } from '@/lib/utils'
import { WaitlistModal } from '@/components/public/waitlist-modal'
import { PlayerBookingsModal } from '@/components/public/player-bookings-modal'
import { toast } from 'sonner'
import { 
  getClubBySlug, 
  generateClubSlots, 
  type SportCategory,
  type GeneratedSlot,
  type ClubData,
  normalizeToSportCategory,
  normalizeSocialUrl,
  extractSocialHandle,
  getGoogleMapsEmbedUrl,
  getGoogleMapsDirectUrl,
  getWazeDirectUrl,
  extractGoogleMapsEmbedUrl,
  extractCoordsFromGoogleMapsUrl,
} from '@/config/clubs-catalog'
import {
  InstagramIcon,
  FacebookIcon,
  TikTokIcon,
} from '@/components/icons/social-icons'
import { getClubPublicData, getClubOccupiedSlots, type OccupiedSlotInfo, geocodeClubAddress } from '@/actions/club.actions'

// Generador dinámico de los próximos 14 días para el carousel táctil móvil
function getNextDays(count = 14) {
  const days = []
  const today = new Date()
  const daysOfWeek = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

  for (let i = 0; i < count; i++) {
    const d = new Date()
    d.setDate(today.getDate() + i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const isoDate = `${yyyy}-${mm}-${dd}`
    
    let label = daysOfWeek[d.getDay()]
    if (i === 0) label = 'Hoy'
    else if (i === 1) label = 'Mañ'

    days.push({
      isoDate,
      dayName: label,
      dayNumber: d.getDate(),
      monthName: months[d.getMonth()],
      isWeekend: d.getDay() === 0 || d.getDay() === 6
    })
  }
  return days
}

export default function ClubPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const searchParams = useSearchParams()

  // Buscar datos del club: inicial sincronizado + carga reactiva desde Supabase
  const initialClub = useMemo(() => getClubBySlug(slug), [slug])
  const [club, setClub] = useState<ClubData>(initialClub)
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>(() => {
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split('; ')
      const statusCookie = cookies.find(c => c.startsWith('demo_subscription_status='))
      if (statusCookie) {
        return statusCookie.split('=')[1]
      }
    }
    return initialClub.subscriptionStatus || 'ACTIVE'
  })

  useEffect(() => {
    let active = true
    getClubPublicData(slug)
      .then((data) => {
        if (active && data) {
          setClub(data)
          if (data.subscriptionStatus) {
            setSubscriptionStatus(data.subscriptionStatus)
          }
        }
      })
      .catch((err) => console.error('[ClubPublicPage] getClubPublicData error:', err))
    return () => {
      active = false
    }
  }, [slug])

  // Identificar deporte preseleccionado por query param (ej: ?sport=FUTBOL) o por defecto el primer deporte del club
  const urlSport = searchParams.get('sport')?.toUpperCase() as SportCategory | null

  const [userSelectedSport, setUserSelectedSport] = useState<SportCategory | null>(null)

  // Deporte activo: si el usuario lo cambió manualmente lo usamos, de lo contrario usamos el del query param o el principal del club
  const selectedSport: SportCategory = useMemo(() => {
    const normUser = userSelectedSport ? normalizeToSportCategory(userSelectedSport) : null
    if (normUser && club.sports.some(s => normalizeToSportCategory(s) === normUser)) {
      return normUser
    }
    const normUrl = urlSport ? normalizeToSportCategory(urlSport) : null
    if (normUrl && club.sports.some(s => normalizeToSportCategory(s) === normUrl)) {
      return normUrl
    }
    return club.sports[0] ? normalizeToSportCategory(club.sports[0]) : 'PADEL'
  }, [userSelectedSport, club.sports, urlSport])

  const [selectedDate, setSelectedDate] = useState<string>(() => getArgentinaTodayIso())
  const [timeFilter, setTimeFilter] = useState<'ALL' | 'MAÑANA' | 'TARDE' | 'NOCHE'>('ALL')
  const [selectedCourtFilter, setSelectedCourtFilter] = useState<string>('ALL')

  // Reloj reactivo para invalidar en tiempo real los turnos que ya pasaron durante el día (Zona Argentina)
  const [currentTimeStr, setCurrentTimeStr] = useState<string>(() => getArgentinaTimeStr())
  const [occupiedSlots, setOccupiedSlots] = useState<OccupiedSlotInfo[]>([])

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTimeStr(getArgentinaTimeStr())
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  // Sincronización en tiempo real de turnos ocupados (0ms entre pestañas + revalidación automática)
  useEffect(() => {
    let active = true
    if (!club.id) return

    const fetchOccupied = () => {
      getClubOccupiedSlots(club.id, selectedDate)
        .then((data) => {
          if (active && data) {
            setOccupiedSlots(data)
          }
        })
        .catch((err) => console.warn('[ClubPublicPage] getClubOccupiedSlots error:', err))
    }

    fetchOccupied()

    // Intervalo periódico de sincronización cada 20 segundos
    const pollTimer = setInterval(fetchOccupied, 20000)

    // Listener BroadcastChannel para recibir confirmaciones de reservas de otras pestañas o checkout
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel('canchar_bookings')
      bc.onmessage = (event) => {
        if (event.data?.type === 'BOOKING_CONFIRMED') {
          fetchOccupied()
        }
      }
    } catch {}

    const onFocus = () => fetchOccupied()
    window.addEventListener('focus', onFocus)

    return () => {
      active = false
      clearInterval(pollTimer)
      if (bc) bc.close()
      window.removeEventListener('focus', onFocus)
    }
  }, [club.id, selectedDate])

  const availableDays = useMemo(() => getNextDays(14), [])

  const [waitlistSlot, setWaitlistSlot] = useState<{
    courtId: string
    courtName: string
    time: string
    sport: string
  } | null>(null)
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false)
  const [isReservasModalOpen, setIsReservasModalOpen] = useState(false)
  const [geocodedCoords, setGeocodedCoords] = useState<{ lat: number; lon: number } | null>(null)

  // Geocodificar automáticamente si no hay embed oficial de Google Maps
  useEffect(() => {
    if (extractGoogleMapsEmbedUrl(club.googleMapsUrl) || extractCoordsFromGoogleMapsUrl(club.googleMapsUrl)) {
      return
    }

    const queryParts = [club.exactAddress || club.address, club.city, club.province || 'Argentina'].filter(Boolean)
    const query = queryParts.join(', ')

    let isMounted = true
    const timer = setTimeout(() => {
      if (!query || query.length < 4) {
        if (isMounted) setGeocodedCoords(null)
        return
      }

      geocodeClubAddress(query).then((coords) => {
        if (isMounted && coords) {
          setGeocodedCoords(coords)
        }
      })
    }, 400)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [club.exactAddress, club.address, club.city, club.province, club.googleMapsUrl])

  const isPublicPaused = 
    subscriptionStatus === 'PARTIALLY_SUSPENDED' || 
    subscriptionStatus === 'PAUSED' || 
    subscriptionStatus === 'LOCKED' ||
    club.subscriptionStatus === 'PARTIALLY_SUSPENDED' ||
    club.subscriptionStatus === 'PAUSED' ||
    club.subscriptionStatus === 'LOCKED'

  // Generar turnos dinámicos del club para el deporte seleccionado y la fecha elegida
  const slots: GeneratedSlot[] = useMemo(() => {
    return generateClubSlots(club, selectedSport, selectedDate)
  }, [club, selectedSport, selectedDate])

  // Filtros combinados de horario, canchas, exclusión de horas pasadas y marcado de ocupados
  const filteredSlots = useMemo(() => {
    const todayIso = getArgentinaTodayIso()

    return slots
      .filter(slot => {
        // 1. Omitir turnos cuya hora ya pasó si se está viendo el día de hoy en hora argentina
        if (selectedDate === todayIso) {
          if (slot.time <= currentTimeStr) {
            return false
          }
        } else if (selectedDate < todayIso) {
          // En fechas pasadas no se permite reservar ningún turno
          return false
        }

        if (selectedCourtFilter !== 'ALL' && slot.courtId !== selectedCourtFilter) return false
        
        const hour = parseInt(slot.time.split(':')[0], 10)
        if (timeFilter === 'MAÑANA' && hour >= 14) return false
        if (timeFilter === 'TARDE' && (hour < 14 || hour >= 19)) return false
        if (timeFilter === 'NOCHE' && hour < 19) return false

        return true
      })
      .map(slot => {
        // 2. Comprobar si el turno ya está ocupado en memoria o base de datos
        const isOccupied = occupiedSlots.some(occ => {
          const matchCourt = occ.courtId === slot.courtId || (occ.courtName && slot.courtName && occ.courtName.toLowerCase() === slot.courtName.toLowerCase())
          return matchCourt && occ.time === slot.time
        })
        return {
          ...slot,
          isAvailable: !isOccupied
        }
      })
  }, [slots, selectedCourtFilter, timeFilter, selectedDate, currentTimeStr, occupiedSlots])

  const availableCount = filteredSlots.filter(s => s.isAvailable).length

  // Obtener lista única de canchas del club para el deporte actual
  const courtsList = useMemo(() => {
    return club.courts.filter(c => normalizeToSportCategory(c.sport) === selectedSport)
  }, [club.courts, selectedSport])

  // Estado para copiar la dirección al portapapeles
  const [copiedAddress, setCopiedAddress] = useState(false)

  const handleCopyAddress = (textToCopy: string) => {
    if (!textToCopy) return
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(textToCopy)
        setCopiedAddress(true)
        toast.success('Dirección copiada al portapapeles')
        setTimeout(() => setCopiedAddress(false), 2000)
      }
    } catch {}
  }

  // Lista de servicios activos para mostrar en la sección dedicada
  const activeServicesList = useMemo(() => {
    const list: Array<{ id: string; label: string; description: string; icon: React.ReactNode; color: string; bg: string; border: string }> = []
    
    const s = club.services || {
      parking: club.hasParking,
      cantina: club.hasCantina,
      showers: club.hasShowers,
      cameras: club.hasCameras,
      lighting: club.hasLighting,
      indoor: club.isIndoor,
      grill: club.hasGrill,
      wifi: club.hasWifi,
      equipment_rental: club.hasEquipmentRental,
    }

    if (s.parking ?? club.hasParking) {
      list.push({
        id: 'parking',
        label: 'Estacionamiento',
        description: 'Espacio disponible para autos y motos dentro o frente al predio.',
        icon: <Car className="w-4 h-4 text-blue-400" />,
        color: 'text-blue-300',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
      })
    }
    if (s.cantina ?? club.hasCantina) {
      list.push({
        id: 'cantina',
        label: 'Cantina / Bar',
        description: 'Bebidas frías, cafetería, tercer tiempo y comidas rápidas.',
        icon: <Coffee className="w-4 h-4 text-amber-400" />,
        color: 'text-amber-300',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
      })
    }
    if (s.showers ?? club.hasShowers) {
      list.push({
        id: 'showers',
        label: 'Duchas y Vestuarios',
        description: 'Vestuarios completos con agua caliente para refrescarte post-partido.',
        icon: <Droplets className="w-4 h-4 text-cyan-400" />,
        color: 'text-cyan-300',
        bg: 'bg-cyan-500/10',
        border: 'border-cyan-500/30',
      })
    }
    if (s.cameras ?? club.hasCameras) {
      list.push({
        id: 'cameras',
        label: 'Cámaras de Partidos',
        description: 'Cámaras para ver partidos en vivo o revivir tus mejores jugadas.',
        icon: <Video className="w-4 h-4 text-purple-400" />,
        color: 'text-purple-300',
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/30',
      })
    }
    if (s.lighting ?? club.hasLighting) {
      list.push({
        id: 'lighting',
        label: 'Iluminación LED',
        description: 'Luces profesionales de alta potencia para turnos nocturnos.',
        icon: <Zap className="w-4 h-4 text-yellow-400" />,
        color: 'text-yellow-300',
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/30',
      })
    }
    if (s.indoor ?? club.isIndoor) {
      list.push({
        id: 'indoor',
        label: 'Canchas Techadas',
        description: 'Instalaciones cubiertas para jugar sin preocuparte por la lluvia o el sol.',
        icon: <Sparkles className="w-4 h-4 text-teal-400" />,
        color: 'text-teal-300',
        bg: 'bg-teal-500/10',
        border: 'border-teal-500/30',
      })
    }
    if (s.grill ?? club.hasGrill) {
      list.push({
        id: 'grill',
        label: 'Parrilla / Quincho',
        description: 'Espacio de asador o quincho habilitado para tercer tiempo y peñas.',
        icon: <Flame className="w-4 h-4 text-orange-400" />,
        color: 'text-orange-300',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
      })
    }
    if (s.wifi ?? club.hasWifi) {
      list.push({
        id: 'wifi',
        label: 'Wi-Fi Libre',
        description: 'Internet inalámbrico de alta velocidad en todo el predio.',
        icon: <Wifi className="w-4 h-4 text-emerald-400" />,
        color: 'text-emerald-300',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
      })
    }
    if (s.equipment_rental ?? club.hasEquipmentRental) {
      list.push({
        id: 'equipment_rental',
        label: 'Alquiler de Paletas/Pelotas',
        description: 'Paletas de pádel, raquetas y tubos de pelotas disponibles para alquilar.',
        icon: <Trophy className="w-4 h-4 text-rose-400" />,
        color: 'text-rose-300',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/30',
      })
    }

    return list
  }, [club])

  // URLs generadas para Google Maps y Waze
  const mapsEmbedUrl = useMemo(() => {
    return getGoogleMapsEmbedUrl({
      address: club.exactAddress || club.address,
      city: club.city,
      province: club.province || 'Argentina',
      google_maps_url: club.googleMapsUrl,
      coords: geocodedCoords,
    })
  }, [club, geocodedCoords])

  const mapsDirectUrl = useMemo(() => {
    return getGoogleMapsDirectUrl({
      address: club.exactAddress || club.address,
      city: club.city,
      province: club.province || 'Argentina',
      google_maps_url: club.googleMapsUrl,
    })
  }, [club])

  const wazeDirectUrl = useMemo(() => {
    return getWazeDirectUrl({
      address: club.exactAddress || club.address,
      city: club.city,
      province: club.province || 'Argentina',
      google_maps_url: club.googleMapsUrl,
      coords: geocodedCoords,
    })
  }, [club, geocodedCoords])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center">
      {/* Contenedor Mobile First optimizado para Smartphones, Tablets y Notebooks */}
      <div className="w-full max-w-lg md:max-w-3xl lg:max-w-4xl flex-1 flex flex-col pb-16 border-x border-slate-900 bg-slate-950">
        
        {/* Barra Superior Flotante Mobile */}
        <header className="sticky top-0 z-30 px-4 py-3 flex items-center justify-between border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-md">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Inicio</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsReservasModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 text-xs font-semibold text-slate-200 transition-colors shadow-xs"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span>Mis reservas</span>
            </button>
          </div>
        </header>

        {/* Hero Card del Club con Detalles Visuales y Datos Reales */}
        <div className="relative p-5 bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border-b border-slate-800">
          <div className="flex items-start gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-950/50 shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Trophy className="w-7 h-7 text-emerald-400" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-white tracking-tight truncate">
                  {club.name}
                </h1>
                <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] px-1.5 py-0 shrink-0">
                  ✓ Verificado
                </Badge>
              </div>

              <a
                href="#ubicacion"
                className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-emerald-400 transition-colors mt-1 group"
                title="Ver ubicación en Google Maps"
              >
                <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="truncate font-medium underline underline-offset-2 decoration-slate-700 group-hover:decoration-emerald-400">
                  {club.address}, {club.city}
                </span>
                <span className="text-[10px] text-emerald-400/90 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0 hidden sm:inline-block">
                  Ver Mapa
                </span>
              </a>

              {/* Rating y contacto rápido */}
              <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-800/80 text-xs">
                <div className="flex items-center gap-1 text-amber-400 font-bold">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>{club.rating}</span>
                  <span className="text-slate-400 font-normal text-[11px]">({club.reviewsCount} opiniones)</span>
                </div>

                <a
                  href={`https://wa.me/${club.whatsappPhone}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-bold text-xs"
                >
                  <Phone className="w-3 h-3" />
                  <span>WhatsApp Club</span>
                </a>
              </div>
            </div>
          </div>

          {/* Chips de Características y Servicios del Club */}
          <div className="flex items-center gap-1.5 mt-3.5 overflow-x-auto no-scrollbar pb-0.5">
            {(club.services?.parking ?? club.hasParking) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 shrink-0">
                <Car className="w-3 h-3 text-blue-400" /> Estacionamiento
              </span>
            )}
            {(club.services?.cantina ?? club.hasCantina) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 shrink-0">
                <Coffee className="w-3 h-3 text-amber-400" /> Cantina / Bar
              </span>
            )}
            {(club.services?.showers ?? club.hasShowers) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 shrink-0">
                <Droplets className="w-3 h-3 text-cyan-400" /> Duchas
              </span>
            )}
            {(club.services?.cameras ?? club.hasCameras) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 shrink-0">
                <Video className="w-3 h-3 text-purple-400" /> Cámaras Partidos
              </span>
            )}
            {(club.services?.lighting ?? club.hasLighting) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 shrink-0">
                <Zap className="w-3 h-3 text-yellow-400" /> Iluminación LED
              </span>
            )}
            {(club.services?.indoor ?? club.isIndoor) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 shrink-0">
                <Sparkles className="w-3 h-3 text-teal-400" /> Canchas Techadas
              </span>
            )}
            {(club.services?.grill ?? club.hasGrill) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 shrink-0">
                <Flame className="w-3 h-3 text-orange-400" /> Parrilla
              </span>
            )}
            {(club.services?.wifi ?? club.hasWifi) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 shrink-0">
                <Wifi className="w-3 h-3 text-emerald-400" /> Wi-Fi
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 shrink-0">
              <Clock className="w-3 h-3 text-slate-400" /> {club.openHours}
            </span>
          </div>

          {/* Redes Sociales Oficiales del Club para Jugadores */}
          {Boolean(
            club.socialLinks &&
            (club.socialLinks.instagram || club.socialLinks.facebook || club.socialLinks.tiktok)
          ) && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800/80 overflow-x-auto no-scrollbar">
              <span className="text-[11px] font-bold text-slate-400 shrink-0">
                Redes del club:
              </span>

              {club.socialLinks?.instagram && (
                <a
                  href={normalizeSocialUrl('instagram', club.socialLinks.instagram)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 hover:text-pink-200 border border-pink-500/30 transition-all text-xs font-semibold shrink-0 group shadow-xs cursor-pointer"
                  title="Visitar Instagram del club"
                >
                  <InstagramIcon className="w-3.5 h-3.5 text-pink-400 group-hover:scale-110 transition-transform" />
                  <span>{extractSocialHandle('instagram', club.socialLinks.instagram) || 'Instagram'}</span>
                </a>
              )}

              {club.socialLinks?.facebook && (
                <a
                  href={normalizeSocialUrl('facebook', club.socialLinks.facebook)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 hover:text-blue-200 border border-blue-500/30 transition-all text-xs font-semibold shrink-0 group shadow-xs cursor-pointer"
                  title="Visitar Facebook del club"
                >
                  <FacebookIcon className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
                  <span>{extractSocialHandle('facebook', club.socialLinks.facebook) || 'Facebook'}</span>
                </a>
              )}

              {club.socialLinks?.tiktok && (
                <a
                  href={normalizeSocialUrl('tiktok', club.socialLinks.tiktok)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700 hover:border-slate-500 transition-all text-xs font-semibold shrink-0 group shadow-xs cursor-pointer"
                  title="Visitar TikTok del club"
                >
                  <TikTokIcon className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <span>{extractSocialHandle('tiktok', club.socialLinks.tiktok) || 'TikTok'}</span>
                </a>
              )}
            </div>
          )}

          {/* Banner de Información Destacada / Promoción del Club para los Jugadores */}
          {club.highlightText && (
            <div className="mt-4 relative overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-slate-900/95 to-emerald-950/40 p-3.5 shadow-lg shadow-amber-950/20">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0 mt-0.5">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.5">
                      {club.highlightBadge || '🔥 Promoción Especial'}
                    </Badge>
                    <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Anuncio del Club
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed font-medium whitespace-pre-line">
                    {club.highlightText}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ────────────────────────────────────────────────────────── */}
        {/* PASO 1: SELECCIONAR DEPORTE                               */}
        {/* ────────────────────────────────────────────────────────── */}
        <section className="px-4 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              1. Elegí tu Deporte en {club.name}
            </span>
          </div>

          <div className={`grid gap-2 ${
            club.sports.length === 1 ? 'grid-cols-1' :
            club.sports.length === 2 ? 'grid-cols-2' :
            'grid-cols-3'
          }`}>
            {club.sports.map((sp) => {
              const isSelected = selectedSport === sp
              const sportName = sp === 'FUTBOL' ? 'Fútbol' : sp === 'PADEL' ? 'Pádel' : sp === 'TENIS' ? 'Tenis' : 'Básquet'
              const sportIcon = sp === 'FUTBOL' ? '⚽' : sp === 'PADEL' ? '🎾' : sp === 'TENIS' ? '🎾' : '🏀'
              const countForSport = club.courts.filter(c => normalizeToSportCategory(c.sport) === normalizeToSportCategory(sp)).length

              return (
                <button
                  key={sp}
                  onClick={() => {
                    setUserSelectedSport(sp)
                    setSelectedCourtFilter('ALL')
                  }}
                  className={`py-3 px-2 rounded-2xl text-xs font-bold transition-all flex flex-col items-center gap-1 border active:scale-95 cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-b from-emerald-500/20 to-emerald-500/10 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/40'
                      : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="text-xl leading-none">{sportIcon}</span>
                  <span className="font-extrabold text-[13px]">{sportName}</span>
                  <span className="text-[10px] font-normal text-slate-400">
                    {countForSport} {countForSport === 1 ? 'Cancha' : 'Canchas'}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* ────────────────────────────────────────────────────────── */}
        {/* PASO 2: SELECTOR DE FECHAS ESTILO APP (CAROUSEL TÁCTIL)    */}
        {/* ────────────────────────────────────────────────────────── */}
        <section className="px-4 pt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              2. Seleccioná el Día
            </span>
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              {availableCount} turnos libres
            </span>
          </div>

          {/* Carousel Táctil de Días */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar touch-momentum pb-1">
            {availableDays.map((day) => {
              const isSelected = selectedDate === day.isoDate
              return (
                <button
                  key={day.isoDate}
                  onClick={() => setSelectedDate(day.isoDate)}
                  className={`flex flex-col items-center justify-center min-w-[62px] h-[74px] rounded-2xl border transition-all active:scale-95 shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-b from-emerald-500 to-teal-600 border-emerald-400 text-white shadow-lg shadow-emerald-950/50'
                      : 'bg-slate-900/80 border-slate-800/90 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
                    isSelected ? 'text-emerald-100' : 'text-slate-400'
                  }`}>
                    {day.dayName}
                  </span>
                  <span className="text-lg font-black leading-tight my-0.5">
                    {day.dayNumber}
                  </span>
                  <span className={`text-[10px] font-semibold ${
                    isSelected ? 'text-emerald-100' : 'text-slate-400'
                  }`}>
                    {day.monthName}
                  </span>
                </button>
              )
            })}

            {/* Input nativo de fecha para elegir cualquier día */}
            <div className="relative min-w-[50px] h-[74px] shrink-0">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                title="Elegir otra fecha"
              />
              <div className="w-full h-full rounded-2xl border border-slate-800 bg-slate-900/60 flex flex-col items-center justify-center text-slate-400 hover:text-white">
                <CalendarIcon className="w-5 h-5" />
                <span className="text-[9px] mt-1 font-semibold">Más</span>
              </div>
            </div>
          </div>
        </section>

        {/* ────────────────────────────────────────────────────────── */}
        {/* FILTROS RÁPIDOS: HORARIOS Y CANCHAS                        */}
        {/* ────────────────────────────────────────────────────────── */}
        <section className="px-4 pt-4">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar touch-momentum pb-1">
            <button
              onClick={() => setTimeFilter('ALL')}
              className={`px-3.5 py-2 min-h-10 rounded-xl text-xs font-bold shrink-0 transition-colors ${
                timeFilter === 'ALL'
                  ? 'bg-slate-200 text-slate-950'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos los horarios
            </button>
            <button
              onClick={() => setTimeFilter('MAÑANA')}
              className={`px-3.5 py-2 min-h-10 rounded-xl text-xs font-bold shrink-0 transition-colors ${
                timeFilter === 'MAÑANA'
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Mañana (hasta 14 hs)
            </button>
            <button
              onClick={() => setTimeFilter('TARDE')}
              className={`px-3.5 py-2 min-h-10 rounded-xl text-xs font-bold shrink-0 transition-colors ${
                timeFilter === 'TARDE'
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Tarde (14 a 19 hs)
            </button>
            <button
              onClick={() => setTimeFilter('NOCHE')}
              className={`px-3.5 py-2 min-h-10 rounded-xl text-xs font-bold shrink-0 transition-colors ${
                timeFilter === 'NOCHE'
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Noche (19 a 00 hs)
            </button>
          </div>

          {/* Filtro por Cancha si hay más de una */}
          {courtsList.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-momentum mt-2 pb-0.5">
              <span className="text-[10px] text-slate-400 font-semibold mr-0.5 shrink-0">Cancha:</span>
              <button
                onClick={() => setSelectedCourtFilter('ALL')}
                className={`px-3 py-1.5 min-h-9 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                  selectedCourtFilter === 'ALL'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'bg-slate-950 border border-slate-800 text-slate-400'
                }`}
              >
                Todas
              </button>
              {courtsList.map((court) => (
                <button
                  key={court.id}
                  onClick={() => setSelectedCourtFilter(court.id)}
                  className={`px-3 py-1.5 min-h-9 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                    selectedCourtFilter === court.id
                      ? 'bg-emerald-500/20 border border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border border-slate-800 text-slate-400'
                  }`}
                >
                  {court.name}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ────────────────────────────────────────────────────────── */}
        {/* PASO 3: LISTADO DE TURNOS DISPONIBLES                      */}
        {/* ────────────────────────────────────────────────────────── */}
        <section className="px-4 pt-5 flex-1">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              3. Turnos en {club.name}
            </span>
            <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400 bg-emerald-950/30">
              ⚡ Reserva con Seña Online
            </Badge>
          </div>

          {isPublicPaused ? (
            <div className="bg-gradient-to-b from-amber-950/40 to-slate-900 border border-amber-800/60 rounded-3xl p-6 text-center space-y-4 shadow-xl mb-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 mx-auto flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-white text-base">Reservas Online Momentáneamente en Pausa</h3>
                <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                  Las reservas automáticas por la web están pausadas momentáneamente en {club.name}. Podés consultar disponibilidad y reservar tu turno directamente con la recepción del club por WhatsApp.
                </p>
              </div>
              <Button
                asChild
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-5 rounded-2xl shadow-lg shadow-emerald-950/40"
              >
                <a
                  href={`https://wa.me/${club.whatsappPhone}?text=${encodeURIComponent(`¡Hola ${club.name}! Quisiera consultar disponibilidad y reservar una cancha para hoy.`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Consultar Turnos por WhatsApp
                </a>
              </Button>
            </div>
          ) : filteredSlots.length === 0 ? (
            <div className="p-8 text-center bg-slate-900/50 rounded-3xl border border-slate-800 space-y-3">
              <Clock className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-bold text-slate-200">
                {(() => {
                  const now = new Date()
                  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
                  return selectedDate === todayIso
                    ? 'No hay más turnos disponibles para hoy'
                    : 'No hay turnos para los filtros seleccionados'
                })()}
              </div>
              <p className="text-xs text-slate-400">
                {(() => {
                  const now = new Date()
                  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
                  return selectedDate === todayIso
                    ? 'Los horarios anteriores ya pasaron o están completos. Probá seleccionando el día de mañana.'
                    : 'Probá seleccionando otro día o quitando los filtros de horario.'
                })()}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setTimeFilter('ALL')
                  setSelectedCourtFilter('ALL')
                }}
                className="text-xs rounded-xl border-slate-700 text-slate-200"
              >
                Ver todos los turnos
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredSlots.map((slot, index) => (
                <Card
                  key={`${slot.courtId}-${slot.time}-${index}`}
                  className={`border-slate-800 transition-all rounded-2xl ${
                    slot.isAvailable
                      ? 'bg-slate-900/80 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-950/20 active:scale-[0.99]'
                      : 'bg-slate-950/50 opacity-50 border-dashed cursor-not-allowed'
                  }`}
                >
                  <CardContent className="p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Pill de Hora Grande */}
                      <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-black shrink-0 border ${
                        slot.isAvailable
                          ? 'bg-slate-950 border-emerald-500/30 text-slate-100 shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}>
                        <span className="text-[10px] font-bold text-emerald-400 tracking-wider">HS</span>
                        <span className="text-base font-black leading-none">{slot.time}</span>
                      </div>

                      {/* Información de la Cancha y Precios */}
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-100 truncate">
                          {slot.courtName}
                        </div>
                        
                        {/* Features chips */}
                        {slot.features && slot.features.length > 0 && (
                          <div className="flex items-center gap-1 mt-0.5">
                            {slot.features.slice(0, 2).map((feat, fIdx) => (
                              <span key={fIdx} className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800/90 text-slate-300 font-medium">
                                {feat}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="text-xs text-slate-400 mt-1">
                          Total {formatARS(slot.totalPrice)} • <span className="text-emerald-400 font-extrabold">Seña {formatARS(slot.depositPrice)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Botón de Acción Táctil */}
                    <div className="shrink-0">
                      {slot.isAvailable ? (
                        <Link
                          href={`/club/${club.slug}/checkout?tenantId=${club.id}&courtId=${slot.courtId}&courtName=${encodeURIComponent(slot.courtName)}&time=${slot.time}&date=${selectedDate}&total=${slot.totalPrice}&deposit=${slot.depositPrice}&sport=${slot.sport}&club=${encodeURIComponent(club.name)}`}
                        >
                          <Button
                            size="sm"
                            className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md shadow-emerald-950/40 gap-1 active:scale-95 transition-transform"
                          >
                            <span>Reservar</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="secondary" className="text-[10px] bg-slate-800 text-slate-400">
                            Ocupado
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setWaitlistSlot({
                                courtId: slot.courtId,
                                courtName: slot.courtName,
                                time: slot.time,
                                sport: slot.sport,
                              })
                              setIsWaitlistOpen(true)
                            }}
                            className="h-7 px-2 text-[10px] border-amber-500/40 text-amber-400 hover:bg-amber-950/40 hover:text-amber-300 font-medium rounded-lg"
                          >
                            <Bell className="w-2.5 h-2.5 mr-1" />
                            Avisarme
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* ────────────────────────────────────────────────────────── */}
        {/* SERVICIOS E INSTALACIONES DEL CLUB                          */}
        {/* ────────────────────────────────────────────────────────── */}
        {activeServicesList.length > 0 && (
          <section className="px-4 pt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Servicios e Instalaciones</h3>
                  <p className="text-[11px] text-slate-400">Comodidades disponibles para los jugadores en {club.name}</p>
                </div>
              </div>
              <Badge variant="outline" className="text-slate-400 border-slate-800 text-[10px]">
                {activeServicesList.length} servicios
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {activeServicesList.map((srv) => (
                <div
                  key={srv.id}
                  className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 hover:border-slate-700 transition-colors flex items-start gap-3"
                >
                  <div className={`p-2 rounded-lg ${srv.bg} ${srv.border} border shrink-0 mt-0.5`}>
                    {srv.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className={`text-xs font-bold ${srv.color} block`}>
                      {srv.label}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                      {srv.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ────────────────────────────────────────────────────────── */}
        {/* UBICACIÓN Y CÓMO LLEGAR (GOOGLE MAPS)                      */}
        {/* ────────────────────────────────────────────────────────── */}
        <section id="ubicacion" className="px-4 pt-6 scroll-mt-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 mt-0.5">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">Ubicación y Cómo Llegar</h3>
                    <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] px-2 py-0.5">
                      GPS Directo
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 font-medium">
                    {club.exactAddress || club.address}, {club.city}{club.province ? `, ${club.province}` : ''}
                  </p>
                  {club.addressReference && (
                    <p className="text-[11px] text-emerald-400/90 mt-1 flex items-center gap-1 font-medium">
                      <span>💡 Referencia:</span>
                      <span className="italic">{club.addressReference}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Botones de acción rápida */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleCopyAddress(`${club.exactAddress || club.address}, ${club.city}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
                  title="Copiar dirección"
                >
                  {copiedAddress ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copiada</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>

                <a
                  href={mapsDirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-950/40 transition-colors cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Google Maps</span>
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </a>

                <a
                  href={wazeDirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-500/40 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Waze</span>
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </a>
              </div>
            </div>

            {/* Mapa Interactivo */}
            {mapsEmbedUrl ? (
              <div className="relative w-full h-64 sm:h-72 rounded-xl overflow-hidden border border-slate-800 bg-slate-950/60 shadow-inner">
                <iframe
                  title={`Mapa de ubicación de ${club.name}`}
                  src={mapsEmbedUrl}
                  width="100%"
                  height="100%"
                  style={{ border: 0, filter: 'contrast(1.05)' }}
                  allowFullScreen={false}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="w-full h-full"
                />
                <div className="absolute bottom-2 right-2 pointer-events-none">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900/90 border border-slate-800 text-[10px] text-slate-300 font-mono shadow-md backdrop-blur-xs">
                    <MapPin className="w-2.5 h-2.5 text-emerald-400" />
                    {mapsEmbedUrl.includes('google.com') ? 'Google Maps' : 'Mapa GPS'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-xl border border-slate-800 bg-slate-950/40 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                  <MapPin className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{club.exactAddress || club.address}</h4>
                  <p className="text-xs text-slate-400">{club.city}{club.province ? `, ${club.province}` : ''}</p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <a
                    href={mapsDirectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Abrir en Google Maps</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Footer Seguridad y Confianza */}
        <footer className="px-4 pt-8 text-center text-xs text-slate-400 space-y-3">
          {Boolean(
            club.socialLinks &&
            (club.socialLinks.instagram || club.socialLinks.facebook || club.socialLinks.tiktok)
          ) && (
            <div className="flex items-center justify-center gap-2 pb-1">
              <span className="text-[11px] text-slate-400 mr-1 font-medium">Seguinos:</span>
              {club.socialLinks?.instagram && (
                <a
                  href={normalizeSocialUrl('instagram', club.socialLinks.instagram)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-pink-400 hover:text-pink-300 hover:border-pink-500/40 transition-colors"
                  aria-label="Instagram del club"
                  title="Instagram"
                >
                  <InstagramIcon className="w-4 h-4" />
                </a>
              )}
              {club.socialLinks?.facebook && (
                <a
                  href={normalizeSocialUrl('facebook', club.socialLinks.facebook)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-blue-400 hover:text-blue-300 hover:border-blue-500/40 transition-colors"
                  aria-label="Facebook del club"
                  title="Facebook"
                >
                  <FacebookIcon className="w-4 h-4" />
                </a>
              )}
              {club.socialLinks?.tiktok && (
                <a
                  href={normalizeSocialUrl('tiktok', club.socialLinks.tiktok)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
                  aria-label="TikTok del club"
                  title="TikTok"
                >
                  <TikTokIcon className="w-4 h-4" />
                </a>
              )}
            </div>
          )}

          <div className="flex items-center justify-center gap-1.5 text-emerald-400/90 font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>Pago seguro protegido mediante Mercado Pago</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Confirmación automática e inmediata con comprobante digital para WhatsApp de {club.name}.
          </p>
          <p className="text-xs text-slate-500 pt-3 border-t border-slate-800/40">
            © 2026 CancharClub. Todos los derechos reservados.
          </p>
        </footer>

        {/* Modal de Lista de Espera Automática */}
        {waitlistSlot && (
          <WaitlistModal
            isOpen={isWaitlistOpen}
            onClose={() => {
              setIsWaitlistOpen(false)
              setWaitlistSlot(null)
            }}
            tenantId={club.id}
            courtId={waitlistSlot.courtId}
            courtName={waitlistSlot.courtName}
            date={selectedDate}
            timeSlot={waitlistSlot.time}
          />
        )}

        {/* Modal de Consulta de Reservas para Jugadores */}
        <PlayerBookingsModal
          open={isReservasModalOpen}
          onOpenChange={setIsReservasModalOpen}
        />
      </div>
    </div>
  )
}
