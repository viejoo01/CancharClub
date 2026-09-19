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

// Registro dinámico de saldo a favor de jugadores (generado por cancelaciones reales o recargas)
const ACTIVE_WALLETS: Record<string, PlayerWallet> = {}



export async function getPlayerWalletBalance(rawPhone: string): Promise<PlayerWallet> {
  const cleanPhone = (rawPhone || '').replace(/\D/g, '')
  const wallet = ACTIVE_WALLETS[cleanPhone]
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
  const wallet = ACTIVE_WALLETS[cleanPhone]

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
