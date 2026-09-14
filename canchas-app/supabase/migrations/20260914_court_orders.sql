-- =============================================================================
-- CANCHARCLUB — MIGRACIÓN SPRINT 1
-- Cantina & Kiosco (court_orders) + IoT Luces (courts) + Caja (bookings)
-- =============================================================================

-- 1. Tabla court_orders para Cantina & Kiosco
CREATE TABLE IF NOT EXISTS public.court_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  court_id      UUID REFERENCES public.courts(id) ON DELETE SET NULL,
  court_name    TEXT NOT NULL DEFAULT 'Mostrador',
  customer_name TEXT NOT NULL DEFAULT 'Mostrador',
  items         JSONB NOT NULL DEFAULT '[]',
  total_ars     NUMERIC(12,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','PREPARING','DELIVERED','CANCELLED')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para búsquedas rápidas por tenant y fecha
CREATE INDEX IF NOT EXISTS idx_court_orders_tenant_id  ON public.court_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_court_orders_created_at ON public.court_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_court_orders_status     ON public.court_orders(status);

-- RLS: Habilitar y configurar políticas para court_orders
ALTER TABLE public.court_orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'court_orders' AND policyname = 'tenant_court_orders_select') THEN
    CREATE POLICY "tenant_court_orders_select" ON public.court_orders FOR SELECT
      USING (tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'court_orders' AND policyname = 'tenant_court_orders_insert') THEN
    CREATE POLICY "tenant_court_orders_insert" ON public.court_orders FOR INSERT
      WITH CHECK (tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'court_orders' AND policyname = 'tenant_court_orders_update') THEN
    CREATE POLICY "tenant_court_orders_update" ON public.court_orders FOR UPDATE
      USING (tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID));
  END IF;
END $$;

-- 2. Columnas en tabla courts para Iluminación IoT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='courts' AND column_name='light_is_on') THEN
    ALTER TABLE public.courts ADD COLUMN light_is_on BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='courts' AND column_name='light_updated_at') THEN
    ALTER TABLE public.courts ADD COLUMN light_updated_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='courts' AND column_name='relay_ip') THEN
    ALTER TABLE public.courts ADD COLUMN relay_ip TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='courts' AND column_name='relay_type') THEN
    ALTER TABLE public.courts ADD COLUMN relay_type TEXT DEFAULT 'SHELLY';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='courts' AND column_name='relay_channel') THEN
    ALTER TABLE public.courts ADD COLUMN relay_channel INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='courts' AND column_name='has_lighting') THEN
    ALTER TABLE public.courts ADD COLUMN has_lighting BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- 3. Columnas en tabla bookings para Caja
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='balance_paid_at') THEN
    ALTER TABLE public.bookings ADD COLUMN balance_paid_at TIMESTAMPTZ;
  END IF;
END $$;
