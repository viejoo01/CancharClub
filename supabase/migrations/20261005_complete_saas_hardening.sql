-- ==============================================================================
-- MIGRACIÓN: 20261005_complete_saas_hardening.sql
-- CANCHARCLUB — BLINDAJE ANTIFRAUDE, CANTINA, CAJA, ARQUEO CIEGO, IOT Y REPUTACIÓN
-- ==============================================================================

-- 1. TABLA: products (Catálogo e Inventario Real de Cantina y Kiosco)
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- RLS: products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_tenant_isolation" ON public.products;
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

-- Permitir lectura pública de productos para el tótem / comanda QR de la cancha
DROP POLICY IF EXISTS "products_public_read_active" ON public.products;
CREATE POLICY "products_public_read_active" ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);


-- 2. TABLA: cash_shifts (Cierres y Arqueos Ciegos de Caja Diaria)
CREATE TABLE IF NOT EXISTS public.cash_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cashier_name TEXT,
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ DEFAULT now(),
  declared_cash_cents INTEGER NOT NULL DEFAULT 0,
  expected_cash_cents INTEGER NOT NULL DEFAULT 0,
  difference_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'EXACT', -- 'EXACT', 'OVER', 'SHORT'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_shifts_tenant ON public.cash_shifts(tenant_id, closed_at DESC);

-- RLS: cash_shifts
ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_shifts_tenant_isolation" ON public.cash_shifts;
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


-- 3. TABLA: players (Reputación, Asistencia y Bloqueos de Jugadores)
CREATE TABLE IF NOT EXISTS public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  internal_notes TEXT,
  custom_tier_override TEXT, -- 'EXEMPLARY', 'RELIABLE', 'MODERATE', 'HIGH_RISK'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_players_tenant_phone ON public.players(tenant_id, phone);

-- RLS: players
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "players_tenant_isolation" ON public.players;
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


-- 4. TABLA: price_change_logs (Auditoría y Blindaje Antifraude de Tarifas SaaS)
CREATE TABLE IF NOT EXISTS public.price_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_id UUID,
  rule_name TEXT,
  previous_price_cents INTEGER,
  new_price_cents INTEGER NOT NULL,
  changed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_change_logs_tenant ON public.price_change_logs(tenant_id, changed_at DESC);

-- RLS: price_change_logs
ALTER TABLE public.price_change_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_change_logs_tenant_isolation" ON public.price_change_logs;
CREATE POLICY "price_change_logs_tenant_isolation" ON public.price_change_logs
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );


-- 5. TABLA: court_lights (Configuración y Telemetría IoT en la Nube)
CREATE TABLE IF NOT EXISTS public.court_lights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_type TEXT NOT NULL DEFAULT 'SHELLY_CLOUD', -- 'SHELLY_CLOUD', 'EWELINK_CLOUD', 'TUYA_CLOUD'
  cloud_device_id TEXT,
  cloud_auth_key TEXT,
  cloud_server_url TEXT,
  channel_index INTEGER NOT NULL DEFAULT 0,
  is_on BOOLEAN NOT NULL DEFAULT false,
  is_auto_mode BOOLEAN NOT NULL DEFAULT true,
  pre_turn_minutes INTEGER NOT NULL DEFAULT 5,
  post_turn_minutes INTEGER NOT NULL DEFAULT 5,
  last_command_at TIMESTAMPTZ,
  last_status_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (court_id)
);

CREATE INDEX IF NOT EXISTS idx_court_lights_court ON public.court_lights(court_id);
CREATE INDEX IF NOT EXISTS idx_court_lights_tenant ON public.court_lights(tenant_id);

-- RLS: court_lights
ALTER TABLE public.court_lights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "court_lights_tenant_isolation" ON public.court_lights;
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


-- 6. COLUMNAS ADICIONALES EN tenants PARA BLINDAJE ANTIFRAUDE Y AUDITORÍA
ALTER TABLE public.tenants 
  ADD COLUMN IF NOT EXISTS last_price_rule_modified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_cycle_max_price_cents INTEGER DEFAULT 0;

-- COMENTARIO DE CIERRE
COMMENT ON TABLE public.products IS 'Catálogo e inventario real para cantina y kiosco con control de stock';
COMMENT ON TABLE public.cash_shifts IS 'Registro histórico de arqueos ciegos y cierres de turno de caja';
COMMENT ON TABLE public.players IS 'Control de reputación, historial de asistencia y listas de bloqueo de jugadores';
COMMENT ON TABLE public.price_change_logs IS 'Auditoría de cambios de precios para evitar evasión de la cuota SaaS';
COMMENT ON TABLE public.court_lights IS 'Configuración de relés IoT con APIs Cloud (Shelly/eWeLink) y automatización pre/post turno';
