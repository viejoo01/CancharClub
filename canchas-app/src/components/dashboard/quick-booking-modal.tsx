'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { createManualBooking, registerCashPayment } from '@/actions/booking.actions'
import { getClubPriceRules } from '@/actions/club.actions'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { getArgentinaTodayIso, isSlotTimeInPast } from '@/lib/utils'

export interface QuickBookingPriceRule {
  id?: string
  courtId?: string | null
  court_id?: string | null
  dayOfWeek?: number[]
  day_of_week?: number[]
  days_of_week?: number[]
  timeFrom?: string
  time_from?: string
  timeTo?: string
  time_to?: string
  priceArs?: number
  price_ars?: number
  price_cents?: number
  deposit_pct?: number
}

function computeSlotPrice(
  courtId: string,
  date: string,
  time: string,
  rules: QuickBookingPriceRule[]
): number {
  if (!courtId) return 25000
  let dayOfWeek = new Date().getDay()
  if (date) {
    const parts = date.split('-').map(Number)
    if (parts.length === 3) dayOfWeek = new Date(parts[0], parts[1] - 1, parts[2]).getDay()
  }
  const cleanTime = (time || '19:00').substring(0, 5)

  if (rules && rules.length > 0) {
    const courtRules = rules.filter((r) => {
      const cId = r.courtId || r.court_id
      return !cId || cId === courtId
    })
    const applicableRules = courtRules.filter((r) => {
      const days = r.dayOfWeek || r.days_of_week || r.day_of_week
      return !days || days.length === 0 || days.includes(dayOfWeek)
    })
    const matchingRule = applicableRules
      .filter((r) => {
        const from = (r.timeFrom || r.time_from || '00:00').substring(0, 5)
        const to = (r.timeTo || r.time_to || '23:59').substring(0, 5)
        return cleanTime >= from && cleanTime <= to
      })
      .sort((a, b) => {
        const fromA = (a.timeFrom || a.time_from || '00:00').substring(0, 5)
        const fromB = (b.timeFrom || b.time_from || '00:00').substring(0, 5)
        return fromB.localeCompare(fromA)
      })[0]

    const chosen = matchingRule || applicableRules[0] || courtRules[0]
    if (chosen) {
      const p = chosen.priceArs || chosen.price_ars || (chosen.price_cents ? Math.round(Number(chosen.price_cents) / 100) : null)
      if (p) return p
    }
  }
  return 25000
}

interface QuickBookingModalProps {
  isOpen: boolean
  onClose: () => void
  tenantId: string
  courts: Array<{
    id: string
    name: string
    sport: string
    slot_duration: 'MIN_60' | 'MIN_90' | 'MIN_120'
  }>
  priceRules?: QuickBookingPriceRule[]
  preselectedDate?: string
  preselectedTime?: string
  preselectedCourtId?: string
  onSuccess?: () => void
}

export function QuickBookingModal({
  isOpen,
  onClose,
  tenantId,
  courts,
  priceRules,
  preselectedDate = getArgentinaTodayIso(),
  preselectedTime = '19:00',
  preselectedCourtId,
  onSuccess,
}: QuickBookingModalProps) {
  const [courtId, setCourtId] = useState(preselectedCourtId || courts[0]?.id || '')
  const [date, setDate] = useState(preselectedDate)
  const [time, setTime] = useState(preselectedTime)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [internalRules, setInternalRules] = useState<QuickBookingPriceRule[]>(priceRules || [])
  const [totalAmount, setTotalAmount] = useState(() =>
    String(
      computeSlotPrice(
        preselectedCourtId || courts[0]?.id || '',
        preselectedDate,
        preselectedTime,
        priceRules || []
      )
    )
  )
  const [depositAmount, setDepositAmount] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER' | 'NONE'>('NONE')
  const [notes, setNotes] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [loading, setLoading] = useState(false)

  // Cargar reglas reales desde el backend si no fueron inyectadas por props
  useEffect(() => {
    if (!priceRules && tenantId) {
      let isMounted = true
      getClubPriceRules(tenantId).then((rules) => {
        if (isMounted && rules && rules.length > 0) {
          setInternalRules(rules as QuickBookingPriceRule[])
          setTotalAmount((prev) => {
            const calculated = String(computeSlotPrice(courtId, date, time, rules as QuickBookingPriceRule[]))
            return prev === '25000' || prev === '12000' ? calculated : prev
          })
        }
      })
      return () => {
        isMounted = false
      }
    }
  }, [priceRules, tenantId, courtId, date, time])

  const recalculatePrice = useCallback(
    (cId: string, d: string, t: string) => {
      const p = computeSlotPrice(cId, d, t, internalRules)
      setTotalAmount(String(p))
    },
    [internalRules]
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerName.trim()) {
      toast.error('Ingresá el nombre del cliente')
      return
    }
    if (!courtId) {
      toast.error('Seleccioná una cancha')
      return
    }

    setLoading(true)
    try {
      const startsAt = `${date}T${time}:00`
      const total = Number(totalAmount) || 0
      const deposit = Number(depositAmount) || 0
      const fullNotes = isRecurring 
        ? `[ABONO SEMANAL FIJO] ${notes}`.trim()
        : notes || undefined

      // 1. Crear reserva manual en PostgreSQL
      const res = await createManualBooking({
        tenant_id: tenantId,
        court_id: courtId,
        customer_name: customerName,
        customer_phone: customerPhone || undefined,
        starts_at: startsAt,
        origin: isRecurring ? 'ADMIN_MANUAL' : 'PHONE',
        total_amount_ars: total,
        deposit_amount_ars: deposit,
        internal_notes: fullNotes,
      })

      if (!res.success) {
        toast.error(res.error || 'Error al guardar reserva')
        setLoading(false)
        return
      }

      // 2. Si se cobró seña o pago en el momento
      if (deposit > 0 && paymentMethod !== 'NONE' && res.booking_id) {
        await registerCashPayment({
          booking_id: res.booking_id,
          amount_ars: deposit,
          payment_method: paymentMethod as 'CASH' | 'TRANSFER',
          notes: 'Seña inicial en mostrador',
        })
      }

      toast.success('¡Turno registrado exitosamente!')

      // Emitir en BroadcastChannel para sincronización instantánea en grilla y portal de jugadores (0ms)
      try {
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          const bc = new BroadcastChannel('canchar_bookings')
          bc.postMessage({ type: 'BOOKING_CONFIRMED', court_id: courtId, starts_at: startsAt })
          bc.close()
        }
      } catch {}

      onClose()
      onSuccess?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Carga Rápida de Turno</DialogTitle>
          <DialogDescription>
            Registrá una reserva telefónica o presencial en mostrador.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Cliente */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="customerName">Nombre Jugador *</Label>
              <Input
                id="customerName"
                placeholder="Ej. Juan Pérez"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-11"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customerPhone">Teléfono (WhatsApp)</Label>
              <Input
                id="customerPhone"
                placeholder="Ej. 3814123456"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="h-11"
                type="tel"
              />
            </div>
          </div>

          {/* Cancha y Horario */}
          <div className="space-y-1.5">
            <Label htmlFor="court">Cancha *</Label>
            <select
              id="court"
              value={courtId}
              onChange={(e) => {
                const newCourt = e.target.value
                setCourtId(newCourt)
                recalculatePrice(newCourt, date, time)
              }}
              className="flex h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            >
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.sport})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Fecha</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => {
                  const newDate = e.target.value
                  setDate(newDate)
                  recalculatePrice(courtId, newDate, time)
                }}
                className="h-11"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="time">Hora de Inicio</Label>
              <Input
                id="time"
                type="time"
                step="1800"
                value={time}
                onChange={(e) => {
                  const newTime = e.target.value
                  setTime(newTime)
                  recalculatePrice(courtId, date, newTime)
                }}
                className="h-11"
                required
              />
              {isSlotTimeInPast(date, time) && (
                <p className="text-[11px] text-amber-400 font-semibold mt-1">
                  ℹ️ Turno pasado (registro histórico / caja)
                </p>
              )}
            </div>
          </div>

          {/* Tarifas y Cobro */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="totalAmount">Precio Total ($ ARS)</Label>
              <Input
                id="totalAmount"
                type="number"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                className="h-11"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="depositAmount">Seña Cobrada Ahora ($)</Label>
              <Input
                id="depositAmount"
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="h-11"
              />
            </div>
          </div>

          {Number(depositAmount) > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="paymentMethod">Medio de Pago de la Seña</Label>
              <select
                id="paymentMethod"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as 'CASH' | 'TRANSFER')}
                className="flex h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="CASH">Efectivo en mostrador</option>
                <option value="TRANSFER">Transferencia bancaria / alias</option>
              </select>
            </div>
          )}

          {/* Opción de Turno Fijo / Abono Semanal */}
          <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-800/40 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-purple-300">
                Turno Fijo / Abono Semanal
              </div>
              <div className="text-[11px] text-slate-400">
                Reserva fija recurrente para este jugador todos los {date} a las {time} hs.
              </div>
            </div>
            <input
              type="checkbox"
              id="isRecurring"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-purple-500"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas Internas</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-3 flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={loading}
              className="w-full sm:w-auto h-11"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Guardando...
                </>
              ) : (
                'Confirmar Turno'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
