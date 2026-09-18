'use server'
// src/actions/tenant-payment-settings.actions.ts
// ==============================================================================
// SERVER ACTIONS — Configuración de Cuentas de Cobro & Señas del Club
// ==============================================================================
// CancharClub garantiza que el 100% de las señas de las canchas se acreditan
// DIRECTAMENTE en las cuentas configuradas por cada Club (CBU/Alias o MP propio).
// La cuenta del Superadmin de la plataforma NUNCA recibe señas de canchas.
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { assertTenantAdmin } from '@/lib/auth-security'
import { sanitizeText } from '@/lib/sanitize'

export interface TenantPaymentSettings {
  tenantId: string
  clubName: string
  bankName: string
  accountHolder: string
  cbu: string
  alias: string
  cuit?: string
  whatsappPhone?: string
  paymentMethods: ('TRANSFER' | 'MERCADOPAGO')[]
  mpConnected: boolean
  mpCollectorId?: string | null
  mpPublicKey?: string | null
}

/**
 * Obtiene la configuración de cobro y datos bancarios del club
 */
export async function getTenantPaymentSettings(tenantId: string): Promise<TenantPaymentSettings | null> {
  try {
    const supabase = await createServiceClient()
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, name, bank_name, bank_account_holder, bank_cbu, bank_alias, bank_cuit, phone_whatsapp, payment_methods, mp_access_token, mp_public_key, mp_collector_id')
      .eq('id', tenantId)
      .maybeSingle()

    if (error || !tenant) {
      console.warn('[getTenantPaymentSettings] Tenant not found for:', tenantId)
      return {
        tenantId,
        clubName: 'Mi Club',
        bankName: '',
        accountHolder: '',
        cbu: '',
        alias: '',
        cuit: '',
        whatsappPhone: '',
        paymentMethods: ['TRANSFER'],
        mpConnected: false,
      }
    }

    return {
      tenantId: tenant.id,
      clubName: tenant.name || 'Mi Club',
      bankName: tenant.bank_name || '',
      accountHolder: tenant.bank_account_holder || '',
      cbu: tenant.bank_cbu || '',
      alias: tenant.bank_alias || '',
      cuit: tenant.bank_cuit || '',
      whatsappPhone: tenant.phone_whatsapp || '',
      paymentMethods: (tenant.payment_methods as ('TRANSFER' | 'MERCADOPAGO')[]) || ['TRANSFER'],
      mpConnected: Boolean(tenant.mp_access_token),
      mpCollectorId: tenant.mp_collector_id,
      mpPublicKey: tenant.mp_public_key,
    }
  } catch (err) {
    console.error('[getTenantPaymentSettings] Error:', err)
    return null
  }
}

/**
 * Guarda los datos bancarios del club para transferencias directas de seña
 */
export async function saveTenantBankSettings(
  tenantId: string,
  data: {
    bankName: string
    accountHolder: string
    cbu: string
    alias: string
    cuit?: string
    whatsappPhone?: string
    paymentMethods?: ('TRANSFER' | 'MERCADOPAGO')[]
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Verificación de Seguridad Anti-IDOR: Solo el dueño del club puede modificar estos datos
    const authCheck = await assertTenantAdmin(tenantId)
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error || 'No tienes permisos para modificar este club' }
    }

    const supabase = await createServiceClient()
    const { error } = await supabase
      .from('tenants')
      .update({
        bank_name: sanitizeText(data.bankName, 60),
        bank_account_holder: sanitizeText(data.accountHolder, 80),
        bank_cbu: data.cbu.replace(/\D/g, '').slice(0, 22),
        bank_alias: sanitizeText(data.alias, 40).toLowerCase(),
        bank_cuit: data.cuit ? data.cuit.replace(/[^\d-]/g, '').slice(0, 14) : null,
        phone_whatsapp: data.whatsappPhone ? sanitizeText(data.whatsappPhone, 25) : null,
        payment_methods: data.paymentMethods || ['TRANSFER'],
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)

    if (error) {
      console.error('[saveTenantBankSettings] DB Error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/dashboard/cobros')
    revalidatePath('/dashboard/caja')
    return { success: true }
  } catch (err: unknown) {
    console.error('[saveTenantBankSettings] Error:', err)
    const msg = err instanceof Error ? err.message : 'Error desconocido al guardar datos bancarios'
    return { success: false, error: msg }
  }
}

/**
 * Conecta las credenciales de Mercado Pago propias del Club
 */
export async function saveTenantMpCredentials(
  tenantId: string,
  data: {
    accessToken: string
    publicKey?: string
    collectorId?: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Verificación de Seguridad Anti-IDOR: Solo el dueño del club puede vincular credenciales
    const authCheck = await assertTenantAdmin(tenantId)
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error || 'No tienes permisos para configurar Mercado Pago en este club' }
    }

    const supabase = await createServiceClient()
    const trimmedToken = data.accessToken.trim()

    // Validación básica de token Mercado Pago
    if (!trimmedToken.startsWith('APP_USR-') && !trimmedToken.startsWith('TEST-')) {
      return { success: false, error: 'El Access Token debe comenzar con APP_USR- o TEST-' }
    }

    const { error } = await supabase
      .from('tenants')
      .update({
        mp_access_token: trimmedToken,
        mp_public_key: data.publicKey?.trim() || null,
        mp_collector_id: data.collectorId?.trim() || null,
        mp_connected_at: new Date().toISOString(),
        payment_methods: ['TRANSFER', 'MERCADOPAGO'],
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)

    if (error) {
      console.error('[saveTenantMpCredentials] DB Error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/dashboard/cobros')
    revalidatePath('/dashboard/caja')
    return { success: true }
  } catch (err: unknown) {
    console.error('[saveTenantMpCredentials] Error:', err)
    const msg = err instanceof Error ? err.message : 'Error desconocido al vincular Mercado Pago'
    return { success: false, error: msg }
  }
}

/**
 * Desconecta la cuenta de Mercado Pago propia del Club
 */
export async function disconnectTenantMpAccount(tenantId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Verificación de Seguridad Anti-IDOR: Solo el dueño del club puede desvincular credenciales
    const authCheck = await assertTenantAdmin(tenantId)
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error || 'No tienes permisos para modificar este club' }
    }

    const supabase = await createServiceClient()
    const { error } = await supabase
      .from('tenants')
      .update({
        mp_access_token: null,
        mp_public_key: null,
        mp_collector_id: null,
        mp_connected_at: null,
        payment_methods: ['TRANSFER'],
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)

    if (error) {
      console.error('[disconnectTenantMpAccount] DB Error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/dashboard/cobros')
    return { success: true }
  } catch (err: unknown) {
    console.error('[disconnectTenantMpAccount] Error:', err)
    const msg = err instanceof Error ? err.message : 'Error desconocido al desvincular'
    return { success: false, error: msg }
  }
}
