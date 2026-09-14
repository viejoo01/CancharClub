'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export async function loginWithEmail(formData: FormData) {
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string

  if (!email || !password) {
    return { success: false, error: 'Completá email y contraseña' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  // Comprobar rol de usuario
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
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
  const clubName = formData.get('clubName') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const phone = formData.get('phone') as string

  if (!clubName || !email || !password) {
    return { success: false, error: 'Completá todos los campos requeridos' }
  }

  const supabase = await createClient()

  // 1. Crear usuario en Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: clubName,
        phone,
      },
    },
  })

  if (authError) {
    return { success: false, error: authError.message }
  }

  // 2. Crear Tenant
  const slug = clubName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const { data: tenant } = await supabase
    .from('tenants')
    .insert({
      name: clubName,
      slug: `${slug}-${Date.now().toString().slice(-4)}`,
      contact_email: email,
      contact_phone: phone,
      city: 'San Miguel de Tucumán',
      province: 'Tucumán',
      is_active: false,  // Requiere activación manual por CancharClub
      plan_id: 'CHICO_1', // Plan inicial por defecto
    })
    .select()
    .single()

  if (tenant && authData.user) {
    // 3. Asignar perfil como TENANT_ADMIN
    await supabase.from('profiles').insert({
      id: authData.user.id,
      tenant_id: tenant.id,
      full_name: clubName,
      role: 'TENANT_ADMIN',
      phone,
    })
  }

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
  redirect('/auth/login')
}
