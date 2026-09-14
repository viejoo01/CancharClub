'use server'

import { createClient } from '@/lib/supabase/server'

export interface CouponValidationResult {
  valid: boolean
  code: string
  discountPct?: number
  discountFixedArs?: number
  discountAmount: number
  message: string
}

export interface PlayerWallet {
  phone: string
  balanceArs: number
  lastUpdated: string
  history: {
    id: string
    date: string
    concept: string
    amountArs: number
    type: 'CREDIT' | 'DEBIT'
  }[]
}

// Cupones activos predeterminados para promociones y marketing
const ACTIVE_COUPONS: Record<string, { pct?: number; fixed?: number; desc: string }> = {
  CANCHAR20: { pct: 20, desc: '20% de descuento en tu turno' },
  BIENVENIDO: { fixed: 2000, desc: '$2.000 de descuento de bienvenida' },
  PADEL10: { pct: 10, desc: '10% OFF para aficionados al pádel' },
  FUTBOL15: { pct: 15, desc: '15% OFF en turnos de fútbol' },
  LLUVIA100: { pct: 100, desc: 'Pase libre por protocolo de lluvia reprogramado' }
}

// Simulación de billeteras de jugadores (sincronizada en memoria / base de datos)
const MOCK_WALLETS: Record<string, PlayerWallet> = {
  '3814123456': {
    phone: '3814123456',
    balanceArs: 4500,
    lastUpdated: '2026-09-12',
    history: [
      {
        id: 'tx-1',
        date: '2026-09-12',
        concept: 'Crédito automático por lluvia (Tormenta Tucumán)',
        amountArs: 4500,
        type: 'CREDIT'
      }
    ]
  },
  '3815998877': {
    phone: '3815998877',
    balanceArs: 7000,
    lastUpdated: '2026-09-10',
    history: [
      {
        id: 'tx-2',
        date: '2026-09-10',
        concept: 'Cancelación con 24hs de anticipación',
        amountArs: 7000,
        type: 'CREDIT'
      }
    ]
  }
}

export async function validateCouponAction(
  rawCode: string,
  totalArs: number
): Promise<CouponValidationResult> {
  const code = (rawCode || '').trim().toUpperCase()
  if (!code) {
    return { valid: false, code: '', discountAmount: 0, message: 'Ingresá un código de cupón' }
  }

  const promo = ACTIVE_COUPONS[code]
  if (!promo) {
    return {
      valid: false,
      code,
      discountAmount: 0,
      message: 'El código ingresado no existe o ya caducó'
    }
  }

  let discount = 0
  if (promo.pct) {
    discount = Math.round((totalArs * promo.pct) / 100)
  } else if (promo.fixed) {
    discount = Math.min(promo.fixed, totalArs)
  }

  return {
    valid: true,
    code,
    discountPct: promo.pct,
    discountFixedArs: promo.fixed,
    discountAmount: discount,
    message: `¡Cupón ${code} aplicado! ${promo.desc}`
  }
}

export async function getPlayerWalletBalance(rawPhone: string): Promise<PlayerWallet> {
  const cleanPhone = (rawPhone || '').replace(/\D/g, '')
  const wallet = MOCK_WALLETS[cleanPhone]
  if (wallet) {
    return wallet
  }

  return {
    phone: cleanPhone,
    balanceArs: 0,
    lastUpdated: new Date().toISOString().split('T')[0],
    history: []
  }
}

export async function applyWalletCreditAction(
  rawPhone: string,
  amountToUse: number
): Promise<{ success: boolean; appliedAmount: number; remainingBalance: number; error?: string }> {
  const cleanPhone = (rawPhone || '').replace(/\D/g, '')
  const wallet = MOCK_WALLETS[cleanPhone]

  if (!wallet || wallet.balanceArs <= 0) {
    return { success: false, appliedAmount: 0, remainingBalance: 0, error: 'No disponés de saldo a favor' }
  }

  const deduct = Math.min(wallet.balanceArs, amountToUse)
  wallet.balanceArs -= deduct
  wallet.history.push({
    id: `tx-${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    concept: 'Pago parcial de seña con saldo a favor',
    amountArs: deduct,
    type: 'DEBIT'
  })

  return {
    success: true,
    appliedAmount: deduct,
    remainingBalance: wallet.balanceArs
  }
}
