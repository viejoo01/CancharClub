-- =============================================================================
-- MIGRACIÓN CANCHARCLUB: TABLA BOOKING_PAYMENTS (Caja Diaria y Cobros Relacionales)
-- Fecha: 2026-10-18
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.booking_payments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    booking_id              UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    
    amount_ars              NUMERIC(10,2) NOT NULL DEFAULT 0,
    amount_cents            BIGINT NOT NULL DEFAULT 0,
    payment_method          TEXT NOT NULL,
    payment_type            TEXT NOT NULL DEFAULT 'BALANCE',
    payment_date            DATE NOT NULL DEFAULT CURRENT_DATE,
    
    registered_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    received_by_profile_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    mp_payment_id           TEXT,
    mp_status               TEXT,
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asegurar que la FK permita cascada para evitar bloqueo 23503 al eliminar turnos
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'booking_payments_booking_id_fkey' 
    AND table_name = 'booking_payments'
  ) THEN
    ALTER TABLE public.booking_payments DROP CONSTRAINT booking_payments_booking_id_fkey;
    ALTER TABLE public.booking_payments ADD CONSTRAINT booking_payments_booking_id_fkey 
      FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Índices de alto rendimiento para consultas de arqueo de caja diario y por reserva
CREATE INDEX IF NOT EXISTS idx_booking_payments_tenant_date 
    ON public.booking_payments(tenant_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_booking_payments_tenant_registered 
    ON public.booking_payments(tenant_id, registered_at);

CREATE INDEX IF NOT EXISTS idx_booking_payments_booking_id 
    ON public.booking_payments(booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_payments_mp_id 
    ON public.booking_payments(mp_payment_id) 
    WHERE mp_payment_id IS NOT NULL;

-- Habilitar RLS
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad RLS por Tenant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'booking_payments' AND policyname = 'booking_payments: tenant enclosure select'
  ) THEN
    CREATE POLICY "booking_payments: tenant enclosure select" ON public.booking_payments
      FOR SELECT USING (
        tenant_id IN (
          SELECT tenant_id FROM public.profiles 
          WHERE profiles.id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'booking_payments' AND policyname = 'booking_payments: tenant enclosure insert'
  ) THEN
    CREATE POLICY "booking_payments: tenant enclosure insert" ON public.booking_payments
      FOR INSERT WITH CHECK (
        tenant_id IN (
          SELECT tenant_id FROM public.profiles 
          WHERE profiles.id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'booking_payments' AND policyname = 'booking_payments: superadmin full access'
  ) THEN
    CREATE POLICY "booking_payments: superadmin full access" ON public.booking_payments
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'SUPERADMIN'
        )
      );
  END IF;
END $$;
