'use server'
// src/actions/cuenta-corriente.actions.ts
// ==============================================================================
// SERVER ACTIONS — Cuenta Corriente de Clientes (Cantina / Fiado / A Cuenta)
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { resolveEffectiveTenantId, assertTenantMember } from '@/lib/auth-security'
import { sanitizeText } from '@/lib/sanitize'

export interface AccountMovement {
  id: string
  date: string
  type: 'CHARGE' | 'PAYMENT'
  amount: number
  description: string
  payment_method?: 'CASH' | 'TRANSFER'
  order_id?: string
}

export interface CustomerAccount {
  id: string
  tenant_id: string
  customer_name: string
  customer_phone: string
  balance: number // > 0 significa saldo deudor (debe al club)
  credit_limit: number
  notes?: string
  movements: AccountMovement[]
  created_at: string
  updated_at: string
}

// ─── Listar Cuentas Corrientes del Club ──────────────────────────────────────

export async function getCustomerAccounts(tenantId?: string): Promise<CustomerAccount[]> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) return []

    const auth = await assertTenantMember(effectiveTenantId)
    if (!auth.authorized) return []

    const supabase = await createServiceClient()

    // 1. Intentar leer desde tabla dedicada customer_accounts si existe
    const { data, error } = await supabase
      .from('customer_accounts')
      .select('*')
      .eq('tenant_id', effectiveTenantId)
      .order('balance', { ascending: false })

    if (!error && data && data.length > 0) {
      return data.map(item => ({
        id: item.id,
        tenant_id: item.tenant_id,
        customer_name: item.customer_name,
        customer_phone: item.customer_phone || '',
        balance: Number(item.balance || 0),
        credit_limit: Number(item.credit_limit || 50000),
        notes: item.notes || '',
        movements: Array.isArray(item.movements) ? item.movements : [],
        created_at: item.created_at,
        updated_at: item.updated_at,
      }))
    }

    // 2. Fallback resiliente a audit_log
    const { data: auditData } = await supabase
      .from('audit_log')
      .select('new_data, created_at')
      .eq('tenant_id', effectiveTenantId)
      .eq('action', 'CUSTOMER_ACCOUNT_SYNC')
      .order('created_at', { ascending: false })
      .limit(1)

    if (auditData && auditData.length > 0 && auditData[0].new_data) {
      const parsed = auditData[0].new_data as { accounts?: CustomerAccount[] }
      if (Array.isArray(parsed.accounts)) {
        return parsed.accounts.sort((a, b) => b.balance - a.balance)
      }
    }

    return []
  } catch (err) {
    console.warn('[getCustomerAccounts] Error:', err)
    return []
  }
}

// ─── Guardar lista de cuentas en persistencia ────────────────────────────────

async function persistCustomerAccounts(
  tenantId: string, 
  accounts: CustomerAccount[]
): Promise<void> {
  const supabase = await createServiceClient()
  try {
    for (const acc of accounts) {
      try {
        await supabase.from('customer_accounts').upsert({
          id: acc.id,
          tenant_id: tenantId,
          customer_name: acc.customer_name,
          customer_phone: acc.customer_phone,
          balance: acc.balance,
          credit_limit: acc.credit_limit,
          notes: acc.notes,
          movements: acc.movements,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })
      } catch {}
    }
  } catch {}

  // Backup garantizado inmutable en audit_log
  try {
    await supabase.from('audit_log').insert({
      tenant_id: tenantId,
      action: 'CUSTOMER_ACCOUNT_SYNC',
      table_name: 'customer_accounts',
      record_id: `sync-${Date.now()}`,
      new_data: { accounts },
    })
  } catch {}
}

// ─── Cargar Consumo / Deuda en Cuenta Corriente ──────────────────────────────

export async function chargeCustomerAccount(params: {
  tenantId: string
  customerName: string
  customerPhone?: string
  amount: number
  description: string
  orderId?: string
}): Promise<{ success: boolean; account?: CustomerAccount; error?: string }> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(params.tenantId)
    if (!effectiveTenantId) return { success: false, error: 'Club no válido' }

    const auth = await assertTenantMember(effectiveTenantId)
    if (!auth.authorized) return { success: false, error: 'No autorizado' }

    const cleanName = sanitizeText(params.customerName || 'Cliente', 60)
    const cleanPhone = (params.customerPhone || '').replace(/[^\d+]/g, '')
    const safeAmount = Math.max(0, Number(params.amount) || 0)

    if (safeAmount <= 0) {
      return { success: false, error: 'El monto del cargo debe ser mayor a 0' }
    }

    const accounts = await getCustomerAccounts(effectiveTenantId)
    let account = accounts.find(
      a => a.customer_name.toLowerCase().trim() === cleanName.toLowerCase().trim()
    )

    const now = new Date().toISOString()
    const newMovement: AccountMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: now,
      type: 'CHARGE',
      amount: safeAmount,
      description: sanitizeText(params.description || 'Consumo en Cantina', 150),
      order_id: params.orderId,
    }

    if (!account) {
      account = {
        id: `acc-${Date.now()}`,
        tenant_id: effectiveTenantId,
        customer_name: cleanName,
        customer_phone: cleanPhone,
        balance: safeAmount,
        credit_limit: 50000,
        notes: 'Cuenta creada automáticamente desde cantina',
        movements: [newMovement],
        created_at: now,
        updated_at: now,
      }
      accounts.push(account)
    } else {
      account.balance += safeAmount
      if (cleanPhone && !account.customer_phone) {
        account.customer_phone = cleanPhone
      }
      account.movements = [newMovement, ...(account.movements || [])].slice(0, 50)
      account.updated_at = now
    }

    await persistCustomerAccounts(effectiveTenantId, accounts)
    revalidatePath('/dashboard/cantina')

    return { success: true, account }
  } catch (err: unknown) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Error al registrar cargo en cuenta corriente' 
    }
  }
}

// ─── Registrar Pago / Saldo de Cuenta Corriente ─────────────────────────────

export async function payCustomerAccount(params: {
  tenantId: string
  accountId: string
  amount: number
  paymentMethod: 'CASH' | 'TRANSFER'
  notes?: string
}): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(params.tenantId)
    if (!effectiveTenantId) return { success: false, error: 'Club no válido' }

    const auth = await assertTenantMember(effectiveTenantId)
    if (!auth.authorized) return { success: false, error: 'No autorizado' }

    const safeAmount = Math.max(0, Number(params.amount) || 0)
    if (safeAmount <= 0) {
      return { success: false, error: 'El monto a saldar debe ser mayor a 0' }
    }

    const accounts = await getCustomerAccounts(effectiveTenantId)
    const account = accounts.find(a => a.id === params.accountId)

    if (!account) {
      return { success: false, error: 'Cuenta corriente no encontrada' }
    }

    const now = new Date().toISOString()
    const methodLabel = params.paymentMethod === 'TRANSFER' ? 'Transferencia' : 'Efectivo'
    const newMovement: AccountMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: now,
      type: 'PAYMENT',
      amount: safeAmount,
      description: `Pago recibido (${methodLabel}) - ${params.notes || 'Cancelación de saldo'}`,
      payment_method: params.paymentMethod,
    }

    account.balance = Math.max(0, account.balance - safeAmount)
    account.movements = [newMovement, ...(account.movements || [])].slice(0, 50)
    account.updated_at = now

    // Impactar en la caja diaria del club
    try {
      const supabase = await createServiceClient()
      await supabase.from('audit_log').insert({
        tenant_id: effectiveTenantId,
        action: 'PAYMENT_RECEIVED',
        table_name: 'payments',
        record_id: `pay-${Date.now()}`,
        new_data: {
          type: 'CUENTA_CORRIENTE_PAYMENT',
          amount: safeAmount,
          payment_method: params.paymentMethod,
          customer_name: account.customer_name,
          notes: `Cobro de Cuenta Corriente: ${account.customer_name}`,
          created_at: now,
        }
      })
    } catch {}

    await persistCustomerAccounts(effectiveTenantId, accounts)
    revalidatePath('/dashboard/cantina')
    revalidatePath('/dashboard/caja')

    return { success: true, newBalance: account.balance }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al registrar cobro'
    }
  }
}

