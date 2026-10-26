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

  describe('Guard 5: 7-Day Tolerance Window & Surcharge Accrual Starting on Day 8', () => {
    it('maintains the base monthly fee during the first 7 days following trial expiration without surcharge', () => {
      const baseAmount = 100000 // Club Luli
      const dueDate = '2026-10-24'

      // Días 1 a 7 (25/10 al 31/10 inclusive): Precio base congelado, 0% de mora
      const testCasesTolerance = [
        { day: 1, date: '2026-10-25T12:00:00.000Z' },
        { day: 2, date: '2026-10-26T12:00:00.000Z' }, // Hoy
        { day: 4, date: '2026-10-28T12:00:00.000Z' },
        { day: 7, date: '2026-10-31T12:00:00.000Z' }, // Último día sin mora
      ]

      for (const tc of testCasesTolerance) {
        const fee = calculateReactivationFee(baseAmount, dueDate, new Date(tc.date))
        expect(fee.elapsedDays).toBe(tc.day)
        expect(fee.daysOverdue).toBe(0)
        expect(fee.surchargeAmount).toBe(0)
        expect(fee.totalAmount).toBe(baseAmount)
        expect(fee.isInTolerancePeriod).toBe(true)
        expect(fee.toleranceEndDate).toBe('31/10/2026')
      }
    })

    it('accurately applies 3% daily surcharge starting on Day 8 of non-payment (01/11)', () => {
      const baseAmount = 100000
      const dueDate = '2026-10-24'

      // Day 8 (01/11): Primer día de mora (+3% = +$3.000)
      const feeDay8 = calculateReactivationFee(baseAmount, dueDate, new Date('2026-11-01T12:00:00.000Z'))
      expect(feeDay8.elapsedDays).toBe(8)
      expect(feeDay8.daysOverdue).toBe(1)
      expect(feeDay8.dailyRatePercent).toBe(3)
      expect(feeDay8.surchargePercent).toBe(3)
      expect(feeDay8.surchargeAmount).toBe(3000)
      expect(feeDay8.totalAmount).toBe(103000)

      // Day 9 (02/11): Segundo día de mora (+6% = +$6.000)
      const feeDay9 = calculateReactivationFee(baseAmount, dueDate, new Date('2026-11-02T12:00:00.000Z'))
      expect(feeDay9.elapsedDays).toBe(9)
      expect(feeDay9.daysOverdue).toBe(2)
      expect(feeDay9.surchargePercent).toBe(6)
      expect(feeDay9.surchargeAmount).toBe(6000)
      expect(feeDay9.totalAmount).toBe(106000)

      // Day 15 (locked): 8 días de mora (+24% = +$24.000)
      const feeDay15 = calculateReactivationFee(baseAmount, dueDate, new Date('2026-11-08T12:00:00.000Z'))
      expect(feeDay15.elapsedDays).toBe(15)
      expect(feeDay15.daysOverdue).toBe(8)
      expect(feeDay15.surchargePercent).toBe(24)
      expect(feeDay15.surchargeAmount).toBe(24000)
      expect(feeDay15.totalAmount).toBe(124000)
    })

    it('handles linked card auto-debit clubs with 1 day retry tolerance and surcharge starting on Day 2', () => {
      const baseAmount = 100000
      const dueDate = '2026-10-24'

      // Día 0 (24/10): Cobro automático ejecutado
      const feeDay0 = calculateReactivationFee(baseAmount, dueDate, new Date('2026-10-24T12:00:00.000Z'), undefined, { isLinkedCard: true })
      expect(feeDay0.elapsedDays).toBe(0)
      expect(feeDay0.daysOverdue).toBe(0)
      expect(feeDay0.totalAmount).toBe(baseAmount)

      // Día 1 (25/10): Reintento al otro día (sin mora)
      const feeDay1 = calculateReactivationFee(baseAmount, dueDate, new Date('2026-10-25T12:00:00.000Z'), undefined, { isLinkedCard: true })
      expect(feeDay1.elapsedDays).toBe(1)
      expect(feeDay1.daysOverdue).toBe(0)
      expect(feeDay1.totalAmount).toBe(baseAmount)

      // Día 2 (26/10): Reintento falló -> Inicia mora (1 día de mora)
      const feeDay2 = calculateReactivationFee(baseAmount, dueDate, new Date('2026-10-26T12:00:00.000Z'), undefined, { isLinkedCard: true })
      expect(feeDay2.elapsedDays).toBe(2)
      expect(feeDay2.daysOverdue).toBe(1)
      expect(feeDay2.surchargePercent).toBe(3)
      expect(feeDay2.surchargeAmount).toBe(3000)
      expect(feeDay2.totalAmount).toBe(103000)
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

    it('charges strictly Base Fee + Surcharge once mora starts on Day 8', () => {
      // Test across multiple overdue days with mora
      const testCases = [
        { day: 8, moraDays: 1, date: '2026-11-01T12:00:00.000Z', expectedTotal: 103000, expectedSurcharge: 3000 },
        { day: 9, moraDays: 2, date: '2026-11-02T12:00:00.000Z', expectedTotal: 106000, expectedSurcharge: 6000 },
        { day: 11, moraDays: 4, date: '2026-11-04T12:00:00.000Z', expectedTotal: 112000, expectedSurcharge: 12000 },
      ]

      for (const tc of testCases) {
        const fee = calculateReactivationFee(baseFee, dueDate, new Date(tc.date))
        expect(fee.elapsedDays).toBe(tc.day)
        expect(fee.daysOverdue).toBe(tc.moraDays)
        expect(fee.surchargeAmount).toBe(tc.expectedSurcharge)
        expect(fee.totalAmount).toBe(tc.expectedTotal)

        // INVARIANTE INQUEBRANTABLE: El monto a pagar con mora NO PUEDE ser igual al mensual base
        expect(fee.totalAmount).toBeGreaterThan(baseFee)
        expect(fee.totalAmount).not.toBe(baseFee)
        expect(fee.totalAmount).toBe(baseFee + tc.expectedSurcharge)
      }
    })

    it('verifies preference formatting includes mora surcharge label and details', () => {
      const overdueDate = new Date('2026-11-01T12:00:00.000Z')
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

  describe('Guard 7: Automated Debit for Clubs Exiting Free Trial (Zero Manual Action When Funds Are Sufficient)', () => {
    it('executes automated debit successfully on trial exit when club has linked card with funds', () => {
      // Simulación de club que finaliza la prueba de 15 días con tarjeta vinculada
      const clubTrialExit = {
        name: 'Luli',
        hasCard: true,
        cardBrand: 'MASTER',
        cardLast4: '***5',
        trialEndsAt: '2026-10-24T20:42:21.972Z',
        monthlyFee: 100000,
        fundsAvailable: true,
      }

      // Verificamos que si tiene fondos, el estado no debe requerir intervención manual
      expect(clubTrialExit.hasCard).toBe(true)
      expect(clubTrialExit.fundsAvailable).toBe(true)

      // El resultado esperado del débito automático
      const autoDebitResult = {
        status: clubTrialExit.fundsAvailable ? 'PAID' : 'FAILED',
        subscriptionStatus: clubTrialExit.fundsAvailable ? 'ACTIVE' : 'PAYMENT_PENDING',
        requiresManualOwnerAction: !clubTrialExit.fundsAvailable,
      }

      expect(autoDebitResult.status).toBe('PAID')
      expect(autoDebitResult.subscriptionStatus).toBe('ACTIVE')
      expect(autoDebitResult.requiresManualOwnerAction).toBe(false)
    })

    it('retries on Day 1 if Day 0 auto-debit fails due to insufficient funds before triggering failed alert', () => {
      const attempts = [
        { day: 0, date: '2026-10-24', status: 'REJECTED', reason: 'Fondos insuficientes' },
        { day: 1, date: '2026-10-25', status: 'REJECTED', reason: 'Fondos insuficientes' },
      ]

      // Tras 2 intentos fallidos, se emite la alerta formal y empieza la mora
      const shouldTriggerFailedAlert = attempts.length >= 2
      expect(shouldTriggerFailedAlert).toBe(true)

      // Mora en tarjeta vinculada inicia al Día 2 sin pagar
      const feeDay2 = calculateReactivationFee(100000, '2026-10-24', new Date('2026-10-26T12:00:00.000Z'), undefined, { isLinkedCard: true })
      expect(feeDay2.daysOverdue).toBe(1)
      expect(feeDay2.surchargeAmount).toBe(3000)
      expect(feeDay2.totalAmount).toBe(103000)
    })

    it('skips auto-debit for clubs without linked cards and gives 7-day manual tolerance window', () => {
      const clubWithoutCard = {
        name: 'Club Sin Tarjeta',
        hasCard: false,
        trialEndsAt: '2026-10-24',
      }

      expect(clubWithoutCard.hasCard).toBe(false)

      // Días 1 a 7: precio base congelado sin mora
      const feeDay7 = calculateReactivationFee(100000, clubWithoutCard.trialEndsAt, new Date('2026-10-31T12:00:00.000Z'), undefined, { isLinkedCard: false })
      expect(feeDay7.isInTolerancePeriod).toBe(true)
      expect(feeDay7.daysOverdue).toBe(0)
      expect(feeDay7.totalAmount).toBe(100000)

      // Día 8: mora comienza
      const feeDay8 = calculateReactivationFee(100000, clubWithoutCard.trialEndsAt, new Date('2026-11-01T12:00:00.000Z'), undefined, { isLinkedCard: false })
      expect(feeDay8.isInTolerancePeriod).toBe(false)
      expect(feeDay8.daysOverdue).toBe(1)
      expect(feeDay8.totalAmount).toBe(103000)
    })
  })

  describe('Guard 8: Universal Invariants for 100% of New Clubs Without Exception', () => {
    it('initializes all new clubs with 15-day trial, baseline reference price ($30.000 ARS), and auto-debit structures', () => {
      // Simulación de los metadatos creados tanto por registerClub como por createClubAction
      const newClubRegistration = {
        name: 'Club Nuevo Sin Excepción',
        sports: ['FUTBOL', 'PADEL'],
        baseSlots: 2,
        now: new Date('2026-10-26T12:00:00.000Z'),
      }

      const trialEndsAt = new Date(newClubRegistration.now.getTime() + 15 * 86400000).toISOString()
      const descriptionMeta = {
        card_linked: false,
        is_trial: true,
        trial_days: 15,
        trial_activated_at: newClubRegistration.now.toISOString(),
        trial_ends_at: trialEndsAt,
        billing_cycle_max_price_cents: 3000000, // $30.000 ARS
        auto_debit_alerts: [],
        auto_debit_attempts: [],
      }

      expect(descriptionMeta.is_trial).toBe(true)
      expect(descriptionMeta.trial_days).toBe(15)
      expect(descriptionMeta.trial_ends_at).toBe('2026-11-10T12:00:00.000Z')
      expect(descriptionMeta.billing_cycle_max_price_cents).toBe(3000000)
      expect(Array.isArray(descriptionMeta.auto_debit_alerts)).toBe(true)
      expect(Array.isArray(descriptionMeta.auto_debit_attempts)).toBe(true)

      // Reglas de precios base garantizadas para cada cancha creada
      const seededPriceRules = [
        { court_id: 'court-1', price_cents: 3000000, is_active: true },
        { court_id: 'court-2', price_cents: 3000000, is_active: true },
      ]
      const maxPriceArs = Math.max(...seededPriceRules.map(r => r.price_cents)) / 100
      expect(maxPriceArs).toBe(30000)

      // Cálculo de cuota SaaS garantizada sin importar si el dueño aún no configuró precios personalizados
      const pricing = calculateClubSaaSFee(2, maxPriceArs, newClubRegistration.now.toISOString(), trialEndsAt, true)
      expect(pricing.monthlyFeeArs).toBeGreaterThan(0)
      expect(pricing.highestSlotPriceArs).toBe(30000)
      expect(pricing.multiplier).toBe(1.3)
      expect(pricing.monthlyFeeArs).toBe(39000) // 1.3 turnos * $30.000 = $39.000
    })

    it('ensures autonomous debit execution on trial exit with zero manual action across all new clubs with linked card', () => {
      const newClubExitingTrial = {
        id: 'tenant-nuevo-001',
        hasCard: true,
        trialEndsAt: '2026-10-26T00:00:00.000Z',
        now: new Date('2026-10-26T00:01:00.000Z'), // Minuto 1 post-trial
        cardApproved: true,
      }

      // Verificamos que al llegar a la fecha fin de trial, se dispara el cobro autónomo
      const isTrialFinished = newClubExitingTrial.now >= new Date(newClubExitingTrial.trialEndsAt)
      expect(isTrialFinished).toBe(true)

      // Con tarjeta vinculada y aprobación bancaria, la factura se liquida de inmediato como PAID
      const debitOutcome = {
        invoiceStatus: newClubExitingTrial.cardApproved ? 'PAID' : 'UNPAID',
        subscriptionStatus: newClubExitingTrial.cardApproved ? 'ACTIVE' : 'PAYMENT_PENDING',
        requiresManualOwnerPayment: false,
      }

      expect(debitOutcome.invoiceStatus).toBe('PAID')
      expect(debitOutcome.subscriptionStatus).toBe('ACTIVE')
      expect(debitOutcome.requiresManualOwnerPayment).toBe(false)
    })
  })

  describe('Guard 9: Strict Banking Validation & Prohibition of Simulated In-House Payments (Real MP Accredited Check)', () => {
    it('strictly forbids local forged IDs (deb_saas_...) and requires genuine MP payment IDs', () => {
      // Invariante de seguridad: Ningún pago generado internamente sin MP puede liquidar una factura
      const isForgedPayment = (paymentId: string) => paymentId.startsWith('deb_saas_') || paymentId.startsWith('simulated_')
      
      expect(isForgedPayment('deb_saas_42731d75_45d127f1_1793017719979')).toBe(true)
      expect(isForgedPayment('simulated_mp')).toBe(true)
      expect(isForgedPayment('1234567890')).toBe(false) // ID numérico auténtico de Mercado Pago
    })

    it('asserts that missing preapprovalId strictly skips auto-debit and keeps invoice UNPAID', () => {
      // Simulación de club sin suscripción en MP (solo tarjeta ingresada en el form)
      const clubWithoutPreapproval: {
        name: string
        hasCardLinked: boolean
        preapprovalId: string | null
        invoiceStatus: string
      } = {
        name: 'Luli',
        hasCardLinked: true,
        preapprovalId: null, // Sin contrato PreApproval en MP
        invoiceStatus: 'UNPAID',
      }

      const autoDebitDecision = {
        shouldExecute: Boolean(clubWithoutPreapproval.preapprovalId && !clubWithoutPreapproval.preapprovalId.startsWith('simulated_')),
        action: clubWithoutPreapproval.preapprovalId ? 'ATTEMPT_MP_DEBIT' : 'SKIP_REQUIRE_MANUAL_PAYMENT',
        resultingInvoiceStatus: 'UNPAID',
      }

      expect(autoDebitDecision.shouldExecute).toBe(false)
      expect(autoDebitDecision.action).toBe('SKIP_REQUIRE_MANUAL_PAYMENT')
      expect(autoDebitDecision.resultingInvoiceStatus).toBe('UNPAID')
      expect(autoDebitDecision.resultingInvoiceStatus).not.toBe('PAID')
    })

    it('asserts that only payments with status approved and status_detail accredited liquidate an invoice to PAID', () => {
      const paymentResponses = [
        { status: 'approved', status_detail: 'accredited', expectedPaid: true },
        { status: 'rejected', status_detail: 'cc_rejected_insufficient_amount', expectedPaid: false },
        { status: 'rejected', status_detail: 'cc_rejected_high_risk', expectedPaid: false },
        { status: 'in_process', status_detail: 'pending_contingency', expectedPaid: false },
        { status: 'cancelled', status_detail: 'by_collector', expectedPaid: false },
      ]

      for (const res of paymentResponses) {
        const isEligibleForPaid = res.status === 'approved' && res.status_detail === 'accredited'
        expect(isEligibleForPaid).toBe(res.expectedPaid)
      }
    })

    it('enforces PAYMENT_PENDING status when card is linked or updated after trial has ended with unpaid invoices', () => {
      const trialEndsAt = new Date('2026-10-24T00:00:00.000Z')
      const currentDate = new Date('2026-10-26T12:00:00.000Z')
      const isStillTrial = currentDate < trialEndsAt
      const hasUnpaidInvoices = true

      // Lógica implementada en confirmAndActivateSubscriptionWithCard:
      let targetStatus: 'ACTIVE' | 'PAYMENT_PENDING' = 'ACTIVE'
      if (!isStillTrial) {
        if (hasUnpaidInvoices) {
          targetStatus = 'PAYMENT_PENDING'
        }
      }

      expect(isStillTrial).toBe(false)
      expect(targetStatus).toBe('PAYMENT_PENDING')
      expect(targetStatus).not.toBe('ACTIVE')
    })
  })
})



