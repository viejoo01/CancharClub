-- =============================================================================
-- MIGRACIÓN CANCHARCLUB: PERMITIR COBROS DE ABONOS MENSUALES EN BOOKING_PAYMENTS
-- Fecha: 2026-10-22
-- =============================================================================

-- Permitir que booking_payments registre pagos mensuales de abonados fijos
-- y cobros de saldos que no dependan obligatoriamente de un turno puntual
ALTER TABLE public.booking_payments ALTER COLUMN booking_id DROP NOT NULL;

-- Vincular opcionalmente el pago al turno fijo recurrente (recurring_slots)
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

-- Índice para consultas rápidas de pagos por turno fijo
CREATE INDEX IF NOT EXISTS idx_booking_payments_recurring_slot 
  ON public.booking_payments(recurring_slot_id);
