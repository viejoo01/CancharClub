'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createHmac } from 'crypto'
import type { User, Session, AuthError } from '@supabase/supabase-js'
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
  const rawPassword = formData.get('password') as string
  const password = rawPassword?.trim()

  if (!rawEmail || !password) {
    return { success: false, error: 'Completá email y contraseña' }
  }

  const cleanEmail = rawEmail.toLowerCase()
  let candidateEmails: string[] = []
  if (cleanEmail.includes('@')) {
    if (cleanEmail.endsWith('@club.com')) {
      candidateEmails = [cleanEmail, `${cleanEmail.replace(/@club\.com$/, '')}@encargado.com`]
    } else {
      candidateEmails = [cleanEmail]
    }
  } else {
    // Si ingresó solo el usuario, probar por defecto como dueño (@club.com) y luego como encargado (@encargado.com)
    candidateEmails = [`${cleanEmail}@club.com`, `${cleanEmail}@encargado.com`]
  }

  const cookieStore = await cookies()
  const supabase = await createClient()

  // 1. ANTES DE NADA: Limpiar cualquier sesión residual previa para evitar contaminación entre clubes
  await supabase.auth.signOut()
  STALE_AUTH_COOKIES.forEach(c => cookieStore.delete(c))

  let authData: { user: User; session: Session | null } | null = null
  let authError: AuthError | null = null

  for (const candidate of candidateEmails) {
    let { data, error } = await supabase.auth.signInWithPassword({
      email: candidate,
      password,
    })

    // Si hay error en el inicio de sesión, verificar auto-confirmación o auto-sincronización de credenciales
    if (error) {
      try {
        const serviceClient = await createServiceClient()
        const { data: usersData } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
        const existingUser = usersData?.users?.find(u => u.email?.toLowerCase() === candidate)

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
            const retry = await supabase.auth.signInWithPassword({ email: candidate, password })
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

    if (!error && data?.user) {
      authData = data
      authError = null
      break
    } else {
      authError = error
    }
  }

  // Si no se pudo autenticar con ningún candidato, PURGAR Y RETORNAR ERROR INMEDIATO.
  if (authError || !authData?.user) {
    await supabase.auth.signOut()
    STALE_AUTH_COOKIES.forEach(c => cookieStore.delete(c))
    let friendlyError = authError?.message || 'Credenciales incorrectas'
    if (friendlyError.toLowerCase().includes('invalid login credentials')) {
      friendlyError = 'Email o contraseña incorrectos. Verificá que no haya errores de tipeo.'
    }
    return { success: false, error: friendlyError }
  }

  const data = authData

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
    .select('id, name, slug, subscription_status, is_active, base_slots_plan, payment_methods, description')
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

  if (sub && sub.payment_notes && (sub.payment_notes.toLowerCase().includes('tarjeta') || sub.payment_notes.toLowerCase().includes('card'))) {
    hasCard = true
    const brandMatch = sub.payment_notes.match(/Tarjeta\s+([A-Za-z0-9_/-]+)/i)
    const last4Match = sub.payment_notes.match(/terminada\s+en\s+([0-9]{4})/i)
    cardBrand = brandMatch && !brandMatch[1].toLowerCase().startsWith('de') ? brandMatch[1] : 'Tarjeta'
    cardLast4 = last4Match ? last4Match[1] : undefined
  }

  if (t?.description) {
    try {
      const meta = JSON.parse(t.description)
      if (meta.card_linked) {
        hasCard = true
        if (meta.card_last4) cardLast4 = meta.card_last4
        if (meta.card_brand) cardBrand = meta.card_brand
      }
    } catch {}
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

  if (t?.base_slots_plan) {
    const planId: SaaSPlanId = t.base_slots_plan === 1 ? 'CHICO_1' : t.base_slots_plan === 2 ? 'MEDIANO_2' : t.base_slots_plan <= 4 ? 'CONSOLIDADO_3_4' : 'GRANDE_5_PLUS'
    cookieStore.set('demo_plan_id', planId, cookieOpts)
  }

  if (hasCard) {
    cookieStore.set('demo_has_card', 'true', cookieOpts)
    cookieStore.delete('new_club_pending_activation')
    if (cardLast4) cookieStore.set('demo_card_last4', cardLast4, cookieOpts)
    if (cardBrand) cookieStore.set('demo_card_brand', cardBrand, cookieOpts)
  } else {
    cookieStore.delete('demo_has_card')
    cookieStore.delete('demo_card_last4')
    cookieStore.delete('demo_card_brand')
    cookieStore.delete('demo_card_holder')
    cookieStore.set('new_club_pending_activation', 'true', cookieOpts)
  }

  if (profile?.role === 'TENANT_STAFF') {
    cookieStore.set('demo_user_role', 'TENANT_STAFF', cookieOpts)
    cookieStore.set('demo_user_name', profile.full_name || 'Encargado (Mostrador)', cookieOpts)
  } else {
    cookieStore.set('demo_user_role', 'TENANT_ADMIN', cookieOpts)
    cookieStore.set('demo_user_name', profile?.full_name || 'Dueño del Club', cookieOpts)
  }

  // SI EL CLUB AÚN NO VINCULÓ TARJETA, EXIGIRLA ANTES DE ENTRAR AL PANEL
  if (!hasCard && profile.role !== 'SUPERADMIN') {
    redirect('/onboarding/tarjeta')
  }

  redirect('/dashboard')
}

export async function registerClub(formData: FormData) {
  const clubName = (formData.get('clubName') as string)?.trim()
  const rawEmail = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string
  const phone = (formData.get('phone') as string)?.trim() || null
  const city = (formData.get('city') as string)?.trim() || 'San Miguel de Tucumán'
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
        phone: phone || undefined,
      },
    })
  } else {
    const { data: userData, error: userError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: clubName,
        phone: phone || undefined,
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
      phone_whatsapp: phone || null,
      city,
      province: 'Tucumán',
      country: 'Argentina',
      timezone: 'America/Argentina/Tucuman',
      is_active: false, // Inactivo hasta que ingrese la tarjeta de débito o crédito
      subscription_status: 'PAYMENT_PENDING', // Pendiente de vinculación de tarjeta
      base_slots_plan: baseSlots,
      payment_methods: ['CARD', 'MERCADO_PAGO'],
      description: JSON.stringify({
        card_linked: false,
        plan_id: planId,
        pending_card: true,
      }),
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
      phone: phone || null,
    })

  // 4. Canchas: El club inicia en blanco para que el dueño cree manualmente sus canchas exactas

  // 5. Iniciar sesión de Supabase para generar sesión y cookies
  const supabase = await createClient()
  await supabase.auth.signInWithPassword({
    email,
    password,
  })

  // 6. Configurar cookies de sesión exigiendo vinculación de tarjeta
  const cookieStore = await cookies()
  cookieStore.set('canchar_tenant_id', tenant.id, { path: '/', maxAge: 86400 })
  cookieStore.set('demo_tenant_id', tenant.id, { path: '/', maxAge: 86400 })
  cookieStore.set('demo_user_role', 'TENANT_ADMIN', { path: '/', maxAge: 86400 })
  cookieStore.set('demo_user_name', clubName, { path: '/', maxAge: 86400 })
  cookieStore.set('demo_tenant_name', clubName, { path: '/', maxAge: 86400 })
  cookieStore.set('demo_tenant_slug', tenant.slug, { path: '/', maxAge: 86400 })
  cookieStore.set('demo_subscription_status', 'PAYMENT_PENDING', { path: '/', maxAge: 86400 })
  cookieStore.set('demo_is_active', 'false', { path: '/', maxAge: 86400 })
  cookieStore.set('demo_plan_id', planId, { path: '/', maxAge: 86400 })
  cookieStore.set('new_club_pending_activation', 'true', { path: '/', maxAge: 86400 })
  cookieStore.delete('demo_has_card')
  cookieStore.delete('demo_card_last4')
  cookieStore.delete('demo_card_brand')
  cookieStore.delete('demo_card_holder')

  // Redirigir obligatoriamente al paso de vinculación de tarjeta antes del panel
  redirect('/onboarding/tarjeta')
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

