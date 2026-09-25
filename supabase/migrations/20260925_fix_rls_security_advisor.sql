-- =============================================================================
-- MIGRACIÓN: CORRECCIÓN DE SEGURIDAD RLS (SUPABASE SECURITY ADVISOR)
-- Proyecto: viejoo01's Project (nmihhlzbpjonmjsmmred)
-- Fecha: 2026-09-25
-- Descripción: 
-- Resuelve la alerta crítica 'rls_disabled_in_public' reportada por Supabase.
-- 1. Habilita RLS en todas las tablas del esquema public que lo tengan desactivado.
-- 2. Define políticas de acceso estrictas para tenant_invoices, torneos y tablas anexas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BARRIDO DINÁMICO: Habilitar RLS en CUALQUIER tabla pública sin RLS
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
-- 2. BLINDAJE ESPECÍFICO PARA tenant_invoices
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.tenant_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_invoices: superadmin y service_role manage" ON public.tenant_invoices;
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

DROP POLICY IF EXISTS "tenant_invoices: tenant_admin read own" ON public.tenant_invoices;
CREATE POLICY "tenant_invoices: tenant_admin read own" ON public.tenant_invoices
    FOR SELECT
    USING (
        tenant_id = public.current_tenant_id() 
        AND public.current_user_role() IN ('TENANT_ADMIN', 'TENANT_STAFF')
    );

-- -----------------------------------------------------------------------------
-- 3. POLÍTICAS PARA MÓDULO DE TORNEOS (Categorías, Equipos y Partidos)
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.tournament_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tournament_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tournament_matches ENABLE ROW LEVEL SECURITY;

-- Lectura pública para visualización de tablas y fixtures
DROP POLICY IF EXISTS "Lectura publica categorias torneos" ON public.tournament_categories;
CREATE POLICY "Lectura publica categorias torneos" ON public.tournament_categories
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Lectura publica equipos torneos" ON public.tournament_teams;
CREATE POLICY "Lectura publica equipos torneos" ON public.tournament_teams
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Lectura publica partidos torneos" ON public.tournament_matches;
CREATE POLICY "Lectura publica partidos torneos" ON public.tournament_matches
    FOR SELECT USING (true);

-- Administración exclusiva por tenant y service_role
DROP POLICY IF EXISTS "Admin categorias torneo" ON public.tournament_categories;
CREATE POLICY "Admin categorias torneo" ON public.tournament_categories
    FOR ALL
    USING (
        auth.role() = 'service_role' OR EXISTS (
            SELECT 1 FROM public.tournaments t
            WHERE t.id = tournament_categories.tournament_id
              AND (t.tenant_id = public.current_tenant_id() OR public.current_user_role() = 'SUPERADMIN')
        )
    );

DROP POLICY IF EXISTS "Admin equipos torneo" ON public.tournament_teams;
CREATE POLICY "Admin equipos torneo" ON public.tournament_teams
    FOR ALL
    USING (
        auth.role() = 'service_role' OR EXISTS (
            SELECT 1 FROM public.tournament_categories c
            JOIN public.tournaments t ON t.id = c.tournament_id
            WHERE c.id = tournament_teams.category_id
              AND (t.tenant_id = public.current_tenant_id() OR public.current_user_role() = 'SUPERADMIN')
        )
    );

DROP POLICY IF EXISTS "Admin partidos torneo" ON public.tournament_matches;
CREATE POLICY "Admin partidos torneo" ON public.tournament_matches
    FOR ALL
    USING (
        auth.role() = 'service_role' OR EXISTS (
            SELECT 1 FROM public.tournament_categories c
            JOIN public.tournaments t ON t.id = c.tournament_id
            WHERE c.id = tournament_matches.category_id
              AND (t.tenant_id = public.current_tenant_id() OR public.current_user_role() = 'SUPERADMIN')
        )
    );

-- -----------------------------------------------------------------------------
-- 4. VERIFICACIÓN FINAL: Todas las tablas en public deben tener rowsecurity = true
-- -----------------------------------------------------------------------------
SELECT 
    schemaname, 
    tablename, 
    rowsecurity AS rls_enabled 
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;
