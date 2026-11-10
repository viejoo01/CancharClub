-- =============================================================================
-- MIGRACIÓN: Blindaje RLS Multi-Tenant e Índices Óptimos para tenant_invoices
-- Proyecto: CancharClub (SaaS Canchas Deportivas)
-- Fecha: 2026-11-10
-- Descripción:
-- 1. Reafirma ENABLE y FORCE ROW LEVEL SECURITY en public.tenant_invoices.
-- 2. Refuerza las políticas RLS para garantizar aislamiento absoluto entre clubes:
--    - superadmin y service_role tienen control total para crons, webhooks y liquidaciones.
--    - tenant_admin y tenant_staff tienen acceso ESTRICTAMENTE de LECTURA (FOR SELECT)
--      únicamente a las facturas emitidas a su propio tenant_id.
--    - Jugadores (PLAYER), usuarios anónimos (anon) o cualquier otro rol tienen 0 acceso.
-- 3. Crea índices compuestos y parciales de alto rendimiento para:
--    - Carga instantánea del historial de facturación (/dashboard/billing).
--    - Búsqueda inmediata de facturas en Webhooks de Mercado Pago (mp_payment_id).
--    - Búsqueda de Checkout Pro (mp_preference_id).
--    - Barrido de facturas impagas en la evaluación de mora y débito automático.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ACTIVACIÓN Y FORZADO INMUTABLE DE ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.tenant_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenant_invoices FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. POLÍTICAS RLS ESTRICTAS
-- -----------------------------------------------------------------------------

-- Eliminar políticas previas para evitar duplicidad o reglas permisivas obsoletas
DROP POLICY IF EXISTS "tenant_invoices: superadmin y service_role manage" ON public.tenant_invoices;
DROP POLICY IF EXISTS "tenant_invoices: tenant_admin read own" ON public.tenant_invoices;
DROP POLICY IF EXISTS "tenant_invoices_superadmin_service_role" ON public.tenant_invoices;
DROP POLICY IF EXISTS "tenant_invoices_tenant_read_own" ON public.tenant_invoices;
DROP POLICY IF EXISTS "tenant_invoices_tenant_isolation" ON public.tenant_invoices;

-- A. Gestión integral para Service Role (Servidor, Webhooks, Crons) y Superadmin de la plataforma
CREATE POLICY "tenant_invoices: superadmin y service_role manage" ON public.tenant_invoices
    FOR ALL
    USING (
        auth.role() = 'service_role' 
        OR (public.current_user_role() = 'SUPERADMIN')
    )
    WITH CHECK (
        auth.role() = 'service_role' 
        OR (public.current_user_role() = 'SUPERADMIN')
    );

-- B. Lectura exclusiva para Administradores y Staff del propio Club
--    Restringido estrictamente a FOR SELECT (prohíbe INSERT, UPDATE y DELETE desde el cliente)
CREATE POLICY "tenant_invoices: tenant_admin read own" ON public.tenant_invoices
    FOR SELECT
    USING (
        tenant_id IS NOT NULL
        AND (
            tenant_id = public.current_tenant_id()
            OR (NULLIF(auth.jwt() ->> 'tenant_id', '')::UUID = tenant_id)
        )
        AND public.current_user_role() IN ('TENANT_ADMIN', 'TENANT_STAFF')
    );

-- -----------------------------------------------------------------------------
-- 3. ÍNDICES DE ALTO RENDIMIENTO
-- -----------------------------------------------------------------------------

-- A. Historial de facturas ordenado por fecha de creación (Pestaña /dashboard/billing)
CREATE INDEX IF NOT EXISTS idx_tenant_invoices_tenant_created 
    ON public.tenant_invoices (tenant_id, created_at DESC);

-- B. Búsqueda instantánea de pagos en webhooks de Mercado Pago
CREATE INDEX IF NOT EXISTS idx_tenant_invoices_mp_payment_id 
    ON public.tenant_invoices (mp_payment_id) 
    WHERE mp_payment_id IS NOT NULL;

-- C. Búsqueda instantánea de preferencias en retorno de Checkout Pro
CREATE INDEX IF NOT EXISTS idx_tenant_invoices_mp_preference_id 
    ON public.tenant_invoices (mp_preference_id) 
    WHERE mp_preference_id IS NOT NULL;

-- D. Barrido de facturas impagas y evaluación de mora (Dunning Cron & Auto-débito)
CREATE INDEX IF NOT EXISTS idx_tenant_invoices_unpaid_due_date 
    ON public.tenant_invoices (due_date) 
    WHERE status = 'UNPAID';

-- -----------------------------------------------------------------------------
-- 4. COMENTARIOS DE DOCUMENTACIÓN EN EL CATÁLOGO DE POSTGRESQL
-- -----------------------------------------------------------------------------
COMMENT ON POLICY "tenant_invoices: superadmin y service_role manage" ON public.tenant_invoices 
    IS 'Permite gestión total de facturación SaaS a service_role y superadministradores de CancharClub.';

COMMENT ON POLICY "tenant_invoices: tenant_admin read own" ON public.tenant_invoices 
    IS 'Garantiza aislamiento multi-tenant: cada club solo puede visualizar sus propias facturas de uso SaaS.';
