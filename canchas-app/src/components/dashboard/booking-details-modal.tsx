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
import { 
  registerCashPayment, 
  cancelBooking, 
  markBookingNoShow, 
  getPlayerReputation,
  confirmBookingDeposit 
} from '@/actions/booking.actions'
import { getPlayerMatchReminderText, createWhatsAppShareUrl } from '@/lib/notifications/templates'
import { formatARS, formatTime, buildWhatsAppLink, cleanNoteForDisplay } from '@/lib/utils'
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
  Printer,
  CheckCircle2,
  Clock
} from 'lucide-react'
import { ThermalReceiptModal } from '@/components/shared/thermal-receipt'
import type { BookingStatus } from '@/types/database'
import { siteConfig } from '@/config/site'
import { useTenantId } from '@/hooks/use-tenant-id'
import { createClient } from '@/lib/supabase/client'

interface BookingDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  booking: {
    id: string
    customer_name: string
    customer_phone?: string | null
    starts_at: string
    ends_at: string
    status: BookingStatus | string
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
  const tenantId = useTenantId()
  const [clubName, setClubName] = useState('Club')
  const [clubSlug, setClubSlug] = useState('')

  useEffect(() => {
    if (!tenantId) return
    const supabase = createClient()
    supabase
      .from('tenants')
      .select('name, slug')
      .eq('id', tenantId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.name) setClubName(data.name)
        if (data?.slug) setClubSlug(data.slug)
      })
  }, [tenantId])

  const [localStatus, setLocalStatus] = useState<string | null>(null)
  const currentStatus = localStatus || booking?.status || 'confirmed'

  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'CASH' | 'TRANSFER' | 'MERCADOPAGO'>('CASH')
  const [loadingPay, setLoadingPay] = useState(false)
  const [loadingCancel, setLoadingCancel] = useState(false)
  const [loadingNoShow, setLoadingNoShow] = useState(false)
  const [loadingConfirm, setLoadingConfirm] = useState(false)
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
        try {
          if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            const bc = new BroadcastChannel('canchar_bookings')
            bc.postMessage({ type: 'BOOKING_CONFIRMED', booking_id: booking.id })
            bc.close()
          }
        } catch {}
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

  const handleConfirmDeposit = async () => {
    setLoadingConfirm(true)
    try {
      const res = await confirmBookingDeposit(booking.id)
      if (res.success) {
        toast.success('¡Turno y seña confirmados exitosamente!', {
          description: 'El turno quedó validado en el sistema.',
        })
        setLocalStatus('CONFIRMED')
        try {
          if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            const bc = new BroadcastChannel('canchar_bookings')
            bc.postMessage({ type: 'BOOKING_CONFIRMED', booking_id: booking.id, status: 'confirmed' })
            bc.close()
          }
        } catch {}
        onSuccess?.()
      } else {
        toast.error(res.error || 'Error al confirmar el turno')
      }
    } catch {
      toast.error('Error al procesar la confirmación')
    } finally {
      setLoadingConfirm(false)
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
        try {
          if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            const bc = new BroadcastChannel('canchar_bookings')
            bc.postMessage({ type: 'BOOKING_CONFIRMED', booking_id: booking.id, status: 'cancelled' })
            bc.close()
          }
        } catch {}
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
    if (!confirm('¿Confirmás marcar este turno como Inasistencia (No Asistió)? Impactará en la reputación del cliente.')) return

    setLoadingNoShow(true)
    try {
      const res = await markBookingNoShow(booking.id)
      if (res.success) {
        toast.error('Turno marcado como Inasistencia (No Asistió)', {
          description: 'Se registró la penalización en el historial del cliente.'
        })
        setLocalStatus('NO_SHOW')
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

  // Recordatorio 3h antes
  const reminderText = getPlayerMatchReminderText({
    playerName: booking.customer_name,
    clubName: clubName || 'Club',
    courtName: courtDisplayName,
    time: booking.starts_at ? `${formatTime(booking.starts_at)} hs` : 'el horario acordado',
    hoursBefore: 3,
    link: clubSlug ? `${siteConfig.url}/club/${clubSlug}` : `${siteConfig.url}`,
  })
  const reminderWaUrl = booking.customer_phone
    ? createWhatsAppShareUrl(booking.customer_phone, reminderText)
    : null

  const hasDepositAmount = (booking.deposit_amount_ars || 0) > 0
  const hasPaidAny = (booking.total_paid || 0) > 0
  const isFullyPaid = (booking.balance_due || 0) === 0 && (booking.total_amount_ars || 0) > 0

  const isTransfer = Boolean(
    booking.internal_notes?.toUpperCase().includes('TRANSFER') ||
    booking.internal_notes?.toUpperCase().includes('BANCO') ||
    booking.internal_notes?.toUpperCase().includes('ALIAS') ||
    currentStatus.toUpperCase() === 'PENDING_DEPOSIT'
  )
  const isAlreadyVerified = Boolean(
    booking.internal_notes?.includes('Seña verificada y aprobada') ||
    booking.internal_notes?.includes('verificada y aprobada')
  )

  const isPendingDeposit =
    (currentStatus.toUpperCase() === 'PENDING_DEPOSIT' ||
      currentStatus.toUpperCase() === 'PENDING' ||
      (isTransfer && !isAlreadyVerified)) &&
    hasDepositAmount

  const getStatusBadge = (status: string) => {
    const s = String(status || '').toUpperCase()
    if (isPendingDeposit) {
      return (
        <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold px-2.5 py-0.5 tracking-wide text-xs">
          SEÑA POR VALIDAR
        </Badge>
      )
    }
    if (isFullyPaid || s === 'CONFIRMED_CASH' || s === 'FULLY_PAID') {
      return (
        <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold px-2.5 py-0.5 tracking-wide text-xs">
          PAGADO TOTAL
        </Badge>
      )
    }
    if (s === 'CONFIRMED' || s === 'DEPOSIT_PAID') {
      if (!hasDepositAmount && !hasPaidAny) {
        return (
          <Badge className="bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold px-2.5 py-0.5 tracking-wide text-xs">
            CONFIRMADO (SIN SEÑA)
          </Badge>
        )
      }
      return (
        <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold px-2.5 py-0.5 tracking-wide text-xs">
          CONFIRMADO
        </Badge>
      )
    }
    if (s === 'NO_SHOW') {
      return (
        <Badge className="bg-red-500/15 text-red-400 border border-red-500/30 font-semibold px-2.5 py-0.5 tracking-wide text-xs">
          NO ASISTIÓ
        </Badge>
      )
    }
    if (s === 'CANCELLED') {
      return (
        <Badge className="bg-slate-500/15 text-slate-400 border border-slate-500/30 font-semibold px-2.5 py-0.5 tracking-wide text-xs">
          CANCELADO
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="font-semibold px-2.5 py-0.5 tracking-wide text-xs">
        {status}
      </Badge>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[540px] max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-4">
            <DialogTitle className="text-xl font-bold text-slate-100">{courtDisplayName}</DialogTitle>
            {getStatusBadge(currentStatus)}
          </div>
          <DialogDescription className="text-slate-400 text-sm">
            {booking.starts_at && formatTime(booking.starts_at)} - {booking.ends_at && formatTime(booking.ends_at)} hs
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Cliente Info & Reputación */}
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
                          <span>{reputation.noShowCount} {reputation.noShowCount === 1 ? 'inasistencia' : 'inasistencias'}</span>
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
              <div className="flex items-center gap-1.5 flex-wrap">
                {waUrl && (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 font-medium text-xs transition-colors min-h-9"
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
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600/20 text-sky-300 hover:bg-sky-600/30 border border-sky-500/30 font-medium text-xs transition-colors min-h-9"
                    title="Enviar recordatorio de 3 horas antes"
                  >
                    <BellRing className="w-3.5 h-3.5" />
                    <span>3h</span>
                  </a>
                )}
              </div>
            </div>

            {/* Alerta de Alto Riesgo de Inasistencia */}
            {reputation?.isHighRisk && (
              <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 flex items-center gap-2 text-xs text-red-300">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <span>
                  <strong>Atención:</strong> Este jugador posee historial reiterado de inasistencias ({reputation.noShowCount} {reputation.noShowCount === 1 ? 'inasistencia' : 'inasistencias'}). Exigir seña del 100%.
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

          {/* Acción 1: Estado de Seña / Cobro del Turno */}
          {isPendingDeposit ? (
            <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  Seña Pendiente de Validación Bancaria
                </span>
                <span className="text-amber-400 font-mono font-bold text-sm">
                  {formatARS(booking.deposit_amount_ars)}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                El jugador registró la reserva por transferencia. Verificá el ingreso en tu cuenta bancaria o billetera y confirmá el turno:
              </p>
              <Button
                type="button"
                onClick={handleConfirmDeposit}
                disabled={loadingConfirm}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2 h-11 shadow-lg shadow-emerald-950/40 text-sm active:scale-[0.99] transition-transform cursor-pointer"
              >
                {loadingConfirm ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Confirmar Seña Recibida / Aprobar Turno</span>
              </Button>
            </div>
          ) : isFullyPaid ? (
            <div className="p-3 rounded-xl bg-emerald-950/25 border border-emerald-500/30 space-y-1">
              <div className="flex items-center justify-between text-xs text-emerald-300">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Turno Pagado Totalmente ({formatARS(booking.total_paid || booking.total_amount_ars)})</span>
                </div>
                <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-[10px] font-semibold">
                  SALDADO
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400 pl-6">
                No hay saldo pendiente. El turno se encuentra completamente abonado.
              </p>
            </div>
          ) : (hasDepositAmount || hasPaidAny) ? (
            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/25 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-emerald-300">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Turno Confirmado — Seña Verificada ({formatARS(booking.total_paid || booking.deposit_amount_ars)})</span>
                </div>
                <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-[10px] font-semibold">
                  SEÑA PAGADA
                </Badge>
              </div>
              {isTransfer && (
                <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20 text-[11px] text-slate-400">
                  <span className="truncate max-w-70">
                    {booking.internal_notes?.includes('Seña verificada')
                      ? '✓ Verificación registrada en historial'
                      : 'Transferencia bancaria registrada'}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleConfirmDeposit}
                    disabled={loadingConfirm}
                    className="h-6 px-2 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40"
                  >
                    Volver a validar
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-700/60 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <div className="flex items-center gap-2 font-semibold text-slate-200">
                  <DollarSign className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Turno Registrado Sin Seña Previa</span>
                </div>
                <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-semibold">
                  COBRO EN CANCHA
                </Badge>
              </div>
              <p className="text-xs text-slate-400">
                No se registró pago de seña por adelantado. Cobrar el total de <strong className="text-slate-200">{formatARS(booking.total_amount_ars)}</strong> cuando los jugadores concurran al club.
              </p>
            </div>
          )}

          {/* Acción 2: Formulario de Cobro rápido si tiene saldo pendiente */}
          {booking.balance_due > 0 && (
            <div className="pt-0.5">
              {!showPayForm ? (
                <Button
                  onClick={() => {
                    setShowPayForm(true)
                    setPayAmount(booking.balance_due.toString())
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-2 h-11 text-sm shadow-md shadow-emerald-950/30 cursor-pointer"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>
                    {hasPaidAny || hasDepositAmount
                      ? `Cobrar Saldo (${formatARS(booking.balance_due)})`
                      : `Cobrar Total en Mostrador (${formatARS(booking.balance_due)})`}
                  </span>
                </Button>
              ) : (
                <form onSubmit={handleRegisterPayment} className="p-3.5 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-3">
                  <div className="text-xs font-bold text-emerald-400">Registrar Cobro de Saldo en Caja</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="payAmount" className="text-xs text-slate-300">Monto ($)</Label>
                      <Input
                        id="payAmount"
                        type="number"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        className="h-10 mt-1"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="payMethod" className="text-xs text-slate-300">Medio</Label>
                      <select
                        id="payMethod"
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value as 'CASH' | 'TRANSFER' | 'MERCADOPAGO')}
                        className="flex h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 mt-1"
                      >
                        <option value="CASH">Efectivo en Caja</option>
                        <option value="TRANSFER">Transferencia / Alias</option>
                        <option value="MERCADOPAGO">Mercado Pago / QR</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowPayForm(false)}
                      className="h-9 text-xs"
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={loadingPay}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-9 text-xs"
                    >
                      {loadingPay ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirmar Cobro'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Nota Interna con traducción y limpieza a español */}
          {booking.internal_notes && cleanNoteForDisplay(booking.internal_notes) && (
            <div className="text-xs text-slate-400 bg-slate-900/60 p-3 rounded-xl border border-slate-800 flex items-start gap-1.5 leading-relaxed">
              <span className="font-semibold text-slate-300 shrink-0">Nota:</span>
              <span>{cleanNoteForDisplay(booking.internal_notes)}</span>
            </div>
          )}
        </div>

        {/* Footer con botones alineados prolijamente */}
        <DialogFooter className="w-full border-t border-slate-800/80 pt-3 mt-2 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
            {/* Botón Imprimir Ticket Térmico */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsReceiptOpen(true)}
              className="h-10 px-3.5 gap-1.5 border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800 hover:text-white text-xs font-medium rounded-lg"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ticket</span>
            </Button>

            {/* Botón Marcar No Asistió */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingNoShow || currentStatus === 'NO_SHOW'}
              onClick={handleMarkNoShow}
              className="h-10 px-3.5 gap-1.5 border-amber-900/40 bg-amber-950/20 text-amber-300 hover:bg-amber-950/40 text-xs font-medium rounded-lg"
            >
              {loadingNoShow ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
              <span>No Asistió</span>
            </Button>

            {/* Botón Cancelar Reserva */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingCancel}
              onClick={handleCancelBooking}
              className="h-10 px-3.5 gap-1.5 border-red-900/40 bg-red-950/20 text-red-400 hover:bg-red-950/50 hover:text-red-300 text-xs font-medium rounded-lg"
            >
              {loadingCancel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              <span>Cancelar</span>
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-10 px-4 text-slate-400 hover:text-slate-100 hover:bg-slate-800 text-xs font-medium rounded-lg w-full sm:w-auto"
          >
            Cerrar
          </Button>
        </DialogFooter>

        {/* Modal de Impresión Térmica */}
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
