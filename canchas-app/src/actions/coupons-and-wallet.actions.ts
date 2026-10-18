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
  if (cleanPhone.length < 8 || !tenantId || !tenantId.trim()) {
    return {
      phone: cleanPhone || '',
      balanceArs: 0,
      lastUpdated: getArgentinaTodayIso(),
      history: []
    }
  }

  try {
    const supabase = await createServiceClient()
    const cleanTenantId = tenantId.trim()
    const { data: credits, error } = await supabase
      .from('customer_credits')
      .select('id, amount_ars, status, reason, created_at, used_at, expires_at')
      .eq('tenant_id', cleanTenantId)
      .or(orCondition)

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
  tenantId?: string,
  bookingId?: string
): Promise<{ success: boolean; appliedAmount: number; remainingBalance: number; error?: string }> {
  const { cleanPhone, orCondition } = getPhoneSearchVariants(rawPhone)
  if (cleanPhone.length < 8) {
    return { success: false, appliedAmount: 0, remainingBalance: 0, error: 'Número de teléfono inválido' }
  }

  if (!tenantId || !tenantId.trim()) {
    return { success: false, appliedAmount: 0, remainingBalance: 0, error: 'Identificador del club requerido para aplicar saldo a favor' }
  }

  if (typeof amountToUse !== 'number' || !Number.isFinite(amountToUse) || amountToUse <= 0) {
    return { success: false, appliedAmount: 0, remainingBalance: 0, error: 'Monto a aplicar inválido' }
  }

  try {
    const nowIso = new Date().toISOString()
    const cleanTenantId = tenantId.trim()
    const supabase = await createServiceClient()
    const { data: availableCredits, error } = await supabase
      .from('customer_credits')
      .select('id, amount_ars, status, expires_at, customer_phone, customer_name')
      .eq('tenant_id', cleanTenantId)
      .or(orCondition)
      .eq('status', 'AVAILABLE')
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('created_at', { ascending: true })

    if (error || !availableCredits || availableCredits.length === 0) {
      return { success: false, appliedAmount: 0, remainingBalance: 0, error: 'No disponés de saldo a favor' }
    }

    const totalAvailable = availableCredits.reduce((sum, c) => sum + (Number(c.amount_ars) || 0), 0)
    let needed = Math.min(totalAvailable, Math.round(amountToUse))
    let actuallyDeducted = 0

    for (const credit of availableCredits) {
      if (needed <= 0) break
      if (credit.expires_at && credit.expires_at <= nowIso) continue
      const creditAmt = Number(credit.amount_ars) || 0
      if (creditAmt <= 0) continue

      if (creditAmt <= needed) {
        const updateFields: Record<string, unknown> = {
          status: 'USED',
          used_at: nowIso,
        }
        if (bookingId) {
          updateFields.reason = `Utilizado en reserva ${bookingId.slice(0, 8)}`
          updateFields.source_booking_id = bookingId
        }

        const { data: updated, error: updateErr } = await supabase
          .from('customer_credits')
          .update(updateFields)
          .eq('id', credit.id)
          .eq('status', 'AVAILABLE')
          .select('id')

        // Si otra transacción concurrente ya consumió este crédito, continuar con el siguiente
        if (updateErr || !updated || updated.length === 0) {
          continue
        }

        needed -= creditAmt
        actuallyDeducted += creditAmt
      } else {
        // Consumo parcial: separar en porción consumida (USED) y porción remanente (AVAILABLE)
        const consumedAmount = needed
        const remaining = creditAmt - consumedAmount

        const { data: updated, error: updateErr } = await supabase
          .from('customer_credits')
          .update({
            amount_ars: remaining,
          })
          .eq('id', credit.id)
          .eq('status', 'AVAILABLE')
          .eq('amount_ars', creditAmt)
          .select('id')

        if (updateErr || !updated || updated.length === 0) {
          continue
        }

        // Registrar formalmente la parte consumida como USED vinculada a la reserva
        await supabase.from('customer_credits').insert({
          tenant_id: cleanTenantId,
          customer_phone: credit.customer_phone || '',
          customer_name: credit.customer_name || 'Cliente',
          amount_ars: consumedAmount,
          status: 'USED',
          source_booking_id: bookingId || null,
          reason: bookingId ? `Utilizado en reserva ${bookingId.slice(0, 8)}` : 'Utilizado en reserva',
          used_at: nowIso,
          expires_at: credit.expires_at || null,
        })

        actuallyDeducted += consumedAmount
        needed = 0
      }
    }

    if (actuallyDeducted === 0) {
      return {
        success: false,
        appliedAmount: 0,
        remainingBalance: 0,
        error: 'El saldo ya fue utilizado en otra operación o no está disponible'
      }
    }

    const remainingBalance = Math.max(0, totalAvailable - actuallyDeducted)

    return {
      success: true,
      appliedAmount: actuallyDeducted,
      remainingBalance
    }
  } catch (err) {
    console.error('[applyWalletCreditAction] Error:', err)
    return { success: false, appliedAmount: 0, remainingBalance: 0, error: 'Error al aplicar saldo a favor' }
  }
}

/**
 * Reembolsa saldo a favor en caso de que una reserva falle posteriormente.
 */
export async function refundWalletCreditAction(
  rawPhone: string,
  amountToRefund: number,
  tenantId: string,
  reason = 'Reversión por checkout fallido'
): Promise<{ success: boolean; error?: string }> {
  const cleanPhone = (rawPhone || '').replace(/\D/g, '')
  if (cleanPhone.length < 8 || !tenantId || amountToRefund <= 0) {
    return { success: false, error: 'Parámetros inválidos para reembolso' }
  }

  try {
    const supabase = await createServiceClient()
    await supabase.from('customer_credits').insert({
      tenant_id: tenantId.trim(),
      customer_phone: cleanPhone,
      customer_name: 'Jugador',
      amount_ars: Math.round(amountToRefund),
      status: 'AVAILABLE',
      reason,
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    })
    return { success: true }
  } catch (err) {
    console.error('[refundWalletCreditAction] Error:', err)
    return { success: false, error: 'Error al reincorporar saldo' }
  }
}

/**
 * Reintegra de forma atómica créditos de billetera virtual consumidos en una reserva al cancelarse.
 */
export async function refundWalletCreditForBooking(
  tenantId: string,
  bookingId: string
): Promise<{ success: boolean; refundedCount?: number }> {
  if (!tenantId || !bookingId) return { success: false }

  try {
    const supabase = await createServiceClient()
    const shortId = bookingId.slice(0, 8)

    const { data: usedCredits, error: findErr } = await supabase
      .from('customer_credits')
      .select('id, amount_ars, reason')
      .eq('tenant_id', tenantId)
      .eq('status', 'USED')
      .or(`source_booking_id.eq.${bookingId},reason.ilike.%${shortId}%`)

    if (findErr || !usedCredits || usedCredits.length === 0) {
      return { success: true, refundedCount: 0 }
    }

    for (const credit of usedCredits) {
      await supabase
        .from('customer_credits')
        .update({
          status: 'AVAILABLE',
          reason: `Saldo reintegrado por cancelación de reserva ${shortId}`,
          used_at: null,
          source_booking_id: null,
        })
        .eq('id', credit.id)
    }

    return { success: true, refundedCount: usedCredits.length }
  } catch (err) {
    console.warn('[refundWalletCreditForBooking] Error:', err)
    return { success: false }
  }
}

