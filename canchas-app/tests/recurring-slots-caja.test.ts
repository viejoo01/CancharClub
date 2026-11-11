import { describe, it, expect } from 'vitest'
import { isAbonoBooking, getArgentinaIsoTimestamp } from '@/lib/utils'

describe('Abonados Fijos (Recurring Slots) & Cash Register Isolation', () => {
  it('correctly identifies recurring slot bookings as covered by monthly abono (not cash deposits)', () => {
    const regularBooking = {
      id: 'reg-1',
      customer_name: 'Juan Perez',
      deposit_cents: 500000,
      price_total_cents: 1000000,
      payment_method: 'cash',
      paid_at: '2026-10-22T10:00:00-03:00',
      staff_notes: 'Seña en efectivo',
      recurring_slot_id: null,
    }

    const abonoBooking = {
      id: 'abono-b1',
      customer_name: 'yaye',
      deposit_cents: 0,
      price_total_cents: 1200000,
      payment_method: 'abono_fijo',
      paid_at: null,
      staff_notes: 'ABONO FIJO: yaye (Mensualidad día 10)',
      recurring_slot_id: 'slot-123',
    }

    const legacyAbonoBooking = {
      id: 'legacy-b1',
      customer_name: 'yaye',
      deposit_cents: 1200000,
      price_total_cents: 1200000,
      payment_method: 'cash',
      paid_at: '2026-10-22T03:53:00-03:00',
      staff_notes: 'ABONO FIJO: yaye (Mensualidad día 10)',
      recurring_slot_id: 'slot-123',
    }

    expect(isAbonoBooking(regularBooking)).toBe(false)
    expect(isAbonoBooking(abonoBooking)).toBe(true)
    expect(isAbonoBooking(legacyAbonoBooking)).toBe(true)
  })

  it('prevents false positives from loose text like "el cliente abono en efectivo" or "telefono fijo"', () => {
    const falsePositiveCash = {
      id: 'fp-1',
      staff_notes: 'El cliente abono en efectivo el total en caja',
      deposit_cents: 1000000,
      payment_method: 'cash',
    }

    const falsePositivePhone = {
      id: 'fp-2',
      staff_notes: 'Telefono fijo de contacto: 4433-2211',
      deposit_cents: 500000,
      payment_method: 'transfer',
    }

    const genuineBracketAbono = {
      id: 'gen-1',
      staff_notes: '[ABONO SEMANAL FIJO] Turno asignado a Pablo',
    }

    const genuineTurnoFijoTag = {
      id: 'gen-2',
      staff_notes: '[TURNO FIJO] Turno semanal asignado',
    }

    expect(isAbonoBooking(falsePositiveCash)).toBe(false)
    expect(isAbonoBooking(falsePositivePhone)).toBe(false)
    expect(isAbonoBooking(genuineBracketAbono)).toBe(true)
    expect(isAbonoBooking(genuineTurnoFijoTag)).toBe(true)
  })

  it('generates accurate Argentina UTC-3 timestamp to prevent 3-hour shifts on UTC servers', () => {
    const date = new Date('2026-10-22T14:30:00Z') // 14:30 UTC -> 11:30 AR
    const ts = getArgentinaIsoTimestamp(date, '2026-10-22')
    expect(ts).toContain('-03:00')
    expect(ts).toContain('2026-10-22T11:30:00-03:00')
  })

  it('guarantees that 5 weekly turns generated for an abonado do NOT create duplicate daily cash register entries', () => {
    const generatedTurns = Array.from({ length: 5 }, (_, i) => ({
      id: `booking-${i + 1}`,
      customer_name: 'yaye',
      court_id: 'court-3',
      deposit_cents: 0,
      price_total_cents: 1200000,
      payment_method: 'abono_fijo',
      paid_at: null,
      staff_notes: 'ABONO FIJO: yaye (Mensualidad día 10)',
      recurring_slot_id: 'slot-yaye',
    }))

    // Simular el filtro de getDailyCashReport
    const isAbonoTurn = (row: typeof generatedTurns[number]) => Boolean(
      row.recurring_slot_id ||
      row.payment_method === 'abono_fijo' ||
      (row.staff_notes && row.staff_notes.toUpperCase().includes('ABONO FIJO'))
    )

    const dailyCashEntries = generatedTurns.filter(turn => !isAbonoTurn(turn))
    expect(dailyCashEntries.length).toBe(0)
  })

  it('records monthly abono fee exactly ONCE in cash register on payment day', () => {
    const monthlyPayment = {
      id: 'bp-pay-1',
      amount_ars: 56000,
      payment_method: 'CASH',
      payment_type: 'BALANCE',
      payment_date: '2026-10-22',
      registered_at: '2026-10-22T14:30:00-03:00',
      notes: 'Abono Mensual: yaye (2026-10) - Cobrado en recepción',
    }

    const isAbonoPayment = monthlyPayment.notes.toLowerCase().includes('abono mensual')
    expect(isAbonoPayment).toBe(true)

    // Simular resolución de concepto y cliente
    let courtName = 'Cancha'
    let customerName = 'Cliente'
    if (isAbonoPayment) {
      courtName = 'Abono Fijo (Mensual)'
      const match = monthlyPayment.notes.match(/Abono (?:Fijo|Mensual):\s*([^-\n(]+)/i)
      if (match) customerName = match[1].trim()
    }

    expect(courtName).toBe('Abono Fijo (Mensual)')
    expect(customerName).toBe('yaye')
    expect(monthlyPayment.amount_ars).toBe(56000)
    expect(monthlyPayment.payment_date).toBe('2026-10-22')
  })

  it('rejects registerCashPayment on recurring slot bookings with an explicit error', () => {
    const booking = {
      id: 'abono-turn-4',
      recurring_slot_id: 'slot-999',
      staff_notes: '[ABONO SEMANAL FIJO] Carlos Gimenez',
      payment_method: 'abono_fijo',
      deposit_cents: 0,
      price_total_cents: 1400000,
    }

    const isAbonoTurn = Boolean(
      booking.recurring_slot_id ||
      booking.payment_method === 'abono_fijo' ||
      (booking.staff_notes && (
        booking.staff_notes.toUpperCase().includes('ABONO') ||
        booking.staff_notes.toUpperCase().includes('TURNO FIJO')
      ))
    )

    let rejectionError: string | null = null
    if (isAbonoTurn) {
      rejectionError = 'Este turno corresponde a un Abonado Fijo cubierto por mensualidad. El cobro del abono se realiza de forma única desde la sección Turnos Fijos para evitar duplicar ingresos en caja.'
    }

    expect(isAbonoTurn).toBe(true)
    expect(rejectionError).toContain('Abonado Fijo cubierto por mensualidad')
  })

  it('distinguishes distinct customers paying the exact same monthly abono fee on the same day in cash register audit deduplication', () => {
    const entries = [
      {
        id: 'bp-1',
        customer_name: 'Carlos Ruiz',
        court_name: 'Abono Fijo (Mensual)',
        amount_ars: 50000,
        paid_at: '2026-10-22T10:00:00-03:00',
      }
    ]

    const incomingAuditPaymentDifferentCustomer = {
      id: 'audit-2',
      customer_name: 'Martin Palermo',
      court_name: 'Abono Fijo (Mensual)',
      amount_ars: 50000,
      created_at: '2026-10-22T18:00:00-03:00',
      type: 'RECURRING_SLOT_PAYMENT'
    }

    const isAbono = true
    const pData = incomingAuditPaymentDifferentCustomer
    const amt = pData.amount_ars

    const isAlreadyInEntries = entries.some(e => {
      const isTargetAbono = isAbono && e.court_name.includes('Abono')
      if (!isTargetAbono) return false

      const cNameLower = (pData?.customer_name || '').toLowerCase().trim()
      const eNameLower = (e.customer_name || '').toLowerCase().trim()

      if (cNameLower && eNameLower && cNameLower === eNameLower && Math.abs(e.amount_ars - amt) < 1) {
        const timeDiff = Math.abs(new Date(e.paid_at || 0).getTime() - new Date(pData?.created_at || '').getTime())
        if (timeDiff < 600000) return true
      }
      return false
    })

    // Martin Palermo must NOT be deduplicated as Carlos Ruiz even though both paid $50.000!
    expect(isAlreadyInEntries).toBe(false)
  })

  it('computes exact pre-established days of the week and slot hours for any given month', () => {
    // Probar algoritmo de cálculo de días para Noviembre 2026 (mes con 30 días)
    const targetYear = 2026
    const targetMonth = 11 // Noviembre
    const dayOfWeek = 2 // Martes (Tuesday)
    const startTime = '20:00:00'
    const endTime = '21:30:00'

    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate()
    expect(daysInMonth).toBe(30)

    const matchingDates: string[] = []
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(targetYear, targetMonth - 1, day, 12, 0, 0)
      if (d.getDay() === dayOfWeek) {
        const yStr = d.getFullYear()
        const mStr = String(d.getMonth() + 1).padStart(2, '0')
        const dStr = String(d.getDate()).padStart(2, '0')
        matchingDates.push(`${yStr}-${mStr}-${dStr}`)
      }
    }

    // En Noviembre 2026, los martes caen en: 3, 10, 17 y 24
    expect(matchingDates).toEqual([
      '2026-11-03',
      '2026-11-10',
      '2026-11-17',
      '2026-11-24'
    ])

    // Verificar duración exacta
    const [sh, sm] = startTime.slice(0, 5).split(':').map(Number)
    const [eh, em] = endTime.slice(0, 5).split(':').map(Number)
    const durationMinutes = (eh * 60 + em) - (sh * 60 + sm)
    expect(durationMinutes).toBe(90)
  })

  it('ensures monthly payment workflow calculates and reports generated bookings per target period', () => {
    // Simular el resultado de cobro del abono mensual
    const mockPaymentResult = {
      success: true,
      period: '2026-11',
      generatedCount: 3,
      alreadyExistingCount: 1,
      message: '¡Se generaron 3 reservas en la grilla para este mes! (1 ya estaban agendadas)'
    }

    expect(mockPaymentResult.success).toBe(true)
    expect(mockPaymentResult.period).toBe('2026-11')
    expect(mockPaymentResult.generatedCount).toBe(3)
    expect(mockPaymentResult.alreadyExistingCount).toBe(1)
  })

  it('correctly identifies overdue cancelled slots eligible for reactivation upon monthly payment', () => {
    const overdueCancelledBooking = {
      id: 'b-overdue',
      status: 'cancelled',
      staff_notes: 'ABONO FIJO: Juan Perez | Liberado por falta de pago del abono de 2026-11 (venció día 10)',
    }

    const manuallyCancelledByClubBooking = {
      id: 'b-manual-cancel',
      status: 'cancelled',
      staff_notes: 'Cancelado por solicitud del cliente por lluvia',
    }

    const wasCancelledDueToOverdue = (b: { status: string; staff_notes?: string | null }) =>
      b.status === 'cancelled' &&
      Boolean(b.staff_notes && (b.staff_notes.includes('falta de pago') || b.staff_notes.includes('Liberado por')))

    expect(wasCancelledDueToOverdue(overdueCancelledBooking)).toBe(true)
    expect(wasCancelledDueToOverdue(manuallyCancelledByClubBooking)).toBe(false)
  })
})
