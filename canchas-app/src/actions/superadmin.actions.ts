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
  subscription_status: 'AL_DIA' | 'PENDIENTE' | 'PAUSADO'
  last_paid: string | null
  plan_id: SaaSPlanId
  is_active: boolean
  created_at?: string | null
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
        is_active,
        subscription_status,
        base_slots_plan,
        mp_access_token,
        created_at,
        courts (id, is_active),
        price_rules (price_cents)
      `)
      .order('created_at', { ascending: false })

    if (error || !tenants) {
      console.warn('Error fetching tenants for superadmin:', error)
      return { success: false, data: [] }
    }

    // Consultar últimos pagos reales de facturas para cada club
    const { data: paidInvoices } = await supabase
      .from('tenant_invoices')
      .select('tenant_id, paid_at')
      .eq('status', 'PAID')
      .order('paid_at', { ascending: false })

    const lastPaidMap = new Map<string, string>()
    if (paidInvoices) {
      for (const inv of paidInvoices) {
        if (inv.paid_at && !lastPaidMap.has(inv.tenant_id)) {
          const d = new Date(inv.paid_at)
          lastPaidMap.set(
            inv.tenant_id,
            `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
          )
        }
      }
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

      // Determinar plan respetando la configuración oficial de la administración (base_slots_plan)
      let defaultPlan: SaaSPlanId = 'MEDIANO_2'
      const baseSlots = Number(t.base_slots_plan)
      if (baseSlots === 1) defaultPlan = 'CHICO_1'
      else if (baseSlots === 1.5 || baseSlots === 2) defaultPlan = 'MEDIANO_2'
      else if (baseSlots === 3 || baseSlots === 4) defaultPlan = 'CONSOLIDADO_3_4'
      else if (baseSlots >= 5) defaultPlan = 'GRANDE_5_PLUS'
      else if (activeCourts <= 1) defaultPlan = 'CHICO_1'
      else if (activeCourts === 2) defaultPlan = 'MEDIANO_2'
      else if (activeCourts <= 4) defaultPlan = 'CONSOLIDADO_3_4'
      else defaultPlan = 'GRANDE_5_PLUS'

      const isActuallyActive = t.is_active === true
      const realLastPaid = lastPaidMap.get(t.id) || null

      let subStatus: 'AL_DIA' | 'PENDIENTE' | 'PAUSADO' = 'PENDIENTE'
      if (t.subscription_status === 'ACTIVE' || t.subscription_status === 'AL_DIA') {
        subStatus = 'AL_DIA'
      } else if (
        t.subscription_status === 'PARTIALLY_SUSPENDED' ||
        t.subscription_status === 'PAUSED' ||
        t.subscription_status === 'LOCKED'
      ) {
        subStatus = 'PAUSADO'
      } else {
        subStatus = 'PENDIENTE'
      }

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
        subscription_status: subStatus,
        last_paid: realLastPaid,
        plan_id: defaultPlan,
        is_active: isActuallyActive,
        created_at: t.created_at || null,
      }
    })

    return { success: true, data: formatted }
  } catch (err) {
    console.error('getSuperadminTenants exception:', err)
    return { success: false, data: [] }
  }
}

/**
 * Permite al Superadmin cambiar el estado de suscripción de un club (AL_DIA, PENDIENTE, PAUSADO).
 * Si se pausa, las reservas públicas web quedan deshabilitadas temporalmente por falta de pago.
 */
export async function updateTenantSubscriptionStatusAction(
  tenantId: string,
  status: 'AL_DIA' | 'PENDIENTE' | 'PAUSADO'
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const dbStatus = status === 'PAUSADO' 
      ? 'PARTIALLY_SUSPENDED' 
      : status === 'PENDIENTE' 
      ? 'PAYMENT_PENDING' 
      : 'ACTIVE'

    const updatePayload: Record<string, unknown> = {
      subscription_status: dbStatus,
    }

    if (status === 'AL_DIA') {
      updatePayload.is_active = true
    }

    const { error } = await supabase
      .from('tenants')
      .update(updatePayload)
      .eq('id', tenantId)

    if (error) {
      console.error('Error updating tenant subscription status:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/superadmin')
    revalidatePath('/dashboard/plan')
    revalidatePath('/dashboard')
    revalidatePath('/')
    return { success: true }
  } catch (err) {
    console.error('updateTenantSubscriptionStatusAction exception:', err)
    return { success: false, error: 'Error al actualizar el estado de suscripción' }
  }
}

/**
 * Permite al Superadmin cambiar el plan SaaS asignado a un club.
 */
export async function updateTenantPlan(tenantId: string, planId: SaaSPlanId) {
  try {
    const supabase = await createServiceClient()
    const baseSlots = planId === 'CHICO_1' ? 1 : planId === 'MEDIANO_2' ? 2 : planId === 'CONSOLIDADO_3_4' ? 3 : 5

    const { error } = await supabase
      .from('tenants')
      .update({ base_slots_plan: baseSlots })
      .eq('id', tenantId)

    if (error) {
      console.error('Error updating tenant plan:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/superadmin')
    revalidatePath('/dashboard/plan')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('updateTenantPlan exception:', err)
    return { success: false, error: 'Error al actualizar el plan del club' }
  }
}

/**
 * Otorga acceso y poder total a un club activándolo con su plan SaaS correspondiente.
 */
export async function activateTenantAccess(tenantId: string, planId?: SaaSPlanId) {
  try {
    const supabase = await createServiceClient()
    const updateData: Record<string, unknown> = {
      is_active: true,
      subscription_status: 'ACTIVE',
    }

    if (planId) {
      const baseSlots = planId === 'CHICO_1' ? 1 : planId === 'MEDIANO_2' ? 2 : planId === 'CONSOLIDADO_3_4' ? 3 : 5
      updateData.base_slots_plan = baseSlots
    }

    const { error } = await supabase
      .from('tenants')
      .update(updateData)
      .eq('id', tenantId)

    if (error) {
      console.error('Error activating tenant:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/superadmin')
    revalidatePath('/dashboard/plan')
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
        subscription_status: 'PAYMENT_PENDING',
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

/**
 * Obtiene todos los perfiles de usuario (admins y cancheros) para el panel superadmin.
 */
export interface SuperadminUserItem {
  id: string
  full_name: string
  email: string
  phone?: string
  role: 'TENANT_ADMIN' | 'TENANT_STAFF' | 'SUPERADMIN'
  tenant_id: string | null
  tenant_name: string | null
  tenant_slug: string | null
  created_at: string
  password?: string
}

export async function getSuperadminUsers(): Promise<{ success: boolean; data: SuperadminUserItem[] }> {
  try {
    const supabase = await createServiceClient()
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role, tenant_id, created_at, tenants(name, slug)')
      .order('created_at', { ascending: false })

    if (error || !profiles) {
      console.warn('Error fetching profiles for superadmin:', error)
      return { success: false, data: [] }
    }

    // Obtener emails y contraseñas guardadas en metadata desde auth.users (requiere service role)
    const { data: authList } = await supabase.auth.admin.listUsers()
    const emailMap: Record<string, string> = {}
    const phoneMap: Record<string, string> = {}
    const passwordMap: Record<string, string> = {}
    if (authList?.users) {
      authList.users.forEach(u => { 
        emailMap[u.id] = u.email || ''
        phoneMap[u.id] = (u.user_metadata?.phone as string) || ''
        const pwd = (u.user_metadata?.assigned_password || u.user_metadata?.initial_password || '') as string
        if (pwd) {
          passwordMap[u.id] = pwd
        }
      })
    }

    const formatted: SuperadminUserItem[] = profiles.map((p) => {
      const t = p.tenants as unknown as { name?: string; slug?: string } | null
      return {
        id: p.id,
        full_name: p.full_name || 'Sin nombre',
        email: emailMap[p.id] || '',
        phone: p.phone || phoneMap[p.id] || '',
        role: (p.role as SuperadminUserItem['role']) || 'TENANT_ADMIN',
        tenant_id: p.tenant_id,
        tenant_name: t?.name || null,
        tenant_slug: t?.slug || null,
        created_at: p.created_at || '',
        password: passwordMap[p.id] || '',
      }
    })

    // Incluir usuarios en auth que aún no tengan perfil vinculado
    const profileUserIds = new Set(profiles.map(p => p.id))
    for (const u of authList?.users || []) {
      if (!profileUserIds.has(u.id)) {
        formatted.push({
          id: u.id,
          full_name: (u.user_metadata?.full_name as string) || (u.email?.split('@')[0] || 'Usuario'),
          email: u.email || '',
          phone: (u.user_metadata?.phone as string) || '',
          role: 'TENANT_ADMIN',
          tenant_id: null,
          tenant_name: (u.user_metadata?.full_name as string) || 'Sin club vinculado',
          tenant_slug: null,
          created_at: u.created_at || '',
          password: passwordMap[u.id] || '',
        })
      }
    }

    return { success: true, data: formatted }
  } catch (err) {
    console.error('getSuperadminUsers exception:', err)
    return { success: false, data: [] }
  }
}

/**
 * Permite al Superadmin cambiar o asignar una nueva contraseña a cualquier usuario
 * y persistirla tanto en auth.users como en su metadata para visualización directa.
 */
export async function updateUserPasswordBySuperadmin(
  userId: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const { data: userData, error: getUserErr } = await supabase.auth.admin.getUserById(userId)
    if (getUserErr || !userData?.user) {
      return { success: false, error: 'Usuario no encontrado' }
    }

    const currentMeta = userData.user.user_metadata || {}
    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
      user_metadata: {
        ...currentMeta,
        assigned_password: newPassword,
        initial_password: newPassword,
      },
    })

    if (updateErr) {
      return { success: false, error: updateErr.message }
    }

    revalidatePath('/superadmin')
    return { success: true }
  } catch (err) {
    console.error('updateUserPasswordBySuperadmin exception:', err)
    return { success: false, error: 'Error al cambiar contraseña' }
  }
}

/**
 * Permite al Superadmin crear un usuario nuevo vinculado a un club con su contraseña definida.
 */
export async function createUserBySuperadmin(payload: {
  name: string
  email: string
  phone: string
  role: 'TENANT_ADMIN' | 'TENANT_STAFF'
  tenantId: string
  password: string
}): Promise<{ success: boolean; error?: string; userId?: string }> {
  try {
    const supabase = await createServiceClient()
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        full_name: payload.name,
        phone: payload.phone,
        initial_password: payload.password,
        assigned_password: payload.password,
      },
    })

    if (authError || !authData?.user) {
      return { success: false, error: authError?.message || 'Error al crear usuario en autenticación' }
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        tenant_id: payload.tenantId,
        full_name: payload.name,
        role: payload.role,
        phone: payload.phone,
      })

    if (profileError) {
      return { success: false, error: profileError.message }
    }

    revalidatePath('/superadmin')
    return { success: true, userId: authData.user.id }
  } catch (err) {
    console.error('createUserBySuperadmin exception:', err)
    return { success: false, error: 'Error inesperado al crear usuario' }
  }
}

/**
 * Genera un enlace de acceso directo (Magic Link de impersonación)
 * para que el Superadmin pueda ingresar al panel de cualquier club con 1 solo clic.
 */
export async function generateUserImpersonationUrl(
  userId: string,
  appOrigin?: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId)
    if (userErr || !userData?.user?.email) {
      return { success: false, error: 'Usuario o email no encontrado' }
    }

    const appUrl = appOrigin || process.env.NEXT_PUBLIC_APP_URL || 'https://www.cancharclub.com.ar'
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userData.user.email,
      options: {
        redirectTo: `${appUrl}/auth/callback?next=/dashboard`,
      },
    })

    if (error || !data?.properties?.action_link) {
      return { success: false, error: error?.message || 'No se pudo generar el enlace de acceso directo' }
    }

    return { success: true, url: data.properties.action_link }
  } catch (err) {
    console.error('generateUserImpersonationUrl exception:', err)
    return { success: false, error: 'Error al generar enlace de acceso directo' }
  }
}

/**
 * Elimina un usuario completamente: primero el perfil de la tabla profiles,
 * luego el usuario de Supabase Auth. Requiere service role key.
 */
export async function deleteProfileById(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()

    // 1. Eliminar el perfil de la tabla profiles (cascada en FK maneja el resto)
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (profileError) {
      console.error('Error deleting profile:', profileError)
      return { success: false, error: profileError.message }
    }

    // 2. Eliminar el usuario de Supabase Auth (necesita service role)
    const { error: authError } = await supabase.auth.admin.deleteUser(userId)

    if (authError) {
      // Si falla el borrado de auth (por ejemplo en modo demo sin service role real)
      // el perfil ya fue borrado. Logueamos pero no fallamos.
      console.warn('Could not delete auth user (profile was deleted):', authError.message)
    }

    revalidatePath('/superadmin')
    return { success: true }
  } catch (err) {
    console.error('deleteProfileById exception:', err)
    return { success: false, error: 'Error al eliminar el usuario' }
  }
}

/**
 * Elimina un club completamente de la base de datos (con sus canchas, perfiles, etc.).
 * Requiere service role key.
 */
export async function deleteTenantById(tenantId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()

    // 1. Eliminar dependencias en orden relacional estricto
    try { await supabase.from('court_orders').delete().eq('tenant_id', tenantId) } catch {}
    try { await supabase.from('court_blocks').delete().eq('tenant_id', tenantId) } catch {}
    try { await supabase.from('recurring_slots').delete().eq('tenant_id', tenantId) } catch {}
    try { await supabase.from('waitlists').delete().eq('tenant_id', tenantId) } catch {}
    try { await supabase.from('tournaments').delete().eq('tenant_id', tenantId) } catch {}
    await supabase.from('bookings').delete().eq('tenant_id', tenantId)
    await supabase.from('price_rules').delete().eq('tenant_id', tenantId)
    await supabase.from('courts').delete().eq('tenant_id', tenantId)
    await supabase.from('profiles').delete().eq('tenant_id', tenantId)

    // 2. Eliminar tenant
    const { error } = await supabase
      .from('tenants')
      .delete()
      .eq('id', tenantId)

    if (error) {
      console.error('Error deleting tenant:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/superadmin')
    revalidatePath('/')
    return { success: true }
  } catch (err) {
    console.error('deleteTenantById exception:', err)
    return { success: false, error: 'Error al eliminar el club' }
  }
}

