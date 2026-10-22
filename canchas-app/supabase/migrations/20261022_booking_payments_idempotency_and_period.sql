-- =============================================================================
-- MIGRACIÓN CANCHARCLUB: IDEMPOTENCIA Y PERÍODO DE PAGO EN BOOKING_PAYMENTS
-- Fecha: 2026-10-22
-- =============================================================================

-- 1. Agregar columna payment_period a booking_payments si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'booking_payments' 
    AND column_name = 'payment_period'
  ) THEN
    ALTER TABLE public.booking_payments 
      ADD COLUMN payment_period TEXT;
  END IF;
END $$;

-- 2. Asegurar que recurring_slot_id exista en booking_payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'booking_payments' 
    AND column_name = 'recurring_slot_id'
  ) THEN
    ALTER TABLE public.booking_payments 
      ADD COLUMN recurring_slot_id UUID REFERENCES public.recurring_slots(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Índice para consultas rápidas por turno fijo
CREATE INDEX IF NOT EXISTS idx_booking_payments_recurring_slot 
  ON public.booking_payments(recurring_slot_id);

-- 4. Índice único para garantizar idempotencia: un solo cobro por (recurring_slot_id, payment_period)
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_payments_recurring_period 
  ON public.booking_payments(recurring_slot_id, payment_period) 
  WHERE recurring_slot_id IS NOT NULL AND payment_period IS NOT NULL;
