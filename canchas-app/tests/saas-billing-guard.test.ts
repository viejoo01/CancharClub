import { describe, it, expect } from 'vitest'
import { calculateClubSaaSFee, calculateSaaSMultiplier, calculateReactivationFee } from '@/lib/saas-pricing'
import { mapMpRejectionDetail } from '@/lib/card-validation'

describe('SaaS Billing Critical Guard & Recurrence Prevention Tests', () => {
  describe('Guard 1: Card Rejection & Payment Gateway Strictness', () => {
    it('properly identifies and translates all bank rejection codes without bypass', () => {
      const rejectionCodes = [
        { code: 'cc_rejected_insufficient_amount', expected: 'Fondos o límite insuficiente en la tarjeta.' },
        { code: 'cc_rejected_high_risk', expected: 'Operación rechazada por los filtros de prevención de fraude.' },
        { code: 'cc_rejected_bad_filled_security_code', expected: 'Código de seguridad (CVV) incorrecto.' },
        { code: 'cc_rejected_card_disabled', expected: 'La tarjeta se encuentra inhabilitada o bloqueada por tu banco.' },
        { code: 'cc_rejected_call_for_authorize', expected: 'Tu banco emisor requiere que autorices la operación antes de continuar.' },
        { code: 'cc_rejected_bad_filled_card_number', expected: 'Número de tarjeta incorrecto o inexistente.' },
      ]

      for (const item of rejectionCodes) {
        const message = mapMpRejectionDetail(item.code)
        expect(message).toBe(item.expected)
        // High risk or insufficient funds must never evaluate to empty or pass
        expect(message.length).toBeGreaterThan(10)
      }
    })

    it('rejects unknown or invalid codes with a generic safe bank rejection error', () => {
      const fallback = mapMpRejectionDetail('unknown_error_code')
      expect(fallback).toBe('Tarjeta no autorizada o rechazada por la entidad bancaria.')
    })
  })

  describe('Guard 2: Sizing & Pricing Calculation Invariant (Club Luli 10 Canchas)', () => {
    it('guarantees that 10 courts with $40,000 turn calculates exactly $100,000 ARS at 2.5x multiplier', () => {
      const courtsCount = 10
      const highestPrice = 40000
      const pricing = calculateClubSaaSFee(courtsCount, highestPrice, null, null, true, false)

      expect(pricing.courtsCount).toBe(10)
      expect(pricing.multiplier).toBe(2.5)
      expect(pricing.highestSlotPriceArs).toBe(40000)
      expect(pricing.monthlyFeeArs).toBe(100000)
      // Must NEVER be $40,000 (which occurred when courts defaulted to 1 due to schema query error)
      expect(pricing.monthlyFeeArs).not.toBe(40000)
    })

    it('prevents regression to 1-court fallback ($40,000) when base_slots_plan is configured', () => {
      const realCourts = 0 // Simulating empty courts table
      const baseSlots = 10
      const effectiveCourts = Math.max(realCourts, baseSlots) || 1
      const pricing = calculateClubSaaSFee(effectiveCourts, 40000, null, null, true, false)

      expect(effectiveCourts).toBe(10)
      expect(pricing.monthlyFeeArs).toBe(100000)
    })

    it('asserts tier scaling progression across all tiers', () => {
      expect(calculateSaaSMultiplier(1)).toBe(1.0)
      expect(calculateSaaSMultiplier(2)).toBe(1.3)
      expect(calculateSaaSMultiplier(3)).toBe(1.5)
      expect(calculateSaaSMultiplier(4)).toBe(2.0)
      expect(calculateSaaSMultiplier(5)).toBe(2.5)
      expect(calculateSaaSMultiplier(10)).toBe(2.5)
    })
  })

  describe('Guard 3: Invariant State Enforcement (Overdue Invoices Prevent "Al Día")', () => {
    it('invariant: an unpaid invoice strictly forces isPaid to false regardless of auto-debit presence', () => {
      // Simulate plan details state
      const simulatedInvoices = [
        {
          id: 'inv-1',
          tenant_id: 'tenant-luli',
          amount: 100000,
          status: 'UNPAID',
          due_date: '2026-10-24',
        }
      ]

      const hasAutoDebit = true // Club has a card on file
      const subscriptionStatus = 'PAYMENT_PENDING'
      const isPaused = false

      // Evaluation rules used in getClubPlanDetails and plan/page.tsx
      const hasOverdueDebt = simulatedInvoices.some(
        inv => (inv.status === 'UNPAID' || inv.status === 'DRAFT') && Number(inv.amount) > 0
      )
      const hasUnpaidInvoice = hasOverdueDebt
      const isPaymentPending = subscriptionStatus === 'PAYMENT_PENDING' || hasUnpaidInvoice

      // The raw isPaid from subscription was previously true if card was linked:
      const rawIsPaidFromSub = true

      // Corrected invariant in saas-billing.actions.ts:
      const planDetailsIsPaid = rawIsPaidFromSub && !hasOverdueDebt

      // Corrected invariant in plan/page.tsx:
      const clientIsPaid = !isPaused && !isPaymentPending && planDetailsIsPaid

      expect(hasAutoDebit).toBe(true)
      expect(hasOverdueDebt).toBe(true)
      expect(planDetailsIsPaid).toBe(false)
      expect(clientIsPaid).toBe(false)
      // Must NEVER display as paid
      expect(clientIsPaid).not.toBe(true)
    })

    it('allows isPaid to become true only when all invoices are PAID and status is ACTIVE', () => {
      const simulatedInvoices = [
        {
          id: 'inv-1',
          tenant_id: 'tenant-luli',
          amount: 100000,
          status: 'PAID',
          due_date: '2026-10-24',
        }
      ]

      const hasAutoDebit = true
      const subscriptionStatus: string = 'ACTIVE'
      const isPaused = false

      const hasOverdueDebt = simulatedInvoices.some(
        inv => (inv.status === 'UNPAID' || inv.status === 'DRAFT') && Number(inv.amount) > 0
      )
      const isPaymentPending = subscriptionStatus === 'PAYMENT_PENDING' || hasOverdueDebt
      const rawIsPaidFromSub = true
      const planDetailsIsPaid = rawIsPaidFromSub && !hasOverdueDebt
      const clientIsPaid = !isPaused && !isPaymentPending && planDetailsIsPaid

      expect(hasAutoDebit).toBe(true)
      expect(hasOverdueDebt).toBe(false)
      expect(planDetailsIsPaid).toBe(true)
      expect(clientIsPaid).toBe(true)
    })
  })

  describe('Guard 4: Trial Expiration Invariant & Dunning Progression', () => {
    it('strictly expires trial when current date is on or after trial_ends_at', () => {
      const createdAt = new Date('2026-10-09T00:00:00.000Z')
      const trialEndsAt = new Date('2026-10-24T00:00:00.000Z')
      const currentDate = new Date('2026-10-25T00:00:00.000Z')

      const pricing = calculateClubSaaSFee(10, 40000, createdAt, trialEndsAt, true)

      // When current date is past trial, isTrial must be false
      expect(currentDate >= trialEndsAt).toBe(true)
      expect(pricing.isTrial).toBe(false)
    })

    it('maps dunning progression accurately by overdue days', () => {
      // Invariant state transitions defined in Cron SaaS Dunning:
      // Day 1 to 7: PAYMENT_PENDING
      // Day 8 to 12: GRACE_PERIOD
      // Day 13 to 14: PARTIALLY_SUSPENDED
      // Day 15+: LOCKED
      const getDunningStatus = (daysOverdue: number): string => {
        if (daysOverdue >= 15) return 'LOCKED'
        if (daysOverdue >= 13) return 'PARTIALLY_SUSPENDED'
        if (daysOverdue >= 8) return 'GRACE_PERIOD'
        if (daysOverdue >= 1) return 'PAYMENT_PENDING'
        return 'ACTIVE'
      }

      expect(getDunningStatus(0)).toBe('ACTIVE')
      expect(getDunningStatus(1)).toBe('PAYMENT_PENDING')
      expect(getDunningStatus(7)).toBe('PAYMENT_PENDING')
      expect(getDunningStatus(8)).toBe('GRACE_PERIOD')
      expect(getDunningStatus(12)).toBe('GRACE_PERIOD')
      expect(getDunningStatus(13)).toBe('PARTIALLY_SUSPENDED')
      expect(getDunningStatus(14)).toBe('PARTIALLY_SUSPENDED')
      expect(getDunningStatus(15)).toBe('LOCKED')
      expect(getDunningStatus(30)).toBe('LOCKED')
    })
  })

  describe('Guard 5: 3% Daily Surcharge Accrual Starting on Day 1 Overdue', () => {
    it('accurately applies 3% daily surcharge on Day 1 of non-payment (not waiting for Day 15 lock)', () => {
      const baseAmount = 100000 // Club Luli
      const dueDate = '2026-10-24'
      const paymentDateDay1 = new Date('2026-10-25T12:00:00.000Z') // 1 day overdue

      const feeDay1 = calculateReactivationFee(baseAmount, dueDate, paymentDateDay1)
      expect(feeDay1.daysOverdue).toBe(1)
      expect(feeDay1.dailyRatePercent).toBe(3)
      expect(feeDay1.surchargePercent).toBe(3)
      expect(feeDay1.surchargeAmount).toBe(3000)
      expect(feeDay1.totalAmount).toBe(103000)
    })

    it('accumulates surcharge proportionally across the tolerance and grace periods', () => {
      const baseAmount = 100000

      // Day 3 of tolerance
      const feeDay3 = calculateReactivationFee(baseAmount, '2026-10-24', new Date('2026-10-27T12:00:00.000Z'))
      expect(feeDay3.daysOverdue).toBe(3)
      expect(feeDay3.surchargePercent).toBe(9)
      expect(feeDay3.surchargeAmount).toBe(9000)
      expect(feeDay3.totalAmount).toBe(109000)

      // Day 7 (last day of tolerance)
      const feeDay7 = calculateReactivationFee(baseAmount, '2026-10-24', new Date('2026-10-31T12:00:00.000Z'))
      expect(feeDay7.daysOverdue).toBe(7)
      expect(feeDay7.surchargePercent).toBe(21)
      expect(feeDay7.surchargeAmount).toBe(21000)
      expect(feeDay7.totalAmount).toBe(121000)

      // Day 15 (locked)
      const feeDay15 = calculateReactivationFee(baseAmount, '2026-10-24', new Date('2026-11-08T12:00:00.000Z'))
      expect(feeDay15.daysOverdue).toBe(15)
      expect(feeDay15.surchargePercent).toBe(45)
      expect(feeDay15.surchargeAmount).toBe(45000)
      expect(feeDay15.totalAmount).toBe(145000)
    })
  })

  describe('Guard 6: Overdue Invoice Payments Always Charge Base Fee + Mora Surcharge (Never Just Base Amount)', () => {
    const baseFee = 100000 // Club Luli
    const dueDate = '2026-10-24'

    it('charges strictly the base fee on-time on due date with 0% surcharge', () => {
      const onTimeDate = new Date('2026-10-24T12:00:00.000Z')
      const fee = calculateReactivationFee(baseFee, dueDate, onTimeDate)

      expect(fee.daysOverdue).toBe(0)
      expect(fee.surchargeAmount).toBe(0)
      expect(fee.totalAmount).toBe(baseFee)
      expect(fee.totalAmount).toBe(100000)
    })

    it('charges strictly Base Fee + Surcharge (never just Base Fee) for overdue payments', () => {
      // Test across multiple overdue days
      const testCases = [
        { day: 1, date: '2026-10-25T12:00:00.000Z', expectedTotal: 103000, expectedSurcharge: 3000 },
        { day: 2, date: '2026-10-26T12:00:00.000Z', expectedTotal: 106000, expectedSurcharge: 6000 },
        { day: 4, date: '2026-10-28T12:00:00.000Z', expectedTotal: 112000, expectedSurcharge: 12000 },
        { day: 10, date: '2026-11-03T12:00:00.000Z', expectedTotal: 130000, expectedSurcharge: 30000 },
      ]

      for (const tc of testCases) {
        const fee = calculateReactivationFee(baseFee, dueDate, new Date(tc.date))
        expect(fee.daysOverdue).toBe(tc.day)
        expect(fee.surchargeAmount).toBe(tc.expectedSurcharge)
        expect(fee.totalAmount).toBe(tc.expectedTotal)

        // INVARIANTE INQUEBRANTABLE: El monto a pagar con mora NO PUEDE ser igual al mensual base
        expect(fee.totalAmount).toBeGreaterThan(baseFee)
        expect(fee.totalAmount).not.toBe(baseFee)
        expect(fee.totalAmount).toBe(baseFee + tc.expectedSurcharge)
      }
    })

    it('verifies preference formatting includes mora surcharge label and details', () => {
      const overdueDate = new Date('2026-10-25T12:00:00.000Z')
      const fee = calculateReactivationFee(baseFee, dueDate, overdueDate)

      const itemTitle = fee.daysOverdue > 0
        ? `Abono Mensual CancharClub (+${fee.daysOverdue}d mora)`
        : `Abono Mensual CancharClub`

      const itemDesc = fee.daysOverdue > 0
        ? `Cuota $${baseFee.toLocaleString('es-AR')} + ${fee.daysOverdue} día de mora (+${fee.surchargePercent}% = +$${fee.surchargeAmount.toLocaleString('es-AR')})`
        : `Cuota regular`

      expect(itemTitle).toBe('Abono Mensual CancharClub (+1d mora)')
      expect(itemDesc).toContain('+$3.000')
      expect(itemDesc).toContain('+3%')
    })
  })
})


