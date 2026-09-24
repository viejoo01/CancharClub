'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import type { SaaSPlanId } from '@/config/saas-plans'

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
  const serviceClient = await createServiceClient()
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role, full_name, tenant_id')
    .eq('id', data.user.id)
    .maybeSingle()

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

  let t = null
  let hasCard = false
  let cardLast4: string | undefined
  let cardBrand: string | undefined

  if (profile?.tenant_id) {
    const { data: tenantData } = await serviceClient
      .from('tenants')
      .select('id, name, slug, subscription_status, is_active, base_slots_plan, payment_methods')
      .eq('id', profile.tenant_id)
      .maybeSingle()
    t = tenantData

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
  }

  if (profile?.tenant_id) {
    cookieStore.set('canchar_tenant_id', profile.tenant_id, { path: '/', maxAge: 86400 })
    cookieStore.set('demo_tenant_id', profile.tenant_id, { path: '/', maxAge: 86400 })
  }
  if (t?.name) cookieStore.set('demo_tenant_name', t.name, { path: '/', maxAge: 86400 })
  if (t?.slug) cookieStore.set('demo_tenant_slug', t.slug, { path: '/', maxAge: 86400 })
  if (t?.subscription_status) cookieStore.set('demo_subscription_status', t.subscription_status, { path: '/', maxAge: 86400 })

  const isActuallyActive = t?.is_active === true
  cookieStore.set('demo_is_active', isActuallyActive ? 'true' : 'false', { path: '/', maxAge: 86400 })
  if (isActuallyActive) {
    cookieStore.delete('new_club_pending_activation')
  }

  if (t?.base_slots_plan) {
    const planId: SaaSPlanId = t.base_slots_plan === 1 ? 'CHICO_1' : t.base_slots_plan === 2 ? 'MEDIANO_2' : t.base_slots_plan <= 4 ? 'CONSOLIDADO_3_4' : 'GRANDE_5_PLUS'
    cookieStore.set('demo_plan_id', planId, { path: '/', maxAge: 86400 })
  }

  if (hasCard || isActuallyActive) {
    cookieStore.set('demo_has_card', 'true', { path: '/', maxAge: 86400 })
    if (cardLast4) cookieStore.set('demo_card_last4', cardLast4, { path: '/', maxAge: 86400 })
    if (cardBrand) cookieStore.set('demo_card_brand', cardBrand, { path: '/', maxAge: 86400 })
  }

  if (profile?.role === 'TENANT_STAFF') {
    cookieStore.set('demo_user_role', 'TENANT_STAFF', { path: '/', maxAge: 86400 })
    cookieStore.set('demo_user_name', profile.full_name || 'Encargado (Mostrador)', { path: '/', maxAge: 86400 })
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
  const planId = ((formData.get('planId') as string) || 'MEDIANO_2') as SaaSPlanId

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
      is_active: false, // Inicia desactivado esperando confirmación de activación
      subscription_status: 'PAYMENT_PENDING', // Estado de activación pendiente
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
  cookieStore.set('demo_subscription_status', 'PAYMENT_PENDING', { path: '/', maxAge: 86400 })
  cookieStore.set('demo_is_active', 'false', { path: '/', maxAge: 86400 })
  cookieStore.set('demo_plan_id', planId, { path: '/', maxAge: 86400 })
  cookieStore.set('new_club_pending_activation', 'true', { path: '/', maxAge: 86400 })
  // Asegurar que no queden datos de tarjeta residuales de otra sesión en este navegador
  cookieStore.delete('demo_has_card')
  cookieStore.delete('demo_card_last4')
  cookieStore.delete('demo_card_brand')
  cookieStore.delete('demo_card_holder')

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
