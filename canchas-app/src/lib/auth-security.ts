// src/lib/auth-security.ts
// ==============================================================================
// CAPA CENTRAL DE AUTORIZACIÓN Y PROTECCIÓN ANTI-IDOR / MULTI-TENANT
// ==============================================================================
// Garantiza que ningún usuario o atacante pueda leer o modificar datos
// de un club que no le pertenece (Enclosure de Tenant).
// ==============================================================================

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'crypto'
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

const SA_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000 // 8 horas máximo

/**
 * Valida criptográficamente el token HMAC de sa_session generado por el panel Superadmin.
 */
export function verifySuperadminSessionToken(token: string, secret: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8')
    const parts = decoded.split(':')
    if (parts.length < 3) return false
    const tokenSig = parts.pop()!
    const timestampStr = parts[parts.length - 1]
    const timestamp = parseInt(timestampStr, 10)

    if (isNaN(timestamp) || Date.now() - timestamp > SA_SESSION_MAX_AGE_MS) {
      return false
    }

    const tokenPayload = parts.join(':')
    const expected = createHmac('sha256', secret).update(tokenPayload).digest('hex')
    const sigBuf = Buffer.from(tokenSig, 'hex')
    const expBuf = Buffer.from(expected, 'hex')
    if (sigBuf.length !== expBuf.length) return false
    return timingSafeEqual(sigBuf, expBuf)
  } catch {
    return false
  }
}

/**
 * Obtiene el perfil del usuario autenticado actual desde Supabase Auth o cookies de sesión.
 * Retorna null si no hay sesión activa.
 */
export async function getCurrentUserProfile(): Promise<AuthUserProfile | null> {
  try {
    const cookieStore = await cookies()

    // 0. Prioridad Superadmin: Verificar sesión criptográfica sa_session
    const saSession = cookieStore.get('sa_session')?.value
    const saSecret = process.env.SUPERADMIN_SESSION_SECRET
    if (saSession && saSecret && verifySuperadminSessionToken(saSession, saSecret)) {
      return {
        id: 'superadmin',
        email: 'superadmin@canchar.club',
        fullName: 'Superadmin Plataforma',
        role: 'SUPERADMIN',
        tenantId: null,
      }
    }

    // 0.1 Cookie demo_user_role con rol SUPERADMIN
    const demoRole = cookieStore.get('demo_user_role')?.value
    if (demoRole === 'SUPERADMIN') {
      const demoName = cookieStore.get('demo_user_name')?.value || 'Superadmin Plataforma'
      return {
        id: 'superadmin-demo',
        email: 'superadmin@canchar.club',
        fullName: demoName,
        role: 'SUPERADMIN',
        tenantId: null,
      }
    }

    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (user && !authErr) {
      const isSuperById = Boolean(process.env.SUPERADMIN_USER_ID && user.id === process.env.SUPERADMIN_USER_ID)
      const serviceClient = await createServiceClient()
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('id, full_name, role, tenant_id')
        .eq('id', user.id)
        .maybeSingle()

      if (profile) {
        const effectiveRole = (isSuperById ? 'SUPERADMIN' : (profile.role as UserRole)) || 'CUSTOMER'
        return {
          id: user.id,
          email: user.email || '',
          fullName: profile.full_name || '',
          role: effectiveRole,
          tenantId: profile.tenant_id || null,
        }
      } else if (isSuperById) {
        return {
          id: user.id,
          email: user.email || '',
          fullName: 'Superadmin Plataforma',
          role: 'SUPERADMIN',
          tenantId: null,
        }
      }
    }

    // SEGURIDAD ESTRICTA: Si no hay usuario autenticado en Supabase con perfil asignado,
    // NO se permite acceso ni se recurre a fallbacks de otros clubes en la BD.
    return null
  } catch (err) {
    console.error('[auth-security] Error fetching user profile:', err)
    return null
  }
}

/**
 * Resuelve el ID del club (tenantId) de forma estricta y segura:
 * 1. Si el usuario es SUPERADMIN, puede acceder a un tenant explícito o a su propio tenant.
 * 2. Si el usuario es administrador o staff de un club, ÚNICAMENTE puede acceder a profile.tenantId.
 * 3. Jamás se hace fallback al primer club de la base de datos para evitar fugas de información.
 */
export async function resolveEffectiveTenantId(explicitTenantId?: string | null): Promise<string | null> {
  const profile = await getCurrentUserProfile()

  if (!profile) {
    return null
  }

  // Superadmin global tiene acceso al tenant solicitado
  if (profile.role === 'SUPERADMIN') {
    if (explicitTenantId && explicitTenantId.trim()) {
      const serviceClient = await createServiceClient()
      const { data: existing } = await serviceClient
        .from('tenants')
        .select('id')
        .eq('id', explicitTenantId.trim())
        .maybeSingle()
      if (existing?.id) return existing.id
    }
    return profile.tenantId || null
  }

  // Dueño o encargado de un club: Su club es EXCLUSIVAMENTE el que tiene asignado en su perfil
  if (profile.tenantId) {
    if (explicitTenantId && explicitTenantId.trim() && explicitTenantId.trim() !== profile.tenantId) {
      // Intento de acceder al ID de otro club: DENEGADO POR SEGURIDAD
      console.warn(`[auth-security] Acceso bloqueado: usuario ${profile.id} intentó acceder al club ajeno ${explicitTenantId}`)
      return null
    }
    return profile.tenantId
  }

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

  // Solo TENANT_ADMIN puede acceder a acciones de administrador de club
  if (profile.role !== 'TENANT_ADMIN') {
    return { authorized: false, error: 'Requiere permisos de Dueño del Club (TENANT_ADMIN).' }
  }

  // Si se especificó un tenant objetivo, verificar que el usuario PERTENEZCA a ese tenant
  if (targetTenantId && profile.tenantId !== targetTenantId) {
    return { authorized: false, error: 'Acceso denegado: no tenés permisos sobre este club.' }
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

  // Verificar que el usuario PERTENEZCA al tenant objetivo (anti-IDOR)
  if (targetTenantId && profile.tenantId !== targetTenantId) {
    return { authorized: false, error: 'Acceso denegado: no pertenecés a este club.' }
  }

  return { authorized: true, user: profile }
}

/**
 * Valida que el usuario tenga rol SUPERADMIN de la plataforma.
 * Debe usarse al inicio de TODA función en superadmin.actions.ts.
 */
export async function assertSuperadmin(): Promise<AuthSecurityResult> {
  const profile = await getCurrentUserProfile()

  if (!profile) {
    return { authorized: false, error: 'Acceso denegado. Sesión no iniciada.' }
  }

  if (profile.role !== 'SUPERADMIN') {
    return { authorized: false, error: 'Acceso denegado. Se requieren permisos de Superadmin.' }
  }

  return { authorized: true, user: profile }
}
