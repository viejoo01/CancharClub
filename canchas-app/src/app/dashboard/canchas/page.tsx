'use client'

import { useState } from 'react'
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

export default function CanchasPage() {
  const [courts, setCourts] = useState([
    {
      id: 'c1',
      name: 'Cancha 1 (Panorámica)',
      sport: 'PADEL' as SportType,
      slot_duration: 'MIN_90' as SlotDuration,
      surface: 'SINTETICO' as CourtSurface,
      has_lighting: true,
      is_indoor: false,
      is_active: true,
    },
    {
      id: 'c2',
      name: 'Cancha 2 (Techada)',
      sport: 'PADEL' as SportType,
      slot_duration: 'MIN_90' as SlotDuration,
      surface: 'SINTETICO' as CourtSurface,
      has_lighting: true,
      is_indoor: true,
      is_active: true,
    },
    {
      id: 'c3',
      name: 'Cancha 3 (Blindex)',
      sport: 'PADEL' as SportType,
      slot_duration: 'MIN_90' as SlotDuration,
      surface: 'SINTETICO' as CourtSurface,
      has_lighting: true,
      is_indoor: false,
      is_active: true,
    },
    {
      id: 'c4',
      name: 'Fútbol 5 (Sintético)',
      sport: 'FUTBOL_5' as SportType,
      slot_duration: 'MIN_60' as SlotDuration,
      surface: 'SINTETICO' as CourtSurface,
      has_lighting: true,
      is_indoor: false,
      is_active: true,
    },
  ])

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
      await createCourt({
        tenant_id: '00000000-0000-0000-0000-000000000001',
        ...newCourt,
      })
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
      <div className="flex items-center justify-between">
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
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-2 shadow-lg shadow-emerald-950/40"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Cancha</span>
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
        clubSlug="padel-central"
      />


      {/* Modal Nueva Cancha */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[450px]">
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
