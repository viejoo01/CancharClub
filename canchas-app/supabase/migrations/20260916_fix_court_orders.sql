-- =============================================================================
-- CANCHARCLUB — MIGRACIÓN: CREACIÓN TABLA COURT_ORDERS (CANTINA & KIOSCO)
-- =============================================================================
-- Copiar y pegar en: Supabase Dashboard -> SQL Editor -> Run
-- Proyecto: nmihhlzbpjonmjsmmred
-- =============================================================================

-- 1. Tabla court_orders
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
  payment_method TEXT DEFAULT 'CASH',
  payment_status TEXT DEFAULT 'PENDING',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_court_orders_tenant_id  ON public.court_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_court_orders_created_at ON public.court_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_court_orders_status     ON public.court_orders(status);

-- 3. Habilitar Row Level Security (RLS)
ALTER TABLE public.court_orders ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de acceso (Permitir inserción desde celular anónimo y lectura/edición desde el panel)
DROP POLICY IF EXISTS "Permitir crear pedidos anonimos y autenticados" ON public.court_orders;
CREATE POLICY "Permitir crear pedidos anonimos y autenticados" 
  ON public.court_orders FOR INSERT 
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir lectura de pedidos" ON public.court_orders;
CREATE POLICY "Permitir lectura de pedidos" 
  ON public.court_orders FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "Permitir actualizar pedidos" ON public.court_orders;
CREATE POLICY "Permitir actualizar pedidos" 
  ON public.court_orders FOR UPDATE 
  USING (true);

-- 5. Habilitar Supabase Realtime para recibir pedidos en vivo en la pantalla del club
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.court_orders;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;
END $$;
