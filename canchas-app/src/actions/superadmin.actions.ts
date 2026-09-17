'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SaaSPlanId } from '@/config/saas-plans'

export interface SuperadminTenantItem {
  id: string
  name: string
  slug: string
  city: string
  active_courts: number
  highest_slot_price: number
  total_bookings: number
  mp_connected: boolean
  status: string
  subscription_status: 'AL_DIA' | 'PENDIENTE'
  last_paid: string | null
  plan_id: SaaSPlanId
  is_active: boolean
}

/**
 * Obtiene todos los clubes reales de la base de datos para el panel de Superadmin.
 */
export async function getSuperadminTenants(): Promise<{ success: boolean; data: SuperadminTenantItem[] }> {
  try {
    const supabase = await createServiceClient()
    const { data: tenants, error } = await supabase
      .from('tenants')
      .select(`
        id,
        name,
        slug,
        city,
        plan_id,
        is_active,
        subscription_status,
        mp_access_token,
        courts (id, is_active),
        price_rules (price_cents)
      `)
      .order('created_at', { ascending: false })

    if (error || !tenants) {
      console.warn('Error fetching tenants for superadmin:', error)
      return { success: false, data: [] }
    }

    const formatted: SuperadminTenantItem[] = tenants.map((t) => {
      const rawCourts = Array.isArray(t.courts) ? t.courts : []
      const activeCourts = rawCourts.filter((c) => c.is_active !== false).length || 2

      const rawRules = Array.isArray(t.price_rules) ? t.price_rules : []
      let maxPriceArs = 30000
      if (rawRules.length > 0) {
        const maxCents = Math.max(...rawRules.map((r) => Number(r.price_cents) || 0))
        if (maxCents > 0) maxPriceArs = Math.round(maxCents / 100)
      }

      // Determinar plan por defecto según canchas si no tiene asignado
      let defaultPlan: SaaSPlanId = 'MEDIANO_2'
      if (activeCourts <= 1) defaultPlan = 'CHICO_1'
      else if (activeCourts === 2) defaultPlan = 'MEDIANO_2'
      else if (activeCourts <= 4) defaultPlan = 'CONSOLIDADO_3_4'
      else defaultPlan = 'GRANDE_5_PLUS'

      const isActuallyActive = t.is_active === true

      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        city: t.city || 'Tucumán',
        active_courts: activeCourts,
        highest_slot_price: maxPriceArs,
        total_bookings: 0,
        mp_connected: Boolean(t.mp_access_token),
        status: isActuallyActive ? 'ACTIVE' : 'PENDING',
        subscription_status: (t.subscription_status === 'ACTIVE' || t.subscription_status === 'AL_DIA' ? 'AL_DIA' : 'PENDIENTE'),
        last_paid: null,
        plan_id: (t.plan_id as SaaSPlanId) || defaultPlan,
        is_active: isActuallyActive,
      }
    })

    return { success: true, data: formatted }
  } catch (err) {
    console.error('getSuperadminTenants exception:', err)
    return { success: false, data: [] }
  }
}

/**
 * Otorga acceso y poder total a un club activándolo con su plan SaaS correspondiente.
 */
export async function activateTenantAccess(tenantId: string, planId: SaaSPlanId) {
  try {
    const supabase = await createServiceClient()
    const { error } = await supabase
      .from('tenants')
      .update({
        is_active: true,
        subscription_status: 'ACTIVE',
        plan_id: planId,
      })
      .eq('id', tenantId)

    if (error) {
      console.error('Error activating tenant:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/superadmin')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('activateTenantAccess exception:', err)
    return { success: false, error: 'Error al activar el club' }
  }
}

/**
 * Suspende o desactiva el acceso a un club (modo vista previa / sólo lectura).
 */
export async function deactivateTenantAccess(tenantId: string) {
  try {
    const supabase = await createServiceClient()
    const { error } = await supabase
      .from('tenants')
      .update({
        is_active: false,
        subscription_status: 'PENDIENTE',
      })
      .eq('id', tenantId)

    if (error) {
      console.error('Error deactivating tenant:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/superadmin')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('deactivateTenantAccess exception:', err)
    return { success: false, error: 'Error al desactivar el club' }
  }
}
