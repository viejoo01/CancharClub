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
import { assertTenantAdmin, resolveEffectiveTenantId } from '@/lib/auth-security'
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
 * Obtiene la configuración de cobro y datos bancarios del club.
 * Si tenantId no se suministra, se auto-resuelve desde el usuario, cookies o BD.
 */
export async function getTenantPaymentSettings(tenantId?: string | null): Promise<TenantPaymentSettings | null> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)

    if (!effectiveTenantId) {
      console.warn('[getTenantPaymentSettings] No tenantId provided or found in session/db')
      return {
        tenantId: '',
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

    const supabase = await createServiceClient()
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, name, bank_name, bank_account_holder, bank_cbu, bank_alias, bank_cuit, phone_whatsapp, payment_methods, mp_access_token, mp_public_key, mp_collector_id')
      .eq('id', effectiveTenantId)
      .maybeSingle()

    if (error || !tenant) {
      console.warn('[getTenantPaymentSettings] Tenant not found for:', effectiveTenantId)
      return {
        tenantId: effectiveTenantId,
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

    const rawMethods = Array.isArray(tenant.payment_methods) ? tenant.payment_methods : ['TRANSFER']
    const paymentMethods: ('TRANSFER' | 'MERCADOPAGO')[] = []
    if (rawMethods.includes('TRANSFER')) paymentMethods.push('TRANSFER')
    if (rawMethods.includes('MERCADOPAGO') || rawMethods.includes('MERCADO_PAGO')) paymentMethods.push('MERCADOPAGO')
    if (paymentMethods.length === 0) paymentMethods.push('TRANSFER')

    return {
      tenantId: tenant.id,
      clubName: tenant.name || 'Mi Club',
      bankName: tenant.bank_name || '',
      accountHolder: tenant.bank_account_holder || '',
      cbu: tenant.bank_cbu || '',
      alias: tenant.bank_alias || '',
      cuit: tenant.bank_cuit || '',
      whatsappPhone: tenant.phone_whatsapp || '',
      paymentMethods,
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
 * Guarda los datos bancarios del club para transferencias directas de seña.
 * Tolera tenantId opcional o nulo, resolviéndolo automáticamente.
 */
export async function saveTenantBankSettings(
  tenantId: string | null | undefined,
  data: {
    bankName: string
    accountHolder: string
    cbu: string
    alias: string
    cuit?: string
    whatsappPhone?: string
    paymentMethods?: ('TRANSFER' | 'MERCADOPAGO')[]
  }
): Promise<{ 
  success: boolean
  error?: string
  savedData?: {
    bankName: string
    accountHolder: string
    cbu: string
    alias: string
    cuit?: string
    whatsappPhone?: string
    paymentMethods: ('TRANSFER' | 'MERCADOPAGO')[]
  }
}> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) {
      return { success: false, error: 'No se pudo determinar el club a modificar' }
    }

    // 1. Verificación de Seguridad Anti-IDOR
    const authCheck = await assertTenantAdmin(effectiveTenantId)
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error || 'No tienes permisos para modificar este club' }
    }

    const supabase = await createServiceClient()

    // Normalizar métodos de pago para persistencia
    const inputMethods = data.paymentMethods || ['TRANSFER']
    const normalizedMethods: string[] = []
    if (inputMethods.includes('TRANSFER')) normalizedMethods.push('TRANSFER')
    if (inputMethods.includes('MERCADOPAGO')) {
      normalizedMethods.push('TRANSFER')
      normalizedMethods.push('MERCADO_PAGO')
    }
    const finalMethods = Array.from(new Set(normalizedMethods.length > 0 ? normalizedMethods : ['TRANSFER']))

    const cleanBank = sanitizeText(data.bankName, 60).trim()
    const cleanHolder = sanitizeText(data.accountHolder, 80).trim()
    const cleanCbu = (data.cbu || '').replace(/\D/g, '').slice(0, 22)
    const cleanAlias = sanitizeText(data.alias, 40).toLowerCase().trim()
    const cleanCuit = data.cuit ? data.cuit.replace(/[^\d-]/g, '').slice(0, 14) : null
    const cleanWhatsapp = data.whatsappPhone ? sanitizeText(data.whatsappPhone, 25).trim() : null

    const { data: updatedRows, error } = await supabase
      .from('tenants')
      .update({
        bank_name: cleanBank,
        bank_account_holder: cleanHolder,
        bank_cbu: cleanCbu,
        bank_alias: cleanAlias,
        bank_cuit: cleanCuit,
        phone_whatsapp: cleanWhatsapp,
        payment_methods: finalMethods,
        updated_at: new Date().toISOString(),
      })
      .eq('id', effectiveTenantId)
      .select('id, name, bank_name, bank_account_holder, bank_cbu, bank_alias, bank_cuit, phone_whatsapp, payment_methods')

    if (error) {
      console.error('[saveTenantBankSettings] DB Error:', error)
      return { success: false, error: error.message }
    }

    if (!updatedRows || updatedRows.length === 0) {
      console.error('[saveTenantBankSettings] No rows updated for tenant:', effectiveTenantId)
      return { success: false, error: 'No se encontró la fila del club en la base de datos' }
    }

    revalidatePath('/dashboard/cobros')
    revalidatePath('/dashboard/caja')
    revalidatePath('/club/[slug]', 'page')
    revalidatePath('/club/[slug]/checkout', 'page')
    revalidatePath('/reserva/[id]/confirmado', 'page')

    const saved = updatedRows[0]
    return {
      success: true,
      savedData: {
        bankName: saved.bank_name || '',
        accountHolder: saved.bank_account_holder || '',
        cbu: saved.bank_cbu || '',
        alias: saved.bank_alias || '',
        cuit: saved.bank_cuit || '',
        whatsappPhone: saved.phone_whatsapp || '',
        paymentMethods: inputMethods,
      },
    }
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
  tenantId: string | null | undefined,
  data: {
    accessToken: string
    publicKey?: string
    collectorId?: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) {
      return { success: false, error: 'No se pudo determinar el club' }
    }

    const authCheck = await assertTenantAdmin(effectiveTenantId)
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
        payment_methods: ['TRANSFER', 'MERCADO_PAGO'],
        updated_at: new Date().toISOString(),
      })
      .eq('id', effectiveTenantId)

    if (error) {
      console.error('[saveTenantMpCredentials] DB Error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/dashboard/cobros')
    revalidatePath('/dashboard/caja')
    revalidatePath('/club/[slug]', 'page')
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
export async function disconnectTenantMpAccount(tenantId: string | null | undefined): Promise<{ success: boolean; error?: string }> {
  try {
    const effectiveTenantId = await resolveEffectiveTenantId(tenantId)
    if (!effectiveTenantId) {
      return { success: false, error: 'No se pudo determinar el club' }
    }

    const authCheck = await assertTenantAdmin(effectiveTenantId)
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
      .eq('id', effectiveTenantId)

    if (error) {
      console.error('[disconnectTenantMpAccount] DB Error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/dashboard/cobros')
    revalidatePath('/club/[slug]', 'page')
    return { success: true }
  } catch (err: unknown) {
    console.error('[disconnectTenantMpAccount] Error:', err)
    const msg = err instanceof Error ? err.message : 'Error desconocido al desvincular'
    return { success: false, error: msg }
  }
}
