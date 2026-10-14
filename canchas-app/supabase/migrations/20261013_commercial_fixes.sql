-- =============================================================================
-- MIGRACIÓN CANCHARCLUB: BLINDAJE COMERCIAL, FACTURACIÓN Y SEGURIDAD
-- Fecha: 2026-10-13
-- =============================================================================

-- 1. Turnos fijos: registrar el último período pagado ('YYYY-MM')
ALTER TABLE public.recurring_slots
  ADD COLUMN IF NOT EXISTS last_paid_period TEXT;

-- 2. Seña porcentual configurable por regla de precio (0 a 100)
ALTER TABLE public.price_rules
  ADD COLUMN IF NOT EXISTS deposit_pct SMALLINT NOT NULL DEFAULT 50
  CHECK (deposit_pct BETWEEN 0 AND 100);

-- 3. Idempotencia y registro de pagos procesados
CREATE TABLE IF NOT EXISTS public.processed_payments (
  payment_id   TEXT PRIMARY KEY,
  source       TEXT NOT NULL,        -- 'booking' | 'saas' | 'reactivation'
  tenant_id    UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount_cents BIGINT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_payments_tenant ON public.processed_payments(tenant_id);

-- Habilitar RLS en processed_payments
ALTER TABLE public.processed_payments ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'processed_payments' AND policyname = 'processed_payments: superadmin or service role'
  ) THEN
    CREATE POLICY "processed_payments: superadmin or service role" ON public.processed_payments
      FOR ALL USING (public.current_user_role() = 'SUPERADMIN');
  END IF;
END $$;

-- 4. Recordatorios de partido por WhatsApp: marcar cuando se envían
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- 5. Suscripción recurrente SaaS: almacenar el ID de preapproval de Mercado Pago
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT;
