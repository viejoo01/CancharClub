-- =============================================================================
-- MIGRACIÓN DE ACTIVACIÓN UNIVERSAL Y REFUERZO DE ROW LEVEL SECURITY (RLS)
-- Proyecto: CancharClub SaaS
-- Fecha: 2026-10-30
-- Descripción:
-- 1. Activa y fuerza Row Level Security (RLS) en el 100% de las tablas del esquema 'public'.
-- 2. Asegura cumplimiento estricto con el Supabase Security Advisor (FORCE RLS).
-- 3. Aísla de forma multi-tenant irrestricta todas las operaciones por tenant_id.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BARRIDO DINÁMICO: ENABLE Y FORCE RLS EN TODAS LAS TABLAS DE 'public'
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' ENABLE ROW LEVEL SECURITY;';
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' FORCE ROW LEVEL SECURITY;';
        RAISE NOTICE 'RLS activado y forzado en tabla: public.%', r.tablename;
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. DECLARACIÓN EXPLÍCITA IDEMPOTENTE (TABLA POR TABLA)
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_log FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.auto_debit_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.auto_debit_attempts FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.booking_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.booking_payments FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bookings FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_shifts FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.court_lights ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.court_lights FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.court_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.court_orders FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.courts FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.customer_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customer_credits FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.players FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.price_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.price_rules FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.processed_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.processed_payments FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.recurring_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.recurring_slots FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.saas_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.saas_subscriptions FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.tenant_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenant_invoices FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.tenant_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenant_payment_settings FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenants FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.tournament_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tournament_categories FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tournament_matches FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.tournament_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tournament_teams FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.tournament_waitlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tournament_waitlists FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tournaments FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.waitlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.waitlists FORCE ROW LEVEL SECURITY;
