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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { CloudRain, AlertTriangle, MessageCircle, CheckCircle2, Loader2, Send } from 'lucide-react'
import { executeRainCancellation, type RainCancellationResult } from '@/actions/weather-protocol.actions'
import { formatARS } from '@/lib/utils'
import { toast } from 'sonner'

interface CourtItem {
  id: string
  name: string
  sport: string
  is_indoor?: boolean
}

interface RainProtocolModalProps {
  isOpen: boolean
  onClose: () => void
  tenantId: string
  courts: CourtItem[]
  currentDate?: string
  onSuccess?: () => void
}

export function RainProtocolModal({
  isOpen,
  onClose,
  tenantId,
  courts,
  currentDate = new Date().toISOString().split('T')[0],
  onSuccess,
}: RainProtocolModalProps) {
  const [selectedDate, setSelectedDate] = useState(currentDate)
  const [timeFrom, setTimeFrom] = useState('17:00')
  const [timeTo, setTimeTo] = useState('23:59')
  // Por defecto, seleccionar las canchas descubiertas (o todas si no hay flag)
  const [selectedCourts, setSelectedCourts] = useState<string[]>(
    courts.filter(c => !c.is_indoor).map(c => c.id).length > 0
      ? courts.filter(c => !c.is_indoor).map(c => c.id)
      : courts.map(c => c.id)
  )
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RainCancellationResult | null>(null)

  const toggleCourt = (id: string) => {
    setSelectedCourts(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const handleExecute = async () => {
    if (selectedCourts.length === 0) {
      toast.error('Seleccioná al menos una cancha afectada')
      return
    }

    setLoading(true)
    try {
      const res = await executeRainCancellation({
        tenantId,
        date: selectedDate,
        timeFrom,
        timeTo,
        courtIds: selectedCourts,
        reason: 'Suspensión por lluvia / mal tiempo (Protocolo Climático CancharClub)',
      })

      if (res.success) {
        setResult(res)
        toast.success(`Protocolo aplicado: ${res.cancelledBookingsCount} turnos cancelados. Señas acreditadas.`)
        onSuccess?.()
      } else {
        toast.error(res.error || 'Error al ejecutar suspensión')
      }
    } catch {
      toast.error('Error al procesar el protocolo climático')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setResult(null)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleReset}>
      <DialogContent className="sm:max-w-[560px] bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center">
              <CloudRain className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white">
                Protocolo Climático (Lluvia / Mal Tiempo)
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Cancelación masiva de jornada con conversión automática de señas en saldo a favor.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-800/60 text-xs text-blue-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <span>
                Al activar el protocolo, las reservas en las canchas y horarios seleccionados pasarán a estado <strong>RAIN_CANCELLED</strong>. Las señas abonadas se acreditarán como saldo a favor en la cuenta del jugador para su próximo partido.
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="rainDate" className="text-xs text-slate-300">Fecha</Label>
                <Input
                  id="rainDate"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-xs mt-1"
                />
              </div>
              <div>
                <Label htmlFor="timeFrom" className="text-xs text-slate-300">Desde Hora</Label>
                <Input
                  id="timeFrom"
                  type="time"
                  value={timeFrom}
                  onChange={(e) => setTimeFrom(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-xs mt-1"
                />
              </div>
              <div>
                <Label htmlFor="timeTo" className="text-xs text-slate-300">Hasta Hora</Label>
                <Input
                  id="timeTo"
                  type="time"
                  value={timeTo}
                  onChange={(e) => setTimeTo(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-xs mt-1"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-slate-300 font-semibold">Canchas Descubiertas / Afectadas:</Label>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCourts.length === courts.length) {
                      setSelectedCourts([])
                    } else {
                      setSelectedCourts(courts.map(c => c.id))
                    }
                  }}
                  className="text-[11px] text-blue-400 hover:underline"
                >
                  {selectedCourts.length === courts.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {courts.map((court) => {
                  const isSelected = selectedCourts.includes(court.id)
                  return (
                    <button
                      key={court.id}
                      type="button"
                      onClick={() => toggleCourt(court.id)}
                      className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                        isSelected
                          ? 'bg-blue-600/20 border-blue-500 text-white shadow-xs'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="truncate pr-1">
                        <div className="text-xs font-semibold truncate">{court.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {court.is_indoor ? 'Techada' : 'Descubierta (Expuesta)'}
                        </div>
                      </div>
                      <Badge variant={isSelected ? 'default' : 'outline'} className="text-[10px] shrink-0">
                        {isSelected ? 'Afectada' : 'Excluida'}
                      </Badge>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <div className="text-sm font-bold text-white">
                ¡Protocolo Climático Ejecutado con Éxito!
              </div>
              <div className="text-xs text-slate-300">
                Se cancelaron <strong>{result.cancelledBookingsCount} turnos</strong> y se acreditaron{' '}
                <strong className="text-emerald-400">{formatARS(result.totalCreditedArs)}</strong> en saldo a favor para los jugadores.
              </div>
            </div>

            <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>Notificaciones por WhatsApp ({result.notifications.length}):</span>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {result.notifications.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-4">
                  No había reservas agendadas en ese rango y canchas.
                </div>
              ) : (
                result.notifications.map((notif) => (
                  <div
                    key={notif.bookingId}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-white truncate">{notif.customerName}</div>
                      <div className="text-[11px] text-slate-400">
                        {notif.courtName} • {notif.time} hs • Crédito: {formatARS(notif.creditedAmount)}
                      </div>
                    </div>

                    {notif.whatsAppUrl ? (
                      <a
                        href={notif.whatsAppUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shrink-0 shadow-xs"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Avisar</span>
                      </a>
                    ) : (
                      <span className="text-[10px] text-slate-500">Sin teléfono</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
          {!result ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={loading || selectedCourts.length === 0}
                onClick={handleExecute}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudRain className="w-4 h-4" />}
                <span>Activar Suspensión por Lluvia</span>
              </Button>
            </>
          ) : (
            <Button
              type="button"
              onClick={handleReset}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold"
            >
              Cerrar y Volver a la Grilla
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
