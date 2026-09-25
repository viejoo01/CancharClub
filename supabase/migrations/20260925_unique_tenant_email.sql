-- ==============================================================================
-- MIGRACIÓN DE SEGURIDAD: UNICIDAD Y FORMATO DE EMAIL PARA CLUBES (@club.com)
-- Fecha: 2026-09-25
-- Descripción:
-- 1. Impide que dos clubes distintos compartan el mismo correo electrónico.
-- 2. Asegura que todos los correos de administración terminen en @club.com.
-- ==============================================================================

-- 1. Normalizar emails existentes a minúsculas y sin espacios
UPDATE public.tenants
SET email = LOWER(TRIM(email))
WHERE email IS NOT NULL;

-- 2. Asegurar que los correos existentes terminen en @club.com
UPDATE public.tenants
SET email = SPLIT_PART(email, '@', 1) || '@club.com'
WHERE email IS NOT NULL AND email NOT LIKE '%@club.com';

-- 3. Crear índice único insensible a mayúsculas/minúsculas para public.tenants(email)
-- Esto previene a nivel de base de datos que dos clubes tengan el mismo correo.
CREATE UNIQUE INDEX IF NOT EXISTS tenants_email_unique_idx 
ON public.tenants (LOWER(email));

-- 4. Asociar el índice único como restricción formal en la tabla
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_email_unique_constraint'
  ) THEN
    ALTER TABLE public.tenants 
    ADD CONSTRAINT tenants_email_unique_constraint UNIQUE USING INDEX tenants_email_unique_idx;
  END IF;
END $$;

-- 5. Restricción CHECK: Garantiza que cualquier nuevo email termine en @club.com
ALTER TABLE public.tenants 
DROP CONSTRAINT IF EXISTS tenants_email_club_domain_check;

ALTER TABLE public.tenants 
ADD CONSTRAINT tenants_email_club_domain_check 
CHECK (email ~* '^[a-z0-9._-]+@club\.com$');

COMMENT ON INDEX public.tenants_email_unique_idx IS 'Garantiza unicidad de email entre todos los clubes de la plataforma.';
