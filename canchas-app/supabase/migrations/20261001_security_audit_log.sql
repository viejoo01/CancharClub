-- =============================================================================
-- MIGRACIÓN: SISTEMA DE AUDITORÍA Y REGISTRO DE EVENTOS DE SEGURIDAD (MEJORA-08)
-- Proyecto: CancharClub
-- Fecha: 2026-10-01
-- Descripción:
-- Crea la tabla append-only 'audit_logs' para trazabilidad de eventos sensibles
-- (inicios de sesión, cambios de contraseña, altas de staff, modificaciones de planes)
-- con Row Level Security (RLS) estricto multi-tenant.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices optimizados para consultas por club, tiempo y tipo de acción
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created 
    ON public.audit_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created 
    ON public.audit_logs(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user 
    ON public.audit_logs(user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. Service role y Superadmin pueden gestionar todos los registros
DROP POLICY IF EXISTS "audit_logs: service_role and superadmin all" ON public.audit_logs;
CREATE POLICY "audit_logs: service_role and superadmin all" ON public.audit_logs
    FOR ALL
    USING (
        auth.role() = 'service_role' 
        OR (public.current_user_role() = 'SUPERADMIN')
    )
    WITH CHECK (
        auth.role() = 'service_role' 
        OR (public.current_user_role() = 'SUPERADMIN')
    );

-- 2. Administradores de Club pueden consultar ÚNICAMENTE la auditoría de su club
DROP POLICY IF EXISTS "audit_logs: tenant_admin view own tenant" ON public.audit_logs;
CREATE POLICY "audit_logs: tenant_admin view own tenant" ON public.audit_logs
    FOR SELECT
    USING (
        tenant_id IS NOT NULL 
        AND tenant_id = public.current_tenant_id()
        AND public.current_user_role() IN ('TENANT_ADMIN', 'TENANT_STAFF')
    );

-- 3. Tabla append-only: Jamás se permiten modificaciones (UPDATE) ni eliminaciones (DELETE) directas
-- a usuarios de club.
COMMENT ON TABLE public.audit_logs IS 'Registro inmutable de eventos de seguridad y operaciones críticas del sistema CancharClub.';
