// src/lib/auth-security.ts
// ==============================================================================
// CAPA CENTRAL DE AUTORIZACIÓN Y PROTECCIÓN ANTI-IDOR / MULTI-TENANT
// ==============================================================================
// Garantiza que ningún usuario o atacante pueda leer o modificar datos
// de un club que no le pertenece (Enclosure de Tenant).
// ==============================================================================

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database'

export interface AuthUserProfile {
  id: string
  email: string
  fullName: string
  role: UserRole
  tenantId: string | null
}

export interface AuthSecurityResult {
  authorized: boolean
  user?: AuthUserProfile
  error?: string
}

/**
 * Obtiene el perfil del usuario autenticado actual desde Supabase Auth.
 * Retorna null si no hay sesión activa.
 */
export async function getCurrentUserProfile(): Promise<AuthUserProfile | null> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (authErr || !user) {
      return null
    }

    const serviceClient = await createServiceClient()
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('id, full_name, role, tenant_id')
      .eq('id', user.id)
      .maybeSingle()

    return {
      id: user.id,
      email: user.email || '',
      fullName: profile?.full_name || '',
      role: (profile?.role as UserRole) || 'CUSTOMER',
      tenantId: profile?.tenant_id || null,
    }
  } catch (err) {
    console.error('[auth-security] Error fetching user profile:', err)
    return null
  }
}

/**
 * Valida que el usuario esté autenticado.
 */
export async function assertAuthenticatedUser(): Promise<AuthSecurityResult> {
  const profile = await getCurrentUserProfile()
  if (!profile) {
    return { authorized: false, error: 'Sesión no iniciada. Por favor ingresá a tu cuenta.' }
  }
  return { authorized: true, user: profile }
}

/**
 * Valida que el usuario sea administrador del club indicado (o Superadmin de la plataforma).
 * Previene ataques IDOR donde el administrador de un club intenta alterar la configuración de otro.
 */
export async function assertTenantAdmin(targetTenantId: string): Promise<AuthSecurityResult> {
  const profile = await getCurrentUserProfile()

  if (!profile) {
    return { authorized: false, error: 'Acceso no autorizado. Iniciá sesión.' }
  }

  // Superadmin global tiene acceso universal
  if (profile.role === 'SUPERADMIN') {
    return { authorized: true, user: profile }
  }

  // Verificar que sea TENANT_ADMIN y que el tenant coincida
  if (profile.role !== 'TENANT_ADMIN') {
    return { authorized: false, error: 'Requiere permisos de Dueño del Club (TENANT_ADMIN).' }
  }

  if (profile.tenantId !== targetTenantId) {
    return { authorized: false, error: 'Acceso denegado: este club no te pertenece.' }
  }

  return { authorized: true, user: profile }
}

/**
 * Valida que el usuario sea miembro del club (Dueño o Canchero / Staff) o Superadmin.
 */
export async function assertTenantMember(targetTenantId: string): Promise<AuthSecurityResult> {
  const profile = await getCurrentUserProfile()

  if (!profile) {
    return { authorized: false, error: 'Acceso no autorizado.' }
  }

  if (profile.role === 'SUPERADMIN') {
    return { authorized: true, user: profile }
  }

  if (!['TENANT_ADMIN', 'TENANT_STAFF'].includes(profile.role)) {
    return { authorized: false, error: 'Sin permisos de operador de club.' }
  }

  if (profile.tenantId !== targetTenantId) {
    return { authorized: false, error: 'Acceso denegado: no perteneces a este club.' }
  }

  return { authorized: true, user: profile }
}
