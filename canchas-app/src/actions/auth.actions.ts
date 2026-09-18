'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export async function loginWithEmail(formData: FormData) {
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string

  if (!email || !password) {
    return { success: false, error: 'Completá email y contraseña' }
  }

  const supabase = await createClient()
  let { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  // Si el email no está confirmado, auto-confirmar con serviceClient y reintentar
  if (error && error.message.toLowerCase().includes('email not confirmed')) {
    try {
      const serviceClient = await createServiceClient()
      const { data: usersData } = await serviceClient.auth.admin.listUsers()
      const existingUser = usersData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
      if (existingUser) {
        await serviceClient.auth.admin.updateUserById(existingUser.id, { email_confirm: true })
        const retry = await supabase.auth.signInWithPassword({ email, password })
        data = retry.data
        error = retry.error
      }
    } catch (adminErr) {
      console.error('Error auto-confirming email:', adminErr)
    }
  }

  if (error || !data?.user) {
    return { success: false, error: error?.message || 'Credenciales incorrectas' }
  }

  // Comprobar rol de usuario y tenant
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, tenant_id, tenants(name, slug, subscription_status, is_active)')
    .eq('id', data.user.id)
    .single()

  const isSuperadmin = 
    profile?.role === 'SUPERADMIN' ||
    Boolean(process.env.SUPERADMIN_USER_ID && data.user.id === process.env.SUPERADMIN_USER_ID) ||
    data.user.email === 'santi.alonsoleal@gmail.com' ||
    data.user.email === 'superadmin@cancharclub.com.ar'

  const cookieStore = await cookies()

  if (isSuperadmin) {
    cookieStore.set('demo_user_role', 'SUPERADMIN', { path: '/', maxAge: 86400 })
    cookieStore.set('demo_user_name', profile?.full_name || 'Superadmin Plataforma', { path: '/', maxAge: 86400 })
    redirect('/superadmin')
  }

  const t = profile?.tenants as unknown as { name?: string; slug?: string; subscription_status?: string; is_active?: boolean } | null

  if (t?.name) cookieStore.set('demo_tenant_name', t.name, { path: '/', maxAge: 86400 })
  if (t?.slug) cookieStore.set('demo_tenant_slug', t.slug, { path: '/', maxAge: 86400 })
  if (t?.subscription_status) cookieStore.set('demo_subscription_status', t.subscription_status, { path: '/', maxAge: 86400 })
  cookieStore.set('demo_is_active', t?.is_active === true ? 'true' : 'false', { path: '/', maxAge: 86400 })

  if (profile?.role === 'TENANT_STAFF') {
    cookieStore.set('demo_user_role', 'TENANT_STAFF', { path: '/', maxAge: 86400 })
    cookieStore.set('demo_user_name', profile.full_name || 'Canchero (Mostrador)', { path: '/', maxAge: 86400 })
  } else {
    cookieStore.set('demo_user_role', 'TENANT_ADMIN', { path: '/', maxAge: 86400 })
    cookieStore.set('demo_user_name', profile?.full_name || 'Dueño del Club', { path: '/', maxAge: 86400 })
  }

  redirect('/dashboard')
}

export async function registerClub(formData: FormData) {
  const clubName = (formData.get('clubName') as string)?.trim()
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const password = formData.get('password') as string
  const phone = (formData.get('phone') as string)?.trim() || '+5493816839320'
  const city = (formData.get('city') as string)?.trim() || 'San Miguel de Tucumán'
  const sportsRaw = formData.get('sports') as string

  if (!clubName || !email || !password) {
    return { success: false, error: 'Completá todos los campos requeridos' }
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

  const serviceClient = await createServiceClient()

  // 1. Crear o actualizar usuario en Supabase Auth con confirmación automática
  let userId: string | null = null

  const { data: userData, error: userError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: clubName,
      phone,
      initial_password: password,
      assigned_password: password,
    },
  })

  if (userError) {
    if (userError.message.toLowerCase().includes('already') || userError.status === 422) {
      const { data: existingUsers } = await serviceClient.auth.admin.listUsers()
      const existing = existingUsers?.users?.find(u => u.email?.toLowerCase() === email)
      if (existing) {
        userId = existing.id
        await serviceClient.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
          user_metadata: { 
            full_name: clubName, 
            phone,
            initial_password: password,
            assigned_password: password,
          },
        })
      } else {
        return { success: false, error: userError.message }
      }
    } else {
      return { success: false, error: userError.message }
    }
  } else if (userData?.user) {
    userId = userData.user.id
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
      is_active: true,
      subscription_status: 'ACTIVE',
      payment_methods: ['TRANSFER', 'MERCADO_PAGO'],
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

  // 4. Crear canchas iniciales según deportes seleccionados
  try {
    const courtsToInsert = sports.map((sport: string, index: number) => {
      const s = sport.toUpperCase()
      const isPadel = s.includes('PADEL')
      let sportEnum: 'PADEL' | 'FUTBOL5' | 'FUTBOL7' | 'TENIS' = 'PADEL'
      if (s.includes('7')) sportEnum = 'FUTBOL7'
      else if (s.includes('FUTBOL') || s.includes('SOCCER') || s.includes('5')) sportEnum = 'FUTBOL5'
      else if (s.includes('TENIS') || s.includes('TENNIS')) sportEnum = 'TENIS'

      return {
        tenant_id: tenant.id,
        name: `Cancha ${index + 1} (${isPadel ? 'Cristal' : 'Sintético'})`,
        sport: sportEnum,
        surface: isPadel ? 'CRISTAL' : 'CESPED_SINTETICO',
        slot_duration_minutes: isPadel ? 90 : 60,
        has_lights: true,
        display_order: index + 1,
        is_active: true,
      }
    })
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
  cookieStore.set('demo_user_role', 'TENANT_ADMIN', { path: '/', maxAge: 86400 })
  cookieStore.set('demo_user_name', clubName, { path: '/', maxAge: 86400 })
  cookieStore.set('demo_tenant_name', clubName, { path: '/', maxAge: 86400 })
  cookieStore.set('demo_tenant_slug', tenant.slug, { path: '/', maxAge: 86400 })
  cookieStore.set('demo_subscription_status', 'ACTIVE', { path: '/', maxAge: 86400 })
  cookieStore.set('demo_is_active', 'true', { path: '/', maxAge: 86400 })

  redirect('/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const cookieStore = await cookies()
  cookieStore.delete('demo_user_role')
  cookieStore.delete('demo_user_name')
  cookieStore.delete('demo_subscription_status')
  cookieStore.delete('demo_plan_id')
  cookieStore.delete('demo_tenant_name')
  cookieStore.delete('demo_tenant_slug')
  cookieStore.delete('canchar_active_venue_id')
  cookieStore.delete('canchar_active_venue_name')
  redirect('/')
}
