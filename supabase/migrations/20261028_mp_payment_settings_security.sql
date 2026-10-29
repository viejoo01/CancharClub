-- =============================================================================
-- MIGRACIÓN CANCHARCLUB: SEGURIDAD, AISLAMIENTO Y BLINDAJE DE MERCADO PAGO
-- Archivo: 20261028_mp_payment_settings_security.sql
-- Objetivo:
--   1. Asegurar restricción UNIQUE en booking_payments.mp_payment_id para prevenir duplicados.
--   2. Proteger credenciales de Mercado Pago (mp_access_token) en public.tenants mediante REVOKE de SELECT a anon y authenticated.
--   3. Crear tabla dedicada public.tenant_payment_settings con RLS estricto para aislamiento multi-tenant de secretos.
-- =============================================================================

-- 1. ÍNDICE ÚNICO DE IDEMPOTENCIA EN BOOKING_PAYMENTS
-- Previene que webhooks concurrentes o reintentados de Mercado Pago inserten dos veces el mismo pago.
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_payments_mp_payment_id_unique 
    ON public.booking_payments(mp_payment_id) 
    WHERE mp_payment_id IS NOT NULL;

-- 2. BLINDAJE DE SECRETOS EN PUBLIC.TENANTS
-- Revoca permisos de SELECT sobre columnas confidenciales de cobro para roles anon y authenticated.
-- El backend (service_role) mantiene acceso completo e irrestricto.
DO $$
BEGIN
    -- Revocar lectura directa de tokens en tenants para evitar extracción vía PostgREST público
    REVOKE SELECT (mp_access_token, mp_refresh_token, mp_access_token_enc, mp_webhook_secret_enc) 
    ON public.tenants 
    FROM anon, authenticated;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Aviso al revocar permisos de columnas sensibles en tenants: %', SQLERRM;
END $$;

-- 3. TABLA SEGREGADA PUBLIC.TENANT_PAYMENT_SETTINGS CON RLS ESTRICTO
CREATE TABLE IF NOT EXISTS public.tenant_payment_settings (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    mp_access_token             TEXT,
    mp_public_key               TEXT,
    mp_refresh_token            TEXT,
    mp_collector_id             TEXT,
    mp_connected_at             TIMESTAMPTZ,
    bank_name                   TEXT,
    account_holder              TEXT,
    cbu                         TEXT,
    alias                       TEXT,
    cuit                        TEXT,
    whatsapp_phone              TEXT,
    transfer_confirmation_mode  TEXT DEFAULT 'MANUAL' CHECK (transfer_confirmation_mode IN ('MANUAL', 'AUTO')),
    payment_methods             TEXT[] DEFAULT ARRAY['TRANSFER']::TEXT[],
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_payment_settings_tenant UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_payment_settings_tenant 
    ON public.tenant_payment_settings(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_payment_settings_collector 
    ON public.tenant_payment_settings(mp_collector_id) 
    WHERE mp_collector_id IS NOT NULL;

-- 4. POLÍTICAS RLS EN TENANT_PAYMENT_SETTINGS
ALTER TABLE public.tenant_payment_settings ENABLE ROW LEVEL SECURITY;

-- Política 1: Service role y Superadmin tienen acceso completo
DROP POLICY IF EXISTS "tenant_payment_settings: superadmin and service role" ON public.tenant_payment_settings;
CREATE POLICY "tenant_payment_settings: superadmin and service role" 
    ON public.tenant_payment_settings
    FOR ALL
    USING (
        (auth.jwt() ->> 'role' = 'service_role')
        OR (public.current_user_role() = 'SUPERADMIN')
    )
    WITH CHECK (
        (auth.jwt() ->> 'role' = 'service_role')
        OR (public.current_user_role() = 'SUPERADMIN')
    );

-- Política 2: Solo administradores del club específico pueden leer sus credenciales de cobro
DROP POLICY IF EXISTS "tenant_payment_settings: tenant admin read own" ON public.tenant_payment_settings;
CREATE POLICY "tenant_payment_settings: tenant admin read own" 
    ON public.tenant_payment_settings
    FOR SELECT
    USING (
        tenant_id = public.current_tenant_id()
        AND public.current_user_role() IN ('TENANT_ADMIN')
    );

-- Política 3: Solo administradores del club específico pueden actualizar sus credenciales de cobro
DROP POLICY IF EXISTS "tenant_payment_settings: tenant admin update own" ON public.tenant_payment_settings;
CREATE POLICY "tenant_payment_settings: tenant admin update own" 
    ON public.tenant_payment_settings
    FOR UPDATE
    USING (
        tenant_id = public.current_tenant_id()
        AND public.current_user_role() IN ('TENANT_ADMIN')
    )
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        AND public.current_user_role() IN ('TENANT_ADMIN')
    );
