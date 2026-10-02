'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { type SaaSPlanId, getPlanByCourtsCount } from '@/config/saas-plans'
import { assertSuperadmin, validatePasswordStrength } from '@/lib/auth-security'

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
  trial_ends_at?: string | null
  is_trial?: boolean
  trial_days_remaining?: number
  cancel_at_period_end?: boolean
  cancellation_effective_date?: string | null
  cancellation_requested_at?: string | null
  cancellation_reason?: string | null
  trial_forfeited?: boolean
}

/**
 * Obtiene todos los clubes reales de la base de datos para el panel de Superadmin.
 */
export async function getSuperadminTenants(): Promise<{ success: boolean; data: SuperadminTenantItem[] }> {
  try {
    const auth = await assertSuperadmin()
    if (!auth.authorized) return { success: false, data: [] }

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
        description,
        plan_id,
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
      let maxPriceArs = 0
      if (rawRules.length > 0) {
        const maxCents = Math.max(...rawRules.map((r) => Number(r.price_cents) || 0))
        if (maxCents > 0) maxPriceArs = Math.round(maxCents / 100)
      }

      // Determinar plan respetando canchas activas y configuración asignada
      const PLAN_RANKS: Record<SaaSPlanId, number> = { CHICO_1: 1, MEDIANO_2: 2, CONSOLIDADO_3_4: 3, GRANDE_5_PLUS: 4 }
      let defaultPlan: SaaSPlanId = 'MEDIANO_2'
      if (t.plan_id && ['CHICO_1', 'MEDIANO_2', 'CONSOLIDADO_3_4', 'GRANDE_5_PLUS'].includes(t.plan_id)) {
        defaultPlan = t.plan_id as SaaSPlanId
      } else if (t.base_slots_plan) {
        const baseSlots = Number(t.base_slots_plan)
        defaultPlan = baseSlots === 1 ? 'CHICO_1' : (baseSlots === 1.5 || baseSlots === 2) ? 'MEDIANO_2' : baseSlots <= 4 ? 'CONSOLIDADO_3_4' : 'GRANDE_5_PLUS'
      }

      if (activeCourts > 0) {
        const fromCourts = getPlanByCourtsCount(activeCourts).id
        if (PLAN_RANKS[fromCourts] > PLAN_RANKS[defaultPlan]) {
          defaultPlan = fromCourts
        }
      }

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

      let trialEndsAt: string | null = (t as unknown as { trial_ends_at?: string | null }).trial_ends_at || null
      let cancelAtPeriodEnd = false
      let cancellationEffectiveDate: string | null = null
      let cancellationRequestedAt: string | null = null
      let cancellationReason: string | null = null

      let trialForfeited = false

      if ((t as unknown as { description?: string | null }).description) {
        try {
          const meta = JSON.parse((t as unknown as { description: string }).description)
          if (meta.trial_forfeited) {
            trialForfeited = true
            trialEndsAt = new Date('2000-01-01T00:00:00.000Z').toISOString()
          } else if (meta.trial_ends_at) {
            trialEndsAt = meta.trial_ends_at
          }
          if (meta.cancel_at_period_end) cancelAtPeriodEnd = true
          if (meta.cancellation_effective_date) cancellationEffectiveDate = String(meta.cancellation_effective_date)
          if (meta.cancellation_requested_at) cancellationRequestedAt = String(meta.cancellation_requested_at)
          if (meta.cancellation_reason) cancellationReason = String(meta.cancellation_reason)
        } catch {}
      }

      const now = Date.now()
      const trialDate = trialEndsAt ? new Date(trialEndsAt).getTime() : null
      const isTrial = trialForfeited ? false : Boolean(trialDate && trialDate > now)
      const trialDaysRemaining = isTrial && trialDate ? Math.max(0, Math.ceil((trialDate - now) / (1000 * 60 * 60 * 24))) : 0

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
        trial_ends_at: trialEndsAt,
        is_trial: isTrial,
        trial_days_remaining: trialDaysRemaining,
        cancel_at_period_end: cancelAtPeriodEnd,
        cancellation_effective_date: cancellationEffectiveDate,
        cancellation_requested_at: cancellationRequestedAt,
        cancellation_reason: cancellationReason,
        trial_forfeited: trialForfeited,
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
    const auth = await assertSuperadmin()
    if (!auth.authorized) return { success: false, error: auth.error }

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
    const auth = await assertSuperadmin()
    if (!auth.authorized) return { success: false, error: auth.error }

    const supabase = await createServiceClient()
    const baseSlots = planId === 'CHICO_1' ? 1 : planId === 'MEDIANO_2' ? 2 : planId === 'CONSOLIDADO_3_4' ? 4 : 5

    const { error } = await supabase
      .from('tenants')
      .update({ 
        plan_id: planId,
        base_slots_plan: baseSlots 
      })
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
    const auth = await assertSuperadmin()
    if (!auth.authorized) return { success: false, error: auth.error }

    const supabase = await createServiceClient()
    const updateData: Record<string, unknown> = {
      is_active: true,
      subscription_status: 'ACTIVE',
    }

    if (planId) {
      const baseSlots = planId === 'CHICO_1' ? 1 : planId === 'MEDIANO_2' ? 2 : planId === 'CONSOLIDADO_3_4' ? 4 : 5
      updateData.base_slots_plan = baseSlots
      updateData.plan_id = planId
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
    const auth = await assertSuperadmin()
    if (!auth.authorized) return { success: false, error: auth.error }

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
 * Activa el período de prueba de 15 días a un club desde el panel Superadmin.
 * Habilita el acceso total (is_active: true), asigna trial_ends_at a 15 días corridos,
 * y pone su estado de suscripción en orden.
 */
export async function activateTenantTrialPeriodAction(
  tenantId: string,
  days: number = 15
): Promise<{ success: boolean; trialEndsAt?: string; error?: string }> {
  try {
    const auth = await assertSuperadmin()
    if (!auth.authorized) return { success: false, error: auth.error }

    const supabase = await createServiceClient()
    const trialEndsAtDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    const trialEndsAtIso = trialEndsAtDate.toISOString()

    // 1. Obtener tenant actual para leer description
    const { data: tenant, error: fetchErr } = await supabase
      .from('tenants')
      .select('id, name, slug, description')
      .eq('id', tenantId)
      .single()

    if (fetchErr || !tenant) {
      return { success: false, error: fetchErr?.message || 'Club no encontrado' }
    }

    let meta: Record<string, unknown> = {}
    if (tenant.description) {
      try {
        meta = JSON.parse(tenant.description)
      } catch {
        meta = {}
      }
    }
    meta.trial_ends_at = trialEndsAtIso
    meta.trial_activated_at = new Date().toISOString()
    meta.trial_days = days

    // 2. Actualizar tenant en Supabase guardando metadata del trial en description
    const updateData: Record<string, unknown> = {
      is_active: true,
      subscription_status: 'ACTIVE',
      description: JSON.stringify(meta),
      updated_at: new Date().toISOString(),
    }

    const { error: updateErr } = await supabase
      .from('tenants')
      .update(updateData)
      .eq('id', tenantId)

    if (updateErr) {
      console.error('[activateTenantTrialPeriodAction] Error al actualizar tenant:', updateErr.message)
      return { success: false, error: updateErr.message }
    }

    // 3. Crear o actualizar suscripción saas con estado 'trialing'
    try {
      const { data: existingSub } = await supabase
        .from('saas_subscriptions')
        .select('id')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingSub) {
        await supabase
          .from('saas_subscriptions')
          .update({
            status: 'trialing',
            current_period_end: trialEndsAtIso,
            payment_notes: `Período de prueba de ${days} días activado desde Superadmin (${new Date().toLocaleDateString('es-AR')})`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSub.id)
      } else {
        await supabase
          .from('saas_subscriptions')
          .insert({
            tenant_id: tenantId,
            status: 'trialing',
            current_period_start: new Date().toISOString(),
            current_period_end: trialEndsAtIso,
            plan_id: 'MEDIANO_2',
            amount: 0,
            payment_notes: `Período de prueba de ${days} días activado desde Superadmin (${new Date().toLocaleDateString('es-AR')})`,
          })
      }
    } catch (subErr) {
      console.warn('[activateTenantTrialPeriodAction] saas_subscriptions error secundario:', subErr)
    }

    revalidatePath('/superadmin')
    revalidatePath('/dashboard/plan')
    revalidatePath('/dashboard')
    if (tenant.slug) {
      revalidatePath(`/club/${tenant.slug}`)
    }

    return { success: true, trialEndsAt: trialEndsAtIso }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al activar período de prueba'
    console.error('activateTenantTrialPeriodAction exception:', err)
    return { success: false, error: msg }
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
    const auth = await assertSuperadmin()
    if (!auth.authorized) return { success: false, data: [] }

    const supabase = await createServiceClient()
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role, tenant_id, created_at, tenants(name, slug)')
      .order('created_at', { ascending: false })

    if (error || !profiles) {
      console.warn('Error fetching profiles for superadmin:', error)
      return { success: false, data: [] }
    }

    // Obtener emails y teléfonos desde auth.users (requiere service role)
    const { data: authList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const emailMap: Record<string, string> = {}
    const phoneMap: Record<string, string> = {}
    if (authList?.users) {
      authList.users.forEach(u => { 
        emailMap[u.id] = u.email || ''
        phoneMap[u.id] = (u.user_metadata?.phone as string) || ''
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
        password: '',
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
          password: '',
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
    const auth = await assertSuperadmin()
    if (!auth.authorized) return { success: false, error: auth.error }

    const cleanPwd = newPassword?.trim()
    const pwdCheck = validatePasswordStrength(cleanPwd)
    if (!pwdCheck.valid) {
      return { success: false, error: pwdCheck.error }
    }

    const supabase = await createServiceClient()
    const { data: userData, error: getUserErr } = await supabase.auth.admin.getUserById(userId)
    if (getUserErr || !userData?.user) {
      return { success: false, error: 'Usuario no encontrado' }
    }

    const cleanMeta = { ...(userData.user.user_metadata || {}) }
    delete cleanMeta.assigned_password
    delete cleanMeta.initial_password

    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
      email_confirm: true,
      user_metadata: cleanMeta,
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
    const auth = await assertSuperadmin()
    if (!auth.authorized) return { success: false, error: auth.error }

    const cleanPwd = payload.password?.trim()
    const pwdCheck = validatePasswordStrength(cleanPwd)
    if (!pwdCheck.valid) {
      return { success: false, error: pwdCheck.error }
    }

    const supabase = await createServiceClient()
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        full_name: payload.name,
        phone: payload.phone,
      },
    })

    if (authError || !authData?.user) {
      if (authError?.message?.toLowerCase().includes('already') || authError?.status === 422) {
        const { data: usersData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
        const existingUser = usersData?.users?.find(u => u.email?.toLowerCase() === payload.email.trim().toLowerCase())
        if (existingUser) {
          const cleanMeta = { ...(existingUser.user_metadata || {}) }
          delete cleanMeta.assigned_password
          delete cleanMeta.initial_password
          await supabase.auth.admin.updateUserById(existingUser.id, {
            password: payload.password,
            email_confirm: true,
            user_metadata: {
              ...cleanMeta,
              full_name: payload.name,
              phone: payload.phone,
            },
          })
          await supabase.from('profiles').upsert({
            id: existingUser.id,
            tenant_id: payload.tenantId,
            full_name: payload.name,
            role: payload.role,
            phone: payload.phone,
          })
          revalidatePath('/superadmin')
          return { success: true, userId: existingUser.id }
        }
      }
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
    const auth = await assertSuperadmin()
    if (!auth.authorized) return { success: false, error: auth.error }

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
    const auth = await assertSuperadmin()
    if (!auth.authorized) return { success: false, error: auth.error }

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
 * Elimina un club completamente de la base de datos (con sus canchas, perfiles, suscripciones SaaS, etc.).
 * Requiere service role key.
 */
export async function deleteTenantById(tenantId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await assertSuperadmin()
    if (!auth.authorized) return { success: false, error: auth.error }

    const supabase = await createServiceClient()

    // 1. Torneos y fixtures dependientes
    try {
      const { data: tourneys } = await supabase.from('tournaments').select('id').eq('tenant_id', tenantId)
      if (tourneys && tourneys.length > 0) {
        const tIds = tourneys.map(t => t.id)
        const { data: cats } = await supabase.from('tournament_categories').select('id').in('tournament_id', tIds)
        if (cats && cats.length > 0) {
          const cIds = cats.map(c => c.id)
          try { await supabase.from('tournament_matches').delete().in('category_id', cIds) } catch {}
          try { await supabase.from('tournament_teams').delete().in('category_id', cIds) } catch {}
          try { await supabase.from('tournament_categories').delete().in('tournament_id', tIds) } catch {}
        }
      }
      await supabase.from('tournaments').delete().eq('tenant_id', tenantId)
    } catch (e) {
      console.warn('Error eliminando torneos:', e)
    }

    // 2. Órdenes y cantina
    try {
      const { data: orders } = await supabase.from('court_orders').select('id').eq('tenant_id', tenantId)
      if (orders && orders.length > 0) {
        const orderIds = orders.map(o => o.id)
        try { await supabase.from('court_order_items').delete().in('order_id', orderIds) } catch {}
      }
      await supabase.from('court_orders').delete().eq('tenant_id', tenantId)
    } catch (e) {
      console.warn('Error eliminando órdenes de cantina:', e)
    }

    // 3. Bloqueos, turnos fijos y listas de espera
    try { await supabase.from('court_blocks').delete().eq('tenant_id', tenantId) } catch {}
    try { await supabase.from('recurring_slots').delete().eq('tenant_id', tenantId) } catch {}
    try { await supabase.from('waitlists').delete().eq('tenant_id', tenantId) } catch {}

    // 4. Reservas y pagos de reservas
    try {
      const { data: bookings } = await supabase.from('bookings').select('id').eq('tenant_id', tenantId)
      if (bookings && bookings.length > 0) {
        const bIds = bookings.map(b => b.id)
        try { await supabase.from('booking_payments').delete().in('booking_id', bIds) } catch {}
      }
      try { await supabase.from('booking_payments').delete().eq('tenant_id', tenantId) } catch {}
      await supabase.from('bookings').delete().eq('tenant_id', tenantId)
    } catch (e) {
      console.warn('Error eliminando reservas:', e)
    }

    // 5. Reglas de precios y canchas
    try { await supabase.from('price_rules').delete().eq('tenant_id', tenantId) } catch {}
    try { await supabase.from('courts').delete().eq('tenant_id', tenantId) } catch {}

    // 6. Facturación y suscripciones SaaS (CRÍTICO: evita violaciones de foreign key)
    try { await supabase.from('tenant_invoices').delete().eq('tenant_id', tenantId) } catch (e) {
      console.warn('Error eliminando facturas SaaS:', e)
    }
    try { await supabase.from('saas_subscriptions').delete().eq('tenant_id', tenantId) } catch (e) {
      console.warn('Error eliminando suscripciones SaaS:', e)
    }
    try { await supabase.from('audit_log').delete().eq('tenant_id', tenantId) } catch {}

    // 7. Perfiles de usuario y cuentas auth asociadas al club (sin tocar SUPERADMINs)
    try {
      const { data: profiles } = await supabase.from('profiles').select('id, role').eq('tenant_id', tenantId)
      if (profiles && profiles.length > 0) {
        for (const p of profiles) {
          if (p.role !== 'SUPERADMIN') {
            try {
              await supabase.auth.admin.deleteUser(p.id)
            } catch (userErr) {
              console.warn('No se pudo eliminar auth user:', p.id, userErr)
            }
          }
        }
        await supabase.from('profiles').delete().eq('tenant_id', tenantId)
      }
    } catch (profErr) {
      console.warn('Error limpiando perfiles:', profErr)
      try {
        await supabase.from('profiles').update({ tenant_id: null }).eq('tenant_id', tenantId)
      } catch {}
    }

    // 8. Eliminar el club (tenant)
    const { error } = await supabase
      .from('tenants')
      .delete()
      .eq('id', tenantId)

    if (error) {
      console.error('Error deleting tenant:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/superadmin')
    revalidatePath('/dashboard')
    revalidatePath('/')
    return { success: true }
  } catch (err) {
    console.error('deleteTenantById exception:', err)
    return { success: false, error: 'Error al eliminar el club' }
  }
}

/**
 * Envía una prueba de telemetría a Email / WhatsApp / Webhook configurado.
 */
export async function testSuperadminTelemetryAction(): Promise<{
  success: boolean
  emailDelivered: boolean
  whatsappDelivered: boolean
  webhookDelivered: boolean
  error?: string
}> {
  const auth = await assertSuperadmin()
  if (!auth.authorized) {
    return { success: false, emailDelivered: false, whatsappDelivered: false, webhookDelivered: false, error: 'No autorizado' }
  }

  const { sendSuperadminAlert } = await import('@/lib/superadmin-notifications')
  return await sendSuperadminAlert({
    event: 'TEST_ALERT',
    title: 'Prueba de Conexión de Telemetría Superadmin',
    clubName: 'Club Demo / Test',
    clubSlug: 'club-test',
    details: {
      'Estado': 'Canal de alertas operativo y conectado correctamente',
      'Plataforma': 'CancharClub SaaS Enterprise',
      'Versión': '2.0 Producción',
    },
    priority: 'HIGH',
  })
}

