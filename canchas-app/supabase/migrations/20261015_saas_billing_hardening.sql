-- =============================================================================
-- MIGRACIÓN CANCHARCLUB: ÍNDICES DE PREAPPROVAL Y AUDITORÍA DE FACTURACIÓN
-- Fecha: 2026-10-15
-- =============================================================================

-- 1. Índice para búsqueda ultra rápida de clubes por suscripción recurrente de Mercado Pago
CREATE INDEX IF NOT EXISTS idx_tenants_mp_preapproval ON public.tenants(mp_preapproval_id);

-- 2. Índice para verificación instantánea de idempotencia en pagos procesados
CREATE INDEX IF NOT EXISTS idx_processed_payments_payment_id ON public.processed_payments(payment_id);
