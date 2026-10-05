// src/lib/audit-logger.ts
// ==============================================================================
// REGISTRO DE EVENTOS DE AUDITORÍA Y SEGURIDAD
// ==============================================================================
// Permite guardar eventos de forma inmutable en la tabla public.audit_logs.
// Si la base de datos no está disponible o la tabla aún no se migró,
// el logger captura el error sin interrumpir el flujo del usuario.
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'

export type SecurityAuditAction =
  | 'AUTH_LOGIN'
  | 'AUTH_LOGOUT'
  | 'AUTH_REGISTER_CLUB'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_RESET'
  | 'STAFF_INVITE'
  | 'STAFF_UPDATE_ROLE'
  | 'STAFF_UPDATE_PASSWORD'
  | 'STAFF_DELETE'
  | 'SUPERADMIN_LOGIN'
  | 'SUPERADMIN_IMPERSONATE'
  | 'CLUB_STATUS_CHANGE'
  | 'SUBSCRIPTION_UPDATE'
  | 'PAYMENT_WEBHOOK_PROCESSED'
  | 'RATE_LIMIT_EXCEEDED'

export interface LogAuditEventParams {
  action: SecurityAuditAction
  resource: string
  tenantId?: string | null
  userId?: string | null
  details?: Record<string, unknown>
  ipAddress?: string | null
  userAgent?: string | null
}

/**
 * Registra un evento de auditoría de forma asíncrona y segura.
 */
export async function logAuditEvent(params: LogAuditEventParams): Promise<void> {
  try {
    const supabase = await createServiceClient()
    
    // Ignorar si el cliente Supabase es un placeholder
    const isPlaceholder = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder')
    if (isPlaceholder) return

    await supabase.from('audit_logs').insert({
      tenant_id: params.tenantId || null,
      user_id: params.userId || null,
      action: params.action,
      resource: params.resource,
      details: params.details || {},
      ip_address: params.ipAddress || null,
      user_agent: params.userAgent || null,
    })
  } catch (err) {
    // La auditoría no debe romper la operación principal del usuario
    console.warn('[AuditLogger] Fallo al persistir evento de auditoría:', err)
  }
}
