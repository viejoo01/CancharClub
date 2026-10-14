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
import {
  CloudRain,
  AlertTriangle,
  MessageCircle,
  CheckCircle2,
  Loader2,
  CalendarDays,
  Sparkles,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Search,
  CalendarCheck2,
} from 'lucide-react'
import {
  executeRainCancellation,
  confirmRainReschedule,
  type RainCancellationResult,
  type SuggestedReschedule,
  type RainAffectedBookingNotification,
} from '@/actions/weather-protocol.actions'
import { formatARS } from '@/lib/utils'
import { buildWaMeLink, buildRainRescheduleWhatsAppMessage } from '@/lib/whatsapp'
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

  // Estados interactivos para las reagendas en la vista de resultados
  const [activeReschedules, setActiveReschedules] = useState<Record<string, SuggestedReschedule | null>>({})
  const [reschedulingLoading, setReschedulingLoading] = useState<Record<string, boolean>>({})
  const [rescheduledSuccess, setRescheduledSuccess] = useState<Record<string, { date: string; time: string; courtName: string }>>({})
  const [expandedMessages, setExpandedMessages] = useState<Record<string, boolean>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

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
        // Inicializar slots activos con los sugeridos
        const initialReschedules: Record<string, SuggestedReschedule | null> = {}
        res.notifications.forEach(n => {
          initialReschedules[n.bookingId] = n.suggestedReschedule
        })
        setActiveReschedules(initialReschedules)

        toast.success(`Protocolo aplicado: ${res.cancelledBookingsCount} turnos suspendidos. Reagendas calculadas.`)
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
    setActiveReschedules({})
    setReschedulingLoading({})
    setRescheduledSuccess({})
    setExpandedMessages({})
    setCopiedId(null)
    setSearchQuery('')
    onClose()
  }

  // Copiar mensaje al portapapeles
  const handleCopyMessage = async (bookingId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(bookingId)
      toast.success('Mensaje copiado al portapapeles')
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      toast.error('No se pudo copiar el mensaje')
    }
  }

  // Confirmar Reagenda con 1 clic en la base de datos
  const handleConfirmReschedule = async (notif: RainAffectedBookingNotification) => {
    const chosenSlot = activeReschedules[notif.bookingId] || notif.suggestedReschedule
    if (!chosenSlot) {
      toast.error('No hay un turno seleccionado para reagendar')
      return
    }

    setReschedulingLoading(prev => ({ ...prev, [notif.bookingId]: true }))
    try {
      const res = await confirmRainReschedule({
        tenantId,
        originalBookingId: notif.bookingId,
        newCourtId: chosenSlot.courtId,
        newDate: chosenSlot.date,
        newStartTime: chosenSlot.startTime,
        durationMinutes: chosenSlot.durationMinutes,
        customerName: notif.customerName,
        customerPhone: notif.customerPhone,
        creditedAmount: notif.creditedAmount,
      })

      if (res.success) {
        setRescheduledSuccess(prev => ({
          ...prev,
          [notif.bookingId]: {
            date: chosenSlot.dateFormatted,
            time: chosenSlot.startTime,
            courtName: chosenSlot.courtName,
          },
        }))
        toast.success(`¡Turno reagendado con éxito para ${notif.customerName}!`, {
          description: `${chosenSlot.dateFormatted} a las ${chosenSlot.startTime} hs en ${chosenSlot.courtName}`,
        })
        onSuccess?.()
      } else {
        toast.error(res.error || 'No se pudo reagendar el turno')
      }
    } catch {
      toast.error('Error al confirmar la reagenda del turno')
    } finally {
      setReschedulingLoading(prev => ({ ...prev, [notif.bookingId]: false }))
    }
  }

  // Filtrar notificaciones por búsqueda
  const filteredNotifications = result?.notifications.filter(n => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      n.customerName.toLowerCase().includes(q) ||
      n.customerPhone.includes(q) ||
      n.originalCourtName.toLowerCase().includes(q)
    )
  }) || []

  return (
    <Dialog open={isOpen} onOpenChange={handleReset}>
      <DialogContent className="sm:max-w-[700px] max-h-[92dvh] overflow-y-auto w-[96vw] sm:w-full bg-slate-900 border-slate-800 text-slate-100 p-4 sm:p-6 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center shrink-0 shadow-inner">
              <CloudRain className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <DialogTitle className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Protocolo Climático (Lluvia / Mal Tiempo)
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Cancelación masiva de turnos con cálculo del próximo turno disponible y mensaje de WhatsApp para el jugador.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4 py-2">
            <div className="p-3.5 rounded-2xl bg-blue-950/40 border border-blue-800/60 text-xs text-blue-200 flex items-start gap-3 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <span>
                Al activar el protocolo, las reservas afectadas se marcarán como <strong>suspendidas por lluvia</strong> y sus señas quedarán guardadas a favor del cliente. Además, <strong>el sistema calculará automáticamente el próximo turno libre más cercano</strong> para ofrecerle una reagenda inmediata por WhatsApp.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="rainDate" className="text-xs text-slate-300 font-semibold">Fecha</Label>
                <Input
                  id="rainDate"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-xs mt-1 text-white focus:border-blue-500"
                />
              </div>
              <div>
                <Label htmlFor="timeFrom" className="text-xs text-slate-300 font-semibold">Desde Hora</Label>
                <Input
                  id="timeFrom"
                  type="time"
                  value={timeFrom}
                  onChange={(e) => setTimeFrom(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-xs mt-1 text-white focus:border-blue-500"
                />
              </div>
              <div>
                <Label htmlFor="timeTo" className="text-xs text-slate-300 font-semibold">Hasta Hora</Label>
                <Input
                  id="timeTo"
                  type="time"
                  value={timeTo}
                  onChange={(e) => setTimeTo(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-xs mt-1 text-white focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-slate-300 font-semibold">Canchas Afectadas por la Lluvia:</Label>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCourts.length === courts.length) {
                      setSelectedCourts([])
                    } else {
                      setSelectedCourts(courts.map(c => c.id))
                    }
                  }}
                  className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                >
                  {selectedCourts.length === courts.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {courts.map((court) => {
                  const isSelected = selectedCourts.includes(court.id)
                  return (
                    <button
                      key={court.id}
                      type="button"
                      onClick={() => toggleCourt(court.id)}
                      className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                        isSelected
                          ? 'bg-blue-600/20 border-blue-500 text-white shadow-xs'
                          : 'bg-slate-950/70 border-slate-800/80 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="text-xs font-semibold truncate text-white">{court.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {court.is_indoor ? 'Techada' : 'Descubierta (Expuesta al clima)'}
                        </div>
                      </div>
                      <Badge
                        variant={isSelected ? 'default' : 'outline'}
                        className={`text-[10px] shrink-0 font-medium ${
                          isSelected ? 'bg-blue-600 text-white border-transparent' : 'border-slate-700 text-slate-400'
                        }`}
                      >
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
            {/* Resumen del Protocolo Ejecutado */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-emerald-950/40 border border-emerald-500/50 space-y-2">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="text-sm font-bold text-white">
                  ¡Protocolo Climático Ejecutado con Éxito!
                </span>
              </div>
              <div className="text-xs text-slate-300 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  Se cancelaron <strong>{result.cancelledBookingsCount} turnos</strong> por mal tiempo.
                </span>
                <span>
                  Señas guardadas como crédito:{' '}
                  <strong className="text-emerald-400 font-bold">{formatARS(result.totalCreditedArs)}</strong>
                </span>
              </div>
              <div className="text-[11px] text-emerald-300/80 flex items-center gap-1 pt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  Se calculó el próximo turno disponible más cercano para cada jugador con mensaje de WhatsApp listo.
                </span>
              </div>
            </div>

            {/* Buscador rápido si hay varios turnos */}
            {result.notifications.length > 2 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  type="text"
                  placeholder="Buscar jugador o cancha..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 bg-slate-950 border-slate-800 text-xs text-white h-8"
                />
              </div>
            )}

            {/* Listado de Jugadores Afectados y sus Reagendas */}
            <div className="max-h-[50dvh] overflow-y-auto space-y-3 pr-1">
              {filteredNotifications.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-6 bg-slate-950/50 rounded-2xl border border-slate-800/80">
                  {result.notifications.length === 0
                    ? 'No había reservas agendadas en ese rango y canchas.'
                    : 'No se encontraron turnos con ese criterio de búsqueda.'}
                </div>
              ) : (
                filteredNotifications.map((notif) => {
                  const currentReschedule = activeReschedules[notif.bookingId] ?? notif.suggestedReschedule
                  const isDone = Boolean(rescheduledSuccess[notif.bookingId])
                  const doneDetails = rescheduledSuccess[notif.bookingId]
                  const isBookingLoading = Boolean(reschedulingLoading[notif.bookingId])
                  const isExpanded = Boolean(expandedMessages[notif.bookingId])

                  // Recalcular dinámicamente el mensaje y link si el usuario cambió el slot propuesto
                  const activeMessageText = buildRainRescheduleWhatsAppMessage({
                    customerName: notif.customerName,
                    clubName: 'CancharClub',
                    originalCourtName: notif.originalCourtName,
                    originalSport: notif.originalSport,
                    originalDateFormatted: notif.originalDateFormatted,
                    originalTime: notif.originalTime,
                    creditedAmount: notif.creditedAmount,
                    suggestedReschedule: currentReschedule,
                  })

                  const activeWhatsAppUrl = notif.customerPhone
                    ? buildWaMeLink(notif.customerPhone, activeMessageText)
                    : ''

                  return (
                    <div
                      key={notif.bookingId}
                      className="p-3.5 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 transition-all hover:border-slate-700 shadow-md"
                    >
                      {/* Cabecera del turno cancelado */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">{notif.customerName}</span>
                            {isDone ? (
                              <Badge className="bg-emerald-600/30 text-emerald-300 border-emerald-500/40 text-[10px] gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Reagendado
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-sky-800/80 text-sky-400 bg-sky-950/30">
                                🌧️ Suspendido
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span>{notif.customerPhone || 'Sin teléfono registrado'}</span>
                            <span>•</span>
                            <span>Turno original: {notif.originalCourtName} a las {notif.originalTime} hs</span>
                          </div>
                        </div>

                        {notif.creditedAmount > 0 && (
                          <div className="text-right shrink-0">
                            <span className="text-[10px] text-slate-400 block">Saldo a favor:</span>
                            <span className="text-xs font-bold text-emerald-400">
                              {formatARS(notif.creditedAmount)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Tarjeta de Reagenda Sugerida */}
                      {isDone && doneDetails ? (
                        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-xs text-emerald-200 flex items-center gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div>
                            <strong>Turno confirmado con éxito:</strong> {doneDetails.date} a las {doneDetails.time} hs en {doneDetails.courtName}.
                          </div>
                        </div>
                      ) : currentReschedule ? (
                        <div className="p-3 rounded-xl bg-gradient-to-r from-blue-950/40 to-slate-900 border border-blue-500/30 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-300">
                              <CalendarDays className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <span>Próximo turno disponible sugerido:</span>
                            </div>
                            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30 font-medium">
                              {currentReschedule.courtSport.replace('_', ' ')}
                            </span>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-white">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-amber-300">
                                {currentReschedule.dateFormatted}
                              </span>
                              <span>•</span>
                              <span className="font-bold text-white bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700">
                                {currentReschedule.startTime} hs a {currentReschedule.endTime} hs
                              </span>
                              <span>•</span>
                              <span className="text-slate-300">{currentReschedule.courtName}</span>
                            </div>
                          </div>

                          {/* Opciones alternativas si el jugador quiere otro día u horario */}
                          {notif.alternativeSlots && notif.alternativeSlots.length > 0 && (
                            <div className="pt-1.5 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span className="text-slate-400 text-[10px]">Otras alternativas libres:</span>
                              {notif.alternativeSlots.map((alt, idx) => {
                                const isAltSelected =
                                  currentReschedule.date === alt.date &&
                                  currentReschedule.startTime === alt.startTime &&
                                  currentReschedule.courtId === alt.courtId

                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => {
                                      setActiveReschedules(prev => ({
                                        ...prev,
                                        [notif.bookingId]: alt,
                                      }))
                                    }}
                                    className={`px-2 py-0.5 rounded-md text-[10px] transition-colors border ${
                                      isAltSelected
                                        ? 'bg-blue-600 text-white border-blue-400 font-bold'
                                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                                    }`}
                                  >
                                    {alt.dateFormatted.split(' ')[0]} {alt.startTime} hs
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/50 text-xs text-amber-200">
                          No se encontraron horarios libres en los próximos 7 días para esta disciplina. Podés coordinar una fecha personalizada con el cliente.
                        </div>
                      )}

                      {/* Botones de Acción: WhatsApp, Copiar y Confirmar Reagenda */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2">
                          {activeWhatsAppUrl ? (
                            <a
                              href={activeWhatsAppUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-xs"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>Enviar por WhatsApp</span>
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-500">Sin teléfono para WhatsApp</span>
                          )}

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyMessage(notif.bookingId, activeMessageText)}
                            className="h-8 text-xs border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 gap-1.5 px-2.5"
                          >
                            {copiedId === notif.bookingId ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            <span>{copiedId === notif.bookingId ? '¡Copiado!' : 'Copiar'}</span>
                          </Button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedMessages(prev => ({
                                ...prev,
                                [notif.bookingId]: !prev[notif.bookingId],
                              }))
                            }
                            className="text-[11px] text-slate-400 hover:text-slate-300 flex items-center gap-1 transition-colors"
                          >
                            <span>{isExpanded ? 'Ocultar mensaje' : 'Ver mensaje'}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>

                          {currentReschedule && !isDone && (
                            <Button
                              type="button"
                              size="sm"
                              disabled={isBookingLoading}
                              onClick={() => handleConfirmReschedule(notif)}
                              className="h-8 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs gap-1.5 shadow-xs"
                            >
                              {isBookingLoading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CalendarCheck2 className="w-3.5 h-3.5" />
                              )}
                              <span>Confirmar Reagenda</span>
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Vista previa desplegable del mensaje */}
                      {isExpanded && (
                        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 whitespace-pre-line leading-relaxed font-mono">
                          {activeMessageText}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-3 border-t border-slate-800">
          {!result ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={onClose} className="min-h-10 sm:min-h-9 text-slate-400 hover:text-white">
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={loading || selectedCourts.length === 0}
                onClick={handleExecute}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold gap-2 min-h-10 sm:min-h-9 px-4 shadow-lg shadow-blue-600/20"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudRain className="w-4 h-4" />}
                <span>Activar Suspensión y Calcular Reagendas</span>
              </Button>
            </>
          ) : (
            <Button
              type="button"
              onClick={handleReset}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold min-h-10"
            >
              Cerrar y Volver a la Grilla
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
