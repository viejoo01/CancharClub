-- =============================================================================
-- CANCHARCLUB — MIGRACIÓN: CREACIÓN TABLA WAITLISTS (LISTA DE ESPERA AUTOMÁTICA)
-- =============================================================================
-- Copiar y pegar en: Supabase Dashboard -> SQL Editor -> Run
-- Proyecto: nmihhlzbpjonmjsmmred
-- =============================================================================

-- 1. Crear tabla waitlists
CREATE TABLE IF NOT EXISTS public.waitlists (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    court_id            UUID REFERENCES public.courts(id) ON DELETE CASCADE,
    date                DATE NOT NULL,
    time_slot           TEXT NOT NULL,
    customer_name       TEXT NOT NULL,
    customer_phone      TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'NOTIFIED', 'EXPIRED', 'CLAIMED')),
    priority_expires_at TIMESTAMPTZ,
    notified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Índices para búsquedas de alta velocidad
CREATE INDEX IF NOT EXISTS idx_waitlists_search ON public.waitlists(tenant_id, date, time_slot, status);
CREATE INDEX IF NOT EXISTS idx_waitlists_tenant ON public.waitlists(tenant_id);

-- 3. Habilitar Row Level Security (RLS)
ALTER TABLE public.waitlists ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de acceso (Permitir inserción pública y acceso para administración)
DROP POLICY IF EXISTS "Permitir crear inscripciones a lista de espera" ON public.waitlists;
CREATE POLICY "Permitir crear inscripciones a lista de espera"
    ON public.waitlists FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Tenants acceden a su lista de espera" ON public.waitlists;
CREATE POLICY "Tenants acceden a su lista de espera"
    ON public.waitlists FOR ALL
    USING (true);

-- 5. Habilitar Supabase Realtime para actualización automática
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.waitlists;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;
END $$;
