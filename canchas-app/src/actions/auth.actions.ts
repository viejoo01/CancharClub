'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createHmac } from 'crypto'
import type { SaaSPlanId } from '@/config/saas-plans'
import { formatClubEmail } from '@/lib/utils'

const STALE_AUTH_COOKIES = [
  'canchar_tenant_id',
  'demo_tenant_id',
  'demo_tenant_name',
  'demo_tenant_slug',
  'demo_user_role',
  'demo_user_name',
  'demo_subscription_status',
  'demo_plan_id',
  'demo_is_active',
  'demo_has_card',
  'demo_card_last4',
  'demo_card_brand',
  'demo_card_holder',
  'new_club_pending_activation',
  'canchar_active_venue_id',
  'canchar_active_venue_name',
  'sa_session',
]

export async function clearAuthCookies() {
  try {
    const cookieStore = await cookies()
    const supabase = await createClient()
    await supabase.auth.signOut()
    STALE_AUTH_COOKIES.forEach(c => cookieStore.delete(c))
    return { success: true }
  } catch (err) {
    console.error('Error clearing auth cookies:', err)
    return { success: false }
  }
}

export async function loginWithEmail(formData: FormData) {
  const rawEmail = (formData.get('email') as string)?.trim()
  let email = rawEmail?.toLowerCase()
  if (email && !email.includes('@')) {
    email = `${email}@club.com`
  }
  const rawPassword = formData.get('password') as string
  const password = rawPassword?.trim()

  if (!email || !password) {
    return { success: false, error: 'Completá email y contraseña' }
  }

  const cookieStore = await cookies()
  const supabase = await createClient()

  // 1. ANTES DE NADA: Limpiar cualquier sesión residual previa para evitar contaminación entre clubes
  await supabase.auth.signOut()
  STALE_AUTH_COOKIES.forEach(c => cookieStore.delete(c))

  let { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  // Si hay error en el inicio de sesión, verificar auto-confirmación o auto-sincronización de credenciales
  if (error) {
    try {
      const serviceClient = await createServiceClient()
      const { data: usersData } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const existingUser = usersData?.users?.find(u => u.email?.toLowerCase() === email)

      if (existingUser) {
        let shouldUpdate = false
        const updatePayload: { email_confirm?: boolean; password?: string } = {}

        if (!existingUser.email_confirmed_at) {
          updatePayload.email_confirm = true
          shouldUpdate = true
        }

        // Si la clave ingresada coincide con la asignada en metadatos, reparar hash desincronizado
        const metaPwd = (existingUser.user_metadata?.assigned_password || existingUser.user_metadata?.initial_password) as string | undefined
        if (metaPwd && (metaPwd.trim() === password || metaPwd === rawPassword)) {
          updatePayload.password = password
          updatePayload.email_confirm = true
          shouldUpdate = true
        }

        if (shouldUpdate) {
          await serviceClient.auth.admin.updateUserById(existingUser.id, updatePayload)
          const retry = await supabase.auth.signInWithPassword({ email, password })
          if (retry.data?.user) {
            data = retry.data
            error = null
          }
        }
      }
    } catch (adminErr) {
      console.error('Error auto-syncing credentials:', adminErr)
    }
  }

  // Si no se pudo autenticar, PURGAR Y RETORNAR ERROR INMEDIATO. NUNCA DEJAR PASAR NI REDIRIGIR.
  if (error || !data?.user) {
    await supabase.auth.signOut()
    STALE_AUTH_COOKIES.forEach(c => cookieStore.delete(c))
    let friendlyError = error?.message || 'Credenciales incorrectas'
    if (friendlyError.toLowerCase().includes('invalid login credentials')) {
      friendlyError = 'Email o contraseña incorrectos. Verificá que no haya errores de tipeo.'
    }
    return { success: false, error: friendlyError }
  }

  // Comprobar rol de usuario y tenant
  const serviceClient = await createServiceClient()
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role, full_name, tenant_id')
    .eq('id', data.user.id)
    .maybeSingle()

  const isSuperadmin = 
    profile?.role === 'SUPERADMIN' ||
    Boolean(process.env.SUPERADMIN_USER_ID && data.user.id === process.env.SUPERADMIN_USER_ID)

  if (isSuperadmin) {
    cookieStore.set('demo_user_role', 'SUPERADMIN', { path: '/', maxAge: 86400 })
    cookieStore.set('demo_user_name', profile?.full_name || 'Superadmin Plataforma', { path: '/', maxAge: 86400 })
    
    // Generar sa_session firmado para acceso directo al panel /superadmin
    const saSecret = process.env.SUPERADMIN_SESSION_SECRET
    const saUsername = process.env.SUPERADMIN_USERNAME || 'superadmin'
    if (saSecret) {
      const payload = `${saUsername}:${Date.now()}`
      const sig = createHmac('sha256', saSecret).update(payload).digest('hex')
      const token = Buffer.from(`${payload}:${sig}`).toString('base64url')
      cookieStore.set('sa_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
      })
    }

    redirect('/superadmin')
  }

  // SEGURIDAD CRÍTICA MULTI-TENANT:
  // Si no es superadmin, el usuario DEBE tener un tenant_id legítimo en su perfil
  if (!profile?.tenant_id) {
    await supabase.auth.signOut()
    STALE_AUTH_COOKIES.forEach(c => cookieStore.delete(c))
    return {
      success: false,
      error: 'Esta cuenta no tiene ningún club asignado. Contactá a soporte.',
    }
  }

  // Buscar estrictamente el club asignado en la base de datos
  const { data: t } = await serviceClient
    .from('tenants')
    .select('id, name, slug, subscription_status, is_active, base_slots_plan, payment_methods')
    .eq('id', profile.tenant_id)
    .maybeSingle()

  if (!t) {
    await supabase.auth.signOut()
    STALE_AUTH_COOKIES.forEach(c => cookieStore.delete(c))
    return {
      success: false,
      error: 'El club asignado a esta cuenta no existe o fue dado de baja.',
    }
  }

  let hasCard = false
  let cardLast4: string | undefined
  let cardBrand: string | undefined

  const { data: sub } = await serviceClient
    .from('saas_subscriptions')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (sub && (sub.status === 'active' || sub.status === 'trialing' || sub.payment_notes?.toLowerCase().includes('tarjeta'))) {
    hasCard = true
    if (sub.payment_notes && sub.payment_notes.toLowerCase().includes('tarjeta')) {
      const brandMatch = sub.payment_notes.match(/Tarjeta\s+([A-Za-z0-9_/-]+)/i)
      const last4Match = sub.payment_notes.match(/terminada\s+en\s+([0-9]{4})/i)
      cardBrand = brandMatch && !brandMatch[1].toLowerCase().startsWith('de') ? brandMatch[1] : 'Tarjeta'
      cardLast4 = last4Match ? last4Match[1] : undefined
    }
  }

  const isProd = process.env.NODE_ENV === 'production'
  const cookieOpts = { path: '/', maxAge: 86400, secure: isProd, sameSite: 'lax' as const }

  cookieStore.set('canchar_tenant_id', profile.tenant_id, cookieOpts)
  cookieStore.set('demo_tenant_id', profile.tenant_id, cookieOpts)
  if (t?.name) cookieStore.set('demo_tenant_name', t.name, cookieOpts)
  if (t?.slug) cookieStore.set('demo_tenant_slug', t.slug, cookieOpts)
  if (t?.subscription_status) cookieStore.set('demo_subscription_status', t.subscription_status, cookieOpts)

  const isActuallyActive = t?.is_active === true
  cookieStore.set('demo_is_active', isActuallyActive ? 'true' : 'false', cookieOpts)
  cookieStore.delete('new_club_pending_activation')

  if (t?.base_slots_plan) {
    const planId: SaaSPlanId = t.base_slots_plan === 1 ? 'CHICO_1' : t.base_slots_plan === 2 ? 'MEDIANO_2' : t.base_slots_plan <= 4 ? 'CONSOLIDADO_3_4' : 'GRANDE_5_PLUS'
    cookieStore.set('demo_plan_id', planId, cookieOpts)
  }

  if (hasCard || isActuallyActive) {
    cookieStore.set('demo_has_card', 'true', cookieOpts)
    if (cardLast4) cookieStore.set('demo_card_last4', cardLast4, cookieOpts)
    if (cardBrand) cookieStore.set('demo_card_brand', cardBrand, cookieOpts)
  }

  if (profile?.role === 'TENANT_STAFF') {
    cookieStore.set('demo_user_role', 'TENANT_STAFF', cookieOpts)
    cookieStore.set('demo_user_name', profile.full_name || 'Encargado (Mostrador)', cookieOpts)
  } else {
    cookieStore.set('demo_user_role', 'TENANT_ADMIN', cookieOpts)
    cookieStore.set('demo_user_name', profile?.full_name || 'Dueño del Club', cookieOpts)
  }

  redirect('/dashboard')
}

export async function registerClub(formData: FormData) {
  const clubName = (formData.get('clubName') as string)?.trim()
  const rawEmail = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string
  const phone = (formData.get('phone') as string)?.trim() || '+5493816839320'
  const city = (formData.get('city') as string)?.trim() || 'San Miguel de Tucumán'
  const sportsRaw = formData.get('sports') as string
  const planId = ((formData.get('planId') as string) || 'MEDIANO_2') as SaaSPlanId

  if (!clubName || !password) {
    return { success: false, error: 'Completá todos los campos requeridos' }
  }

  // REGLA: El email del club es siempre por defecto: <nombre_elegido>@club.com
  const email = formatClubEmail(rawEmail, clubName)

  const serviceClient = await createServiceClient()

  // 1. REGLA DE SEGURIDAD CRÍTICA: No pueden dos clubes distintos tener el mismo mail
  const { data: existingTenant } = await serviceClient
    .from('tenants')
    .select('id, name, email')
    .ilike('email', email)
    .maybeSingle()

  if (existingTenant) {
    return {
      success: false,
      error: `El email "${email}" ya está registrado por otro club ("${existingTenant.name}"). Por favor elegí otro nombre para tu club.`,
    }
  }

  // 2. Comprobar también en Supabase Auth si el usuario ya está asociado a otro club
  const { data: usersData } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existingAuthUser = usersData?.users?.find(u => u.email?.toLowerCase() === email)
  if (existingAuthUser) {
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('tenant_id')
      .eq('id', existingAuthUser.id)
      .maybeSingle()
    if (profile?.tenant_id) {
      return {
        success: false,
        error: `El correo "${email}" ya se encuentra registrado por otro club. Por favor elegí otro nombre.`,
      }
    }
  }

  let sports: string[] = ['PADEL']
  if (sportsRaw) {
    try {
      const parsed = JSON.parse(sportsRaw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        sports = parsed
      }
    } catch {
      sports = ['PADEL']
    }
  }

  // 3. Crear o actualizar usuario en Supabase Auth con confirmación automática
  let userId: string | null = null

  if (existingAuthUser) {
    // Si existía sin tenant, reutilizarlo
    userId = existingAuthUser.id
    await serviceClient.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: {
        full_name: clubName,
        phone,
      },
    })
  } else {
    const { data: userData, error: userError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: clubName,
        phone,
      },
    })

    if (userError) {
      return { success: false, error: userError.message }
    } else if (userData?.user) {
      userId = userData.user.id
    }
  }

  if (!userId) {
    return { success: false, error: 'No se pudo generar la cuenta de usuario' }
  }

  // 2. Crear Tenant con columnas exactas de Supabase
  const baseSlug = clubName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  const slug = `${baseSlug || 'club'}-${Date.now().toString().slice(-4)}`

  const baseSlotsMap: Record<SaaSPlanId, number> = {
    CHICO_1: 1,
    MEDIANO_2: 2,
    CONSOLIDADO_3_4: 4,
    GRANDE_5_PLUS: 6,
  }
  const baseSlots = baseSlotsMap[planId] || 2

  const { data: tenant, error: tenantError } = await serviceClient
    .from('tenants')
    .insert({
      name: clubName,
      slug,
      email,
      phone_whatsapp: phone,
      city,
      province: 'Tucumán',
      country: 'Argentina',
      timezone: 'America/Argentina/Tucuman',
      is_active: true, // Club recién agregado queda activo y operativo de inmediato
      subscription_status: 'ACTIVE', // Suscripción activa
      base_slots_plan: baseSlots,
      payment_methods: ['CARD', 'MERCADO_PAGO'],
    })
    .select()
    .single()

  if (tenantError || !tenant) {
    console.error('Error inserting tenant:', tenantError)
    return { success: false, error: tenantError?.message || 'Error al crear el club' }
  }

  // 3. Asignar perfil como TENANT_ADMIN vinculado al tenant
  await serviceClient
    .from('profiles')
    .upsert({
      id: userId,
      tenant_id: tenant.id,
      full_name: clubName,
      role: 'TENANT_ADMIN',
      phone,
    })

  // 4. Crear canchas iniciales según plan y deportes seleccionados
  try {
    const targetCourts = planId === 'CHICO_1' ? 1 : planId === 'MEDIANO_2' ? 2 : planId === 'CONSOLIDADO_3_4' ? 3 : 5
    const courtsToInsert = []
    for (let index = 0; index < targetCourts; index++) {
      const sport = sports[index % sports.length] || 'PADEL'
      const s = sport.toUpperCase()
      const isPadel = s.includes('PADEL')
      let sportEnum: 'PADEL' | 'FUTBOL5' | 'FUTBOL7' | 'TENIS' | 'BASQUET' = 'PADEL'
      if (s.includes('7')) sportEnum = 'FUTBOL7'
      else if (s.includes('FUTBOL') || s.includes('SOCCER') || s.includes('5')) sportEnum = 'FUTBOL5'
      else if (s.includes('TENIS') || s.includes('TENNIS')) sportEnum = 'TENIS'
      else if (s.includes('BASQUET') || s.includes('BASKET')) sportEnum = 'BASQUET'

      const isBasket = sportEnum === 'BASQUET'
      const isTenis = sportEnum === 'TENIS'
      const surfaceName = isPadel ? 'Cristal' : isBasket ? 'Parquet' : isTenis ? 'Polvo de ladrillo' : 'Sintético'
      const surfaceEnum = isPadel ? 'CRISTAL' : isBasket ? 'PARQUET' : isTenis ? 'POLVO_LADRILLO' : 'CESPED_SINTETICO'

      courtsToInsert.push({
        tenant_id: tenant.id,
        name: `Cancha ${index + 1} (${surfaceName})`,
        sport: sportEnum,
        surface: surfaceEnum,
        slot_duration_minutes: isPadel ? 90 : 60,
        has_lights: true,
        display_order: index + 1,
        is_active: true,
      })
    }
    const { error: insertCourtsErr } = await serviceClient.from('courts').insert(courtsToInsert)
    if (insertCourtsErr) console.error('Error creating initial courts:', insertCourtsErr.message)
  } catch (courtErr) {
    console.warn('Initial courts creation notice:', courtErr)
  }

  // 5. Iniciar sesión de Supabase para generar sesión y cookies
  const supabase = await createClient()
  await supabase.auth.signInWithPassword({
    email,
    password,
  })

  // 6. Configurar cookies de sesión
  const cookieStore = await cookies()
  cookieStore.set('canchar_tenant_id', tenant.id, { path: '/', maxAge: 86400 })
  cookieStore.set('demo_tenant_id', tenant.id, { path: '/', maxAge: 86400 })
  cookieStore.set('demo_user_role', 'TENANT_ADMIN', { path: '/', maxAge: 86400 })
  cookieStore.set('demo_user_name', clubName, { path: '/', maxAge: 86400 })
  cookieStore.set('demo_tenant_name', clubName, { path: '/', maxAge: 86400 })
  cookieStore.set('demo_tenant_slug', tenant.slug, { path: '/', maxAge: 86400 })
  cookieStore.set('demo_subscription_status', 'ACTIVE', { path: '/', maxAge: 86400 })
  cookieStore.set('demo_is_active', 'true', { path: '/', maxAge: 86400 })
  cookieStore.set('demo_plan_id', planId, { path: '/', maxAge: 86400 })
  cookieStore.delete('new_club_pending_activation')
  cookieStore.set('demo_has_card', 'true', { path: '/', maxAge: 86400 })

  redirect('/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const cookieStore = await cookies()
  const cookiesToDelete = [
    'demo_user_role',
    'demo_user_name',
    'demo_subscription_status',
    'demo_plan_id',
    'demo_tenant_name',
    'demo_tenant_slug',
    'demo_tenant_id',
    'canchar_tenant_id',
    'demo_is_active',
    'demo_has_card',
    'demo_card_last4',
    'demo_card_brand',
    'demo_card_holder',
    'new_club_pending_activation',
    'canchar_active_venue_id',
    'canchar_active_venue_name',
  ]
  cookiesToDelete.forEach(c => cookieStore.delete(c))
  redirect('/')
}

/**
 * Permite al usuario actual autenticado (dueño o encargado) cambiar su propia contraseña.
 */
export async function changeOwnPassword(payload: {
  currentPassword?: string
  newPassword: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanNewPassword = payload.newPassword?.trim()
    if (!cleanNewPassword || cleanNewPassword.length < 8) {
      return { success: false, error: 'La nueva contraseña debe tener al menos 8 caracteres.' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Si hay usuario en la sesión Supabase
    const targetUserId = user?.id
    const userEmail = user?.email

    // Si no hay usuario en sesión Supabase, rechazar la operación.
    // No se permite cambiar contraseña sin sesión activa verificada.
    if (!targetUserId) {
      return { success: false, error: 'No se encontró una sesión activa de usuario. Por favor volvé a ingresar.' }
    }

    // Si se especificó contraseña actual y tenemos email, validar que sea correcta
    if (payload.currentPassword?.trim() && userEmail) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: payload.currentPassword.trim(),
      })
      if (signInErr) {
        return { success: false, error: 'La contraseña actual ingresada es incorrecta.' }
      }
    }

    // Actualizar la contraseña con serviceClient (evita restricciones de sesión)
    const serviceClient = await createServiceClient()
    const { data: userData } = await serviceClient.auth.admin.getUserById(targetUserId)
    const cleanMeta = { ...(userData?.user?.user_metadata || {}) }
    delete cleanMeta.assigned_password
    delete cleanMeta.initial_password

    const { error: updateErr } = await serviceClient.auth.admin.updateUserById(targetUserId, {
      password: cleanNewPassword,
      email_confirm: true,
      user_metadata: cleanMeta,
    })

    if (updateErr) {
      return { success: false, error: updateErr.message }
    }

    // Refrescar la sesión en Supabase con la nueva contraseña si tenemos el email
    if (userEmail) {
      try {
        await supabase.auth.signInWithPassword({
          email: userEmail,
          password: cleanNewPassword,
        })
      } catch {}
    }

    return { success: true }
  } catch (err) {
    console.error('changeOwnPassword exception:', err)
    return { success: false, error: 'Error inesperado al cambiar la contraseña.' }
  }
}

