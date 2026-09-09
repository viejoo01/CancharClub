'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function loginWithEmail(formData: FormData) {
  const email = formData.get('email') as string
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
    .select('role')
    .eq('id', data.user.id)
    .single()

  if (profile?.role === 'SUPERADMIN') {
    redirect('/superadmin')
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
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({
      name: clubName,
      slug: `${slug}-${Date.now().toString().slice(-4)}`,
      contact_email: email,
      contact_phone: phone,
      city: 'San Miguel de Tucumán',
      province: 'Tucumán',
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
  redirect('/auth/login')
}
