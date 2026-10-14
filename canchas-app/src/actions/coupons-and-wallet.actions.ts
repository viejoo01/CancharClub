'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { getArgentinaTodayIso } from '@/lib/utils'

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

function getPhoneSearchVariants(rawPhone: string): { cleanPhone: string; orCondition: string } {
  const clean = (rawPhone || '').replace(/\D/g, '')
  const suffix = clean.length >= 8 ? clean.slice(-8) : clean
  const variants = new Set<string>()
  if (clean) {
    variants.add(clean)
    variants.add(`+${clean}`)
    if (clean.startsWith('549')) {
      const local = clean.slice(3)
      variants.add(local)
    } else if (clean.startsWith('54')) {
      const local = clean.slice(2)
      variants.add(local)
      variants.add(`549${local}`)
    } else {
      variants.add(`549${clean}`)
      variants.add(`+549${clean}`)
    }
  }

  const conditions = [
    ...Array.from(variants).map(v => `customer_phone.eq."${v}"`),
    ...(suffix ? [`customer_phone.ilike."%${suffix}%"`] : []),
  ]

  return { cleanPhone: clean, orCondition: conditions.join(',') }
}

/**
 * Consulta el saldo a favor de un jugador directamente desde la tabla persistente customer_credits
 */
export async function getPlayerWalletBalance(rawPhone: string, tenantId?: string): Promise<PlayerWallet> {
  const { cleanPhone, orCondition } = getPhoneSearchVariants(rawPhone)
  if (cleanPhone.length < 8) {
    return {
      phone: '',
      balanceArs: 0,
      lastUpdated: getArgentinaTodayIso(),
      history: []
    }
  }

  try {
    const supabase = await createServiceClient()
    let query = supabase
      .from('customer_credits')
      .select('id, amount_ars, status, reason, created_at, used_at, expires_at')
      .or(orCondition)

    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }

    const { data: credits, error } = await query

    if (error || !credits) {
      return {
        phone: cleanPhone,
        balanceArs: 0,
        lastUpdated: getArgentinaTodayIso(),
        history: []
      }
    }

    const now = new Date()
    const nowIso = now.toISOString()
    const availableCredits = credits.filter(c => {
      const isAvailable = c.status === 'AVAILABLE'
      const notExpired = !c.expires_at || c.expires_at > nowIso
      return isAvailable && notExpired
    })
    const balanceArs = availableCredits.reduce((sum, c) => sum + (Number(c.amount_ars) || 0), 0)

    const history = credits.map(c => {
      const isExpired = c.status === 'AVAILABLE' && Boolean(c.expires_at && c.expires_at <= nowIso)
      return {
        id: c.id,
        date: c.created_at ? getArgentinaTodayIso(new Date(c.created_at)) : getArgentinaTodayIso(),
        concept: isExpired ? `${c.reason || 'Saldo a favor'} (Vencido)` : (c.reason || 'Saldo a favor por cancelación'),
        amountArs: Number(c.amount_ars) || 0,
        type: (c.status === 'USED' ? 'DEBIT' : 'CREDIT') as 'CREDIT' | 'DEBIT'
      }
    })

    return {
      phone: cleanPhone,
      balanceArs,
      lastUpdated: getArgentinaTodayIso(),
      history
    }
  } catch (err) {
    console.error('[getPlayerWalletBalance] Error querying customer_credits:', err)
    return {
      phone: cleanPhone,
      balanceArs: 0,
      lastUpdated: getArgentinaTodayIso(),
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
  const { cleanPhone, orCondition } = getPhoneSearchVariants(rawPhone)
  if (cleanPhone.length < 8) {
    return { success: false, appliedAmount: 0, remainingBalance: 0, error: 'Número de teléfono inválido' }
  }

  if (typeof amountToUse !== 'number' || !Number.isFinite(amountToUse) || amountToUse <= 0) {
    return { success: false, appliedAmount: 0, remainingBalance: 0, error: 'Monto a aplicar inválido' }
  }

  try {
    const nowIso = new Date().toISOString()
    const supabase = await createServiceClient()
    let query = supabase
      .from('customer_credits')
      .select('id, amount_ars, status, expires_at')
      .or(orCondition)
      .eq('status', 'AVAILABLE')
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
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

    for (const credit of availableCredits) {
      if (needed <= 0) break
      if (credit.expires_at && credit.expires_at <= nowIso) continue
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
