'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  MapPin,
  Car,
  Coffee,
  Droplets,
  Video,
  Zap,
  Sparkles,
  Flame,
  Wifi,
  Trophy,
  ExternalLink,
  Navigation,
  Loader2,
  CheckCircle2,
  Layers,
  Compass,
} from 'lucide-react'
import {
  getClubServicesAndLocation,
  updateClubServicesAndLocation,
  geocodeClubAddress,
} from '@/actions/club.actions'
import {
  getGoogleMapsEmbedUrl,
  getGoogleMapsDirectUrl,
  getWazeDirectUrl,
  extractGoogleMapsEmbedUrl,
  extractCoordsFromGoogleMapsUrl,
  type ClubServicesConfig,
  type ClubLocationConfig,
  type ClubServicesAndLocationData,
} from '@/config/clubs-catalog'
import { toast } from 'sonner'

interface ClubServicesLocationModalProps {
  isOpen: boolean
  onClose: () => void
  tenantId: string
  clubSlug?: string
  initialData?: ClubServicesAndLocationData
  onSuccess?: (data: ClubServicesAndLocationData) => void
}

export function ClubServicesLocationModal({
  isOpen,
  onClose,
  tenantId,
  initialData,
  onSuccess,
}: ClubServicesLocationModalProps) {
  const [activeTab, setActiveTab] = useState<'SERVICES' | 'LOCATION'>('SERVICES')

  // Servicios
  const [parking, setParking] = useState(Boolean(initialData?.services.parking))
  const [cantina, setCantina] = useState(Boolean(initialData?.services.cantina))
  const [showers, setShowers] = useState(Boolean(initialData?.services.showers))
  const [cameras, setCameras] = useState(Boolean(initialData?.services.cameras))
  const [lighting, setLighting] = useState(
    initialData?.services.lighting !== undefined ? Boolean(initialData.services.lighting) : true
  )
  const [indoor, setIndoor] = useState(Boolean(initialData?.services.indoor))
  const [grill, setGrill] = useState(Boolean(initialData?.services.grill))
  const [wifi, setWifi] = useState(Boolean(initialData?.services.wifi))
  const [equipmentRental, setEquipmentRental] = useState(Boolean(initialData?.services.equipment_rental))

  // Ubicación y Mapa
  const [address, setAddress] = useState(initialData?.location.address || '')
  const [city, setCity] = useState(initialData?.location.city || '')
  const [province, setProvince] = useState(initialData?.location.province || '')
  const [reference, setReference] = useState(initialData?.location.reference || '')
  const [googleMapsUrl, setGoogleMapsUrl] = useState(initialData?.location.google_maps_url || '')

  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [geocodedCoords, setGeocodedCoords] = useState<{ lat: number; lon: number } | null>(null)

  // Cargar datos actuales si no se pasaron como prop
  useEffect(() => {
    if (!isOpen || !tenantId || initialData) return

    let isMounted = true
    getClubServicesAndLocation(tenantId)
      .then((data) => {
        if (!isMounted) return
        setParking(Boolean(data.services.parking))
        setCantina(Boolean(data.services.cantina))
        setShowers(Boolean(data.services.showers))
        setCameras(Boolean(data.services.cameras))
        setLighting(Boolean(data.services.lighting))
        setIndoor(Boolean(data.services.indoor))
        setGrill(Boolean(data.services.grill))
        setWifi(Boolean(data.services.wifi))
        setEquipmentRental(Boolean(data.services.equipment_rental))

        setAddress(data.location.address || '')
        setCity(data.location.city || '')
        setProvince(data.location.province || '')
        setReference(data.location.reference || '')
        setGoogleMapsUrl(data.location.google_maps_url || '')
      })
      .catch((err) => {
        console.error('[ClubServicesLocationModal] Error fetching services:', err)
      })
      .finally(() => {
        if (isMounted) setFetching(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen, tenantId, initialData])

  // Geocodificar automáticamente si no hay embed oficial ni coordenadas en la URL
  useEffect(() => {
    if (!isOpen) return
    if (extractGoogleMapsEmbedUrl(googleMapsUrl) || extractCoordsFromGoogleMapsUrl(googleMapsUrl)) {
      return
    }

    const queryParts = [address.trim(), city.trim(), (province || 'Argentina').trim()].filter(Boolean)
    const query = queryParts.join(', ')

    let isMounted = true
    const timer = setTimeout(() => {
      if (!query || query.length < 4) {
        if (isMounted) setGeocodedCoords(null)
        return
      }

      geocodeClubAddress(query).then((coords) => {
        if (isMounted) {
          setGeocodedCoords(coords)
        }
      })
    }, 500)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [isOpen, address, city, province, googleMapsUrl])

  // Contar cantidad de servicios activos
  const activeServicesCount = [
    parking,
    cantina,
    showers,
    cameras,
    lighting,
    indoor,
    grill,
    wifi,
    equipmentRental,
  ].filter(Boolean).length

  // URLs de mapa computadas
  const embedUrl = getGoogleMapsEmbedUrl({
    address,
    city,
    province,
    google_maps_url: googleMapsUrl,
    coords: geocodedCoords,
  })

  const isOfficialGoogleEmbed = Boolean(extractGoogleMapsEmbedUrl(googleMapsUrl))

  const directMapsUrl = getGoogleMapsDirectUrl({
    address,
    city,
    province,
    google_maps_url: googleMapsUrl,
  })

  const wazeUrl = getWazeDirectUrl({
    address,
    city,
    province,
    google_maps_url: googleMapsUrl,
    coords: geocodedCoords,
  })

  const handleSave = async () => {
    if (!tenantId) return
    setLoading(true)

    const servicesPayload: ClubServicesConfig = {
      parking,
      cantina,
      showers,
      cameras,
      lighting,
      indoor,
      grill,
      wifi,
      equipment_rental: equipmentRental,
    }

    const locationPayload: ClubLocationConfig = {
      address: address.trim(),
      city: city.trim(),
      province: province.trim(),
      reference: reference.trim(),
      google_maps_url: googleMapsUrl.trim(),
    }

    try {
      const res = await updateClubServicesAndLocation(tenantId, {
        services: servicesPayload,
        location: locationPayload,
      })

      if (res.success && res.data) {
        toast.success('¡Servicios y ubicación actualizados!', {
          description: 'Los cambios ya están visibles para los jugadores en tu página pública.',
        })
        onSuccess?.(res.data)
        onClose()
      } else {
        toast.error('Error al guardar', {
          description: res.error || 'Ocurrió un error inesperado al actualizar.',
        })
      }
    } catch {
      toast.error('Error de conexión', {
        description: 'No se pudo conectar con el servidor. Revisá tu conexión.',
      })
    } finally {
      setLoading(false)
    }
  }

  // Lista de servicios interactivos
  const servicesList = [
    {
      id: 'parking',
      title: 'Estacionamiento',
      desc: 'Espacio propio o vigilado para autos y motos de los jugadores.',
      icon: Car,
      active: parking,
      toggle: () => setParking(!parking),
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      badge: 'Estacionamiento',
    },
    {
      id: 'cantina',
      title: 'Cantina / Bar / Buffet',
      desc: 'Bebidas frías, cafetería, tercer tiempo y snacks para después del partido.',
      icon: Coffee,
      active: cantina,
      toggle: () => setCantina(!cantina),
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      badge: 'Cantina / Bar',
    },
    {
      id: 'showers',
      title: 'Duchas y Vestuarios',
      desc: 'Vestuarios completos con duchas de agua caliente y cambiadores.',
      icon: Droplets,
      active: showers,
      toggle: () => setShowers(!showers),
      color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
      badge: 'Duchas y Vestuarios',
    },
    {
      id: 'cameras',
      title: 'Cámaras de Partidos',
      desc: 'Grabación de jugadas destacadas, repeticiones o transmisión de partidos.',
      icon: Video,
      active: cameras,
      toggle: () => setCameras(!cameras),
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      badge: 'Cámaras de Partidos',
    },
    {
      id: 'lighting',
      title: 'Iluminación LED Profesional',
      desc: 'Potencia lumínica óptima sin sombras para turnos nocturnos.',
      icon: Zap,
      active: lighting,
      toggle: () => setLighting(!lighting),
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      badge: 'Iluminación LED',
    },
    {
      id: 'indoor',
      title: 'Canchas Techadas',
      desc: 'Canchas cubiertas para jugar sin interrupciones por lluvia o calor.',
      icon: Sparkles,
      active: indoor,
      toggle: () => setIndoor(!indoor),
      color: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
      badge: 'Canchas Techadas',
    },
    {
      id: 'grill',
      title: 'Parrilla / Quincho',
      desc: 'Espacio disponible para asados grupales y tercer tiempo con amigos.',
      icon: Flame,
      active: grill,
      toggle: () => setGrill(!grill),
      color: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
      badge: 'Parrilla / Quincho',
    },
    {
      id: 'wifi',
      title: 'Wi-Fi de Alta Velocidad',
      desc: 'Conexión a internet libre y gratuita para socios y jugadores.',
      icon: Wifi,
      active: wifi,
      toggle: () => setWifi(!wifi),
      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
      badge: 'Wi-Fi Libre',
    },
    {
      id: 'equipmentRental',
      title: 'Alquiler de Paletas y Pelotas',
      desc: 'Equipamiento deportivo disponible para alquilar en el club.',
      icon: Trophy,
      active: equipmentRental,
      toggle: () => setEquipmentRental(!equipmentRental),
      color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
      badge: 'Alquiler de Paletas',
    },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-slate-950 border border-slate-800 text-slate-100 p-0 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        {/* Cabecera del Modal */}
        <DialogHeader className="p-6 pb-4 border-b border-slate-800/80 bg-linear-to-b from-slate-900/90 to-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-teal-500/20 to-emerald-500/20 border border-teal-500/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Servicios y Ubicación del Club</span>
                <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30 text-[10px] px-2 py-0.5">
                  Visible para jugadores
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 mt-0.5">
                Destacá las comodidades de tu club y añadí tu dirección exacta con mapa interactivo de Google Maps.
              </DialogDescription>
            </div>
          </div>

          {/* Navegación por Pestañas */}
          <div className="flex items-center gap-2 mt-4 pt-2 border-t border-slate-800/60">
            <button
              type="button"
              onClick={() => setActiveTab('SERVICES')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'SERVICES'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Servicios e Instalaciones</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] font-bold text-slate-300">
                {activeServicesCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('LOCATION')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'LOCATION'
                  ? 'bg-teal-500/15 text-teal-400 border border-teal-500/30 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Dirección y Google Maps</span>
              {address && (
                <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
              )}
            </button>
          </div>
        </DialogHeader>

        {/* Cuerpo del Modal con Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {fetching ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
              <p className="text-xs">Cargando datos del club...</p>
            </div>
          ) : activeTab === 'SERVICES' ? (
            /* ─── PESTAÑA 1: SERVICIOS E INSTALACIONES ─── */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    ¿Qué servicios ofrece tu club?
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Activá las comodidades disponibles. Se mostrarán con insignias llamativas en la página de reservas.
                  </p>
                </div>
                <Badge variant="outline" className="text-xs border-slate-700 text-slate-300">
                  {activeServicesCount} de {servicesList.length} activos
                </Badge>
              </div>

              {/* Grilla de Servicios */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {servicesList.map((srv) => {
                  const Icon = srv.icon
                  return (
                    <div
                      key={srv.id}
                      onClick={srv.toggle}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer select-none flex items-start gap-3 ${
                        srv.active
                          ? 'bg-slate-900/90 border-emerald-500/40 shadow-sm shadow-emerald-950/20'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 opacity-60 hover:opacity-90'
                      }`}
                    >
                      <div className={`p-2 rounded-xl shrink-0 border ${srv.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-xs font-bold ${srv.active ? 'text-white' : 'text-slate-300'}`}>
                            {srv.title}
                          </span>
                          <span
                            className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] shrink-0 ${
                              srv.active
                                ? 'bg-emerald-500 text-slate-950 font-black'
                                : 'border border-slate-700 text-transparent'
                            }`}
                          >
                            ✓
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug line-clamp-2">
                          {srv.desc}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Vista previa de insignias para jugadores */}
              <div className="p-3.5 rounded-2xl bg-linear-to-b from-slate-900/80 to-slate-950 border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                  Vista previa de cómo lo verán los jugadores:
                </span>
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  {servicesList.filter((s) => s.active).length === 0 ? (
                    <span className="text-[11px] text-slate-500 italic">
                      No hay servicios seleccionados. Hacé clic en los recuadros para activarlos.
                    </span>
                  ) : (
                    servicesList
                      .filter((s) => s.active)
                      .map((s) => {
                        const Icon = s.icon
                        return (
                          <span
                            key={s.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-200 font-medium"
                          >
                            <Icon className="w-3 h-3 text-emerald-400" />
                            <span>{s.badge}</span>
                          </span>
                        )
                      })
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ─── PESTAÑA 2: DIRECCIÓN Y GOOGLE MAPS ─── */
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="exact-address" className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-teal-400" />
                    <span>Dirección Exacta (Calle y Altura)</span>
                  </Label>
                  <Input
                    id="exact-address"
                    placeholder="Ej: Av. Aconquija 2100 o Calle 50 Nº 1420"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="bg-slate-900/90 border-slate-800 text-xs text-white placeholder:text-slate-600 h-9"
                  />
                  <p className="text-[11px] text-slate-500">
                    La dirección física donde se encuentran las canchas de tu club.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="club-city" className="text-xs font-semibold text-slate-200">
                    Ciudad / Localidad
                  </Label>
                  <Input
                    id="club-city"
                    placeholder="Ej: Yerba Buena o San Miguel de Tucumán"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="bg-slate-900/90 border-slate-800 text-xs text-white placeholder:text-slate-600 h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="club-province" className="text-xs font-semibold text-slate-200">
                    Provincia
                  </Label>
                  <Input
                    id="club-province"
                    placeholder="Ej: Tucumán o Buenos Aires"
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    className="bg-slate-900/90 border-slate-800 text-xs text-white placeholder:text-slate-600 h-9"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="club-reference" className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-amber-400" />
                    <span>Indicaciones o Referencias de Acceso (Opcional)</span>
                  </Label>
                  <Input
                    id="club-reference"
                    placeholder="Ej: Frente al shopping, portón azul grande al lado de la estación de servicio"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="bg-slate-900/90 border-slate-800 text-xs text-white placeholder:text-slate-600 h-9"
                  />
                  <p className="text-[11px] text-slate-500">
                    Ayuda a los jugadores nuevos a ubicar rápidamente la entrada del predio o estacionamiento.
                  </p>
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="google-maps-url" className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Link directo o Place de Google Maps (Opcional)</span>
                    </Label>
                    {directMapsUrl && (
                      <a
                        href={directMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-400 hover:text-teal-300"
                      >
                        <span>Abrir en Google Maps</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <Input
                    id="google-maps-url"
                    placeholder="Pegá aquí el iframe de Google Maps o enlace de tu club"
                    value={googleMapsUrl}
                    onChange={(e) => {
                      const val = e.target.value
                      const cleanEmbed = extractGoogleMapsEmbedUrl(val)
                      setGoogleMapsUrl(cleanEmbed || val)
                    }}
                    className="bg-slate-900/90 border-slate-800 text-xs text-white placeholder:text-slate-600 h-9 font-mono"
                  />
                  <div className="text-[11px] text-slate-400 space-y-1">
                    <p>
                      💡 <strong>Para mapa embebido oficial de Google Maps:</strong> Buscá tu club en Google Maps, tocá <strong>Compartir</strong> &gt; pestaña <strong>Insertar un mapa</strong> y pegá el código acá.
                    </p>
                    <p className="text-slate-500">
                      Si pegás un enlace compartido normal (maps.app.goo.gl), se utilizará para abrir directamente en Google Maps y Waze.
                    </p>
                  </div>
                </div>
              </div>

              {/* Previsualización del Mapa */}
              <div className="p-4 rounded-2xl bg-linear-to-b from-slate-900/90 to-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">
                      Vista previa del Mapa:
                    </span>
                    {isOfficialGoogleEmbed ? (
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">
                        Google Maps Oficial
                      </Badge>
                    ) : embedUrl ? (
                      <Badge className="bg-sky-500/10 text-sky-400 border-sky-500/30 text-[10px]">
                        Mapa GPS Activo
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {directMapsUrl && (
                      <a
                        href={directMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-semibold inline-flex items-center gap-1"
                      >
                        <MapPin className="w-3 h-3" />
                        <span>Google Maps</span>
                      </a>
                    )}
                    {wazeUrl && (
                      <a
                        href={wazeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[11px] font-semibold inline-flex items-center gap-1"
                      >
                        <Navigation className="w-3 h-3" />
                        <span>Waze</span>
                      </a>
                    )}
                  </div>
                </div>

                {embedUrl ? (
                  <div className="relative w-full h-56 rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                    <iframe
                      title="Previsualización Mapa"
                      src={embedUrl}
                      className="w-full h-full border-0"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                    <div className="absolute bottom-2 right-2 pointer-events-none">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900/90 border border-slate-800 text-[10px] text-slate-300 font-mono shadow-md backdrop-blur-xs">
                        <MapPin className="w-2.5 h-2.5 text-emerald-400" />
                        {isOfficialGoogleEmbed ? 'Google Maps' : 'Mapa GPS'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center bg-slate-950/60 rounded-xl border border-dashed border-slate-800 text-slate-400 text-xs flex flex-col items-center justify-center gap-2 p-4">
                    <MapPin className="w-6 h-6 text-slate-500 animate-pulse" />
                    <p className="font-medium text-slate-300">
                      Completá la calle y ciudad arriba para generar la vista previa interactiva.
                    </p>
                    <p className="text-[11px] text-slate-500 max-w-sm">
                      O pegá el código de inserción de Google Maps (Compartir &gt; Insertar un mapa).
                    </p>
                  </div>
                )}

                {reference && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2">
                    <Navigation className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-200">
                      <strong>Referencia que verán los jugadores:</strong> {reference}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Pie de página con Botones de Acción */}
        <DialogFooter className="p-4 border-t border-slate-800/80 bg-slate-950 flex sm:justify-between items-center gap-2">
          <div className="text-[11px] text-slate-400 hidden sm:flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Actualización inmediata en el portal público</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={loading}
              className="text-xs text-slate-400 hover:text-white h-9 px-3 cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-9 px-4 gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/40"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Guardar Servicios y Mapa</span>
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
