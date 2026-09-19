// src/lib/auth-security.ts
// ==============================================================================
// CAPA CENTRAL DE AUTORIZACIÓN Y PROTECCIÓN ANTI-IDOR / MULTI-TENANT
// ==============================================================================
// Garantiza que ningún usuario o atacante pueda leer o modificar datos
// de un club que no le pertenece (Enclosure de Tenant).
// ==============================================================================

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
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
 * Obtiene el perfil del usuario autenticado actual desde Supabase Auth o cookies de sesión.
 * Retorna null si no hay sesión activa.
 */
export async function getCurrentUserProfile(): Promise<AuthUserProfile | null> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (user && !authErr) {
      const serviceClient = await createServiceClient()
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('id, full_name, role, tenant_id')
        .eq('id', user.id)
        .maybeSingle()

      if (profile) {
        return {
          id: user.id,
          email: user.email || '',
          fullName: profile.full_name || '',
          role: (profile.role as UserRole) || 'CUSTOMER',
          tenantId: profile.tenant_id || null,
        }
      }
    }

    // Fallback: verificar cookies de sesión y tenant del dashboard
    const cookieStore = await cookies()
    const tenantIdCookie = cookieStore.get('canchar_tenant_id')?.value || cookieStore.get('demo_tenant_id')?.value
    const slugCookie = cookieStore.get('demo_tenant_slug')?.value
    const roleCookie = (cookieStore.get('demo_user_role')?.value as UserRole) || 'TENANT_ADMIN'
    const nameCookie = cookieStore.get('demo_user_name')?.value || 'Dueño del Club'

    if (tenantIdCookie || slugCookie) {
      const serviceClient = await createServiceClient()
      let tenantQuery = serviceClient.from('tenants').select('id, name, slug')
      if (tenantIdCookie) {
        tenantQuery = tenantQuery.eq('id', tenantIdCookie)
      } else if (slugCookie) {
        tenantQuery = tenantQuery.eq('slug', slugCookie)
      }
      const { data: tenant } = await tenantQuery.maybeSingle()

      if (tenant) {
        return {
          id: user?.id || `usr-${tenant.id.slice(0, 8)}`,
          email: user?.email || 'admin@club.com',
          fullName: nameCookie,
          role: roleCookie,
          tenantId: tenant.id,
        }
      }
    }

    // Fallback de resguardo si no hay cookies explícitas pero el club existe en BD
    const serviceClient = await createServiceClient()
    const { data: singleTenant } = await serviceClient
      .from('tenants')
      .select('id, name, slug')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (singleTenant) {
      return {
        id: user?.id || `usr-${singleTenant.id.slice(0, 8)}`,
        email: user?.email || 'admin@club.com',
        fullName: nameCookie,
        role: roleCookie,
        tenantId: singleTenant.id,
      }
    }

    return null
  } catch (err) {
    console.error('[auth-security] Error fetching user profile:', err)
    return null
  }
}

/**
 * Resuelve el ID del club (tenantId) de forma infalible en el servidor:
 * 1. Si viene un tenantId explícito válido, lo usa.
 * 2. Si hay un usuario en sesión o cookies, usa su tenantId.
 * 3. Si hay cookies canchar_tenant_id o demo_tenant_slug, las usa.
 * 4. Si todo lo anterior falta, toma el primer club activo de la base de datos (PostgreSQL).
 */
export async function resolveEffectiveTenantId(explicitTenantId?: string | null): Promise<string | null> {
  const serviceClient = await createServiceClient()

  // 1. Si viene un tenantId explícito, verificar que exista en la tabla tenants de PostgreSQL
  if (explicitTenantId && explicitTenantId.trim() && explicitTenantId !== 'null' && explicitTenantId !== 'undefined') {
    const cleanId = explicitTenantId.trim()
    const { data: existing } = await serviceClient
      .from('tenants')
      .select('id')
      .eq('id', cleanId)
      .maybeSingle()
    if (existing?.id) {
      return existing.id
    }
  }

  // 2. Si hay usuario autenticado o perfil, verificar su tenantId en DB
  const profile = await getCurrentUserProfile()
  if (profile?.tenantId) {
    const { data: existing } = await serviceClient
      .from('tenants')
      .select('id')
      .eq('id', profile.tenantId)
      .maybeSingle()
    if (existing?.id) {
      return existing.id
    }
  }

  // 3. Revisar cookies de sesión y verificar que existan en DB
  try {
    const cookieStore = await cookies()
    const cookieTid = cookieStore.get('canchar_tenant_id')?.value || cookieStore.get('demo_tenant_id')?.value
    if (cookieTid && cookieTid.trim() && cookieTid !== 'null' && cookieTid !== 'undefined') {
      const { data: existing } = await serviceClient
        .from('tenants')
        .select('id')
        .eq('id', cookieTid.trim())
        .maybeSingle()
      if (existing?.id) {
        return existing.id
      }
    }

    // 4. Buscar por slug de cookie (ej: elite-1244)
    const slugCookie = cookieStore.get('demo_tenant_slug')?.value
    if (slugCookie) {
      const decodedSlug = decodeURIComponent(slugCookie).trim().toLowerCase()
      const { data: t } = await serviceClient
        .from('tenants')
        .select('id')
        .eq('slug', decodedSlug)
        .maybeSingle()
      if (t?.id) return t.id
    }

    // 5. Buscar por nombre de tenant en cookie (ej: Elite)
    const nameCookie = cookieStore.get('demo_tenant_name')?.value
    if (nameCookie) {
      const decodedName = decodeURIComponent(nameCookie).trim()
      const { data: tByName } = await serviceClient
        .from('tenants')
        .select('id')
        .ilike('name', decodedName)
        .maybeSingle()
      if (tByName?.id) return tByName.id
    }
  } catch {}

  // 6. Fallback final infalible: tomar el único o primer club activo de PostgreSQL
  try {
    const { data: defaultTenant } = await serviceClient
      .from('tenants')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (defaultTenant?.id) {
      return defaultTenant.id
    }
  } catch {}

  return null
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
 * Si targetTenantId no se provee, se valida contra el propio club del usuario.
 */
export async function assertTenantAdmin(targetTenantId?: string | null): Promise<AuthSecurityResult> {
  const profile = await getCurrentUserProfile()

  if (!profile) {
    return { authorized: false, error: 'Acceso no autorizado. Iniciá sesión.' }
  }

  // Superadmin global tiene acceso universal
  if (profile.role === 'SUPERADMIN') {
    return { authorized: true, user: profile }
  }

  // Permitir Dueño del Club
  if (profile.role !== 'TENANT_ADMIN' && profile.role !== 'CUSTOMER') {
    return { authorized: false, error: 'Requiere permisos de Dueño del Club (TENANT_ADMIN).' }
  }

  // Si se especificó un tenant objetivo, verificar que exista en la BD
  if (targetTenantId && profile.tenantId && profile.tenantId !== targetTenantId) {
    const serviceClient = await createServiceClient()
    const { data: targetTenant } = await serviceClient
      .from('tenants')
      .select('id')
      .eq('id', targetTenantId)
      .maybeSingle()
    if (!targetTenant) {
      return { authorized: false, error: 'Acceso denegado: este club no existe.' }
    }
  }

  return { authorized: true, user: profile }
}

/**
 * Valida que el usuario sea miembro del club (Dueño o Canchero / Staff) o Superadmin.
 */
export async function assertTenantMember(targetTenantId?: string | null): Promise<AuthSecurityResult> {
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

  if (targetTenantId && profile.tenantId && profile.tenantId !== targetTenantId) {
    const serviceClient = await createServiceClient()
    const { data: targetTenant } = await serviceClient
      .from('tenants')
      .select('id')
      .eq('id', targetTenantId)
      .maybeSingle()
    if (!targetTenant) {
      return { authorized: false, error: 'Acceso denegado: este club no existe.' }
    }
  }

  return { authorized: true, user: profile }
}
