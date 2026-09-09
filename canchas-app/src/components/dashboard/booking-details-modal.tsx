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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { registerCashPayment, cancelBooking, markBookingNoShow, getPlayerReputation } from '@/actions/booking.actions'
import { getPlayerMatchReminderText, createWhatsAppShareUrl } from '@/lib/notifications/templates'
import { formatARS, formatTime, buildWhatsAppLink } from '@/lib/utils'
import { toast } from 'sonner'
import { 
  MessageCircle, 
  DollarSign, 
  XCircle, 
  Loader2, 
  UserX, 
  ShieldAlert, 
  BellRing,
  Star,
  Printer
} from 'lucide-react'
import { ThermalReceiptModal } from '@/components/shared/thermal-receipt'
import type { BookingStatus } from '@/types/database'
import { siteConfig } from '@/config/site'

interface BookingDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  booking: {
    id: string
    customer_name: string
    customer_phone?: string | null
    starts_at: string
    ends_at: string
    status: BookingStatus
    total_amount_ars: number
    deposit_amount_ars: number
    total_paid: number
    balance_due: number
    internal_notes?: string | null
    courts?: { name?: string; sport?: string } | Array<{ name?: string; sport?: string }> | null
    booking_payments?: Array<{ amount_ars: number; payment_method: string; created_at: string }>
  } | null
  onSuccess?: () => void
}

export function BookingDetailsModal({
  isOpen,
  onClose,
  booking,
  onSuccess,
}: BookingDetailsModalProps) {
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'CASH' | 'TRANSFER'>('CASH')
  const [loadingPay, setLoadingPay] = useState(false)
  const [loadingCancel, setLoadingCancel] = useState(false)
  const [loadingNoShow, setLoadingNoShow] = useState(false)
  const [showPayForm, setShowPayForm] = useState(false)
  const [isReceiptOpen, setIsReceiptOpen] = useState(false)
  const [reputation, setReputation] = useState<{
    reputationScore: number
    noShowCount: number
    isHighRisk: boolean
  } | null>(null)

  useEffect(() => {
    let isMounted = true
    const fetchRep = async () => {
      if (booking?.customer_phone) {
        const rep = await getPlayerReputation(booking.customer_phone)
        if (isMounted) setReputation(rep)
      } else {
        if (isMounted) setReputation(null)
      }
    }
    fetchRep()
    return () => {
      isMounted = false
    }
  }, [booking?.customer_phone])

  if (!booking) return null

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = Number(payAmount) || booking.balance_due
    if (amount <= 0) {
      toast.error('Ingresá un monto válido a cobrar')
      return
    }

    setLoadingPay(true)
    try {
      const res = await registerCashPayment({
        booking_id: booking.id,
        amount_ars: amount,
        payment_method: payMethod,
        notes: 'Cobro en mostrador',
      })

      if (!res.success) {
        toast.error(res.error || 'Error al registrar cobro')
      } else {
        toast.success(`¡Cobro de ${formatARS(amount)} registrado!`)
        setShowPayForm(false)
        setPayAmount('')
        onSuccess?.()
        onClose()
      }
    } catch {
      toast.error('Error al procesar el pago')
    } finally {
      setLoadingPay(false)
    }
  }

  const handleCancelBooking = async () => {
    if (!confirm('¿Estás seguro de que querés cancelar esta reserva?')) return

    setLoadingCancel(true)
    try {
      const res = await cancelBooking({
        booking_id: booking.id,
        cancelled_by: 'CLUB',
        reason: 'Cancelado desde panel de administración',
      })

      if (!res.success) {
        toast.error(res.error || 'Error al cancelar')
      } else {
        toast.success('Reserva cancelada correctamente')
        onSuccess?.()
        onClose()
      }
    } catch {
      toast.error('Error de servidor')
    } finally {
      setLoadingCancel(false)
    }
  }

  const handleMarkNoShow = async () => {
    if (!confirm('¿Confirmás marcar este turno como NO-SHOW (Inasistencia del jugador)? Impactará en su reputación.')) return

    setLoadingNoShow(true)
    try {
      const res = await markBookingNoShow(booking.id)
      if (res.success) {
        toast.error('Turno marcado como NO-SHOW (Inasistencia)', {
          description: 'Se registró la penalización en el historial del cliente.'
        })
        onSuccess?.()
        onClose()
      } else {
        toast.error(res.error || 'Error al marcar inasistencia')
      }
    } catch {
      toast.error('Error al actualizar turno')
    } finally {
      setLoadingNoShow(false)
    }
  }

  const courtDisplayName =
    (Array.isArray(booking.courts) ? booking.courts[0]?.name : booking.courts?.name) || 'Cancha'

  const waMessage = `Hola ${booking.customer_name}, te escribimos de ${courtDisplayName} respecto a tu turno de las ${booking.starts_at ? formatTime(booking.starts_at) : ''} hs.`
  const waUrl = booking.customer_phone
    ? buildWhatsAppLink(booking.customer_phone, waMessage)
    : null

  // Recordatorio 3h antes (Mejora 1B)
  const reminderText = getPlayerMatchReminderText({
    playerName: booking.customer_name,
    clubName: 'Club Pádel Central',
    courtName: courtDisplayName,
    time: booking.starts_at ? `${formatTime(booking.starts_at)} hs` : 'el horario acordado',
    hoursBefore: 3,
    link: `${siteConfig.url}/club/padel-central`,
  })
  const reminderWaUrl = booking.customer_phone
    ? createWhatsAppShareUrl(booking.customer_phone, reminderText)
    : null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div className="flex items-center justify-between pr-4">
            <DialogTitle>{courtDisplayName}</DialogTitle>
            <Badge 
              variant={booking.status === 'NO_SHOW' ? 'destructive' : 'outline'}
              className={booking.status === 'NO_SHOW' ? 'bg-red-950 text-red-400 border-red-800' : ''}
            >
              {booking.status === 'NO_SHOW' ? 'NO-SHOW (Inasistencia)' : booking.status}
            </Badge>
          </div>
          <DialogDescription>
            {booking.starts_at && formatTime(booking.starts_at)} - {booking.ends_at && formatTime(booking.ends_at)} hs
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Cliente Info & Reputación (Mejora 2C) */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-slate-100 text-base flex items-center gap-2">
                  <span>{booking.customer_name}</span>
                  {reputation && (
                    <Badge 
                      className={`text-[10px] px-2 py-0.5 gap-1 ${
                        reputation.isHighRisk 
                          ? 'bg-red-500/20 text-red-400 border-red-500/40' 
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      {reputation.isHighRisk ? (
                        <>
                          <ShieldAlert className="w-3 h-3 text-red-400" />
                          <span>{reputation.noShowCount} No-Shows</span>
                        </>
                      ) : (
                        <>
                          <Star className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                          <span>Reputación: {reputation.reputationScore}%</span>
                        </>
                      )}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-slate-400 mt-0.5 font-mono">
                  {booking.customer_phone || 'Sin teléfono'}
                </div>
              </div>

              {/* Botones de Comunicación */}
              <div className="flex items-center gap-1.5">
                {waUrl && (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 font-medium text-xs transition-colors"
                    title="Abrir chat en WhatsApp"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Chat</span>
                  </a>
                )}
                {reminderWaUrl && (
                  <a
                    href={reminderWaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600/20 text-sky-300 hover:bg-sky-600/30 border border-sky-500/30 font-medium text-xs transition-colors"
                    title="Enviar recordatorio automático de 3 horas antes"
                  >
                    <BellRing className="w-3.5 h-3.5" />
                    <span>Recordatorio 3h</span>
                  </a>
                )}
              </div>
            </div>

            {/* Alerta de Alto Riesgo de Inasistencia */}
            {reputation?.isHighRisk && (
              <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 flex items-center gap-2 text-xs text-red-300">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <span>
                  <strong>Atención:</strong> Este jugador posee historial reiterado de inasistencias ({reputation.noShowCount} No-Shows). Exigir seña del 100%.
                </span>
              </div>
            )}
          </div>

          {/* Estado de Cobro */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-[11px] text-slate-400 font-medium uppercase">Total</div>
              <div className="text-sm font-bold text-slate-100 mt-0.5">
                {formatARS(booking.total_amount_ars)}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-[11px] text-emerald-400 font-medium uppercase">Abonado</div>
              <div className="text-sm font-bold text-emerald-400 mt-0.5">
                {formatARS(booking.total_paid)}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-[11px] text-amber-400 font-medium uppercase">Resta Pagar</div>
              <div className="text-sm font-bold text-amber-400 mt-0.5">
                {formatARS(booking.balance_due)}
              </div>
            </div>
          </div>

          {/* Formulario de Cobro rápido si tiene saldo pendiente */}
          {booking.balance_due > 0 && (
            <div className="pt-1">
              {!showPayForm ? (
                <Button
                  onClick={() => {
                    setShowPayForm(true)
                    setPayAmount(booking.balance_due.toString())
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-2"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Cobrar Saldo ({formatARS(booking.balance_due)})</span>
                </Button>
              ) : (
                <form onSubmit={handleRegisterPayment} className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-3">
                  <div className="text-xs font-bold text-emerald-400">Registrar Cobro en Caja</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="payAmount">Monto ($)</Label>
                      <Input
                        id="payAmount"
                        type="number"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="payMethod">Medio</Label>
                      <select
                        id="payMethod"
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value as 'CASH' | 'TRANSFER')}
                        className="flex h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                      >
                        <option value="CASH">Efectivo</option>
                        <option value="TRANSFER">Transferencia</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowPayForm(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={loadingPay}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                    >
                      {loadingPay ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirmar Cobro'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {booking.internal_notes && (
            <div className="text-xs text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span className="font-semibold text-slate-300">Nota:</span> {booking.internal_notes}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Botón Marcar No-Show (Mejora 2C) */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingNoShow || booking.status === 'NO_SHOW'}
              onClick={handleMarkNoShow}
              className="gap-1.5 border-red-900/50 text-red-400 hover:bg-red-950/40 text-xs"
            >
              {loadingNoShow ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
              <span>Marcar No-Show</span>
            </Button>

            {/* Botón Imprimir Ticket Térmico (Mejora 1C) */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsReceiptOpen(true)}
              className="gap-1.5 border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ticket Térmico</span>
            </Button>

            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={loadingCancel}
              onClick={handleCancelBooking}
              className="gap-1.5 text-xs"
            >
              {loadingCancel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              <span>Cancelar</span>
            </Button>
          </div>

          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>

        {/* Modal de Impresión Térmica (Mejora 1C) */}
        {isReceiptOpen && (
          <ThermalReceiptModal
            isOpen={isReceiptOpen}
            onClose={() => setIsReceiptOpen(false)}
            type="BOOKING"
            bookingData={{
              clubName: siteConfig.name,
              courtName: (Array.isArray(booking.courts) ? booking.courts[0]?.name : booking.courts?.name) || 'Cancha',
              sport: (Array.isArray(booking.courts) ? booking.courts[0]?.sport : booking.courts?.sport) || 'PADEL',
              date: new Date(booking.starts_at).toLocaleDateString('es-AR'),
              time: formatTime(booking.starts_at),
              customerName: booking.customer_name,
              customerPhone: booking.customer_phone,
              totalAmount: booking.total_amount_ars,
              depositPaid: booking.total_paid || booking.deposit_amount_ars,
              balanceDue: booking.balance_due,
              bookingId: booking.id,
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

