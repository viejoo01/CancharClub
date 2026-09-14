-- =============================================================================
-- SISTEMA CLUB - SaaS Multi-Tenant para Gestión de Canchas Deportivas
-- Migración: 001_initial_schema.sql
-- Descripción: Schema DDL completo con RLS y restricciones de concurrencia
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. EXTENSIONES
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ---------------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------------
CREATE TYPE public.user_role AS ENUM (
  'SUPERADMIN',
  'TENANT_ADMIN',
  'TENANT_STAFF',
  'CUSTOMER'
);

CREATE TYPE public.sport_type AS ENUM (
  'PADEL',
  'FUTBOL5',
  'FUTBOL7',
  'TENIS'
);

CREATE TYPE public.surface_type AS ENUM (
  'CESPED_SINTETICO',
  'PASTO_NATURAL',
  'CEMENTO',
  'POLVO_LADRILLO',
  'CRISTAL'
);

CREATE TYPE public.booking_status AS ENUM (
  'pending_lock',
  'pending_deposit',
  'confirmed',
  'confirmed_cash',
  'cancelled',
  'no_show',
  'completed'
);

CREATE TYPE public.payment_method AS ENUM (
  'mercadopago',
  'cash',
  'bank_transfer',
  'account_credit'
);

CREATE TYPE public.saas_plan AS ENUM (
  'STARTER',
  'STANDARD',
  'PREMIUM',
  'ENTERPRISE'
);

CREATE TYPE public.subscription_status AS ENUM (
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'suspended'
);

-- ---------------------------------------------------------------------------
-- 2. TENANTS
-- ---------------------------------------------------------------------------
CREATE TABLE public.tenants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  logo_url        TEXT,
  description     TEXT,
  phone_whatsapp  TEXT,
  email           TEXT,
  address         TEXT,
  city            TEXT DEFAULT 'Tucumán',
  province        TEXT DEFAULT 'Tucumán',
  country         TEXT DEFAULT 'AR',
  timezone        TEXT DEFAULT 'America/Argentina/Tucuman',
  booking_advance_days  INTEGER DEFAULT 14,
  cancellation_hours    INTEGER DEFAULT 24,
  deposit_percentage    NUMERIC(5,2) DEFAULT 50,
  currency              TEXT DEFAULT 'ARS',
  mp_access_token_enc   TEXT,
  mp_webhook_secret_enc TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.tenants IS 'Clubes deportivos registrados en la plataforma SaaS.';
COMMENT ON COLUMN public.tenants.slug IS 'Identificador URL único del club, ej: club-los-pinos.';
COMMENT ON COLUMN public.tenants.deposit_percentage IS 'Porcentaje de seña requerido al reservar online (0 = sin seña, 100 = pago total).';

-- ---------------------------------------------------------------------------
-- 3. PROFILES
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  role        public.user_role NOT NULL DEFAULT 'CUSTOMER',
  full_name   TEXT,
  phone       TEXT,
  avatar_url  TEXT,
  total_bookings INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Extiende auth.users con rol, tenant y datos de perfil.';
COMMENT ON COLUMN public.profiles.tenant_id IS 'NULL para SUPERADMIN y CUSTOMERs sin club asignado.';

CREATE INDEX idx_profiles_tenant_role ON public.profiles(tenant_id, role);

-- ---------------------------------------------------------------------------
-- 4. COURTS
-- ---------------------------------------------------------------------------
CREATE TABLE public.courts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sport       public.sport_type NOT NULL,
  surface     public.surface_type,
  is_indoor   BOOLEAN DEFAULT FALSE,
  has_lights  BOOLEAN DEFAULT TRUE,
  slot_duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (slot_duration_minutes IN (60, 90)),
  display_order INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.courts IS 'Canchas deportivas de cada club.';
CREATE INDEX idx_courts_tenant ON public.courts(tenant_id, is_active);

-- ---------------------------------------------------------------------------
-- 5. PRICE_RULES
-- ---------------------------------------------------------------------------
CREATE TABLE public.price_rules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  court_id    UUID NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  day_of_week INTEGER[] NOT NULL CHECK (
    array_length(day_of_week, 1) > 0 AND
    day_of_week <@ ARRAY[1,2,3,4,5,6,7]
  ),
  time_from   TIME NOT NULL,
  time_to     TIME NOT NULL CHECK (time_to > time_from),
  price_cents BIGINT NOT NULL CHECK (price_cents >= 0),
  priority    INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  valid_from  DATE,
  valid_to    DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.price_rules IS 'Reglas de precios por franja horaria y día de semana por cancha.';
COMMENT ON COLUMN public.price_rules.price_cents IS 'Precio en centavos de ARS (ej: 1500000 = ARS 15.000,00).';
CREATE INDEX idx_price_rules_court ON public.price_rules(court_id, is_active);

-- ---------------------------------------------------------------------------
-- 6. BOOKINGS - Tabla crítica con restricción de exclusión
-- ---------------------------------------------------------------------------
CREATE TABLE public.bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  court_id        UUID NOT NULL REFERENCES public.courts(id) ON DELETE RESTRICT,
  customer_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  booked_at       TSTZRANGE NOT NULL,
  status          public.booking_status NOT NULL DEFAULT 'pending_lock',
  sport           public.sport_type NOT NULL,
  price_total_cents   BIGINT NOT NULL CHECK (price_total_cents >= 0),
  deposit_cents       BIGINT NOT NULL DEFAULT 0 CHECK (deposit_cents >= 0),
  price_rule_id       UUID REFERENCES public.price_rules(id) ON DELETE SET NULL,
  payment_method      public.payment_method,
  mp_payment_id       TEXT,
  mp_merchant_order   TEXT,
  mp_preference_id    TEXT,
  paid_at             TIMESTAMPTZ,
  customer_name   TEXT,
  customer_phone  TEXT,
  customer_email  TEXT,
  staff_deposit_amount_cents BIGINT DEFAULT 0,
  staff_notes                TEXT,
  created_by_staff_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  redis_lock_key  TEXT,
  lock_expires_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.bookings IS 'Reservas de canchas con control estricto de concurrencia.';
COMMENT ON COLUMN public.bookings.booked_at IS 'Rango temporal [inicio, fin) de la reserva, tipo tstzrange.';
COMMENT ON COLUMN public.bookings.price_total_cents IS 'Precio total del turno en centavos de ARS.';

CREATE INDEX idx_bookings_tenant_status ON public.bookings(tenant_id, status);
CREATE INDEX idx_bookings_court_date    ON public.bookings(court_id, booked_at);
CREATE INDEX idx_bookings_customer      ON public.bookings(customer_id);
CREATE INDEX idx_bookings_mp_payment    ON public.bookings(mp_payment_id) WHERE mp_payment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- FUNCIÓN AUXILIAR Y COLUMNA GENERADA PARA LA RESTRICCIÓN DE EXCLUSIÓN
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.booking_is_active(status public.booking_status)
RETURNS BOOLEAN AS $$
  SELECT status IN (
    'pending_lock',
    'pending_deposit',
    'confirmed',
    'confirmed_cash',
    'completed'
  );
$$ LANGUAGE sql IMMUTABLE;

ALTER TABLE public.bookings
  ADD COLUMN is_active_slot BOOLEAN GENERATED ALWAYS AS (
    public.booking_is_active(status)
  ) STORED;

-- EXCLUSIÓN ANTI-OVERBOOKING (constraint de exclusión GIST)
ALTER TABLE public.bookings
  ADD CONSTRAINT excl_bookings_no_overlap
  EXCLUDE USING GIST (
    court_id      WITH =,
    booked_at     WITH &&
  )
  WHERE (is_active_slot = TRUE);

COMMENT ON CONSTRAINT excl_bookings_no_overlap ON public.bookings IS
  'Garantiza que no haya dos reservas activas en la misma cancha con rangos temporales solapados.';

-- ---------------------------------------------------------------------------
-- 7. SAAS_SUBSCRIPTIONS
-- ---------------------------------------------------------------------------
CREATE TABLE public.saas_subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  plan            public.saas_plan NOT NULL DEFAULT 'STANDARD',
  status          public.subscription_status NOT NULL DEFAULT 'trialing',
  billing_period_start  DATE NOT NULL,
  billing_period_end    DATE NOT NULL CHECK (billing_period_end > billing_period_start),
  reference_slot_price_cents  BIGINT NOT NULL,
  plan_multiplier             NUMERIC(4,2) NOT NULL DEFAULT 2.0,
  minimum_fee_cents           BIGINT NOT NULL DEFAULT 0,
  calculated_fee_cents        BIGINT GENERATED ALWAYS AS (
    GREATEST(
      ROUND(reference_slot_price_cents * plan_multiplier)::BIGINT,
      minimum_fee_cents
    )
  ) STORED,
  paid_at         TIMESTAMPTZ,
  mp_payment_id   TEXT,
  payment_notes   TEXT,
  calculated_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.saas_subscriptions IS 'Abonos mensuales de cada club al SaaS.';
COMMENT ON COLUMN public.saas_subscriptions.reference_slot_price_cents IS 'Snapshot del turno nocturno más caro vigente al día 1 del mes, en centavos ARS.';
COMMENT ON COLUMN public.saas_subscriptions.calculated_fee_cents IS 'Fee: MAX(precio_ref * multiplicador, mínimo).';

CREATE INDEX idx_saas_subs_tenant_period ON public.saas_subscriptions(tenant_id, billing_period_start DESC);
CREATE UNIQUE INDEX idx_saas_subs_tenant_month ON public.saas_subscriptions(tenant_id, billing_period_start);

-- ---------------------------------------------------------------------------
-- 8. AUDIT_LOG
-- ---------------------------------------------------------------------------
CREATE TABLE public.audit_log (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   UUID,
  user_id     UUID,
  action      TEXT NOT NULL,
  table_name  TEXT NOT NULL,
  record_id   UUID NOT NULL,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant_created ON public.audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_record ON public.audit_log(table_name, record_id);

-- ---------------------------------------------------------------------------
-- 9. TRIGGERS: updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_courts_updated_at
  BEFORE UPDATE ON public.courts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_price_rules_updated_at
  BEFORE UPDATE ON public.price_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_saas_subs_updated_at
  BEFORE UPDATE ON public.saas_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. TRIGGER: Sincronizar perfil al registrar usuario
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'CUSTOMER'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 11. FUNCIONES HELPER
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 12. ROW LEVEL SECURITY (RLS)
-- ---------------------------------------------------------------------------

-- TENANTS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_select_public ON public.tenants
  FOR SELECT USING (is_active = TRUE);
CREATE POLICY tenants_manage_superadmin ON public.tenants
  FOR ALL
  USING (public.current_user_role() = 'SUPERADMIN')
  WITH CHECK (public.current_user_role() = 'SUPERADMIN');

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_own ON public.profiles
  FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_tenant_staff_select ON public.profiles
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('TENANT_ADMIN', 'TENANT_STAFF')
  );
CREATE POLICY profiles_superadmin ON public.profiles
  FOR ALL
  USING (public.current_user_role() = 'SUPERADMIN')
  WITH CHECK (public.current_user_role() = 'SUPERADMIN');

-- COURTS
ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;
CREATE POLICY courts_select_public ON public.courts
  FOR SELECT USING (is_active = TRUE);
CREATE POLICY courts_manage_admin ON public.courts
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_user_role() = 'TENANT_ADMIN')
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_user_role() = 'TENANT_ADMIN');
CREATE POLICY courts_superadmin ON public.courts
  FOR ALL
  USING (public.current_user_role() = 'SUPERADMIN')
  WITH CHECK (public.current_user_role() = 'SUPERADMIN');

-- PRICE_RULES
ALTER TABLE public.price_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY price_rules_select_public ON public.price_rules
  FOR SELECT USING (is_active = TRUE);
CREATE POLICY price_rules_manage_admin ON public.price_rules
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_user_role() = 'TENANT_ADMIN')
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_user_role() = 'TENANT_ADMIN');
CREATE POLICY price_rules_superadmin ON public.price_rules
  FOR ALL
  USING (public.current_user_role() = 'SUPERADMIN')
  WITH CHECK (public.current_user_role() = 'SUPERADMIN');

-- BOOKINGS
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY bookings_customer_own ON public.bookings
  FOR SELECT USING (customer_id = auth.uid());
CREATE POLICY bookings_customer_insert ON public.bookings
  FOR INSERT WITH CHECK (customer_id = auth.uid() AND public.current_user_role() = 'CUSTOMER');
CREATE POLICY bookings_tenant_staff ON public.bookings
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_user_role() IN ('TENANT_ADMIN', 'TENANT_STAFF'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_user_role() IN ('TENANT_ADMIN', 'TENANT_STAFF'));
CREATE POLICY bookings_superadmin ON public.bookings
  FOR ALL
  USING (public.current_user_role() = 'SUPERADMIN')
  WITH CHECK (public.current_user_role() = 'SUPERADMIN');

-- SAAS_SUBSCRIPTIONS
ALTER TABLE public.saas_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_subs_tenant_read ON public.saas_subscriptions
  FOR SELECT USING (tenant_id = public.current_tenant_id() AND public.current_user_role() = 'TENANT_ADMIN');
CREATE POLICY saas_subs_superadmin ON public.saas_subscriptions
  FOR ALL
  USING (public.current_user_role() = 'SUPERADMIN')
  WITH CHECK (public.current_user_role() = 'SUPERADMIN');

-- AUDIT_LOG
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_superadmin ON public.audit_log
  FOR SELECT USING (public.current_user_role() = 'SUPERADMIN');
CREATE POLICY audit_log_tenant_admin ON public.audit_log
  FOR SELECT USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() = 'TENANT_ADMIN'
  );

-- ---------------------------------------------------------------------------
-- 13. FUNCIÓN: Calcular precio de un slot
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_slot_price(p_court_id UUID, p_start_at TIMESTAMPTZ)
RETURNS BIGINT AS $$
DECLARE
  v_price_cents BIGINT;
  v_dow         INTEGER;
  v_time        TIME;
BEGIN
  SELECT
    EXTRACT(ISODOW FROM p_start_at AT TIME ZONE t.timezone)::INTEGER,
    (p_start_at AT TIME ZONE t.timezone)::TIME
  INTO v_dow, v_time
  FROM public.courts c
  JOIN public.tenants t ON t.id = c.tenant_id
  WHERE c.id = p_court_id;

  SELECT pr.price_cents INTO v_price_cents
  FROM public.price_rules pr
  WHERE pr.court_id = p_court_id
    AND pr.is_active = TRUE
    AND v_dow = ANY(pr.day_of_week)
    AND v_time >= pr.time_from
    AND v_time < pr.time_to
    AND (pr.valid_from IS NULL OR pr.valid_from <= p_start_at::DATE)
    AND (pr.valid_to   IS NULL OR pr.valid_to   >= p_start_at::DATE)
  ORDER BY pr.priority DESC
  LIMIT 1;

  RETURN COALESCE(v_price_cents, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 14. FUNCIÓN: Precio nocturno máximo para facturación SaaS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_max_nocturnal_price(p_tenant_id UUID)
RETURNS BIGINT AS $$
DECLARE
  v_max_price BIGINT;
BEGIN
  SELECT MAX(pr.price_cents) INTO v_max_price
  FROM public.price_rules pr
  JOIN public.courts c ON c.id = pr.court_id
  WHERE c.tenant_id = p_tenant_id
    AND pr.is_active = TRUE
    AND pr.time_from >= '20:00'::TIME
    AND (pr.valid_to IS NULL OR pr.valid_to >= CURRENT_DATE);

  RETURN COALESCE(v_max_price, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 15. VISTA: Turnos del día para el panel admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_daily_bookings AS
SELECT
  b.id,
  b.tenant_id,
  b.court_id,
  c.name        AS court_name,
  c.sport,
  b.status,
  b.customer_name,
  b.customer_phone,
  b.customer_id,
  p.full_name   AS customer_profile_name,
  lower(b.booked_at) AS start_at,
  upper(b.booked_at) AS end_at,
  b.price_total_cents,
  b.deposit_cents,
  b.payment_method,
  b.staff_notes,
  b.created_at
FROM public.bookings b
JOIN public.courts c ON c.id = b.court_id
LEFT JOIN public.profiles p ON p.id = b.customer_id
WHERE b.status NOT IN ('cancelled', 'no_show');

COMMENT ON VIEW public.v_daily_bookings IS
  'Vista de turnos activos con datos de cancha y cliente para el panel admin.';

-- ===========================================================================
-- FIN DEL SCHEMA - 001_initial_schema.sql
-- ===========================================================================
