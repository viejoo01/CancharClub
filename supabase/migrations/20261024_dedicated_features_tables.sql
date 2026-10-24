-- supabase/migrations/20261024_dedicated_features_tables.sql
-- ==============================================================================
-- CANCHARCLUB — MIGRACIÓN DE TABLAS DEDICADAS: FACTURACIÓN AFIP & BOT DE WHATSAPP
-- ==============================================================================

-- 1. TABLA: invoices (Comprobantes y Facturación Electrónica AFIP / ARCA)
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  tipo_comprobante INTEGER NOT NULL DEFAULT 11, -- 11: Factura C, 6: Factura B, 1: Factura A
  punto_venta INTEGER NOT NULL DEFAULT 1,
  numero_comprobante INTEGER NOT NULL,
  numero_completo TEXT NOT NULL, -- ej: 0001-00000452
  fecha_emision DATE NOT NULL DEFAULT CURRENT_DATE,
  cliente_nombre TEXT NOT NULL,
  cliente_tipo_doc INTEGER NOT NULL DEFAULT 99, -- 96: DNI, 80: CUIT, 99: Final
  cliente_nro_doc TEXT,
  concepto INTEGER NOT NULL DEFAULT 2, -- 1: Productos, 2: Servicios, 3: Mixto
  monto_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  cae TEXT NOT NULL,
  cae_vencimiento DATE NOT NULL,
  qr_url TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON public.invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_booking ON public.invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_fecha ON public.invoices(tenant_id, fecha_emision DESC);

-- RLS: invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_tenant_isolation" ON public.invoices;
CREATE POLICY "invoices_tenant_isolation" ON public.invoices
  FOR ALL
  USING (
    tenant_id IN (
      SELECT p.tenant_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'STAFF', 'OWNER')
    )
    OR (
      SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()
    ) = 'SUPERADMIN'
  )
  WITH CHECK (
    tenant_id IN (
      SELECT p.tenant_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'STAFF', 'OWNER')
    )
    OR (
      SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()
    ) = 'SUPERADMIN'
  );

-- 2. TABLA: whatsapp_bot_configs (Configuración Desatendida de Mensajería)
CREATE TABLE IF NOT EXISTS public.whatsapp_bot_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_confirm_bookings BOOLEAN NOT NULL DEFAULT true,
  auto_reminder_2h BOOLEAN NOT NULL DEFAULT true,
  auto_waitlist_alert BOOLEAN NOT NULL DEFAULT true,
  provider TEXT NOT NULL DEFAULT 'SIMULATED', -- 'META_CLOUD', 'EVOLUTION_API', 'SIMULATED'
  phone_number_id TEXT,
  api_key TEXT,
  custom_greeting TEXT DEFAULT '¡Hola! Te escribimos de CancharClub en nombre de tu club.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_configs_tenant ON public.whatsapp_bot_configs(tenant_id);

-- RLS: whatsapp_bot_configs
ALTER TABLE public.whatsapp_bot_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_configs_tenant_isolation" ON public.whatsapp_bot_configs;
CREATE POLICY "wa_configs_tenant_isolation" ON public.whatsapp_bot_configs
  FOR ALL
  USING (
    tenant_id IN (
      SELECT p.tenant_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'STAFF', 'OWNER')
    )
    OR (
      SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()
    ) = 'SUPERADMIN'
  )
  WITH CHECK (
    tenant_id IN (
      SELECT p.tenant_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'STAFF', 'OWNER')
    )
    OR (
      SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()
    ) = 'SUPERADMIN'
  );

-- 3. TABLA: whatsapp_message_logs (Registro de Auditoría de Mensajes Salientes)
CREATE TABLE IF NOT EXISTS public.whatsapp_message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  recipient_phone TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  message_type TEXT NOT NULL, -- 'CONFIRMATION', 'REMINDER_2H', 'WAITLIST_ALERT', 'DEBT_REMINDER', 'TEST'
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SENT', -- 'SENT', 'PENDING', 'FAILED', 'SIMULATED'
  external_message_id TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_logs_tenant ON public.whatsapp_message_logs(tenant_id, sent_at DESC);

-- RLS: whatsapp_message_logs
ALTER TABLE public.whatsapp_message_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_logs_tenant_isolation" ON public.whatsapp_message_logs;
CREATE POLICY "wa_logs_tenant_isolation" ON public.whatsapp_message_logs
  FOR ALL
  USING (
    tenant_id IN (
      SELECT p.tenant_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'STAFF', 'OWNER')
    )
    OR (
      SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()
    ) = 'SUPERADMIN'
  )
  WITH CHECK (
    tenant_id IN (
      SELECT p.tenant_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'TENANT_ADMIN', 'TENANT_STAFF', 'STAFF', 'OWNER')
    )
    OR (
      SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()
    ) = 'SUPERADMIN'
  );
