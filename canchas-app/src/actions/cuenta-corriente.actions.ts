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

// Cache en memoria para apertura instantánea (TTL 60s)
const customerAccountsCache = new Map<string, { data: CustomerAccount[]; timestamp: number }>()
const CUENTA_CORRIENTE_CACHE_TTL_MS = 60000

export async function invalidateCustomerAccountsCache(tenantId?: string) {
  if (tenantId) {
    customerAccountsCache.delete(tenantId)
  } else {
    customerAccountsCache.clear()
  }
}

// ─── Listar Cuentas Corrientes del Club ──────────────────────────────────────

export async function getCustomerAccounts(tenantId?: string): Promise<CustomerAccount[]> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) return []

    const cached = customerAccountsCache.get(effectiveTenantId)
    if (cached && Date.now() - cached.timestamp < CUENTA_CORRIENTE_CACHE_TTL_MS) {
      return cached.data
    }

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
      const result = data.map(item => ({
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
      customerAccountsCache.set(effectiveTenantId, { data: result, timestamp: Date.now() })
      return result
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
        const result = parsed.accounts.sort((a, b) => b.balance - a.balance)
        customerAccountsCache.set(effectiveTenantId, { data: result, timestamp: Date.now() })
        return result
      }
    }

    customerAccountsCache.set(effectiveTenantId, { data: [], timestamp: Date.now() })
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
  customerAccountsCache.set(tenantId, { data: accounts, timestamp: Date.now() })
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
    const cleanDigits = cleanPhone.replace(/\D/g, '')

    let account: CustomerAccount | undefined

    // 1. Priorizar coincidencia por teléfono si está disponible
    if (cleanDigits && cleanDigits.length >= 6) {
      account = accounts.find(a => {
        const aDigits = (a.customer_phone || '').replace(/\D/g, '')
        return aDigits.length >= 6 && (aDigits === cleanDigits || aDigits.endsWith(cleanDigits) || cleanDigits.endsWith(aDigits))
      })
    }

    // 2. Si no se encontró por teléfono, buscar por nombre
    if (!account) {
      account = accounts.find(
        a => a.customer_name.toLowerCase().trim() === cleanName.toLowerCase().trim()
      )
    }

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
      const defaultLimit = 50000
      if (safeAmount > defaultLimit) {
        return {
          success: false,
          error: `El monto solicitado ($${safeAmount.toLocaleString('es-AR')}) supera el límite de crédito para nuevas cuentas ($${defaultLimit.toLocaleString('es-AR')}).`,
        }
      }

      account = {
        id: `acc-${Date.now()}`,
        tenant_id: effectiveTenantId,
        customer_name: cleanName,
        customer_phone: cleanPhone,
        balance: safeAmount,
        credit_limit: defaultLimit,
        notes: 'Cuenta creada automáticamente desde cantina',
        movements: [newMovement],
        created_at: now,
        updated_at: now,
      }
      accounts.push(account)
    } else {
      const creditLimit = Number(account.credit_limit) || 50000
      if (account.balance + safeAmount > creditLimit) {
        return {
          success: false,
          error: `Límite de crédito excedido. El cliente "${account.customer_name}" tiene una deuda de $${account.balance.toLocaleString('es-AR')} y un límite de crédito de $${creditLimit.toLocaleString('es-AR')}. Nuevo saldo ($${(account.balance + safeAmount).toLocaleString('es-AR')}) supera el tope permitido.`,
        }
      }

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

/**
 * Consulta previa no-bloqueante del límite de crédito disponible de un cliente
 */
export async function checkCustomerCreditLimit(params: {
  tenantId: string
  customerName: string
  customerPhone?: string
  proposedAmount: number
}): Promise<{
  allowed: boolean
  currentBalance: number
  creditLimit: number
  availableCredit: number
  error?: string
}> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(params.tenantId)
    if (!effectiveTenantId) return { allowed: false, currentBalance: 0, creditLimit: 0, availableCredit: 0, error: 'Club no válido' }

    const cleanName = sanitizeText(params.customerName || '', 60).toLowerCase().trim()
    const cleanDigits = (params.customerPhone || '').replace(/\D/g, '')
    const safeAmount = Math.max(0, Number(params.proposedAmount) || 0)

    const accounts = await getCustomerAccounts(effectiveTenantId)
    let account: CustomerAccount | undefined

    if (cleanDigits && cleanDigits.length >= 6) {
      account = accounts.find(a => {
        const aDigits = (a.customer_phone || '').replace(/\D/g, '')
        return aDigits.length >= 6 && (aDigits === cleanDigits || aDigits.endsWith(cleanDigits) || cleanDigits.endsWith(aDigits))
      })
    }

    if (!account && cleanName) {
      account = accounts.find(a => a.customer_name.toLowerCase().trim() === cleanName)
    }

    const currentBalance = account ? Number(account.balance) || 0 : 0
    const creditLimit = account ? (Number(account.credit_limit) || 50000) : 50000
    const availableCredit = Math.max(0, creditLimit - currentBalance)
    const allowed = (currentBalance + safeAmount) <= creditLimit

    return {
      allowed,
      currentBalance,
      creditLimit,
      availableCredit,
      error: allowed ? undefined : `Supera el límite de crédito disponible ($${availableCredit.toLocaleString('es-AR')})`
    }
  } catch {
    return { allowed: true, currentBalance: 0, creditLimit: 50000, availableCredit: 50000 }
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

    // Impactar en la caja diaria del club (registro relacional inmutable en booking_payments con fallback a audit_log)
    try {
      const supabase = await createServiceClient()
      await supabase.from('booking_payments').insert({
        tenant_id: effectiveTenantId,
        amount_cents: Math.round(safeAmount * 100),
        amount_ars: safeAmount,
        payment_method: params.paymentMethod,
        payment_type: 'BALANCE',
        registered_at: now,
        notes: `Cobro Cuenta Corriente: ${account.customer_name}${params.notes ? ` - ${params.notes}` : ''}`,
      })

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
    } catch (payErr) {
      console.warn('[payCustomerAccount] Error al registrar pago en auditoría/caja:', payErr)
    }

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

