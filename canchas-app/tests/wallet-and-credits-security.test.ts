import { describe, it, expect } from 'vitest'

describe('Customer Credits, Wallet & Double Spending Security Audit', () => {
  describe('1. Concurrency & Partial Credit Consumption Logic', () => {
    interface CreditRow {
      id: string
      amount_ars: number
      status: 'AVAILABLE' | 'USED' | 'EXPIRED'
      source_booking_id: string | null
      used_at: string | null
    }

    function consumeCreditsSimulated(
      credits: CreditRow[],
      amountToUse: number,
      bookingId: string
    ): {
      success: boolean
      appliedAmount: number
      remainingBalance: number
      updatedCredits: CreditRow[]
      error?: string
    } {
      if (amountToUse <= 0) {
        return { success: false, appliedAmount: 0, remainingBalance: 0, updatedCredits: credits, error: 'Monto inválido' }
      }

      const available = credits.filter(c => c.status === 'AVAILABLE')
      const totalAvailable = available.reduce((acc, c) => acc + c.amount_ars, 0)

      if (totalAvailable <= 0) {
        return { success: false, appliedAmount: 0, remainingBalance: 0, updatedCredits: credits, error: 'Sin saldo' }
      }

      let needed = Math.min(totalAvailable, amountToUse)
      let actuallyDeducted = 0
      const list = [...credits]

      for (let i = 0; i < list.length; i++) {
        if (needed <= 0) break
        const c = list[i]
        if (c.status !== 'AVAILABLE') continue

        if (c.amount_ars <= needed) {
          // Consumo total
          actuallyDeducted += c.amount_ars
          needed -= c.amount_ars
          list[i] = {
            ...c,
            status: 'USED',
            source_booking_id: bookingId,
            used_at: new Date().toISOString(),
          }
        } else {
          // Consumo parcial: divide en remanente y consumido
          const consumed = needed
          const remainder = c.amount_ars - consumed
          actuallyDeducted += consumed
          needed = 0

          list[i] = {
            ...c,
            amount_ars: remainder,
            status: 'AVAILABLE',
          }

          list.push({
            id: `used-${c.id}`,
            amount_ars: consumed,
            status: 'USED',
            source_booking_id: bookingId,
            used_at: new Date().toISOString(),
          })
        }
      }

      const remainingBalance = Math.max(0, totalAvailable - actuallyDeducted)
      return {
        success: true,
        appliedAmount: actuallyDeducted,
        remainingBalance,
        updatedCredits: list,
      }
    }

    it('correctly splits a $10.000 credit when a booking requires $4.000', () => {
      const initialCredits: CreditRow[] = [
        {
          id: 'cred-1',
          amount_ars: 10000,
          status: 'AVAILABLE',
          source_booking_id: null,
          used_at: null,
        },
      ]

      const res = consumeCreditsSimulated(initialCredits, 4000, 'b-123')
      expect(res.success).toBe(true)
      expect(res.appliedAmount).toBe(4000)
      expect(res.remainingBalance).toBe(6000)

      // Verificar división de registros
      const availableRows = res.updatedCredits.filter(c => c.status === 'AVAILABLE')
      const usedRows = res.updatedCredits.filter(c => c.status === 'USED')

      expect(availableRows).toHaveLength(1)
      expect(availableRows[0].amount_ars).toBe(6000)

      expect(usedRows).toHaveLength(1)
      expect(usedRows[0].amount_ars).toBe(4000)
      expect(usedRows[0].source_booking_id).toBe('b-123')
    })

    it('rejects double-spending when balance is 0 or already USED', () => {
      const usedCredits: CreditRow[] = [
        {
          id: 'cred-1',
          amount_ars: 5000,
          status: 'USED',
          source_booking_id: 'b-old',
          used_at: new Date().toISOString(),
        },
      ]

      const res = consumeCreditsSimulated(usedCredits, 5000, 'b-new')
      expect(res.success).toBe(false)
      expect(res.appliedAmount).toBe(0)
      expect(res.error).toBe('Sin saldo')
    })
  })

  describe('2. Checkout Free-Booking Vulnerability Prevention', () => {
    function calculateFinalDepositWithWallet(params: {
      officialDepositArs: number
      declaredDepositArs: number
      walletRequestedArs: number
      walletBalanceArs: number
    }): {
      allowed: boolean
      finalDepositArs: number
      walletAppliedArs: number
      errorCode?: string
    } {
      const { officialDepositArs, declaredDepositArs, walletRequestedArs, walletBalanceArs } = params

      let walletActuallyAppliedArs = 0
      if (walletRequestedArs > 0) {
        const maxApplicableWallet = Math.min(walletRequestedArs, officialDepositArs)
        if (walletBalanceArs < maxApplicableWallet) {
          return {
            allowed: false,
            finalDepositArs: officialDepositArs,
            walletAppliedArs: 0,
            errorCode: 'INSUFFICIENT_WALLET_BALANCE',
          }
        }
        walletActuallyAppliedArs = maxApplicableWallet
      }

      const finalDepositArs = Math.max(0, officialDepositArs - walletActuallyAppliedArs)

      // Prevención de bypass: si el cliente declaró seña 0 pero no cubrió la seña con saldo legítimo
      if (
        officialDepositArs > 0 &&
        finalDepositArs > 0 &&
        declaredDepositArs <= 0 &&
        walletActuallyAppliedArs < officialDepositArs
      ) {
        return {
          allowed: false,
          finalDepositArs,
          walletAppliedArs: 0,
          errorCode: 'INVALID_DEPOSIT_AMOUNT',
        }
      }

      return {
        allowed: true,
        finalDepositArs,
        walletAppliedArs: walletActuallyAppliedArs,
      }
    }

    it('blocks attacker trying to get a free booking by sending deposit 0 without wallet credit', () => {
      const res = calculateFinalDepositWithWallet({
        officialDepositArs: 5000,
        declaredDepositArs: 0,
        walletRequestedArs: 0,
        walletBalanceArs: 0,
      })

      expect(res.allowed).toBe(false)
      expect(res.errorCode).toBe('INVALID_DEPOSIT_AMOUNT')
    })

    it('blocks attacker trying to claim $5000 wallet credit with $0 real wallet balance', () => {
      const res = calculateFinalDepositWithWallet({
        officialDepositArs: 5000,
        declaredDepositArs: 0,
        walletRequestedArs: 5000,
        walletBalanceArs: 0,
      })

      expect(res.allowed).toBe(false)
      expect(res.errorCode).toBe('INSUFFICIENT_WALLET_BALANCE')
    })

    it('allows genuine player with sufficient wallet credit to cover the full deposit', () => {
      const res = calculateFinalDepositWithWallet({
        officialDepositArs: 5000,
        declaredDepositArs: 0,
        walletRequestedArs: 5000,
        walletBalanceArs: 8000,
      })

      expect(res.allowed).toBe(true)
      expect(res.finalDepositArs).toBe(0)
      expect(res.walletAppliedArs).toBe(5000)
    })

    it('correctly handles partial wallet coverage ($2000 credit on $5000 deposit -> $3000 cash/transfer)', () => {
      const res = calculateFinalDepositWithWallet({
        officialDepositArs: 5000,
        declaredDepositArs: 3000,
        walletRequestedArs: 2000,
        walletBalanceArs: 2000,
      })

      expect(res.allowed).toBe(true)
      expect(res.finalDepositArs).toBe(3000)
      expect(res.walletAppliedArs).toBe(2000)
    })
  })

  describe('3. Rain Protocol Credit Qualification Rules', () => {
    function qualifyBookingForRainCredit(booking: {
      status: string
      deposit_cents: number
      hasAccreditedPayment: boolean
    }): { eligible: boolean; creditedArs: number } {
      const normalized = booking.status.toLowerCase()
      const isConfirmedPaid = ['confirmed', 'confirmed_cash', 'completed', 'deposit_paid'].includes(normalized)

      let eligible = isConfirmedPaid
      if (!eligible && normalized === 'pending_deposit') {
        if (booking.hasAccreditedPayment) {
          eligible = true
        }
      }

      const creditedArs = eligible ? Math.round((Number(booking.deposit_cents) || 0) / 100) : 0
      return { eligible, creditedArs }
    }

    it('does NOT issue credit for unpaid pending_deposit bookings', () => {
      const res = qualifyBookingForRainCredit({
        status: 'pending_deposit',
        deposit_cents: 600000, // $6.000 ARS
        hasAccreditedPayment: false,
      })

      expect(res.eligible).toBe(false)
      expect(res.creditedArs).toBe(0)
    })

    it('issues credit for confirmed bookings with accredited deposit', () => {
      const res = qualifyBookingForRainCredit({
        status: 'confirmed',
        deposit_cents: 600000, // $6.000 ARS
        hasAccreditedPayment: true,
      })

      expect(res.eligible).toBe(true)
      expect(res.creditedArs).toBe(6000)
    })
  })

  describe('4. Advance Cancellation Notice Window (cancellation_hours)', () => {
    function canPlayerCancel(
      slotStartTimeIso: string,
      currentTimeIso: string,
      cancellationHours: number
    ): { allowed: boolean; error?: string } {
      const slotMs = new Date(slotStartTimeIso).getTime()
      const nowMs = new Date(currentTimeIso).getTime()

      if (slotMs <= nowMs) {
        return { allowed: false, error: 'El turno ya comenzó o ha transcurrido.' }
      }

      const noticeHours = (slotMs - nowMs) / (1000 * 60 * 60)
      if (noticeHours < cancellationHours) {
        return {
          allowed: false,
          error: `Se requiere al menos ${cancellationHours} hs de anticipación.`,
        }
      }

      return { allowed: true }
    }

    it('blocks player from cancelling 2 hours before game when club requires 24h notice', () => {
      const res = canPlayerCancel(
        '2026-10-28T20:00:00Z',
        '2026-10-28T18:00:00Z', // 2 hours prior
        24
      )
      expect(res.allowed).toBe(false)
      expect(res.error).toContain('24 hs de anticipación')
    })

    it('allows player cancellation when made 30 hours in advance with 24h policy', () => {
      const res = canPlayerCancel(
        '2026-10-29T20:00:00Z',
        '2026-10-28T14:00:00Z', // 30 hours prior
        24
      )
      expect(res.allowed).toBe(true)
    })
  })

  describe('5. Phone Number Normalization & Cross-Area Collision Prevention', () => {
    function normalizeArgentinePhoneVariants(raw: string): string[] {
      const clean = (raw || '').replace(/\D/g, '')
      const variants = new Set<string>()
      if (clean) {
        variants.add(clean)
        variants.add(`+${clean}`)
        let national = clean
        if (clean.startsWith('549') && clean.length >= 11) {
          national = clean.slice(3)
        } else if (clean.startsWith('54') && clean.length >= 10) {
          national = clean.slice(2)
        } else if (clean.startsWith('0') && clean.length >= 10) {
          national = clean.slice(1)
        }

        if (national.length >= 8) {
          variants.add(national)
          variants.add(`549${national}`)
          variants.add(`+549${national}`)
          variants.add(`54${national}`)
          variants.add(`+54${national}`)
          variants.add(`0${national}`)
        }
      }
      return Array.from(variants)
    }

    it('normalizes +5493814123456 and matches 3814123456 without colliding with 3514123456', () => {
      const tucumanVariants = normalizeArgentinePhoneVariants('+5493814123456')
      const cordobaVariants = normalizeArgentinePhoneVariants('+5493514123456')

      expect(tucumanVariants).toContain('3814123456')
      expect(tucumanVariants).toContain('5493814123456')
      expect(tucumanVariants).not.toContain('3514123456')

      // Ensure no intersection between two numbers from different area codes having same local digits
      const intersection = tucumanVariants.filter(v => cordobaVariants.includes(v))
      expect(intersection).toHaveLength(0)
    })
  })
})
