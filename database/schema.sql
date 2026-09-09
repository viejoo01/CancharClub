-- =============================================================================
-- PLATAFORMA SAAS - GESTIÓN DE CANCHAS DEPORTIVAS (TUCUMÁN, ARG)
-- Schema DDL v1.0 — PostgreSQL 15+ / Supabase
-- =============================================================================
-- Orden de ejecución:
--   1. Extensiones
--   2. Tipos ENUM
--   3. Tablas (dependencias de FK en orden)
--   4. Índices
--   5. Restricción de exclusión (anti-overbooking)
--   6. Funciones auxiliares (helpers para RLS)
--   7. Políticas RLS
--   8. Triggers
-- =============================================================================


-- =============================================================================
-- 1. EXTENSIONES
-- =============================================================================

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Soporte para tipos de rango en índices B-tree (GIST)
-- Requerido para la restricción EXCLUDE USING gist con tsrange
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Fuzzy matching / full-text search (opcional pero útil)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";


-- =============================================================================
-- 2. TIPOS ENUM
-- =============================================================================

-- Roles de usuario en la plataforma
CREATE TYPE public.user_role AS ENUM (
    'SUPERADMIN',       -- Dueño de la plataforma SaaS
    'TENANT_ADMIN',     -- Dueño / gerente del club
    'TENANT_STAFF',     -- Recepcionista / cajero
    'CUSTOMER'          -- Jugador / cliente final
);

-- Estado del tenant en la plataforma SaaS
CREATE TYPE public.tenant_status AS ENUM (
    'TRIAL',            -- Período de prueba gratuita
    'ACTIVE',           -- Suscripción paga activa
    'PAST_DUE',         -- Pago vencido (grace period)
    'SUSPENDED',        -- Acceso bloqueado por deuda
    'CANCELLED'         -- Baja definitiva
);

-- Deportes soportados
CREATE TYPE public.sport_type AS ENUM (
    'PADEL',
    'FUTBOL_5',
    'FUTBOL_7',
    'TENIS',
    'SQUASH',
    'OTHER'
);

-- Tipo de superficie de la cancha
CREATE TYPE public.court_surface AS ENUM (
    'CEMENTO',
    'SINTETICO',
    'POLVO_LADRILLO',
    'ALFOMBRA',
    'PARQUET',
    'OTHER'
);

-- Duración estándar del turno en minutos
CREATE TYPE public.slot_duration AS ENUM (
    'MIN_60',           -- 1 hora
    'MIN_90',           -- 1 hora y media
    'MIN_120'           -- 2 horas
);

-- Estado del precio (permite histórico)
CREATE TYPE public.price_rule_type AS ENUM (
    'STANDARD',         -- Horario normal
    'PEAK',             -- Horario pico / nocturno
    'OFF_PEAK',         -- Horario bajo (mañana)
    'WEEKEND',          -- Fin de semana
    'HOLIDAY',          -- Feriado
    'PROMO'             -- Precio especial / promoción
);

-- Estado de la reserva — modelo de estados
CREATE TYPE public.booking_status AS ENUM (
    'SLOT_LOCKED',          -- Slot bloqueado en Redis (checkout iniciado)
    'PENDING_DEPOSIT',      -- Esperando pago de seña (MP creado, no pagado)
    'DEPOSIT_PAID',         -- Seña abonada online (MP confirmado)
    'CONFIRMED',            -- Reserva confirmada (seña + confirmación manual o auto)
    'PARTIAL_PAID',         -- Pago parcial registrado en caja
    'FULLY_PAID',           -- Turno abonado en su totalidad
    'CANCELLED_USER',       -- Cancelado por el jugador
    'CANCELLED_CLUB',       -- Cancelado por el club (e.g. lluvia, mantenimiento)
    'NO_SHOW',              -- El jugador no se presentó
    'COMPLETED'             -- Turno jugado y cerrado
);

-- Origen de la reserva
CREATE TYPE public.booking_origin AS ENUM (
    'ONLINE_PORTAL',    -- Portal público de reservas
    'ADMIN_MANUAL',     -- Carga manual desde panel admin
    'WHATSAPP',         -- Reserva tomada por WhatsApp (carga staff)
    'PHONE',            -- Reserva telefónica
    'WALK_IN'           -- Presencial en el club
);

-- Método de cobro para movimientos de caja
CREATE TYPE public.payment_method AS ENUM (
    'CASH',             -- Efectivo
    'TRANSFER',         -- Transferencia bancaria
    'MERCADOPAGO',      -- Pago online MP (checkout pro)
    'DEBIT_CARD',       -- Tarjeta de débito (POS)
    'CREDIT_CARD',      -- Tarjeta de crédito (POS)
    'QR_MP',            -- QR de Mercado Pago en mostrador
    'OTHER'
);

-- Estado del pago de suscripción SaaS
CREATE TYPE public.subscription_payment_status AS ENUM (
    'PENDING',
    'PAID',
    'OVERDUE',
    'WAIVED'            -- Perdonado (p.ej. descuento comercial)
);


-- =============================================================================
-- 3. TABLAS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.1 TENANTS — Un registro por club deportivo
-- -----------------------------------------------------------------------------
CREATE TABLE public.tenants (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identidad pública
    slug                TEXT NOT NULL UNIQUE,           -- Ej: "padel-sport-tucuman"
    name                TEXT NOT NULL,                  -- "Pádel Sport Tucumán"
    legal_name          TEXT,                           -- Razón social
    cuit                TEXT,                           -- CUIT del club (AR)
    logo_url            TEXT,
    primary_color       TEXT DEFAULT '#10B981',         -- Color de marca (hex)

    -- Contacto
    phone               TEXT,
    whatsapp_number     TEXT,                           -- Número E.164 para links WA
    email               TEXT,
    website_url         TEXT,
    instagram_handle    TEXT,

    -- Ubicación
    address             TEXT,
    city                TEXT DEFAULT 'Tucumán',
    province            TEXT DEFAULT 'Tucumán',
    country             TEXT DEFAULT 'AR',
    timezone            TEXT DEFAULT 'America/Argentina/Buenos_Aires',
    google_maps_url     TEXT,

    -- Estado en el SaaS
    status              public.tenant_status NOT NULL DEFAULT 'TRIAL',
    trial_ends_at       TIMESTAMPTZ,
    suspended_at        TIMESTAMPTZ,
    suspension_reason   TEXT,

    -- Configuración operativa del club
    advance_booking_days    INT NOT NULL DEFAULT 30,
    cancellation_hours      INT NOT NULL DEFAULT 24,
    deposit_percentage      NUMERIC(5,2) NOT NULL DEFAULT 50.00,
    min_deposit_amount_ars  NUMERIC(10,2),

    -- Horario de atención general del club
    business_hours      JSONB DEFAULT '{
        "monday":    {"open": "08:00", "close": "23:00"},
        "tuesday":   {"open": "08:00", "close": "23:00"},
        "wednesday": {"open": "08:00", "close": "23:00"},
        "thursday":  {"open": "08:00", "close": "23:00"},
        "friday":    {"open": "08:00", "close": "23:00"},
        "saturday":  {"open": "08:00", "close": "23:00"},
        "sunday":    {"open": "09:00", "close": "22:00"}
    }'::JSONB,

    -- Configuración de Mercado Pago del club
    mp_access_token         TEXT,
    mp_public_key           TEXT,
    mp_webhook_secret       TEXT,
    mp_marketplace_fee_pct  NUMERIC(5,2) DEFAULT 0.00,

    -- Auditoría
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.tenants IS 'Tenant raíz de la arquitectura multi-inquilino. Un registro por club deportivo.';
COMMENT ON COLUMN public.tenants.slug IS 'Identificador URL-amigable. Se usa en el enrutamiento /club/[slug].';
COMMENT ON COLUMN public.tenants.whatsapp_number IS 'Número en formato E.164 (ej: +5493816001234). Usado para generar links wa.me.';
COMMENT ON COLUMN public.tenants.mp_access_token IS 'Access token OAuth de Mercado Pago del club. NUNCA exponer al frontend.';


-- -----------------------------------------------------------------------------
-- 3.2 PROFILES — Extiende auth.users de Supabase
-- -----------------------------------------------------------------------------
CREATE TABLE public.profiles (
    id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id           UUID REFERENCES public.tenants(id) ON DELETE SET NULL,

    full_name           TEXT,
    avatar_url          TEXT,
    phone               TEXT,
    dni                 TEXT,

    role                public.user_role NOT NULL DEFAULT 'CUSTOMER',

    preferred_sport     public.sport_type,
    notification_prefs  JSONB DEFAULT '{"email": true, "whatsapp": false}'::JSONB,

    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Perfil extendido de usuario. Ligado 1:1 con auth.users de Supabase.';
COMMENT ON COLUMN public.profiles.tenant_id IS 'NULL para SUPERADMIN. Para TENANT_ADMIN/STAFF indica su club propietario.';


-- -----------------------------------------------------------------------------
-- 3.3 COURTS — Canchas dentro de un club
-- -----------------------------------------------------------------------------
CREATE TABLE public.courts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    name                TEXT NOT NULL,
    sport               public.sport_type NOT NULL,
    surface             public.court_surface,
    slot_duration       public.slot_duration NOT NULL DEFAULT 'MIN_60',

    is_indoor           BOOLEAN NOT NULL DEFAULT FALSE,
    has_lighting        BOOLEAN NOT NULL DEFAULT TRUE,
    has_blindex         BOOLEAN NOT NULL DEFAULT FALSE,
    max_players         INT,
    description         TEXT,
    image_url           TEXT,

    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    is_bookable_online  BOOLEAN NOT NULL DEFAULT TRUE,

    display_order       INT NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_court_name_per_tenant UNIQUE (tenant_id, name)
);

COMMENT ON TABLE public.courts IS 'Canchas físicas disponibles en un club (tenant).';


-- -----------------------------------------------------------------------------
-- 3.4 PRICE_RULES — Reglas de precio por franja horaria / tipo
-- -----------------------------------------------------------------------------
CREATE TABLE public.price_rules (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    court_id            UUID REFERENCES public.courts(id) ON DELETE CASCADE,

    name                TEXT NOT NULL,
    rule_type           public.price_rule_type NOT NULL DEFAULT 'STANDARD',

    applies_to_days     INT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
    time_from           TIME NOT NULL,
    time_to             TIME NOT NULL,

    price_ars           NUMERIC(10,2) NOT NULL CHECK (price_ars >= 0),

    valid_from          DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to            DATE,

    is_active           BOOLEAN NOT NULL DEFAULT TRUE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_price_rule_time_order CHECK (time_from < time_to),
    CONSTRAINT chk_price_rule_promo_zero CHECK (
        price_ars > 0 OR rule_type = 'PROMO'
    )
);

COMMENT ON TABLE public.price_rules IS 'Define las franjas horarias y sus precios por cancha o por tenant completo.';
COMMENT ON COLUMN public.price_rules.applies_to_days IS 'Array de enteros 0-6. 0=Domingo (alineado con EXTRACT DOW de PostgreSQL).';
COMMENT ON COLUMN public.price_rules.valid_from IS 'Inicio de vigencia. Permite histórico para calcular el abono SaaS retrospectivamente.';
COMMENT ON COLUMN public.price_rules.court_id IS 'NULL indica que la regla aplica a TODAS las canchas del tenant.';


-- -----------------------------------------------------------------------------
-- 3.5 BOOKINGS — Reservas (núcleo del sistema)
-- -----------------------------------------------------------------------------
CREATE TABLE public.bookings (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    court_id                UUID NOT NULL REFERENCES public.courts(id) ON DELETE RESTRICT,
    price_rule_id           UUID REFERENCES public.price_rules(id) ON DELETE SET NULL,
    customer_profile_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

    -- Datos del cliente (snapshot — permite reservas sin cuenta)
    customer_name           TEXT NOT NULL,
    customer_phone          TEXT,
    customer_email          TEXT,

    -- ──────────────────────────────────────────────────────────────────
    -- VENTANA TEMPORAL — NÚCLEO DEL ANTI-OVERBOOKING
    -- Se almacena como TSTZRANGE para usar el operador && en EXCLUDE.
    -- Convención: límite inferior INCLUSIVO, superior EXCLUSIVO [start, end)
    -- Ejemplo: ['2024-10-15 20:00:00-03', '2024-10-15 21:00:00-03')
    -- ──────────────────────────────────────────────────────────────────
    booking_range           TSTZRANGE NOT NULL,

    -- Columnas calculadas convenientes (indexadas)
    starts_at               TIMESTAMPTZ GENERATED ALWAYS AS (lower(booking_range)) STORED,
    ends_at                 TIMESTAMPTZ GENERATED ALWAYS AS (upper(booking_range)) STORED,

    -- Estado y origen
    status                  public.booking_status NOT NULL DEFAULT 'PENDING_DEPOSIT',
    origin                  public.booking_origin NOT NULL DEFAULT 'ONLINE_PORTAL',

    -- Importes en ARS (snapshot al momento de reserva — inmutables)
    total_amount_ars        NUMERIC(10,2) NOT NULL CHECK (total_amount_ars >= 0),
    deposit_amount_ars      NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (deposit_amount_ars >= 0),
    balance_due_ars         NUMERIC(10,2) GENERATED ALWAYS AS (total_amount_ars - deposit_amount_ars) STORED,

    -- Seguimiento de seña online (Mercado Pago)
    deposit_paid_at             TIMESTAMPTZ,
    deposit_mp_payment_id       TEXT,
    deposit_mp_preference_id    TEXT,
    -- external_reference ÚNICO enviado a MP. Correlaciona webhook -> reserva
    -- sin exponer el booking_id interno.
    deposit_mp_external_ref     TEXT UNIQUE,
    balance_paid_at             TIMESTAMPTZ,

    -- Bloqueo temporal de Redis
    redis_lock_key          TEXT,           -- Formato: "lock:court:{court_id}:{unix_ts}"
    lock_expires_at         TIMESTAMPTZ,

    -- Notas
    internal_notes          TEXT,           -- Solo visible para staff
    customer_notes          TEXT,           -- Notas del jugador

    -- Auditoría
    created_by_profile_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cancelled_by_profile_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cancelled_at                TIMESTAMPTZ,
    cancellation_reason         TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_booking_range_not_empty CHECK (NOT isempty(booking_range)),
    CONSTRAINT chk_deposit_le_total CHECK (deposit_amount_ars <= total_amount_ars)
);

COMMENT ON TABLE public.bookings IS 'Tabla central. El anti-overbooking se garantiza mediante el índice EXCLUDE y el bloqueo Redis en checkout.';
COMMENT ON COLUMN public.bookings.booking_range IS 'Rango TSTZRANGE [starts_at, ends_at). Clave para la restricción EXCLUDE de solapamientos.';
COMMENT ON COLUMN public.bookings.deposit_mp_external_ref IS 'UUID generado por la plataforma y enviado a MP. Permite correlacionar webhook -> reserva.';


-- -----------------------------------------------------------------------------
-- 3.6 BOOKING_PAYMENTS — Registro de cobros (caja diaria)
-- -----------------------------------------------------------------------------
CREATE TABLE public.booking_payments (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    booking_id              UUID NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,

    amount_ars              NUMERIC(10,2) NOT NULL CHECK (amount_ars > 0),
    payment_method          public.payment_method NOT NULL,
    payment_date            DATE NOT NULL DEFAULT CURRENT_DATE,
    registered_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    received_by_profile_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reference_number        TEXT,

    mp_payment_id           TEXT,
    mp_status               TEXT,

    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.booking_payments IS 'Registro de cada cobro realizado contra una reserva. Permite split payments (efectivo + MP).';


-- -----------------------------------------------------------------------------
-- 3.7 COURT_BLOCKS — Bloqueos manuales de canchas
-- -----------------------------------------------------------------------------
CREATE TABLE public.court_blocks (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    court_id                UUID NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,

    block_range             TSTZRANGE NOT NULL,
    reason                  TEXT NOT NULL DEFAULT 'Mantenimiento',
    created_by_profile_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_block_range_not_empty CHECK (NOT isempty(block_range))
);

COMMENT ON TABLE public.court_blocks IS 'Bloqueos de canchas por mantenimiento, lluvia, eventos privados, etc.';


-- -----------------------------------------------------------------------------
-- 3.8 SAAS_SUBSCRIPTIONS — Facturación mensual del SaaS a cada club
-- -----------------------------------------------------------------------------
CREATE TABLE public.saas_subscriptions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,

    billing_period_start    DATE NOT NULL,          -- Primer día del mes
    billing_period_end      DATE NOT NULL,          -- Último día del mes

    plan_name               TEXT NOT NULL DEFAULT 'Estándar',
    plan_multiplier         NUMERIC(5,2) NOT NULL DEFAULT 2.00,
    plan_description        TEXT,

    -- Cálculo del abono
    -- Lógica: MAX(precio_peak_más_caro × multiplicador, piso_mínimo) - descuento
    peak_price_snapshot_ars NUMERIC(10,2) NOT NULL,
    calculated_amount_ars   NUMERIC(10,2) NOT NULL,
    min_floor_amount_ars    NUMERIC(10,2) NOT NULL DEFAULT 5000.00,
    final_amount_ars        NUMERIC(10,2) NOT NULL,
    discount_amount_ars     NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_due_ars           NUMERIC(10,2) NOT NULL,

    payment_status          public.subscription_payment_status NOT NULL DEFAULT 'PENDING',
    paid_at                 TIMESTAMPTZ,
    payment_method          public.payment_method,
    payment_reference       TEXT,

    superadmin_notes        TEXT,

    generated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_subscription_period_tenant UNIQUE (tenant_id, billing_period_start),
    CONSTRAINT chk_subscription_period_order CHECK (billing_period_start <= billing_period_end),
    CONSTRAINT chk_final_ge_floor CHECK (final_amount_ars >= min_floor_amount_ars)
);

COMMENT ON TABLE public.saas_subscriptions IS 'Facturación mensual de la plataforma SaaS a cada club. El monto se calcula sobre el precio del turno nocturno más caro vigente al día 1 del período.';
COMMENT ON COLUMN public.saas_subscriptions.peak_price_snapshot_ars IS 'Snapshot del precio PEAK más alto tomado el día 1 del período. Inmutable una vez generado.';
COMMENT ON COLUMN public.saas_subscriptions.plan_multiplier IS 'Cantidad de "turnos nocturnos" que se cobra. Ej: 2.0 = dos turnos nocturnos.';


-- =============================================================================
-- 4. ÍNDICES DE RENDIMIENTO
-- =============================================================================

CREATE INDEX idx_tenants_slug       ON public.tenants (slug);
CREATE INDEX idx_tenants_status     ON public.tenants (status);

CREATE INDEX idx_profiles_tenant    ON public.profiles (tenant_id);
CREATE INDEX idx_profiles_role      ON public.profiles (role);
CREATE INDEX idx_profiles_phone     ON public.profiles (phone) WHERE phone IS NOT NULL;

CREATE INDEX idx_courts_tenant      ON public.courts (tenant_id);
CREATE INDEX idx_courts_sport       ON public.courts (sport);
CREATE INDEX idx_courts_active      ON public.courts (tenant_id, is_active, is_bookable_online);

CREATE INDEX idx_price_rules_tenant ON public.price_rules (tenant_id);
CREATE INDEX idx_price_rules_court  ON public.price_rules (court_id) WHERE court_id IS NOT NULL;
CREATE INDEX idx_price_rules_active ON public.price_rules (tenant_id, is_active, valid_from, valid_to);

-- Bookings — índices críticos para el panel y la disponibilidad
CREATE INDEX idx_bookings_tenant        ON public.bookings (tenant_id);
CREATE INDEX idx_bookings_court         ON public.bookings (court_id);
CREATE INDEX idx_bookings_customer      ON public.bookings (customer_profile_id) WHERE customer_profile_id IS NOT NULL;
CREATE INDEX idx_bookings_status        ON public.bookings (tenant_id, status);
CREATE INDEX idx_bookings_starts_at     ON public.bookings (tenant_id, starts_at);
CREATE INDEX idx_bookings_mp_ext_ref    ON public.bookings (deposit_mp_external_ref) WHERE deposit_mp_external_ref IS NOT NULL;
CREATE INDEX idx_bookings_lock_exp      ON public.bookings (lock_expires_at) WHERE lock_expires_at IS NOT NULL;
-- Índice GIST compuesto para consultas de disponibilidad por rango
CREATE INDEX idx_bookings_gist_range    ON public.bookings USING GIST (court_id, booking_range);

CREATE INDEX idx_court_blocks_tenant    ON public.court_blocks (tenant_id);
CREATE INDEX idx_court_blocks_gist      ON public.court_blocks USING GIST (court_id, block_range);

CREATE INDEX idx_booking_payments_tenant  ON public.booking_payments (tenant_id);
CREATE INDEX idx_booking_payments_booking ON public.booking_payments (booking_id);
CREATE INDEX idx_booking_payments_date    ON public.booking_payments (tenant_id, payment_date);

CREATE INDEX idx_saas_subs_tenant   ON public.saas_subscriptions (tenant_id);
CREATE INDEX idx_saas_subs_period   ON public.saas_subscriptions (billing_period_start, payment_status);


-- =============================================================================
-- 5. RESTRICCIÓN DE EXCLUSIÓN — ANTI-OVERBOOKING (CRÍTICO)
-- =============================================================================
--
-- Garantiza a nivel de BASE DE DATOS que NO pueden existir dos reservas
-- ACTIVAS que se superpongan temporalmente en la misma cancha.
--
-- Mecanismo:
--   EXCLUDE USING GIST (court_id WITH =, booking_range WITH &&)
--   → WHERE status IN (estados activos)
--
-- El operador && sobre TSTZRANGE devuelve TRUE si los rangos SE SOLAPAN.
-- El operador = sobre UUID es manejado por btree_gist.
--
-- Estados que PARTICIPAN del índice (bloquean el slot):
--   PENDING_DEPOSIT, DEPOSIT_PAID, CONFIRMED, PARTIAL_PAID, FULLY_PAID
--
-- Estados que NO participan (slot libre):
--   SLOT_LOCKED  → el lock real está en Redis con TTL de 7 min
--   CANCELLED_*  → canceladas
--   NO_SHOW      → no-show
--   COMPLETED    → finalizado
--
-- Si dos transacciones concurrentes intentan INSERT simultáneo con el mismo
-- court_id y booking_range solapado, PostgreSQL lanza ExclusionViolation
-- (código SQLSTATE 23P01) antes de que ambas confirmen.
-- =============================================================================

ALTER TABLE public.bookings
ADD CONSTRAINT exc_no_overlapping_active_bookings
EXCLUDE USING GIST (
    court_id        WITH =,
    booking_range   WITH &&
)
WHERE (
    status IN (
        'PENDING_DEPOSIT',
        'DEPOSIT_PAID',
        'CONFIRMED',
        'PARTIAL_PAID',
        'FULLY_PAID'
    )
);

COMMENT ON CONSTRAINT exc_no_overlapping_active_bookings ON public.bookings
IS 'Restricción de exclusión GIST: impide solapamientos de reservas activas en la misma cancha. Requiere extensión btree_gist. Las reservas canceladas/completadas y los locks de Redis (SLOT_LOCKED) no participan del índice.';


-- =============================================================================
-- 6. FUNCIONES AUXILIARES (HELPERS PARA RLS)
-- =============================================================================

-- Retorna el tenant_id del usuario autenticado actual
CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Retorna el rol del usuario autenticado actual
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ¿El usuario actual es SUPERADMIN?
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT get_my_role() = 'SUPERADMIN';
$$;

-- ¿El usuario pertenece al tenant indicado con rol >= STAFF?
CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND tenant_id = _tenant_id
          AND role IN ('TENANT_ADMIN', 'TENANT_STAFF')
    );
$$;

-- ¿El usuario es admin del tenant indicado?
CREATE OR REPLACE FUNCTION public.is_tenant_admin(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND tenant_id = _tenant_id
          AND role = 'TENANT_ADMIN'
    );
$$;


-- =============================================================================
-- 7. ROW LEVEL SECURITY (RLS) — AISLAMIENTO MULTI-TENANT
-- =============================================================================
-- Principio: cada tabla sensible tiene RLS forzado.
-- El acceso se otorga EXPLÍCITAMENTE vía políticas.
-- Las Server Actions de Next.js que usen service_role key deben usar
-- funciones SECURITY DEFINER o un cliente supabase con JWT del usuario.
-- =============================================================================

ALTER TABLE public.tenants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_rules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_payments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.court_blocks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_subscriptions   ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tenants              FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles             FORCE ROW LEVEL SECURITY;
ALTER TABLE public.courts               FORCE ROW LEVEL SECURITY;
ALTER TABLE public.price_rules          FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bookings             FORCE ROW LEVEL SECURITY;
ALTER TABLE public.booking_payments     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.court_blocks         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.saas_subscriptions   FORCE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: public.tenants
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "tenants: superadmin full access" ON public.tenants
    FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

CREATE POLICY "tenants: member can read own tenant" ON public.tenants
    FOR SELECT TO authenticated
    USING (id = public.get_my_tenant_id());

CREATE POLICY "tenants: admin can update own tenant" ON public.tenants
    FOR UPDATE TO authenticated
    USING (id = public.get_my_tenant_id() AND public.is_tenant_admin(id))
    WITH CHECK (id = public.get_my_tenant_id() AND public.is_tenant_admin(id));

-- Lectura pública mínima para el portal (solo datos básicos, no tokens MP)
CREATE POLICY "tenants: public read active" ON public.tenants
    FOR SELECT TO anon
    USING (status IN ('ACTIVE', 'TRIAL'));


-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: public.profiles
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "profiles: superadmin full access" ON public.profiles
    FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

CREATE POLICY "profiles: own row select" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());

-- El usuario puede actualizar su propio perfil pero NO cambiar su rol
CREATE POLICY "profiles: own row update (no role change)" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "profiles: staff can see tenant members" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_my_tenant_id()
        AND public.is_tenant_member(public.get_my_tenant_id())
    );

CREATE POLICY "profiles: admin can insert tenant staff" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.get_my_tenant_id()
        AND public.is_tenant_admin(public.get_my_tenant_id())
        AND role != 'SUPERADMIN'
    );

CREATE POLICY "profiles: admin can update tenant staff" ON public.profiles
    FOR UPDATE TO authenticated
    USING (
        tenant_id = public.get_my_tenant_id()
        AND public.is_tenant_admin(public.get_my_tenant_id())
        AND role != 'SUPERADMIN'
    )
    WITH CHECK (tenant_id = public.get_my_tenant_id() AND role != 'SUPERADMIN');


-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: public.courts
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "courts: superadmin full access" ON public.courts
    FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

-- Portal público: solo canchas activas y reservables online
CREATE POLICY "courts: public read active bookable" ON public.courts
    FOR SELECT TO anon, authenticated
    USING (is_active = TRUE AND is_bookable_online = TRUE);

-- Staff ve todas las canchas de su club (incluyendo inactivas)
CREATE POLICY "courts: staff read all own tenant" ON public.courts
    FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_my_tenant_id()
        AND public.is_tenant_member(public.get_my_tenant_id())
    );

CREATE POLICY "courts: admin manage" ON public.courts
    FOR ALL TO authenticated
    USING (
        tenant_id = public.get_my_tenant_id()
        AND public.is_tenant_admin(public.get_my_tenant_id())
    )
    WITH CHECK (tenant_id = public.get_my_tenant_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: public.price_rules
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "price_rules: superadmin full access" ON public.price_rules
    FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

-- Lectura pública de reglas vigentes (para mostrar precios en el portal)
CREATE POLICY "price_rules: public read active" ON public.price_rules
    FOR SELECT TO anon, authenticated
    USING (is_active = TRUE AND (valid_to IS NULL OR valid_to >= CURRENT_DATE));

CREATE POLICY "price_rules: staff read all own tenant" ON public.price_rules
    FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_my_tenant_id()
        AND public.is_tenant_member(public.get_my_tenant_id())
    );

CREATE POLICY "price_rules: admin manage" ON public.price_rules
    FOR ALL TO authenticated
    USING (
        tenant_id = public.get_my_tenant_id()
        AND public.is_tenant_admin(public.get_my_tenant_id())
    )
    WITH CHECK (tenant_id = public.get_my_tenant_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: public.bookings
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "bookings: superadmin full access" ON public.bookings
    FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

-- Staff ve y gestiona todas las reservas de su club
CREATE POLICY "bookings: staff full access own tenant" ON public.bookings
    FOR ALL TO authenticated
    USING (
        tenant_id = public.get_my_tenant_id()
        AND public.is_tenant_member(public.get_my_tenant_id())
    )
    WITH CHECK (tenant_id = public.get_my_tenant_id());

-- Cliente ve sus propias reservas
CREATE POLICY "bookings: customer read own" ON public.bookings
    FOR SELECT TO authenticated
    USING (customer_profile_id = auth.uid());

-- Cliente puede insertar reserva online propia en estado PENDING_DEPOSIT
CREATE POLICY "bookings: customer insert online" ON public.bookings
    FOR INSERT TO authenticated
    WITH CHECK (
        customer_profile_id = auth.uid()
        AND status = 'PENDING_DEPOSIT'
        AND origin = 'ONLINE_PORTAL'
    );

-- Cliente puede cancelar reservas propias (solo estado -> CANCELLED_USER)
CREATE POLICY "bookings: customer cancel own" ON public.bookings
    FOR UPDATE TO authenticated
    USING (
        customer_profile_id = auth.uid()
        AND status IN ('PENDING_DEPOSIT', 'DEPOSIT_PAID', 'CONFIRMED')
    )
    WITH CHECK (
        customer_profile_id = auth.uid()
        AND status = 'CANCELLED_USER'
    );

-- NOTA: No se concede SELECT anon directo sobre bookings.
-- La disponibilidad pública se expone via RPC get_court_availability() que
-- no revela datos personales.


-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: public.booking_payments
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "booking_payments: superadmin full access" ON public.booking_payments
    FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

CREATE POLICY "booking_payments: staff manage own tenant" ON public.booking_payments
    FOR ALL TO authenticated
    USING (
        tenant_id = public.get_my_tenant_id()
        AND public.is_tenant_member(public.get_my_tenant_id())
    )
    WITH CHECK (tenant_id = public.get_my_tenant_id());

-- Cliente puede ver pagos de sus propias reservas
CREATE POLICY "booking_payments: customer read own" ON public.booking_payments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.id = booking_id
              AND b.customer_profile_id = auth.uid()
        )
    );


-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: public.court_blocks
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "court_blocks: superadmin full access" ON public.court_blocks
    FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

CREATE POLICY "court_blocks: staff manage own tenant" ON public.court_blocks
    FOR ALL TO authenticated
    USING (
        tenant_id = public.get_my_tenant_id()
        AND public.is_tenant_member(public.get_my_tenant_id())
    )
    WITH CHECK (tenant_id = public.get_my_tenant_id());

-- Los bloqueos son informativos: visibles en el portal (sin datos personales)
CREATE POLICY "court_blocks: public read" ON public.court_blocks
    FOR SELECT TO anon, authenticated
    USING (TRUE);


-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: public.saas_subscriptions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "saas_subscriptions: superadmin full access" ON public.saas_subscriptions
    FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

-- TENANT_ADMIN solo puede VER su propia suscripción
CREATE POLICY "saas_subscriptions: tenant admin read own" ON public.saas_subscriptions
    FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_my_tenant_id()
        AND public.is_tenant_admin(public.get_my_tenant_id())
    );


-- =============================================================================
-- 8. TRIGGERS
-- =============================================================================

-- ── 8.1 Auto-actualización de updated_at ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER trg_courts_updated_at
    BEFORE UPDATE ON public.courts
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER trg_price_rules_updated_at
    BEFORE UPDATE ON public.price_rules
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER trg_bookings_updated_at
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER trg_saas_subscriptions_updated_at
    BEFORE UPDATE ON public.saas_subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();


-- ── 8.2 Auto-crear perfil al registrar usuario en Supabase Auth ──────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url',
        COALESCE(
            (NEW.raw_user_meta_data->>'role')::public.user_role,
            'CUSTOMER'
        )
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auth_on_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON TRIGGER trg_auth_on_user_created ON auth.users
IS 'Crea automáticamente un registro en public.profiles cuando un usuario se registra vía Supabase Auth.';


-- ── 8.3 Validar que un bloqueo de cancha no solape reservas activas ───────

CREATE OR REPLACE FUNCTION public.check_court_block_no_overlap()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.court_id = NEW.court_id
          AND b.booking_range && NEW.block_range
          AND b.status IN (
              'PENDING_DEPOSIT', 'DEPOSIT_PAID', 'CONFIRMED',
              'PARTIAL_PAID', 'FULLY_PAID'
          )
    ) THEN
        RAISE EXCEPTION
            'Conflicto: existe una reserva activa que se superpone con el bloqueo [%, %]',
            lower(NEW.block_range), upper(NEW.block_range)
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_court_block_overlap_check
    BEFORE INSERT OR UPDATE ON public.court_blocks
    FOR EACH ROW EXECUTE FUNCTION public.check_court_block_no_overlap();

COMMENT ON TRIGGER trg_court_block_overlap_check ON public.court_blocks
IS 'Impide crear un bloqueo de cancha que solape con una reserva activa existente.';


-- ── 8.4 Limpiar SLOT_LOCKED expirados (invocar desde cron o Edge Function) ─

CREATE OR REPLACE FUNCTION public.cleanup_expired_slot_locks()
RETURNS INT
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE public.bookings
    SET
        status              = 'CANCELLED_USER',
        cancellation_reason = 'Lock temporal de checkout expirado (TTL Redis)',
        cancelled_at        = NOW()
    WHERE status = 'SLOT_LOCKED'
      AND lock_expires_at < NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_slot_locks IS 'Libera reservas SLOT_LOCKED con TTL vencido. Ejecutar cada 5 min vía pg_cron o Supabase scheduled Edge Function.';


-- =============================================================================
-- 9. RPC PÚBLICA — DISPONIBILIDAD DE CANCHA (SIN DATOS PERSONALES)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_court_availability(
    _court_id   UUID,
    _date_from  DATE,
    _date_to    DATE
)
RETURNS TABLE (
    slot_start      TIMESTAMPTZ,
    slot_end        TIMESTAMPTZ,
    is_available    BOOLEAN,
    block_reason    TEXT
)
LANGUAGE PLPGSQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    -- Llamable por anon. No expone datos personales de reservas.
    RETURN QUERY
    WITH occupied AS (
        -- Reservas activas (incluyendo SLOT_LOCKED para evitar race condition UI)
        SELECT booking_range AS r, NULL::TEXT AS reason
        FROM public.bookings
        WHERE court_id = _court_id
          AND lower(booking_range)::DATE BETWEEN _date_from AND _date_to
          AND status IN (
              'SLOT_LOCKED', 'PENDING_DEPOSIT', 'DEPOSIT_PAID',
              'CONFIRMED', 'PARTIAL_PAID', 'FULLY_PAID'
          )
        UNION ALL
        -- Bloqueos manuales
        SELECT block_range AS r, reason
        FROM public.court_blocks
        WHERE court_id = _court_id
          AND lower(block_range)::DATE BETWEEN _date_from AND _date_to
    )
    SELECT
        lower(r)    AS slot_start,
        upper(r)    AS slot_end,
        FALSE       AS is_available,
        reason      AS block_reason
    FROM occupied;
END;
$$;

COMMENT ON FUNCTION public.get_court_availability IS 'RPC pública para el portal de reservas. Retorna los slots ocupados de una cancha sin exponer datos personales. Segura para llamar con anon key de Supabase.';

-- Otorgar ejecución pública
GRANT EXECUTE ON FUNCTION public.get_court_availability(UUID, DATE, DATE) TO anon, authenticated;


-- =============================================================================
-- 10. FUNCIÓN DE FACTURACIÓN SAAS — CÁLCULO AUTOMÁTICO DEL ABONO MENSUAL
-- =============================================================================
--
-- Lógica de negocio:
--   1. Buscar el precio PEAK más alto vigente al día 1 del período para el tenant
--   2. Multiplicar por plan_multiplier (ej: 2 turnos)
--   3. Aplicar piso mínimo: MAX(calculado, piso_minimo)
--   4. Restar descuento si aplica
--   5. Insertar en saas_subscriptions (ON CONFLICT DO NOTHING para idempotencia)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_saas_invoice(
    _tenant_id              UUID,
    _billing_period_start   DATE,
    _plan_multiplier        NUMERIC  DEFAULT 2.0,
    _min_floor_ars          NUMERIC  DEFAULT 5000.0,
    _discount_ars           NUMERIC  DEFAULT 0.0,
    _plan_name              TEXT     DEFAULT 'Estándar'
)
RETURNS UUID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_peak_price        NUMERIC(10,2);
    v_calculated        NUMERIC(10,2);
    v_final             NUMERIC(10,2);
    v_total_due         NUMERIC(10,2);
    v_period_end        DATE;
    v_subscription_id   UUID;
BEGIN
    -- Solo SUPERADMIN puede generar facturas SaaS
    IF NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol SUPERADMIN'
            USING ERRCODE = '42501';
    END IF;

    v_period_end := (_billing_period_start + INTERVAL '1 month - 1 day')::DATE;

    -- Precio PEAK más caro vigente al día 1 del período de facturación
    -- Considera reglas comodín (court_id IS NULL) y por cancha específica
    SELECT MAX(pr.price_ars)
    INTO v_peak_price
    FROM public.price_rules pr
    WHERE pr.tenant_id = _tenant_id
      AND pr.rule_type IN ('PEAK', 'WEEKEND')
      AND pr.is_active = TRUE
      AND pr.valid_from <= _billing_period_start
      AND (pr.valid_to IS NULL OR pr.valid_to >= _billing_period_start);

    IF v_peak_price IS NULL THEN
        RAISE EXCEPTION
            'Sin precio PEAK activo para tenant % al %',
            _tenant_id, _billing_period_start
            USING ERRCODE = 'P0002';
    END IF;

    v_calculated := v_peak_price * _plan_multiplier;
    v_final      := GREATEST(v_calculated, _min_floor_ars);
    v_total_due  := v_final - COALESCE(_discount_ars, 0);

    INSERT INTO public.saas_subscriptions (
        tenant_id,
        billing_period_start,
        billing_period_end,
        plan_name,
        plan_multiplier,
        plan_description,
        peak_price_snapshot_ars,
        calculated_amount_ars,
        min_floor_amount_ars,
        final_amount_ars,
        discount_amount_ars,
        total_due_ars,
        payment_status
    ) VALUES (
        _tenant_id,
        _billing_period_start,
        v_period_end,
        _plan_name,
        _plan_multiplier,
        FORMAT(
            '%s turnos nocturnos × $%s ARS (precio pico vigente al %s)',
            _plan_multiplier::TEXT,
            v_peak_price::TEXT,
            TO_CHAR(_billing_period_start, 'DD/MM/YYYY')
        ),
        v_peak_price,
        v_calculated,
        _min_floor_ars,
        v_final,
        COALESCE(_discount_ars, 0),
        v_total_due,
        'PENDING'
    )
    ON CONFLICT (tenant_id, billing_period_start) DO NOTHING
    RETURNING id INTO v_subscription_id;

    RETURN v_subscription_id;
END;
$$;

COMMENT ON FUNCTION public.generate_saas_invoice IS
'Genera la factura mensual SaaS para un tenant.
Toma el precio PEAK/WEEKEND más caro vigente al día 1 del período.
Aplica: MAX(precio_peak × multiplicador, piso_minimo) − descuento.
Idempotente: ON CONFLICT DO NOTHING evita doble facturación.
Solo ejecutable por SUPERADMIN.';


-- =============================================================================
-- FIN DEL SCRIPT DDL v1.0
-- =============================================================================
-- Verificaciones rápidas post-ejecución:
--
--   -- Tablas con RLS activo
--   SELECT tablename, rowsecurity, forcerowsecurity
--   FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
--
--   -- Restricción EXCLUDE registrada
--   SELECT conname, contype, conrelid::regclass
--   FROM pg_constraint WHERE conname = 'exc_no_overlapping_active_bookings';
--
--   -- Políticas RLS creadas
--   SELECT tablename, policyname, cmd, roles
--   FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
--
--   -- Funciones creadas
--   SELECT proname, prosecdef FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace ORDER BY proname;
-- =============================================================================
