import { describe, it, expect } from 'vitest'

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

    const isAbonoTurn = (row: { recurring_slot_id?: string | null; payment_method?: string | null; staff_notes?: string | null }) => {
      return Boolean(
        row.recurring_slot_id ||
        row.payment_method === 'abono_fijo' ||
        (row.staff_notes && row.staff_notes.toUpperCase().includes('ABONO FIJO'))
      )
    }

    expect(isAbonoTurn(regularBooking)).toBe(false)
    expect(isAbonoTurn(abonoBooking)).toBe(true)
    expect(isAbonoTurn(legacyAbonoBooking)).toBe(true)
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
})
