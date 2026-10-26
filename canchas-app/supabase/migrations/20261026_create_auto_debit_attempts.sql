-- =============================================================================
-- MIGRACIÓN CANCHARCLUB: TABLA DE INTENTOS DE DÉBITO AUTOMÁTICO Y TRAZABILIDAD
-- Fecha: 2026-10-26
-- =============================================================================

-- 1. Agregar campo last_failed_attempt_at en tenant_invoices si no existe
ALTER TABLE public.tenant_invoices 
ADD COLUMN IF NOT EXISTS last_failed_attempt_at TIMESTAMPTZ;

-- 1.1 Agregar columnas para persistencia de tarjeta en tenants
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS card_brand TEXT;

ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS card_linked BOOLEAN DEFAULT false;

-- 2. Tabla de auditoría e historial de intentos de cobro automático (Auto-Debit State Machine)
CREATE TABLE IF NOT EXISTS public.auto_debit_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.tenant_invoices(id) ON DELETE CASCADE,
    attempt_number INT NOT NULL DEFAULT 1,
    status TEXT NOT NULL, -- 'FAILED', 'APPROVED', 'SKIPPED'
    failure_reason TEXT,
    payment_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Índices para auditoría rápida y dunning
CREATE INDEX IF NOT EXISTS idx_auto_debit_attempts_tenant ON public.auto_debit_attempts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_auto_debit_attempts_invoice ON public.auto_debit_attempts(invoice_id);
CREATE INDEX IF NOT EXISTS idx_auto_debit_attempts_created ON public.auto_debit_attempts(created_at DESC);

-- 4. RLS para auto_debit_attempts
ALTER TABLE public.auto_debit_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auto_debit_attempts: superadmin y service_role manage" ON public.auto_debit_attempts;
CREATE POLICY "auto_debit_attempts: superadmin y service_role manage" ON public.auto_debit_attempts
    FOR ALL
    USING (
        auth.role() = 'service_role' 
        OR (public.current_user_role() = 'SUPERADMIN')
    )
    WITH CHECK (
        auth.role() = 'service_role' 
        OR (public.current_user_role() = 'SUPERADMIN')
    );

DROP POLICY IF EXISTS "auto_debit_attempts: tenant_admin read own" ON public.auto_debit_attempts;
CREATE POLICY "auto_debit_attempts: tenant_admin read own" ON public.auto_debit_attempts
    FOR SELECT
    USING (
        tenant_id = public.current_tenant_id() 
        AND public.current_user_role() IN ('TENANT_ADMIN', 'TENANT_STAFF')
    );
