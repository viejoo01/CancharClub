'use server'
// src/actions/mp-marketplace.actions.ts
// ==============================================================================
// SERVER ACTIONS — Mercado Pago Connect Directo al Club
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { assertTenantAdmin, assertTenantMember } from '@/lib/auth-security'

export interface MpMarketplaceStatus {
  isConnected: boolean
  collectorId?: string | null
  connectedAt?: string | null
  feePct: number
}

/** Generar URL de autorización OAuth de Mercado Pago para vincular la cuenta del club */
export async function getMpOAuthConnectUrl(tenantId: string): Promise<string> {
  const auth = await assertTenantAdmin(tenantId)
  if (!auth.authorized) {
    throw new Error(auth.error || 'No autorizado')
  }

  const clientId = process.env.MP_CLIENT_ID || process.env.NEXT_PUBLIC_MP_CLIENT_ID || '1234567890'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cancharclub.com.ar'
  const redirectUri = `${appUrl}/api/auth/mercadopago/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    platform_id: 'mp',
    state: tenantId,
    redirect_uri: redirectUri,
  })

  return `https://auth.mercadopago.com/authorization?${params.toString()}`
}

/** Obtener estado de conexión de Mercado Pago Marketplace para el club */
export async function getTenantMpMarketplaceStatus(tenantId: string): Promise<MpMarketplaceStatus> {
  try {
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return {
        isConnected: false,
        feePct: 0,
      }
    }

    const supabase = await createServiceClient()
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('mp_access_token, mp_collector_id, mp_connected_at, mp_marketplace_fee_pct')
      .eq('id', tenantId)
      .single()

    if (error || !tenant) {
      return {
        isConnected: false,
        feePct: 0,
      }
    }

    return {
      isConnected: Boolean(tenant.mp_access_token && tenant.mp_collector_id),
      collectorId: tenant.mp_collector_id,
      connectedAt: tenant.mp_connected_at,
      feePct: Number(tenant.mp_marketplace_fee_pct ?? 0),
    }
  } catch (err) {
    console.error('[getTenantMpMarketplaceStatus] Error:', err)
    return {
      isConnected: false,
      feePct: 0,
    }
  }
}

/** Desconectar la cuenta de Mercado Pago del club */
export async function disconnectTenantMpMarketplace(tenantId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await assertTenantAdmin(tenantId)
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'No autorizado' }
    }

    const supabase = await createServiceClient()
    const { error } = await supabase
      .from('tenants')
      .update({
        mp_access_token: null,
        mp_refresh_token: null,
        mp_collector_id: null,
        mp_connected_at: null,
      })
      .eq('id', tenantId)

    if (error) return { success: false, error: error.message }

    revalidatePath('/dashboard/plan')
    return { success: true }
  } catch (err) {
    console.error('[disconnectTenantMpMarketplace] Error:', err)
    return { success: false, error: 'Error al desvincular cuenta' }
  }
}

/**
 * Simulación instantánea para entorno de pruebas/demo:
 * Permite vincular una cuenta virtual de Mercado Pago con collector_id de prueba
 */
export async function simulateMpConnectionForDemo(tenantId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await assertTenantAdmin(tenantId)
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'No autorizado' }
    }

    const supabase = await createServiceClient()
    const demoCollectorId = `MP_COLLECTOR_${Math.floor(100000 + Math.random() * 900000)}`
    const demoToken = `TEST-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`

    const { error } = await supabase
      .from('tenants')
      .update({
        mp_access_token: demoToken,
        mp_collector_id: demoCollectorId,
        mp_connected_at: new Date().toISOString(),
        mp_marketplace_fee_pct: 0,
      })
      .eq('id', tenantId)

    if (error) return { success: false, error: error.message }

    revalidatePath('/dashboard/plan')
    return { success: true }
  } catch (err) {
    console.error('[simulateMpConnectionForDemo] Error:', err)
    return { success: false, error: 'Error al simular conexión' }
  }
}
