'use client'

import { useState } from 'react'
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
import { Clock, CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import { updateClubSchedule } from '@/actions/club.actions'
import { toast } from 'sonner'
import type { ClubScheduleConfig } from '@/lib/time-slots'

interface ClubScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  tenantId: string
  initialSchedule?: ClubScheduleConfig
  onSuccess?: (newSchedule: ClubScheduleConfig) => void
}

const OPENING_PRESETS = ['07:00', '08:00', '09:00', '10:00', '11:00']
const CLOSING_PRESETS = ['22:00', '23:00', '23:30', '00:00', '01:00']

export function ClubScheduleModal({
  isOpen,
  onClose,
  tenantId,
  initialSchedule,
  onSuccess,
}: ClubScheduleModalProps) {
  const [openingTime, setOpeningTime] = useState(initialSchedule?.opening_time || '08:00')
  const [closingTime, setClosingTime] = useState(initialSchedule?.closing_time || '23:30')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) {
      toast.error('Error: no se detectó el identificador del club')
      return
    }

    if (!openingTime || !closingTime) {
      toast.error('Por favor completá los horarios de apertura y cierre')
      return
    }

    setLoading(true)
    try {
      const res = await updateClubSchedule(tenantId, {
        opening_time: openingTime,
        closing_time: closingTime,
      })

      if (!res.success) {
        toast.error(res.error || 'Error al guardar horario')
        return
      }

      toast.success('¡Horarios actualizados exitosamente!', {
        description: `Turnos configurados de ${openingTime} a ${closingTime} hs.`,
      })

      onSuccess?.(res.schedule || { opening_time: openingTime, closing_time: closingTime })
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-120 bg-slate-950 border-slate-800 text-slate-100">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white">
                Horario de Apertura y Cierre
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Los turnos de las canchas se generarán estrictamente dentro de esta franja.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {/* Horario de Apertura */}
          <div className="space-y-2 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="flex items-center justify-between">
              <Label htmlFor="openingTime" className="text-xs font-bold text-slate-200">
                Horario de Apertura (Primer turno)
              </Label>
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                Abre {openingTime} hs
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Input
                id="openingTime"
                type="time"
                value={openingTime}
                onChange={(e) => setOpeningTime(e.target.value)}
                className="h-11 bg-slate-950 border-slate-700 text-white font-mono text-base focus:ring-emerald-500 cursor-pointer"
                required
              />
            </div>

            {/* Accesos rápidos de apertura */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-500 mr-1">Rápidos:</span>
              {OPENING_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset}
                  onClick={() => setOpeningTime(preset)}
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                    openingTime === preset
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              No aparecerán canchas disponibles antes de las <strong className="text-white">{openingTime} hs</strong>. El primer turno del día comenzará puntualmente a esa hora.
            </p>
          </div>

          {/* Horario de Cierre */}
          <div className="space-y-2 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="flex items-center justify-between">
              <Label htmlFor="closingTime" className="text-xs font-bold text-slate-200">
                Horario de Cierre (Último turno)
              </Label>
              <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                Cierra {closingTime} hs
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Input
                id="closingTime"
                type="time"
                value={closingTime}
                onChange={(e) => setClosingTime(e.target.value)}
                className="h-11 bg-slate-950 border-slate-700 text-white font-mono text-base focus:ring-cyan-500 cursor-pointer"
                required
              />
            </div>

            {/* Accesos rápidos de cierre */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-500 mr-1">Rápidos:</span>
              {CLOSING_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset}
                  onClick={() => setClosingTime(preset)}
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                    closingTime === preset
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              El club finalizará su jornada a las <strong className="text-white">{closingTime} hs</strong>. Ningún turno posterior estará disponible.
            </p>
          </div>

          {/* Resumen en vivo */}
          <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-xs text-emerald-300 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-white">Configuración activa de turnos:</div>
              <div className="mt-0.5">
                Primer turno disponible: <span className="font-bold text-emerald-400">{openingTime} hs</span> — Último turno: <span className="font-bold text-cyan-400">{closingTime} hs</span>.
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1.5"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Guardando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Guardar Horario
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
