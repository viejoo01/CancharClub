-- =============================================================================
-- MIGRACIÓN CANCHARCLUB: AGREGAR plan_id E is_active A TABLA TENANTS
-- Fecha: 2026-09-11
-- =============================================================================

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS plan_id TEXT DEFAULT 'CHICO_1';

-- Comentario descriptivo
COMMENT ON COLUMN public.tenants.is_active IS 'Indica si el club fue aprobado y activado por el superadmin';
COMMENT ON COLUMN public.tenants.plan_id IS 'Identificador del plan SaaS asignado: CHICO_1, MEDIANO_2, CONSOLIDADO_3_4, GRANDE_5_PLUS';
