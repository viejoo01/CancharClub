-- ==============================================================================
-- Migración 20261021: Expansión de Rondas en Torneos y Registro Atómico Anti-Race Conditions
-- ==============================================================================

-- 1. Ampliar el CHECK constraint de rondas en tournament_matches para soportar llaves de 16 y 24+ equipos (Octavos, Dieciseisavos y Grupos)
ALTER TABLE public.tournament_matches 
DROP CONSTRAINT IF EXISTS tournament_matches_round_check;

ALTER TABLE public.tournament_matches 
ADD CONSTRAINT tournament_matches_round_check 
CHECK (round IN (
    'DIECISEISAVOS', 
    'OCTAVOS', 
    'CUARTOS', 
    'SEMIFINAL', 
    'FINAL', 
    'GRUPO_A', 
    'GRUPO_B', 
    'GRUPO'
));

-- 2. Función RPC Atómica con bloqueo de fila (FOR UPDATE) para inscripción de equipos
-- Garantiza que concurrentemente NUNCA se supere el cupo máximo 'max_teams'
CREATE OR REPLACE FUNCTION public.register_tournament_team_atomic(
    p_category_id UUID,
    p_name TEXT,
    p_player_1 TEXT,
    p_player_2 TEXT,
    p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_max_teams INT;
    v_current_count INT;
    v_team_id UUID;
    v_new_team JSONB;
BEGIN
    -- Bloqueo exclusivo de fila de la categoría
    SELECT COALESCE(max_teams, 8) INTO v_max_teams
    FROM public.tournament_categories
    WHERE id = p_category_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Categoría no encontrada');
    END IF;

    IF v_max_teams <= 0 THEN
        v_max_teams := 8;
    END IF;

    -- Conteo exacto bajo el bloqueo
    SELECT COUNT(*) INTO v_current_count
    FROM public.tournament_teams
    WHERE category_id = p_category_id;

    IF v_current_count >= v_max_teams THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', format('Esta categoría ya completó su cupo máximo de %s equipos inscriptos.', v_max_teams)
        );
    END IF;

    -- Inserción garantizada dentro de la transacción
    INSERT INTO public.tournament_teams (
        category_id,
        name,
        player_1,
        player_2,
        phone
    ) VALUES (
        p_category_id,
        p_name,
        p_player_1,
        p_player_2,
        p_phone
    )
    RETURNING id INTO v_team_id;

    SELECT to_jsonb(t) INTO v_new_team
    FROM public.tournament_teams t
    WHERE t.id = v_team_id;

    RETURN jsonb_build_object('success', true, 'team', v_new_team);
END;
$$;

-- Otorgar permisos de ejecución
GRANT EXECUTE ON FUNCTION public.register_tournament_team_atomic(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon, service_role;
