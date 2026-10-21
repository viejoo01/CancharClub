import { describe, it, expect } from 'vitest'
import { buildDebtWhatsAppReminder } from '@/lib/cuenta-corriente-utils'
import type { CustomerAccount } from '@/actions/cuenta-corriente.actions'

describe('Cantina & Fast POS Financial Engine', () => {
  describe('Cart & POS Item Computation', () => {
    interface CartItem {
      id: string
      name: string
      unitPrice: number
      quantity: number
    }

    function calculateOrderTotal(
      items: CartItem[],
      discountPct = 0,
      surchargePct = 0
    ): { subtotal: number; discount: number; surcharge: number; total: number } {
      const subtotal = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0)
      const discount = Math.round((subtotal * discountPct) / 100)
      const surcharge = Math.round((subtotal * surchargePct) / 100)
      const total = subtotal - discount + surcharge
      return { subtotal, discount, surcharge, total }
    }

    it('calculates subtotal and item totals accurately', () => {
      const items: CartItem[] = [
        { id: '1', name: 'Gatorade 500ml', unitPrice: 3500, quantity: 4 }, // 14000
        { id: '2', name: 'Tubo Pelotas Pádel', unitPrice: 18000, quantity: 1 }, // 18000
        { id: '3', name: 'Barrita Cereal', unitPrice: 1200, quantity: 2 }, // 2400
      ]

      const { subtotal, discount, surcharge, total } = calculateOrderTotal(items)
      expect(subtotal).toBe(34400)
      expect(discount).toBe(0)
      expect(surcharge).toBe(0)
      expect(total).toBe(34400)
    })

    it('applies member discounts and payment method surcharges correctly', () => {
      const items: CartItem[] = [
        { id: '1', name: 'Cerveza Patagonia', unitPrice: 5000, quantity: 2 }, // 10000
      ]

      // 10% descuento socio
      const withDiscount = calculateOrderTotal(items, 10, 0)
      expect(withDiscount.subtotal).toBe(10000)
      expect(withDiscount.discount).toBe(1000)
      expect(withDiscount.total).toBe(9000)

      // 15% recargo tarjeta de crédito
      const withSurcharge = calculateOrderTotal(items, 0, 15)
      expect(withSurcharge.surcharge).toBe(1500)
      expect(withSurcharge.total).toBe(11500)
    })
  })

  describe('Split Payment Reconciliation', () => {
    interface PaymentSplit {
      method: 'CASH' | 'MP_QR' | 'TRANSFER' | 'CUENTA_CORRIENTE'
      amount: number
    }

    function validatePaymentSplits(totalDue: number, splits: PaymentSplit[]): {
      isComplete: boolean
      totalPaid: number
      remainingBalance: number
    } {
      const totalPaid = splits.reduce((acc, s) => acc + s.amount, 0)
      const remainingBalance = totalDue - totalPaid
      return {
        isComplete: totalPaid === totalDue,
        totalPaid,
        remainingBalance,
      }
    }

    it('validates exact split payments combining Cash, MP QR and Cuenta Corriente', () => {
      const totalDue = 45000
      const splits: PaymentSplit[] = [
        { method: 'CASH', amount: 15000 },
        { method: 'MP_QR', amount: 20000 },
        { method: 'CUENTA_CORRIENTE', amount: 10000 },
      ]

      const result = validatePaymentSplits(totalDue, splits)
      expect(result.isComplete).toBe(true)
      expect(result.remainingBalance).toBe(0)
    })

    it('flags incomplete or overpaid payments', () => {
      const totalDue = 50000
      const partialSplits: PaymentSplit[] = [
        { method: 'CASH', amount: 30000 },
      ]

      const res = validatePaymentSplits(totalDue, partialSplits)
      expect(res.isComplete).toBe(false)
      expect(res.remainingBalance).toBe(20000)
    })
  })

  describe('Cuenta Corriente Ledger & Debt Reminder Generator', () => {
    it('generates a compliant WhatsApp reminder message with customer debt and bank alias', () => {
      const mockAccount: CustomerAccount = {
        id: 'acc-1',
        tenant_id: 'tenant-10',
        customer_name: 'Martín Palermo',
        customer_phone: '+5491198765432',
        balance: 24500,
        credit_limit: 50000,
        movements: [
          {
            id: 'm-1',
            date: '2026-10-20',
            type: 'CHARGE',
            amount: 15000,
            description: 'Consumo Cantina - 2 Cervezas y Papas',
          },
          {
            id: 'm-2',
            date: '2026-10-21',
            type: 'CHARGE',
            amount: 9500,
            description: 'Alquiler Paleta Pádel',
          },
        ],
        created_at: '2026-01-01',
        updated_at: '2026-10-21',
      }

      const reminderLink = buildDebtWhatsAppReminder(mockAccount, 'Club Central Pádel', 'CLUB.CENTRAL.PADEL')
      
      expect(reminderLink).toContain('phone=5491198765432')
      expect(reminderLink).toContain('Mart%C3%ADn%20Palermo')
      expect(reminderLink).toContain('CLUB.CENTRAL.PADEL')
    })
  })
})
