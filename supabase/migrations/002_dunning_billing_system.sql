-- =============================================================================
-- SISTEMA CLUB - SaaS Multi-Tenant para Gestión de Canchas Deportivas
-- Migración: 002_dunning_billing_system.sql
-- Descripción: Módulo de Facturación Recurrente, Cobranzas y Suspensión Progresiva (Dunning)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ENUMS DEL SISTEMA DE DUNNING
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.tenant_subscription_status AS ENUM (
    'ACTIVE',               -- Al día y operativo
    'PAYMENT_PENDING',      -- Días 1 al 7: Factura emitida, período ordinario de pago
    'GRACE_PERIOD',         -- Días 8 al 12: Aviso suave (banner flotante sin bloqueo)
    'PARTIALLY_SUSPENDED',  -- Días 13 al 14: Degradación parcial (pausa de reservas públicas)
    'LOCKED'                -- Día 15+: Bloqueo total del panel de administración
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM (
    'DRAFT',
    'UNPAID',
    'PAID',
    'VOID'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 2. MODIFICACIÓN DE LA TABLA TENANTS
-- -----------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS subscription_status public.tenant_subscription_status NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS base_slots_plan NUMERIC(4,2) DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS minimum_floor_ars NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_balance NUMERIC(12,2) DEFAULT 0;

COMMENT ON COLUMN public.tenants.subscription_status IS 'Estado del ciclo de cobranza escalonado (Dunning).';
COMMENT ON COLUMN public.tenants.base_slots_plan IS 'Cantidad de turnos que equivale el plan SaaS mensual (ej. 1.5x turnos).';
COMMENT ON COLUMN public.tenants.minimum_floor_ars IS 'Precio piso garantizado para la cuota mensual en ARS.';
COMMENT ON COLUMN public.tenants.current_balance IS 'Saldo deudor acumulado del club ante la plataforma SaaS.';

CREATE INDEX IF NOT EXISTS idx_tenants_subscription_status ON public.tenants(subscription_status);

-- -----------------------------------------------------------------------------
-- 3. TABLA DE FACTURAS / LIQUIDACIONES SAAS (tenant_invoices)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_invoices (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  month                 INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year                  INTEGER NOT NULL CHECK (year >= 2024),
  amount                NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status                public.invoice_status NOT NULL DEFAULT 'UNPAID',
  reference_slot_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
  slots_multiplier      NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  mp_preference_id      TEXT,
  mp_payment_id         TEXT,
  due_date              DATE NOT NULL,
  paid_at               TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_tenant_invoice_period UNIQUE (tenant_id, year, month)
);

COMMENT ON TABLE public.tenant_invoices IS 'Facturas y liquidaciones mensuales emitidas a cada club por el uso de la plataforma SaaS.';
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status ON public.tenant_invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.tenant_invoices(due_date);

ALTER TABLE public.tenant_invoices ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 4. PROCEDIMIENTO ALMACENADO PARA EVALUACIÓN AUTOMÁTICA DE DUNNING (CRON)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_tenant_dunning()
RETURNS TABLE (
  processed_tenants INTEGER,
  invoices_generated INTEGER,
  status_updated INTEGER
) AS $$
DECLARE
  v_current_day INTEGER := EXTRACT(DAY FROM CURRENT_DATE);
  v_current_month INTEGER := EXTRACT(MONTH FROM CURRENT_DATE);
  v_current_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
  v_last_day_of_month DATE := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
  v_tenant RECORD;
  v_highest_slot_price NUMERIC;
  v_multiplier NUMERIC;
  v_invoice_amount NUMERIC;
  v_courts_count INTEGER;
  v_count_tenants INTEGER := 0;
  v_count_invoices INTEGER := 0;
  v_count_status INTEGER := 0;
  v_unpaid_invoice RECORD;
BEGIN
  -- Iterar sobre todos los clubes activos
  FOR v_tenant IN 
    SELECT t.id, t.name, t.subscription_status, t.base_slots_plan, t.minimum_floor_ars
    FROM public.tenants t
    WHERE t.is_active = TRUE
  LOOP
    v_count_tenants := v_count_tenants + 1;

    -- DÍA 1: Generar la factura mensual si aún no existe
    IF v_current_day = 1 THEN
      -- Obtener el precio más caro de las reglas de precios del club
      SELECT COALESCE(MAX(pr.price_cents) / 100, 30000)
      INTO v_highest_slot_price
      FROM public.price_rules pr
      WHERE pr.tenant_id = v_tenant.id AND pr.is_active = TRUE;

      -- Cantidad de canchas activas
      SELECT COUNT(*)
      INTO v_courts_count
      FROM public.courts c
      WHERE c.tenant_id = v_tenant.id AND c.is_active = TRUE;

      -- Multiplicador proporcional: 0.5 * canchas + 0.5 (o base_slots_plan si configurado)
      v_multiplier := COALESCE(v_tenant.base_slots_plan, (0.5 * GREATEST(1, v_courts_count) + 0.5));
      v_invoice_amount := GREATEST(v_highest_slot_price * v_multiplier, COALESCE(v_tenant.minimum_floor_ars, 0));

      -- Insertar factura si no existe para este período
      INSERT INTO public.tenant_invoices (
        tenant_id,
        month,
        year,
        amount,
        status,
        reference_slot_price,
        slots_multiplier,
        due_date,
        notes
      ) VALUES (
        v_tenant.id,
        v_current_month,
        v_current_year,
        v_invoice_amount,
        'UNPAID',
        v_highest_slot_price,
        v_multiplier,
        v_last_day_of_month,
        'Liquidación mensual SaaS automatizada'
      )
      ON CONFLICT (tenant_id, year, month) DO NOTHING;

      IF FOUND THEN
        v_count_invoices := v_count_invoices + 1;
        -- Actualizar saldo deudor y estado a PAYMENT_PENDING
        UPDATE public.tenants
        SET subscription_status = 'PAYMENT_PENDING',
            current_balance = current_balance + v_invoice_amount,
            updated_at = NOW()
        WHERE id = v_tenant.id;
        v_count_status := v_count_status + 1;
      END IF;
    END IF;

    -- Comprobar si tiene alguna factura UNPAID vencida o del mes actual
    SELECT ti.id, ti.amount, ti.status
    INTO v_unpaid_invoice
    FROM public.tenant_invoices ti
    WHERE ti.tenant_id = v_tenant.id
      AND ti.year = v_current_year
      AND ti.month = v_current_month
      AND ti.status = 'UNPAID'
    LIMIT 1;

    -- Si no tiene facturas impagas y está en mora, restablecer a ACTIVE
    IF v_unpaid_invoice IS NULL THEN
      IF v_tenant.subscription_status != 'ACTIVE' THEN
        UPDATE public.tenants
        SET subscription_status = 'ACTIVE',
            current_balance = 0,
            updated_at = NOW()
        WHERE id = v_tenant.id;
        v_count_status := v_count_status + 1;
      END IF;
    ELSE
      -- TIENE FACTURA IMPAGA: Aplicar escalonamiento de Dunning según día del mes
      IF v_current_day BETWEEN 1 AND 7 THEN
        -- Período ordinario de pago voluntario
        IF v_tenant.subscription_status != 'PAYMENT_PENDING' THEN
          UPDATE public.tenants SET subscription_status = 'PAYMENT_PENDING', updated_at = NOW() WHERE id = v_tenant.id;
          v_count_status := v_count_status + 1;
        END IF;
      ELSIF v_current_day BETWEEN 8 AND 12 THEN
        -- Días 8 al 12: Período de gracia con advertencia (Soft Warning)
        IF v_tenant.subscription_status != 'GRACE_PERIOD' THEN
          UPDATE public.tenants SET subscription_status = 'GRACE_PERIOD', updated_at = NOW() WHERE id = v_tenant.id;
          v_count_status := v_count_status + 1;
        END IF;
      ELSIF v_current_day BETWEEN 13 AND 14 THEN
        -- Días 13 al 14: Suspensión parcial (Pausa en reservas públicas)
        IF v_tenant.subscription_status != 'PARTIALLY_SUSPENDED' THEN
          UPDATE public.tenants SET subscription_status = 'PARTIALLY_SUSPENDED', updated_at = NOW() WHERE id = v_tenant.id;
          v_count_status := v_count_status + 1;
        END IF;
      ELSIF v_current_day >= 15 THEN
        -- Día 15 en adelante: Bloqueo total (Locked)
        IF v_tenant.subscription_status != 'LOCKED' THEN
          UPDATE public.tenants SET subscription_status = 'LOCKED', updated_at = NOW() WHERE id = v_tenant.id;
          v_count_status := v_count_status + 1;
        END IF;
      END IF;
    END IF;

  END LOOP;

  processed_tenants := v_count_tenants;
  invoices_generated := v_count_invoices;
  status_updated := v_count_status;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.evaluate_tenant_dunning() IS 
  'Evalúa cronológicamente el estado de deuda de cada club y aplica suspensión progresiva (Día 1: Factura, Día 8: Gracia, Día 13: Pausa Pública, Día 15: Bloqueo Total).';

-- -----------------------------------------------------------------------------
-- 5. TRIGGER DE ACTUALIZACIÓN RÁPIDA TRAS PAGO
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_invoice_paid()
RETURNS TRIGGER AS $$
BEGIN
  -- Si la factura se marca como PAID
  IF NEW.status = 'PAID' AND OLD.status != 'PAID' THEN
    NEW.paid_at := COALESCE(NEW.paid_at, NOW());

    -- Verificar si quedan otras facturas pendientes
    IF NOT EXISTS (
      SELECT 1 FROM public.tenant_invoices
      WHERE tenant_id = NEW.tenant_id AND status = 'UNPAID' AND id != NEW.id
    ) THEN
      -- Restablecer el club a ACTIVE y saldar balance
      UPDATE public.tenants
      SET subscription_status = 'ACTIVE',
          current_balance = 0,
          updated_at = NOW()
      WHERE id = NEW.tenant_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_invoice_paid_status ON public.tenant_invoices;
CREATE TRIGGER trg_invoice_paid_status
  BEFORE UPDATE ON public.tenant_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.on_invoice_paid();
