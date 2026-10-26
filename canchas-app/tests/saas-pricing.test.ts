import { describe, it, expect } from 'vitest'
import { 
  calculateClubSaaSFee, 
  calculateSaaSMultiplier, 
  calculateReactivationFee
} from '@/lib/saas-pricing'

describe('SaaS Pricing Engine', () => {
  it('calculates correct multipliers based on calibrated tier table', () => {
    expect(calculateSaaSMultiplier(1)).toBe(1.0)
    expect(calculateSaaSMultiplier(2)).toBe(1.3)
    expect(calculateSaaSMultiplier(3)).toBe(1.5)
    expect(calculateSaaSMultiplier(4)).toBe(2.0)
    expect(calculateSaaSMultiplier(5)).toBe(2.5)
    expect(calculateSaaSMultiplier(8)).toBe(2.5)
  })

  it('calculates monthly fee and respects monthly cap', () => {
    // 2 canchas, turno $20,000 -> 20000 * 1.3 = 26000. Cap para 2 canchas es $55,000.
    const res = calculateClubSaaSFee(2, 20000, null, null, true, false)
    expect(res.monthlyFeeArs).toBe(26000)
    expect(res.isCapApplied).toBe(false)

    // 2 canchas, turno $50,000 -> 50000 * 1.3 = 65000. Cap para 2 canchas es $55,000 -> aplica cap de 55000.
    const resCapped = calculateClubSaaSFee(2, 50000, null, null, true, false)
    expect(res.monthlyCapArs).toBe(55000)
    expect(resCapped.monthlyFeeArs).toBe(55000)
    expect(resCapped.isCapApplied).toBe(true)
  })

  it('calculates annual plan fee with 2 months free (10 months price for 12 months)', () => {
    const resAnnual = calculateClubSaaSFee(2, 20000, null, null, true, true)
    // Mensual estándar = 26000. Anual = 26000 * 10 = 260000.
    expect(resAnnual.annualTotalFeeArs).toBe(260000)
    expect(resAnnual.annualSavingsArs).toBe(52000)
    expect(resAnnual.annualMonthlyEquivalentArs).toBe(Math.round(260000 / 12))
  })

  it('calculates reactivation fee with 3% daily surcharge on overdue days', () => {
    // 5 días de mora con base de $30.000 -> 5 * 3% = 15% recargo = $4.500 -> Total $34.500
    const fee = calculateReactivationFee(30000, '01/10/2026', new Date(2026, 9, 6), 5)
    expect(fee.daysOverdue).toBe(5)
    expect(fee.surchargePercent).toBe(15)
    expect(fee.surchargeAmount).toBe(4500)
    expect(fee.totalAmount).toBe(34500)

    // 0 días de mora
    const zeroFee = calculateReactivationFee(30000, '01/10/2026', new Date(2026, 9, 1), 0)
    expect(zeroFee.daysOverdue).toBe(0)
    expect(zeroFee.surchargeAmount).toBe(0)
    expect(zeroFee.totalAmount).toBe(30000)
  })

  it('calculates 10-court club (Grande 5+) fee accurately at 2.5x multiplier', () => {
    // 10 canchas, turno mayor $40.000 -> 40000 * 2.5 = $100.000
    const res = calculateClubSaaSFee(10, 40000, null, null, true, false)
    expect(res.courtsCount).toBe(10)
    expect(res.multiplier).toBe(2.5)
    expect(res.highestSlotPriceArs).toBe(40000)
    expect(res.monthlyFeeArs).toBe(100000)
    expect(res.planId).toBe('GRANDE_5_PLUS')
    expect(res.formulaDescription).toContain('2.5 turnos de $40.000 (10 canchas)')
  })

  it('correctly tracks trial state before and after 15 days', () => {
    const createdAt = new Date('2026-10-09T00:00:00.000Z')
    const trialEndsAt = new Date('2026-10-24T00:00:00.000Z')

    // Prueba expirada si la fecha actual es posterior a trialEndsAt
    const pricingExpired = calculateClubSaaSFee(10, 40000, createdAt, trialEndsAt, true)
    // Cuando el trial ya pasó, isTrial debe ser falso
    expect(new Date() >= trialEndsAt).toBe(true)
    expect(pricingExpired.isTrial).toBe(false)
  })
})
