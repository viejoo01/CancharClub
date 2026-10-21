-- ==============================================================================
-- Migración 20261021: Diferenciales Competitivos de Torneos
-- 1. Aranceles de Inscripción y Pagos con Mercado Pago en Torneos
-- 2. Lista de Espera Automática para Cupos de Torneos
-- ==============================================================================

-- 1. Agregar precio de inscripción por categoría en torneos
ALTER TABLE public.tournament_categories
ADD COLUMN IF NOT EXISTS entry_fee_ars NUMERIC DEFAULT 0;

-- 2. Agregar estado de pago y registro de transacción en equipos inscriptos
ALTER TABLE public.tournament_teams
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID', 'EXEMPT')),
ADD COLUMN IF NOT EXISTS mp_payment_id TEXT,
ADD COLUMN IF NOT EXISTS amount_paid_ars NUMERIC DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tournament_teams_payment_status ON public.tournament_teams(category_id, payment_status);

-- 3. Crear tabla para Lista de Espera de Torneos
CREATE TABLE IF NOT EXISTS public.tournament_waitlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.tournament_categories(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    player_1 TEXT NOT NULL,
    player_2 TEXT,
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'NOTIFIED', 'ENROLLED', 'CANCELLED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    notified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tournament_waitlists_category ON public.tournament_waitlists(category_id, status);
CREATE INDEX IF NOT EXISTS idx_tournament_waitlists_tenant ON public.tournament_waitlists(tenant_id);

-- 4. Habilitar RLS y Políticas
ALTER TABLE public.tournament_waitlists ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'tournament_waitlists' AND policyname = 'Lectura publica lista de espera torneos'
    ) THEN
        CREATE POLICY "Lectura publica lista de espera torneos" ON public.tournament_waitlists
            FOR SELECT TO anon, authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'tournament_waitlists' AND policyname = 'Inscripcion publica lista de espera torneos'
    ) THEN
        CREATE POLICY "Inscripcion publica lista de espera torneos" ON public.tournament_waitlists
            FOR INSERT TO anon, authenticated
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'tournament_waitlists' AND policyname = 'Admin gestion lista espera torneos'
    ) THEN
        CREATE POLICY "Admin gestion lista espera torneos" ON public.tournament_waitlists
            FOR ALL TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.tournament_categories c
                    JOIN public.tournaments t ON t.id = c.tournament_id
                    JOIN public.profiles p ON p.tenant_id = t.tenant_id
                    WHERE c.id = tournament_waitlists.category_id
                    AND p.id = auth.uid()
                )
            );
    END IF;
END $$;
