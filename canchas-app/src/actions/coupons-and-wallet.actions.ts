'use server'

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
