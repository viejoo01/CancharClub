'use client'

import { useState, useEffect } from 'react'
import { Plus, Layers, CheckCircle2, XCircle, Zap, Shield, Loader2, QrCode, Clock } from 'lucide-react'
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
import { createCourt, updateCourt } from '@/actions/club.actions'
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

export default function CanchasPage() {
  const tenantId = useTenantId()
  const [courts, setCourts] = useState<Court[]>([])
  const [courtsLoading, setCourtsLoading] = useState(true)
  const [clubSlug, setClubSlug] = useState('club')

  // Cargar canchas reales desde Supabase
  useEffect(() => {
    if (!tenantId) return
    const supabase = createClient()
    supabase
      .from('courts')
      .select('id, name, sport, slot_duration_minutes, surface, has_lights, is_indoor, is_active')
      .eq('tenant_id', tenantId)
      .order('display_order', { ascending: true })
      .then(({ data }) => {
        if (data) {
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
            surface: c.surface || 'SINTETICO',
            has_lighting: !!c.has_lights,
            is_indoor: !!c.is_indoor,
            is_active: c.is_active ?? true,
          }))
          setCourts(mapped)
        }
        setCourtsLoading(false)
      })
    // Also get club slug
    supabase
      .from('profiles')
      .select('tenants(slug)')
      .eq('tenant_id', tenantId)
      .single()
      .then(({ data }) => {
        const slug = (data?.tenants as { slug?: string } | null)?.slug
        if (slug) setClubSlug(slug)
      })
  }, [tenantId])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedQrCourt, setSelectedQrCourt] = useState<{ id: string; name: string; sport: string } | null>(null)
  const [name, setName] = useState('')
  const [sport, setSport] = useState<SportType>('PADEL')
  const [slotDuration, setSlotDuration] = useState<SlotDuration>('MIN_90')
  const [isCovered, setIsCovered] = useState(false)
  const [surface, setSurface] = useState<CourtSurface>('SINTETICO')
  const [loading, setLoading] = useState(false)

  const handleToggleActive = async (courtId: string, current: boolean) => {
    setCourts(prev => prev.map(c => c.id === courtId ? { ...c, is_active: !current } : c))
    try {
      await updateCourt(courtId, { is_active: !current })
      toast.success('Estado de cancha actualizado')
    } catch {
      toast.info('Actualizado localmente')
    }
  }

  const handleDurationChange = async (courtId: string, newDuration: SlotDuration) => {
    setCourts(prev => prev.map(c => c.id === courtId ? { ...c, slot_duration: newDuration } : c))
    try {
      await updateCourt(courtId, { slot_duration: newDuration })
      const durText = newDuration === 'MIN_60' ? '60 min' : newDuration === 'MIN_90' ? '90 min' : '120 min'
      toast.success(`Duración de turnos actualizada a ${durText}`)
    } catch {
      toast.info('Duración actualizada localmente')
    }
  }

  const handleCreateCourt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    const newCourt = {
      id: `court-${Date.now()}`,
      name,
      sport,
      slot_duration: slotDuration,
      surface,
      has_lighting: true,
      is_indoor: isCovered,
      is_active: true,
    }

    setCourts(prev => [...prev, newCourt])

    try {
      if (!tenantId) {
        toast.error('Error: no se pudo determinar el club activo')
        setLoading(false)
        return
      }
      const created = await createCourt({
        tenant_id: tenantId,
        ...newCourt,
      })
      // Update court id with real DB id if returned
      if (created?.court?.id) {
        setCourts(prev => prev.map(c => c.id === newCourt.id ? { ...c, id: created.court!.id } : c))
      }
      toast.success('¡Cancha agregada con éxito!')
    } catch {
      toast.info('Cancha agregada')
    } finally {
      setLoading(false)
      setIsModalOpen(false)
      setName('')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            Gestión de Canchas
          </h2>
          <p className="text-xs text-slate-400">
            Configurá las canchas disponibles, deportes, duración flexible de turnos y códigos QR de cantina.
          </p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-2 shadow-lg shadow-emerald-950/40 h-10 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nueva Cancha</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {courts.map((court) => (
          <Card key={court.id} className="relative overflow-hidden border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <Badge variant="outline" className="mb-2">
                    {court.sport}
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
                  {court.surface === 'SINTETICO' ? 'Césped Sintético' : court.surface === 'POLVO_LADRILLO' ? 'Polvo de Ladrillo' : court.surface}
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

              {/* Botón Cartel QR Cantina (Mejora 2D) */}
              <div className="pt-2 border-t border-slate-800/60 flex justify-end">
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
                  <option value="FUTBOL_5">Fútbol 5</option>
                  <option value="FUTBOL_7">Fútbol 7</option>
                  <option value="TENIS">Tenis</option>
                  <option value="SQUASH">Squash</option>
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
                <option value="SINTETICO">Césped Sintético</option>
                <option value="CEMENTO">Cemento / Quick</option>
                <option value="POLVO_LADRILLO">Polvo de Ladrillo</option>
                <option value="PARQUET">Parquet</option>
                <option value="ALFOMBRA">Alfombra</option>
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
    </div>
  )
}
