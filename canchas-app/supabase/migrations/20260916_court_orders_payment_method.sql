-- =============================================================================
-- CANCHARCLUB — MIGRACIÓN: Métodos de Pago y Estado de Pago en Cantina
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='court_orders' AND column_name='payment_method'
  ) THEN
    ALTER TABLE public.court_orders ADD COLUMN payment_method TEXT DEFAULT 'CASH';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='court_orders' AND column_name='payment_status'
  ) THEN
    ALTER TABLE public.court_orders ADD COLUMN payment_status TEXT DEFAULT 'PENDING';
  END IF;
END $$;
