-- =============================================================================
-- MIGRACIÓN CANCHARCLUB: CONSOLIDACIÓN DE TABLAS NÚCLEO
-- Fecha: 2026-10-19
-- Define de forma idempotente las tablas relacionales para:
--   1. products (Inventario y catálogo de cantina)
--   2. cash_shifts (Sesiones de caja y arqueos ciegos)
--   3. court_lights (Control de relés IoT de iluminación)
--   4. players (Directorio y reputación de jugadores)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLA: products (Cantina y Kiosco)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'BEBIDAS',
  price_cents INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock_alert INTEGER NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_tenant ON public.products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(tenant_id, is_active);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'products_tenant_isolation'
  ) THEN
    CREATE POLICY "products_tenant_isolation" ON public.products
      FOR ALL
      USING (
        tenant_id IN (
          SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
      )
      WITH CHECK (
        tenant_id IN (
          SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'products_public_read_active'
  ) THEN
    CREATE POLICY "products_public_read_active" ON public.products
      FOR SELECT
      TO anon, authenticated
      USING (is_active = true);
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 2. TABLA: cash_shifts (Cierres de Caja y Arqueo Ciego)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cashier_name TEXT,
  declared_cash_cents BIGINT NOT NULL DEFAULT 0,
  expected_cash_cents BIGINT NOT NULL DEFAULT 0,
  diff_cash_cents BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('EXACT', 'OVER', 'SHORT')),
  notes TEXT,
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_shifts_tenant ON public.cash_shifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_closed ON public.cash_shifts(tenant_id, closed_at);

ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cash_shifts' AND policyname = 'cash_shifts_tenant_isolation'
  ) THEN
    CREATE POLICY "cash_shifts_tenant_isolation" ON public.cash_shifts
      FOR ALL
      USING (
        tenant_id IN (
          SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
      )
      WITH CHECK (
        tenant_id IN (
          SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 3. TABLA: court_lights (Control IoT de Iluminación)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.court_lights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  court_id UUID NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  relay_type TEXT NOT NULL DEFAULT 'SHELLY_CLOUD',
  relay_channel INTEGER NOT NULL DEFAULT 0,
  is_on BOOLEAN NOT NULL DEFAULT false,
  auto_schedule BOOLEAN NOT NULL DEFAULT true,
  last_state_change TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_court_lights UNIQUE (court_id)
);

CREATE INDEX IF NOT EXISTS idx_court_lights_tenant ON public.court_lights(tenant_id);

ALTER TABLE public.court_lights ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'court_lights' AND policyname = 'court_lights_tenant_isolation'
  ) THEN
    CREATE POLICY "court_lights_tenant_isolation" ON public.court_lights
      FOR ALL
      USING (
        tenant_id IN (
          SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
      )
      WITH CHECK (
        tenant_id IN (
          SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 4. TABLA: players (Directorio y Reputación de Jugadores)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  reputation_score INTEGER NOT NULL DEFAULT 100,
  no_show_count INTEGER NOT NULL DEFAULT 0,
  total_bookings INTEGER NOT NULL DEFAULT 0,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  internal_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_player_phone_tenant UNIQUE (tenant_id, phone)
);

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS internal_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_players_tenant_phone ON public.players(tenant_id, phone);

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'players' AND policyname = 'players_tenant_isolation'
  ) THEN
    CREATE POLICY "players_tenant_isolation" ON public.players
      FOR ALL
      USING (
        tenant_id IN (
          SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
      )
      WITH CHECK (
        tenant_id IN (
          SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;
