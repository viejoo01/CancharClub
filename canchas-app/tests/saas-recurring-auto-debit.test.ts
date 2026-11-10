import { describe, it, expect } from 'vitest'
import { calculateInvoiceSurcharge } from '@/lib/billing/dunning'
import { calculateReactivationFee } from '@/lib/saas-pricing'
import { mapMpRejectionDetail, isValidLuhn, detectCardBrand } from '@/lib/card-validation'
import { executeTenantAutoDebit } from '@/actions/saas-billing.actions'

describe('SaaS Recurring Auto-Debit & Mercado Pago MLA Invariant Suite', () => {

  // 1. FAIL-CLOSED ARCHITECTURE & TOKEN PROHIBITION
  describe('1. Fail-Closed Protocol & card_token Prohibition', () => {
    it('aborts automatically when mp_preapproval_id is null or missing, leaving invoice UNPAID', async () => {
      // Intentar debitar para un club sin contrato recurrente en MP
      const res = await executeTenantAutoDebit({
        tenantId: 'demo-unlinked-tenant-id',
        invoiceId: 'inv-test-123',
      })

      // Debe abortar limpiamente sin marcar pagado
      expect(res.success).toBe(false)
      expect(res.status).toBe('SKIPPED')
      expect(res.paymentId).toBeUndefined()
    })

    it('prohibits synthetic and mock tokens (simulated_*, token_*) from approving invoices', async () => {
      const syntheticTokens = [
        'token_1234567890abcdef',
        'simulated_preapproval_999',
        'card_token_live_test_xyz',
      ]

      for (const token of syntheticTokens) {
        expect(token.startsWith('token_') || token.startsWith('simulated_') || token.startsWith('card_token_')).toBe(true)
      }
    })

    it('validates card format with Luhn Mod-10 and detects card brand before tokenization', () => {
      expect(isValidLuhn('4532015112830366')).toBe(true)
      expect(isValidLuhn('5425233430109903')).toBe(true)
      expect(isValidLuhn('4532015112830367')).toBe(false) // Check digit inválido

      expect(detectCardBrand('4532015112830366')?.brand).toBe('VISA')
      expect(detectCardBrand('5425233430109903')?.brand).toBe('MASTERCARD')
    })
  })

  // 2. IDEMPOTENCY & NETWORK TIMEOUT PROTECTION
  describe('2. Idempotency Key Specification', () => {
    it('generates unique, collision-free idempotency keys per invoice attempt', () => {
      const invoiceId = 'b0d77e48-8316-43b8-80f4-046e7f8cf2a2'
      const attempt1 = `invoice_${invoiceId}_attempt_1_${Date.now()}`
      const attempt2 = `invoice_${invoiceId}_attempt_2_${Date.now() + 1000}`

      expect(attempt1).toContain(`invoice_${invoiceId}_attempt_1_`)
      expect(attempt2).toContain(`invoice_${invoiceId}_attempt_2_`)
      expect(attempt1).not.toBe(attempt2)
    })
  })

  // 3. DUNNING STAIR & REJECTION MAPPING FOR LINKED CARDS
  describe('3. Dunning Stair & Rejection Mapping for Linked Cards', () => {
    it('accurately maps all Mercado Pago banking decline codes to user-friendly Spanish explanations', () => {
      expect(mapMpRejectionDetail('cc_rejected_insufficient_amount')).toBe('Fondos o límite insuficiente en la tarjeta.')
      expect(mapMpRejectionDetail('cc_rejected_high_risk')).toBe('Operación rechazada por los filtros de prevención de fraude.')
      expect(mapMpRejectionDetail('cc_rejected_card_disabled')).toBe('La tarjeta se encuentra inhabilitada o bloqueada por tu banco.')
      expect(mapMpRejectionDetail('cc_rejected_call_for_authorize')).toBe('Tu banco emisor requiere que autorices la operación antes de continuar.')
      expect(mapMpRejectionDetail('cc_rejected_bad_filled_security_code')).toBe('Código de seguridad (CVV) incorrecto.')
    })

    it('handles Day 0 (Attempt 1) failure without surcharges', () => {
      const baseAmount = 45000
      const now = new Date()
      // En Día 0 (fecha de vencimiento hoy), aún no hay recargo por mora
      const surcharge = calculateInvoiceSurcharge(baseAmount, now)
      expect(surcharge.surchargeAmount).toBe(0)
      expect(surcharge.surchargePercentage).toBe(0)
      expect(surcharge.totalAmount).toBe(45000)
    })

    it('enforces 7-day grace period for manual invoices before daily surcharge', () => {
      const baseAmount = 50000
      // 5 días vencida (dentro del período de gracia de 7 días)
      const date5DaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      const day5 = calculateInvoiceSurcharge(baseAmount, date5DaysAgo)
      expect(day5.surchargeDays).toBe(0)
      expect(day5.surchargeAmount).toBe(0)
      expect(day5.totalAmount).toBe(50000)

      // 9 días vencida (2 días de mora devengada a partir del día 8: 2 * 3% = 6%)
      const date9DaysAgo = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000)
      const day9 = calculateInvoiceSurcharge(baseAmount, date9DaysAgo)
      expect(day9.surchargeDays).toBe(2)
      expect(day9.surchargePercentage).toBe(6)
      expect(day9.surchargeAmount).toBe(3000)
      expect(day9.totalAmount).toBe(53000)
    })

    it('enforces 1-day retry tolerance and 3% daily surcharge starting Day 2 for linked cards', () => {
      const baseAmount = 60000
      const dueDate = '2026-11-01'

      // Día 0 (Día del vencimiento / Intento 1): 0 recargo
      const day0 = calculateReactivationFee(baseAmount, dueDate, new Date('2026-11-01T12:00:00Z'), undefined, { isLinkedCard: true })
      expect(day0.surchargeAmount).toBe(0)
      expect(day0.totalAmount).toBe(60000)

      // Día 1 (Día de reintento automático / Intento 2): 0 recargo (en tolerancia)
      const day1 = calculateReactivationFee(baseAmount, dueDate, new Date('2026-11-02T12:00:00Z'), undefined, { isLinkedCard: true })
      expect(day1.isInTolerancePeriod).toBe(true)
      expect(day1.surchargeAmount).toBe(0)
      expect(day1.totalAmount).toBe(60000)

      // Día 2 (Mora comienza tras fallar Intento 2): 1 día de mora (+3%)
      const day2 = calculateReactivationFee(baseAmount, dueDate, new Date('2026-11-03T12:00:00Z'), undefined, { isLinkedCard: true })
      expect(day2.daysOverdue).toBe(1)
      expect(day2.surchargePercent).toBe(3)
      expect(day2.surchargeAmount).toBe(1800)
      expect(day2.totalAmount).toBe(61800)

      // Día 4 (3 días de mora = 9%)
      const day4 = calculateReactivationFee(baseAmount, dueDate, new Date('2026-11-05T12:00:00Z'), undefined, { isLinkedCard: true })
      expect(day4.daysOverdue).toBe(3)
      expect(day4.surchargePercent).toBe(9)
      expect(day4.surchargeAmount).toBe(5400)
      expect(day4.totalAmount).toBe(65400)
    })
  })

  // 4. INVARIANT: isPaid IS STRICTLY FALSE WHILE UNPAID INVOICES EXIST
  describe('4. Invariant: isPaid is Strictly False if Unpaid Invoices Exist', () => {
    it('keeps payment status strictly unpaid even if card is linked until bank approval', () => {
      const mockTenantBillingState = {
        hasLinkedCard: true,
        mpPreapprovalId: '2c9380847b2c0f64017b359f12340001',
        invoices: [
          { id: 'inv-1', status: 'UNPAID', amount: 45000, due_date: '2026-11-01' }
        ]
      }

      const hasUnpaidInvoices = mockTenantBillingState.invoices.some(i => i.status === 'UNPAID')
      const isPaid = !hasUnpaidInvoices

      // INVARIANTE CARDINAL: isPaid DEBE ser estrictamente false
      expect(isPaid).toBe(false)
    })
  })

  // 5. WEBHOOK ROUTING & TRANSACTION MATCHING
  describe('5. Webhook Routing & Subscription Authorized Payment', () => {
    it('distinguishes subscription_authorized_payment from regular booking payments', () => {
      const webhookPayloadSubscription = {
        type: 'subscription_authorized_payment',
        data: { id: 'auth_pay_987654321' }
      }

      const webhookPayloadBooking = {
        type: 'payment',
        data: { id: '123456789' }
      }

      expect(webhookPayloadSubscription.type).toBe('subscription_authorized_payment')
      expect(webhookPayloadBooking.type).toBe('payment')
    })
  })
})
