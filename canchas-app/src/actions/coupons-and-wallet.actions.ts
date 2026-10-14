'use server'

import { createServiceClient } from '@/lib/supabase/server'

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

/**
 * Consulta el saldo a favor de un jugador directamente desde la tabla persistente customer_credits
 */
export async function getPlayerWalletBalance(rawPhone: string, tenantId?: string): Promise<PlayerWallet> {
  const cleanPhone = (rawPhone || '').replace(/\D/g, '')
  if (cleanPhone.length < 8) {
    return {
      phone: '',
      balanceArs: 0,
      lastUpdated: new Date().toISOString().split('T')[0],
      history: []
    }
  }

  try {
    const supabase = await createServiceClient()
    let query = supabase
      .from('customer_credits')
      .select('id, amount_ars, status, reason, created_at, used_at')
      .eq('customer_phone', cleanPhone)

    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }

    const { data: credits, error } = await query

    if (error || !credits) {
      return {
        phone: cleanPhone,
        balanceArs: 0,
        lastUpdated: new Date().toISOString().split('T')[0],
        history: []
      }
    }

    const now = new Date()
    const availableCredits = credits.filter(c => c.status === 'AVAILABLE')
    const balanceArs = availableCredits.reduce((sum, c) => sum + (Number(c.amount_ars) || 0), 0)

    const history = credits.map(c => ({
      id: c.id,
      date: (c.created_at || now.toISOString()).split('T')[0],
      concept: c.reason || 'Saldo a favor por cancelación',
      amountArs: Number(c.amount_ars) || 0,
      type: (c.status === 'USED' ? 'DEBIT' : 'CREDIT') as 'CREDIT' | 'DEBIT'
    }))

    return {
      phone: cleanPhone,
      balanceArs,
      lastUpdated: now.toISOString().split('T')[0],
      history
    }
  } catch (err) {
    console.error('[getPlayerWalletBalance] Error querying customer_credits:', err)
    return {
      phone: cleanPhone,
      balanceArs: 0,
      lastUpdated: new Date().toISOString().split('T')[0],
      history: []
    }
  }
}

/**
 * Aplica saldo a favor de la billetera persistente del cliente (customer_credits) descontando
 * el monto de los créditos disponibles en base de datos.
 */
export async function applyWalletCreditAction(
  rawPhone: string,
  amountToUse: number,
  tenantId?: string
): Promise<{ success: boolean; appliedAmount: number; remainingBalance: number; error?: string }> {
  const cleanPhone = (rawPhone || '').replace(/\D/g, '')
  if (cleanPhone.length < 8) {
    return { success: false, appliedAmount: 0, remainingBalance: 0, error: 'Número de teléfono inválido' }
  }

  if (typeof amountToUse !== 'number' || !Number.isFinite(amountToUse) || amountToUse <= 0) {
    return { success: false, appliedAmount: 0, remainingBalance: 0, error: 'Monto a aplicar inválido' }
  }

  try {
    const supabase = await createServiceClient()
    let query = supabase
      .from('customer_credits')
      .select('id, amount_ars, status')
      .eq('customer_phone', cleanPhone)
      .eq('status', 'AVAILABLE')
      .order('created_at', { ascending: true })

    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }

    const { data: availableCredits, error } = await query

    if (error || !availableCredits || availableCredits.length === 0) {
      return { success: false, appliedAmount: 0, remainingBalance: 0, error: 'No disponés de saldo a favor' }
    }

    const totalAvailable = availableCredits.reduce((sum, c) => sum + (Number(c.amount_ars) || 0), 0)
    let needed = Math.min(totalAvailable, Math.round(amountToUse))
    const totalDeducted = needed

    const nowIso = new Date().toISOString()

    for (const credit of availableCredits) {
      if (needed <= 0) break
      const creditAmt = Number(credit.amount_ars) || 0

      if (creditAmt <= needed) {
        // Consumir el crédito completo
        await supabase
          .from('customer_credits')
          .update({
            status: 'USED',
            used_at: nowIso,
          })
          .eq('id', credit.id)
        needed -= creditAmt
      } else {
        // Consumo parcial: reducir el monto del crédito disponible
        const remaining = creditAmt - needed
        await supabase
          .from('customer_credits')
          .update({
            amount_ars: remaining,
          })
          .eq('id', credit.id)
        needed = 0
      }
    }

    const remainingBalance = Math.max(0, totalAvailable - totalDeducted)

    return {
      success: true,
      appliedAmount: totalDeducted,
      remainingBalance
    }
  } catch (err) {
    console.error('[applyWalletCreditAction] Error:', err)
    return { success: false, appliedAmount: 0, remainingBalance: 0, error: 'Error al aplicar saldo a favor' }
  }
}
