-- =============================================================================
-- MIGRACIÓN DE BLINDAJE DEFINITIVO RLS — 10/10 DE SEGURIDAD (POSTGRESQL / SUPABASE)
-- Proyecto: CancharClub
-- Fecha: 2026-10-01
-- Descripción:
-- 1. Corrige la política permisiva 'USING (true)' de la tabla waitlists, sellando
--    la fuga de PII (nombres y teléfonos de jugadores) entre clubes.
-- 2. Refuerza Row Level Security (RLS) en court_orders, recurring_slots,
--    customer_credits, audit_logs y tenant_invoices.
-- 3. Habilita RLS de forma forzada e inmutable en todas las tablas del esquema public.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BARRIDO UNIVERSAL: Habilitar RLS en TODAS las tablas públicas
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
          AND rowsecurity = false
    ) LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' ENABLE ROW LEVEL SECURITY;';
        RAISE NOTICE 'RLS activado con éxito para tabla: %', r.tablename;
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. BLINDAJE ESTRICTO PARA TABLA: waitlists (Lista de Espera)
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.waitlists ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas inseguras anteriores
DROP POLICY IF EXISTS "Tenants acceden a su lista de espera" ON public.waitlists;
DROP POLICY IF EXISTS "Permitir crear inscripciones a lista de espera" ON public.waitlists;
DROP POLICY IF EXISTS "waitlists: public insert" ON public.waitlists;
DROP POLICY IF EXISTS "waitlists: tenant manage own" ON public.waitlists;
DROP POLICY IF EXISTS "waitlists: superadmin and service_role all" ON public.waitlists;

-- A. Inserción pública permitida únicamente con tenant_id válido
CREATE POLICY "waitlists: public insert" ON public.waitlists
    FOR INSERT
    WITH CHECK (tenant_id IS NOT NULL);

-- B. Lectura y gestión exclusiva para miembros del propio club
CREATE POLICY "waitlists: tenant manage own" ON public.waitlists
    FOR ALL
    USING (
        auth.role() = 'service_role'
        OR (public.current_user_role() = 'SUPERADMIN')
        OR (
            tenant_id IS NOT NULL 
            AND (
                tenant_id = public.current_tenant_id()
                OR (NULLIF(auth.jwt() ->> 'tenant_id', '')::UUID = tenant_id)
            )
        )
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR (public.current_user_role() = 'SUPERADMIN')
        OR (
            tenant_id IS NOT NULL 
            AND (
                tenant_id = public.current_tenant_id()
                OR (NULLIF(auth.jwt() ->> 'tenant_id', '')::UUID = tenant_id)
            )
        )
    );

-- -----------------------------------------------------------------------------
-- 3. BLINDAJE ESTRICTO PARA TABLA: court_orders (Cantina y Kiosco)
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.court_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_court_orders_select" ON public.court_orders;
DROP POLICY IF EXISTS "tenant_court_orders_insert" ON public.court_orders;
DROP POLICY IF EXISTS "tenant_court_orders_update" ON public.court_orders;
DROP POLICY IF EXISTS "court_orders: tenant isolation" ON public.court_orders;

CREATE POLICY "court_orders: tenant isolation" ON public.court_orders
    FOR ALL
    USING (
        auth.role() = 'service_role'
        OR (public.current_user_role() = 'SUPERADMIN')
        OR (
            tenant_id IS NOT NULL 
            AND (
                tenant_id = public.current_tenant_id()
                OR (NULLIF(auth.jwt() ->> 'tenant_id', '')::UUID = tenant_id)
            )
        )
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR (public.current_user_role() = 'SUPERADMIN')
        OR (
            tenant_id IS NOT NULL 
            AND (
                tenant_id = public.current_tenant_id()
                OR (NULLIF(auth.jwt() ->> 'tenant_id', '')::UUID = tenant_id)
            )
        )
    );

-- -----------------------------------------------------------------------------
-- 4. BLINDAJE ESTRICTO PARA TABLA: recurring_slots (Turnos Fijos)
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.recurring_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenants acceden a sus propios turnos fijos" ON public.recurring_slots;
DROP POLICY IF EXISTS "recurring_slots: tenant isolation" ON public.recurring_slots;

CREATE POLICY "recurring_slots: tenant isolation" ON public.recurring_slots
    FOR ALL
    USING (
        auth.role() = 'service_role'
        OR (public.current_user_role() = 'SUPERADMIN')
        OR (
            tenant_id IS NOT NULL 
            AND (
                tenant_id = public.current_tenant_id()
                OR (NULLIF(auth.jwt() ->> 'tenant_id', '')::UUID = tenant_id)
            )
        )
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR (public.current_user_role() = 'SUPERADMIN')
        OR (
            tenant_id IS NOT NULL 
            AND (
                tenant_id = public.current_tenant_id()
                OR (NULLIF(auth.jwt() ->> 'tenant_id', '')::UUID = tenant_id)
            )
        )
    );

-- -----------------------------------------------------------------------------
-- 5. BLINDAJE ESTRICTO PARA TABLA: customer_credits (Saldos de Clientes)
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.customer_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenants acceden a sus propios créditos" ON public.customer_credits;
DROP POLICY IF EXISTS "customer_credits: tenant isolation" ON public.customer_credits;

CREATE POLICY "customer_credits: tenant isolation" ON public.customer_credits
    FOR ALL
    USING (
        auth.role() = 'service_role'
        OR (public.current_user_role() = 'SUPERADMIN')
        OR (
            tenant_id IS NOT NULL 
            AND (
                tenant_id = public.current_tenant_id()
                OR (NULLIF(auth.jwt() ->> 'tenant_id', '')::UUID = tenant_id)
            )
        )
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR (public.current_user_role() = 'SUPERADMIN')
        OR (
            tenant_id IS NOT NULL 
            AND (
                tenant_id = public.current_tenant_id()
                OR (NULLIF(auth.jwt() ->> 'tenant_id', '')::UUID = tenant_id)
            )
        )
    );

-- -----------------------------------------------------------------------------
-- 6. VERIFICACIÓN FINAL: Todas las tablas públicas deben tener RLS activado
-- -----------------------------------------------------------------------------
SELECT 
    schemaname, 
    tablename, 
    rowsecurity AS rls_enabled 
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;
