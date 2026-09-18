-- =============================================================================
-- MIGRACIÓN DE SEGURIDAD EXTREMA — CANCHARCLUB (2026-09-18)
-- =============================================================================
-- 1. REVOCACIÓN DE LECTURA DE CREDENCIALES SENSIBLES
-- 2. POLÍTICAS RLS ANTI-FUGA DE DATOS PERSONALES
-- 3. AUDITORÍA Y PROTECCIÓN MULTI-TENANT
-- =============================================================================

-- 1. REVOCAR PERMISOS DE LECTURA EN COLUMNAS SENSIBLES DE TENANTS
-- Impide que clientes anónimos o autenticados extraigan tokens de Mercado Pago
REVOKE SELECT (mp_access_token, mp_access_token_enc, mp_webhook_secret, mp_webhook_secret_enc)
ON public.tenants FROM anon, authenticated;

-- 2. BLINDAJE DE PROFILES: Ningún cliente anónimo puede listar perfiles
DROP POLICY IF EXISTS "profiles: anon select" ON public.profiles;
REVOKE ALL ON public.profiles FROM anon;

-- 3. BLINDAJE DE BOOKINGS: Ningún cliente anónimo puede listar reservas
DROP POLICY IF EXISTS "bookings: anon select" ON public.bookings;
REVOKE ALL ON public.bookings FROM anon;

-- 4. FORZAR RLS EN TODAS LAS TABLAS CRÍTICAS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_payments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courts FORCE ROW LEVEL SECURITY;

-- 5. POLÍTICA PÚBLICA ESTRICTA PARA TENANTS (Solo lectura de campos no confidenciales)
DROP POLICY IF EXISTS "tenants_select_public" ON public.tenants;
DROP POLICY IF EXISTS "tenants: public read active" ON public.tenants;

CREATE POLICY "tenants: public read active" ON public.tenants
    FOR SELECT TO anon, authenticated
    USING (is_active = TRUE);
