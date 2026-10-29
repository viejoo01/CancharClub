-- =============================================================================
-- CANCHARCLUB — MIGRACIÓN: SEGURIDAD, RLS, PROTECCIÓN DE PII Y CASCADA DE LISTA DE ESPERA
-- Fecha: 2026-10-28
-- =============================================================================

-- 1. Asegurar índices de alto rendimiento para búsqueda y cascada en waitlists
CREATE INDEX IF NOT EXISTS idx_waitlists_cascade
    ON public.waitlists(status, priority_expires_at)
    WHERE status = 'NOTIFIED';

CREATE INDEX IF NOT EXISTS idx_waitlists_queue
    ON public.waitlists(tenant_id, date, time_slot, status, created_at)
    WHERE status = 'WAITING';

-- 2. Función Atómica para Consumo de Token de Reclamo (Anti Race-Condition)
-- Garantiza que solo un jugador pueda reclamar el turno liberado de forma atómica
CREATE OR REPLACE FUNCTION public.claim_waitlist_slot_atomic(
    p_claim_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE public.waitlists
    SET status = 'CLAIMED'
    WHERE id = p_claim_id
      AND status = 'NOTIFIED'
      AND priority_expires_at > NOW();

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

-- 3. Blindaje de Row Level Security (RLS) en public.waitlists
-- Corrige vulnerabilidad crítica de PII: elimina políticas abiertas con USING (true)
ALTER TABLE public.waitlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenants acceden a su lista de espera" ON public.waitlists;
DROP POLICY IF EXISTS "Permitir crear inscripciones a lista de espera" ON public.waitlists;
DROP POLICY IF EXISTS "waitlists: public insert" ON public.waitlists;
DROP POLICY IF EXISTS "waitlists: staff manage own tenant" ON public.waitlists;

-- A. Inserción pública permitida para que los jugadores se anoten desde la web
CREATE POLICY "waitlists: public insert"
    ON public.waitlists FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- B. Consulta y gestión restringida estrictamente al personal del club (Staff / Admin / Superadmin)
-- Protege los números de teléfono y nombres de los jugadores en lista de espera
CREATE POLICY "waitlists: staff manage own tenant"
    ON public.waitlists FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND (p.tenant_id = waitlists.tenant_id OR p.role = 'SUPERADMIN')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND (p.tenant_id = waitlists.tenant_id OR p.role = 'SUPERADMIN')
        )
    );

-- 4. Blindaje de Row Level Security (RLS) en public.tournament_waitlists
-- Corrige fuga de PII que permitía leer teléfonos de competidores mediante SELECT anon
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tournament_waitlists') THEN
        ALTER TABLE public.tournament_waitlists ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "Lectura publica lista de espera torneos" ON public.tournament_waitlists;
        DROP POLICY IF EXISTS "tournament_waitlists: staff manage own tenant" ON public.tournament_waitlists;

        CREATE POLICY "tournament_waitlists: staff manage own tenant"
            ON public.tournament_waitlists FOR ALL
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.tournament_categories c
                    JOIN public.tournaments t ON t.id = c.tournament_id
                    JOIN public.profiles p ON p.id = auth.uid()
                    WHERE c.id = tournament_waitlists.category_id
                    AND (p.tenant_id = t.tenant_id OR p.role = 'SUPERADMIN')
                )
            );
    END IF;
END $$;
