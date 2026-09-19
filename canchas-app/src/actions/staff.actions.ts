'use server'
// src/actions/staff.actions.ts
// ==============================================================================
// SERVER ACTIONS — Gestión de Equipo, Empleados y Permisos (Multiusuario)
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type StaffRole = 'TENANT_ADMIN' | 'TENANT_STAFF'

export interface StaffMember {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: StaffRole
  created_at: string
  last_sign_in_at?: string | null
}

/**
 * Obtiene la lista de colaboradores reales del club desde PostgreSQL y Supabase Auth.
 * Si el club no tiene colaboradores adicionales o solo tiene al dueño, devuelve únicamente
 * los registros que verdaderamente existen en la base de datos (nunca datos ficticios).
 */
export async function getClubStaff(
  tenantId: string
): Promise<{ success: boolean; staff: StaffMember[]; error?: string }> {
  try {
    if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      return { success: true, staff: [] }
    }

    const supabase = await createServiceClient()

    // 1. Consultar perfiles asociados al club con roles autorizados
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role, created_at')
      .eq('tenant_id', tenantId)
      .in('role', ['TENANT_ADMIN', 'TENANT_STAFF'])
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[getClubStaff] Error al consultar profiles:', error.message)
      return { success: false, staff: [], error: error.message }
    }

    if (!profiles || profiles.length === 0) {
      return { success: true, staff: [] }
    }

    // 2. Resolver emails desde Supabase Auth (donde reside el email del usuario)
    const staff: StaffMember[] = await Promise.all(
      profiles.map(async (p) => {
        let email = ''
        let lastSignIn: string | null = null
        try {
          const { data: userData } = await supabase.auth.admin.getUserById(p.id)
          if (userData?.user) {
            email = userData.user.email || ''
            lastSignIn = userData.user.last_sign_in_at || null
          }
        } catch {
          // Si no se puede resolver el auth user, continúa con email vacío
        }

        return {
          id: p.id,
          full_name: p.full_name || 'Colaborador',
          email,
          phone: p.phone || null,
          role: p.role as StaffRole,
          created_at: p.created_at,
          last_sign_in_at: lastSignIn,
        }
      })
    )

    return { success: true, staff }
  } catch (err) {
    console.error('[getClubStaff] Exception:', err)
    return { success: false, staff: [], error: 'Error inesperado al consultar equipo' }
  }
}

/**
 * Invita o crea un nuevo miembro del equipo en la base de datos real.
 */
export async function inviteStaffMember(params: {
  tenantId: string
  fullName: string
  email: string
  role: StaffRole
  phone?: string
}): Promise<{ success: boolean; member?: StaffMember; error?: string }> {
  try {
    if (!params.tenantId || !params.fullName.trim() || !params.email.trim()) {
      return { success: false, error: 'Por favor completá todos los campos requeridos.' }
    }

    const supabase = await createServiceClient()
    const cleanEmail = params.email.trim().toLowerCase()
    const cleanName = params.fullName.trim()
    const cleanPhone = params.phone?.trim() || null

    // 1. Buscar si ya existe una cuenta de usuario con este correo
    const { data: usersData } = await supabase.auth.admin.listUsers()
    const existingUser = usersData?.users?.find(u => u.email?.toLowerCase() === cleanEmail)
    let userId = existingUser?.id

    // 2. Si no existe, crear el usuario en Supabase Auth
    if (!existingUser) {
      const tempPassword = `Club${Math.floor(100000 + Math.random() * 900000)}`
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: cleanEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: cleanName,
          phone: cleanPhone,
          assigned_password: tempPassword,
        },
      })

      if (createErr || !newUser?.user) {
        console.error('[inviteStaffMember] Error al crear auth user:', createErr?.message)
        return { success: false, error: createErr?.message || 'Error al generar la cuenta del colaborador' }
      }
      userId = newUser.user.id
    }

    if (!userId) {
      return { success: false, error: 'No se pudo vincular la cuenta de usuario' }
    }

    // 3. Crear o actualizar el perfil en la tabla profiles
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        tenant_id: params.tenantId,
        full_name: cleanName,
        phone: cleanPhone,
        role: params.role,
      })
      .select('id, full_name, phone, role, created_at')
      .single()

    if (profileErr || !profile) {
      console.error('[inviteStaffMember] Error al guardar perfil:', profileErr?.message)
      return { success: false, error: profileErr?.message || 'Error al guardar el colaborador en la base de datos' }
    }

    revalidatePath('/dashboard/equipo')
    return {
      success: true,
      member: {
        id: profile.id,
        full_name: profile.full_name,
        email: cleanEmail,
        phone: profile.phone,
        role: profile.role as StaffRole,
        created_at: profile.created_at,
      },
    }
  } catch (err) {
    console.error('[inviteStaffMember] Exception:', err)
    return { success: false, error: 'Error inesperado al agregar colaborador' }
  }
}

/**
 * Actualiza el rol de un colaborador en la base de datos real.
 */
export async function updateStaffRole(
  profileId: string,
  newRole: StaffRole
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', profileId)

    if (error) {
      console.error('[updateStaffRole] Error al actualizar rol:', error.message)
      return { success: false, error: error.message }
    }

    revalidatePath('/dashboard/equipo')
    return { success: true }
  } catch (err) {
    console.error('[updateStaffRole] Exception:', err)
    return { success: false, error: 'Error al actualizar el rol' }
  }
}

/**
 * Elimina o revoca el acceso a un colaborador en la base de datos real.
 */
export async function removeStaffMember(
  profileId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()

    // 1. Desvincular referencias en bookings si las hubiere para evitar violaciones de clave foránea
    try {
      await supabase
        .from('bookings')
        .update({ created_by_staff_id: null })
        .eq('created_by_staff_id', profileId)
    } catch {}

    // 2. Eliminar el perfil en la tabla profiles
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', profileId)

    if (error) {
      console.error('[removeStaffMember] Error al eliminar perfil:', error.message)
      return { success: false, error: error.message }
    }

    // 3. Opcionalmente eliminar el usuario de Supabase Auth
    try {
      await supabase.auth.admin.deleteUser(profileId)
    } catch {}

    revalidatePath('/dashboard/equipo')
    return { success: true }
  } catch (err) {
    console.error('[removeStaffMember] Exception:', err)
    return { success: false, error: 'Error al eliminar colaborador' }
  }
}
