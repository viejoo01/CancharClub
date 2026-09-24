'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Layers, CheckCircle2, XCircle, Zap, Shield, Loader2, QrCode, Clock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
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
import { CourtQrModal } from '@/components/dashboard/court-qr-modal'
import { createCourt, updateCourt, deleteCourt, getClubSchedule } from '@/actions/club.actions'
import { ClubScheduleModal } from '@/components/dashboard/club-schedule-modal'
import { DEFAULT_CLUB_SCHEDULE, type ClubScheduleConfig } from '@/lib/time-slots'
import { toast } from 'sonner'
import type { SportType, SlotDuration, CourtSurface } from '@/types/database'
import { useTenantId } from '@/hooks/use-tenant-id'
import { createClient } from '@/lib/supabase/client'

interface Court {
  id: string
  name: string
  sport: SportType
  slot_duration: SlotDuration
  surface: CourtSurface
  has_lighting: boolean
  is_indoor: boolean
  is_active: boolean
}

function formatSurface(surface?: string | null) {
  if (!surface) return 'Césped Sintético'
  if (surface === 'CESPED_SINTETICO' || surface === 'SINTETICO') return 'Césped Sintético'
  if (surface === 'CRISTAL') return 'Cristal / Panorámica'
  if (surface === 'CEMENTO') return 'Cemento / Quick'
  if (surface === 'POLVO_LADRILLO') return 'Polvo de Ladrillo'
  if (surface === 'PASTO_NATURAL') return 'Pasto Natural'
  return surface
}

function formatSport(sport?: string | null) {
  if (!sport) return 'Pádel'
  if (sport === 'FUTBOL5' || sport === 'FUTBOL_5') return 'Fútbol 5'
  if (sport === 'FUTBOL7' || sport === 'FUTBOL_7') return 'Fútbol 7'
  if (sport === 'TENIS') return 'Tenis'
  if (sport === 'PADEL') return 'Pádel'
  if (sport === 'BASQUET' || sport === 'BASKET') return 'Básquet'
  return sport
}

export default function CanchasPage() {
  const tenantId = useTenantId()
  const [courts, setCourts] = useState<Court[]>([])
  const [courtsLoading, setCourtsLoading] = useState(true)
  const [clubSlug, setClubSlug] = useState('club')
  const [schedule, setSchedule] = useState<ClubScheduleConfig>(DEFAULT_CLUB_SCHEDULE)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedQrCourt, setSelectedQrCourt] = useState<{ id: string; name: string; sport: string } | null>(null)
  const [name, setName] = useState('')
  const [sport, setSport] = useState<SportType>('PADEL')
  const [slotDuration, setSlotDuration] = useState<SlotDuration>('MIN_90')
  const [isCovered, setIsCovered] = useState(false)
  const [surface, setSurface] = useState<CourtSurface>('CESPED_SINTETICO')
  const [loading, setLoading] = useState(false)

  const loadCourtsData = useCallback(async (isInitial = false) => {
    if (!tenantId) return
    const supabase = createClient()
    try {
      const { data, error } = await supabase
        .from('courts')
        .select('id, name, sport, slot_duration_minutes, surface, has_lights, is_indoor, is_active')
        .eq('tenant_id', tenantId)
        .order('display_order', { ascending: true })

      if (data && !error) {
        interface CourtDbRow {
          id: string
          name: string
          sport: SportType
          slot_duration_minutes: number | null
          surface: CourtSurface | null
          has_lights: boolean | null
          is_indoor: boolean | null
          is_active: boolean | null
        }
        const mapped: Court[] = (data as unknown as CourtDbRow[]).map(c => ({
          id: c.id,
          name: c.name,
          sport: c.sport,
          slot_duration: c.slot_duration_minutes === 60 ? 'MIN_60' : c.slot_duration_minutes === 120 ? 'MIN_120' : 'MIN_90',
          surface: c.surface || 'CESPED_SINTETICO',
          has_lighting: !!c.has_lights,
          is_indoor: !!c.is_indoor,
          is_active: c.is_active ?? true,
        }))
        setCourts(mapped)
      }
    } catch {}

    try {
      const sched = await getClubSchedule(tenantId)
      if (sched) setSchedule(sched)
    } catch {}

    if (isInitial) setCourtsLoading(false)
  }, [tenantId])

  // Cargar canchas reales y mantener consultas continuas a la base de datos
  useEffect(() => {
    if (!tenantId) return

    const fetchCourts = async () => {
      try {
        await loadCourtsData(false)
      } catch {}
    }
    void fetchCourts()

    // Sondeo continuo cada 5 segundos a la base de datos
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void fetchCourts()
    }, 5000)

    const handleSync = () => void fetchCourts()
    window.addEventListener('focus', handleSync)
    document.addEventListener('visibilitychange', handleSync)

    // Obtener slug del club desde la BD
    const supabase = createClient()
    supabase
      .from('profiles')
      .select('tenants(slug)')
      .eq('tenant_id', tenantId)
      .maybeSingle()
      .then(({ data }) => {
        const slug = (data?.tenants as { slug?: string } | null)?.slug
        if (slug) setClubSlug(slug)
      })

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleSync)
      document.removeEventListener('visibilitychange', handleSync)
    }
  }, [tenantId, loadCourtsData])

  const handleToggleActive = async (courtId: string, current: boolean) => {
    const nextState = !current
    setCourts(prev => prev.map(c => c.id === courtId ? { ...c, is_active: nextState } : c))
    try {
      const res = await updateCourt(courtId, { is_active: nextState })
      if (!res.success) {
        setCourts(prev => prev.map(c => c.id === courtId ? { ...c, is_active: current } : c))
        toast.error(res.error || 'Error al actualizar estado')
      } else {
        toast.success(nextState ? 'Cancha activada' : 'Cancha desactivada')
      }
    } catch {
      setCourts(prev => prev.map(c => c.id === courtId ? { ...c, is_active: current } : c))
      toast.error('Error de conexión al actualizar estado')
    }
  }

  const handleDurationChange = async (courtId: string, newDuration: SlotDuration) => {
    const prevDuration = courts.find(c => c.id === courtId)?.slot_duration || 'MIN_90'
    setCourts(prev => prev.map(c => c.id === courtId ? { ...c, slot_duration: newDuration } : c))
    try {
      const res = await updateCourt(courtId, { slot_duration: newDuration })
      if (!res.success) {
        setCourts(prev => prev.map(c => c.id === courtId ? { ...c, slot_duration: prevDuration } : c))
        toast.error(res.error || 'Error al actualizar duración')
      } else {
        const durText = newDuration === 'MIN_60' ? '60 min' : newDuration === 'MIN_90' ? '90 min' : '120 min'
        toast.success(`Duración de turnos actualizada a ${durText}`)
      }
    } catch {
      setCourts(prev => prev.map(c => c.id === courtId ? { ...c, slot_duration: prevDuration } : c))
      toast.error('Error de conexión al actualizar duración')
    }
  }

  const handleDeleteCourt = async (courtId: string, courtName: string) => {
    if (!tenantId) return
    if (!confirm(`¿Estás seguro de que querés eliminar la cancha "${courtName}"? Esta acción no se puede deshacer.`)) return

    try {
      const res = await deleteCourt(courtId, tenantId)
      if (!res.success) {
        if (res.hasActiveBookings) {
          const proceed = confirm(
            `${res.error}\n\n¿Deseás eliminar la cancha de todas formas borrando todos sus turnos asociados? (Si cancelás, podés simplemente desactivarla).`
          )
          if (proceed) {
            const forceRes = await deleteCourt(courtId, tenantId, { force: true })
            if (forceRes.success) {
              setCourts(prev => prev.filter(c => c.id !== courtId))
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('canchar:courts-changed'))
              }
              toast.success(`Cancha "${courtName}" y sus turnos asociados fueron eliminados correctamente`)
              return
            } else {
              toast.error(forceRes.error || 'Error al forzar eliminación')
              return
            }
          }
        } else {
          toast.error(res.error || 'Error al eliminar cancha')
        }
      } else {
        setCourts(prev => prev.filter(c => c.id !== courtId))
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('canchar:courts-changed'))
        }
        toast.success(`Cancha "${courtName}" eliminada correctamente`)
      }
    } catch {
      toast.error('Error de conexión al eliminar cancha')
    }
  }

  const handleCreateCourt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    if (!tenantId) {
      toast.error('Error: no se pudo determinar el club activo')
      return
    }

    setLoading(true)
    try {
      const res = await createCourt({
        tenant_id: tenantId,
        name: name.trim(),
        sport,
        slot_duration: slotDuration,
        surface,
        has_lighting: true,
        is_indoor: isCovered,
        is_active: true,
      })

      if (!res.success || !res.court) {
        toast.error(res.error || 'Error al guardar la cancha en la base de datos')
        return
      }

      // Solo agregamos al estado local cuando la base de datos confirmó el guardado
      const dbCourt = res.court
      const createdCourt: Court = {
        id: dbCourt.id,
        name: dbCourt.name,
        sport: dbCourt.sport,
        slot_duration: dbCourt.slot_duration_minutes === 60 ? 'MIN_60' : dbCourt.slot_duration_minutes === 120 ? 'MIN_120' : 'MIN_90',
        surface: dbCourt.surface || 'CESPED_SINTETICO',
        has_lighting: Boolean(dbCourt.has_lights),
        is_indoor: Boolean(dbCourt.is_indoor),
        is_active: dbCourt.is_active !== false,
      }

      setCourts(prev => [...prev, createdCourt])
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('canchar:courts-changed'))
      }
      toast.success('¡Cancha guardada y registrada con éxito en el club!')
      setIsModalOpen(false)
      setName('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al crear la cancha'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            Gestión de Canchas
          </h2>
          <p className="text-xs text-slate-400">
            Configurá las canchas disponibles, deportes, duración flexible de turnos y códigos QR de cantina.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={() => setIsScheduleModalOpen(true)}
            className="border-emerald-500/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50 hover:text-white font-medium gap-1.5 h-10 px-3 cursor-pointer text-xs"
            title="Configurar horario de apertura y cierre del club"
          >
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>Horario: {schedule.opening_time} - {schedule.closing_time} hs</span>
          </Button>

          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-2 shadow-lg shadow-emerald-950/40 h-10 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nueva Cancha</span>
          </Button>
        </div>
      </div>

      {/* Banner de Horario Operativo del Club */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">Horario Operativo del Club:</span>
              <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs px-2 py-0.5">
                {schedule.opening_time} a {schedule.closing_time} hs
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Los turnos del calendario y del portal público de reservas se generan estrictamente dentro de este rango.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsScheduleModalOpen(true)}
          className="text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 h-8 px-2.5 shrink-0 cursor-pointer"
        >
          Editar Horario
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {courts.map((court) => (
          <Card key={court.id} className="relative overflow-hidden border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <Badge variant="outline" className="mb-2">
                    {formatSport(court.sport)}
                  </Badge>
                  <CardTitle className="text-base">{court.name}</CardTitle>
                </div>
                <button
                  onClick={() => handleToggleActive(court.id, court.is_active)}
                  className="focus:outline-none"
                  title={court.is_active ? 'Desactivar cancha' : 'Activar cancha'}
                >
                  {court.is_active ? (
                    <Badge variant="default" className="gap-1 cursor-pointer">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      Activa
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1 cursor-pointer">
                      <XCircle className="w-3 h-3 text-slate-400" />
                      Inactiva
                    </Badge>
                  )}
                </button>
              </div>

              {/* Selector de Duración Flexible (Mejora 2B) */}
              <div className="pt-2">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span className="flex items-center gap-1 font-medium">
                    <Clock className="w-3 h-3 text-emerald-400" /> Duración de Turnos:
                  </span>
                </div>
                <select
                  value={court.slot_duration}
                  onChange={(e) => handleDurationChange(court.id, e.target.value as SlotDuration)}
                  className="w-full h-8 rounded-lg bg-slate-950 border border-slate-700 px-2.5 text-xs text-emerald-400 font-semibold focus:outline-none focus:border-emerald-500"
                >
                  <option value="MIN_60">60 minutos (Estándar Fútbol)</option>
                  <option value="MIN_90">90 minutos (Recomendado Pádel)</option>
                  <option value="MIN_120">120 minutos (2 horas)</option>
                </select>
              </div>
            </CardHeader>

            <CardContent className="space-y-2 text-xs text-slate-300 border-t border-slate-800/80 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-500" /> Superficie:
                </span>
                <span className="font-medium text-slate-200">
                  {formatSurface(court.surface)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" /> Iluminación:
                </span>
                <span className="font-medium text-slate-200">LED Profesional</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-teal-400" /> Cobertura:
                </span>
                <span className="font-medium text-slate-200">
                  {court.is_indoor ? 'Techada' : 'Al descubierto'}
                </span>
              </div>

              {/* Botones de acción: QR Cantina y Eliminar */}
              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeleteCourt(court.id, court.name)}
                  className="h-7 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 gap-1 px-2"
                  title="Eliminar cancha"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedQrCourt({ id: court.id, name: court.name, sport: court.sport })}
                  className="h-7 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 gap-1.5"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Código QR Cantina</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal QR Cantina */}
      <CourtQrModal
        isOpen={!!selectedQrCourt}
        onClose={() => setSelectedQrCourt(null)}
        court={selectedQrCourt}
        clubSlug={clubSlug}
      />

      {/* Loading state while fetching courts */}
      {courtsLoading && (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>Cargando canchas...</span>
        </div>
      )}
      {!courtsLoading && courts.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <p className="text-sm">No hay canchas registradas. Agregá la primera cancha con el botón &quot;Nueva Cancha&quot;.</p>
        </div>
      )}


      {/* Modal Nueva Cancha */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[450px] max-h-[90dvh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Nueva Cancha</DialogTitle>
            <DialogDescription>
              Agregá una nueva cancha al inventario del club.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCourt} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="courtName">Nombre de la Cancha *</Label>
              <Input
                id="courtName"
                placeholder="Ej. Cancha 4 (Cristal)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sport">Deporte</Label>
                <select
                  id="sport"
                  value={sport}
                  onChange={(e) => setSport(e.target.value as SportType)}
                  className="flex h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="PADEL">Pádel</option>
                  <option value="FUTBOL5">Fútbol 5</option>
                  <option value="FUTBOL7">Fútbol 7</option>
                  <option value="TENIS">Tenis</option>
                  <option value="BASQUET">Básquet</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="duration">Duración de Turno</Label>
                <select
                  id="duration"
                  value={slotDuration}
                  onChange={(e) => setSlotDuration(e.target.value as SlotDuration)}
                  className="flex h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="MIN_60">60 minutos</option>
                  <option value="MIN_90">90 minutos</option>
                  <option value="MIN_120">120 minutos</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="surface">Superficie</Label>
              <select
                id="surface"
                value={surface}
                onChange={(e) => setSurface(e.target.value as CourtSurface)}
                className="flex h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              >
                <option value="CESPED_SINTETICO">Césped Sintético</option>
                <option value="CRISTAL">Cristal / Panorámica</option>
                <option value="CEMENTO">Cemento / Quick</option>
                <option value="POLVO_LADRILLO">Polvo de Ladrillo</option>
                <option value="PASTO_NATURAL">Pasto Natural</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="covered"
                type="checkbox"
                checked={isCovered}
                onChange={(e) => setIsCovered(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="covered" className="text-sm text-slate-300 font-medium cursor-pointer">
                Cancha techada / cubierta
              </label>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : 'Guardar Cancha'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Horarios de Apertura y Cierre del Club */}
      {isScheduleModalOpen && (
        <ClubScheduleModal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          tenantId={tenantId || ''}
          initialSchedule={schedule}
          onSuccess={(newSchedule) => {
            setSchedule(newSchedule)
          }}
        />
      )}
    </div>
  )
}
