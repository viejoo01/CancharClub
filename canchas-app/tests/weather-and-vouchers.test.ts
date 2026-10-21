import { describe, it, expect } from 'vitest'

describe('Weather Protocol & Customer Digital Vouchers', () => {
  interface Voucher {
    code: string
    discount_amount: number
    discount_type: 'PERCENTAGE' | 'FIXED'
    min_spend: number
    expires_at: string
    is_used: boolean
  }

  function validateVoucher(
    voucher: Voucher,
    orderAmount: number,
    currentDateIso: string
  ): { isValid: boolean; discountAmount: number; error?: string } {
    if (voucher.is_used) {
      return { isValid: false, discountAmount: 0, error: 'El cupón ya ha sido utilizado' }
    }

    if (new Date(currentDateIso) > new Date(voucher.expires_at)) {
      return { isValid: false, discountAmount: 0, error: 'El cupón se encuentra vencido' }
    }

    if (orderAmount < voucher.min_spend) {
      return {
        isValid: false,
        discountAmount: 0,
        error: `El monto mínimo de compra es de $${voucher.min_spend}`,
      }
    }

    let discount = 0
    if (voucher.discount_type === 'FIXED') {
      discount = Math.min(voucher.discount_amount, orderAmount)
    } else {
      discount = Math.round((orderAmount * voucher.discount_amount) / 100)
    }

    return { isValid: true, discountAmount: discount }
  }

  it('validates and applies fixed amount refund vouchers from rain cancellations', () => {
    const rainVoucher: Voucher = {
      code: 'LLUVIA-A1B2C3',
      discount_amount: 15000,
      discount_type: 'FIXED',
      min_spend: 0,
      expires_at: '2026-11-20T23:59:59Z',
      is_used: false,
    }

    const res = validateVoucher(rainVoucher, 25000, '2026-10-21T10:00:00Z')
    expect(res.isValid).toBe(true)
    expect(res.discountAmount).toBe(15000)
  })

  it('rejects expired vouchers', () => {
    const expiredVoucher: Voucher = {
      code: 'PROMO-VERANO',
      discount_amount: 20,
      discount_type: 'PERCENTAGE',
      min_spend: 5000,
      expires_at: '2026-03-01T00:00:00Z',
      is_used: false,
    }

    const res = validateVoucher(expiredVoucher, 10000, '2026-10-21T10:00:00Z')
    expect(res.isValid).toBe(false)
    expect(res.error).toBe('El cupón se encuentra vencido')
    expect(res.discountAmount).toBe(0)
  })

  it('rejects already used vouchers to prevent double redemption', () => {
    const usedVoucher: Voucher = {
      code: 'BIENVENIDO',
      discount_amount: 5000,
      discount_type: 'FIXED',
      min_spend: 10000,
      expires_at: '2026-12-31T23:59:59Z',
      is_used: true,
    }

    const res = validateVoucher(usedVoucher, 20000, '2026-10-21T10:00:00Z')
    expect(res.isValid).toBe(false)
    expect(res.error).toBe('El cupón ya ha sido utilizado')
  })

  it('enforces minimum purchase spend rules', () => {
    const minSpendVoucher: Voucher = {
      code: 'DESCUENTO50',
      discount_amount: 50,
      discount_type: 'PERCENTAGE',
      min_spend: 30000,
      expires_at: '2026-12-31T23:59:59Z',
      is_used: false,
    }

    // Under minimum spend ($20.000 < $30.000)
    const failRes = validateVoucher(minSpendVoucher, 20000, '2026-10-21T10:00:00Z')
    expect(failRes.isValid).toBe(false)
    expect(failRes.error).toContain('monto mínimo')

    // Above minimum spend ($40.000 >= $30.000) -> 50% discount = $20.000
    const passRes = validateVoucher(minSpendVoucher, 40000, '2026-10-21T10:00:00Z')
    expect(passRes.isValid).toBe(true)
    expect(passRes.discountAmount).toBe(20000)
  })
})
