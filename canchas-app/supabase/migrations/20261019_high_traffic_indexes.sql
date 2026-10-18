-- ==============================================================================
-- CANCHARCLUB — MIGRACIÓN DE ALTO TRÁFICO E ÍNDICES DE MÁXIMA CONCURRENCIA
-- ==============================================================================
-- Optimiza consultas de alta frecuencia:
-- 1. Consultas de disponibilidad y reservas activas por cancha
-- 2. Listados de reservas recientes del dashboard por tenant_id
-- 3. Búsqueda de saldos a favor por source_booking_id en cancelaciones
-- 4. Notificaciones y alertas en tiempo real por tenant_id y action
-- ==============================================================================

-- 1. Índice compuesto de alta velocidad para disponibilidad y calendarios
CREATE INDEX IF NOT EXISTS idx_bookings_active_court_range 
ON public.bookings (court_id, booked_at) 
WHERE (status != 'cancelled');

-- 2. Índice para listados y métricas del dashboard del club
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_created_desc 
ON public.bookings (tenant_id, created_at DESC);

-- 3. Índice para búsqueda ultra-rápida de saldos vinculados a reservas
CREATE INDEX IF NOT EXISTS idx_customer_credits_source_booking 
ON public.customer_credits (source_booking_id) 
WHERE (source_booking_id IS NOT NULL);

-- 4. Índice para notificaciones explícitas del club
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_action_created 
ON public.audit_log (tenant_id, action, created_at DESC);

-- 5. Analizar tablas para actualizar las estadísticas del optimizador de PostgreSQL
ANALYZE public.bookings;
ANALYZE public.courts;
ANALYZE public.booking_payments;
ANALYZE public.customer_credits;
ANALYZE public.audit_log;
