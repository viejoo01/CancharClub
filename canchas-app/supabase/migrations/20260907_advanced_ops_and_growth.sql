-- =============================================================================
-- MIGRACIÓN CANCHARCLUB v2.0: OPERATIVA AVANZADA, RETENCIÓN Y RENTABILIDAD
-- Fecha: 2026-09-07
-- Plataforma: Supabase / PostgreSQL 15+
-- =============================================================================

-- 1. Ampliar ENUM booking_status con 'RAIN_CANCELLED'
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'RAIN_CANCELLED';

-- 2. Tabla de Turnos Fijos Recurrentes (Abonados Semanales)
CREATE TABLE IF NOT EXISTS public.recurring_slots (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    court_id            UUID NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
    day_of_week         INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Domingo, 1=Lunes, ..., 6=Sábado
    start_time          TIME NOT NULL,
    end_time            TIME NOT NULL,
    customer_name       TEXT NOT NULL,
    customer_phone      TEXT NOT NULL,
    customer_email      TEXT,
    monthly_price       NUMERIC(10,2) NOT NULL CHECK (monthly_price >= 0),
    status              TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'CANCELLED')),
    payment_due_day     INT NOT NULL DEFAULT 10 CHECK (payment_due_day BETWEEN 1 AND 28),
    last_generated_month TEXT, -- Ej: '2026-09'
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_slots_tenant ON public.recurring_slots(tenant_id, day_of_week);

-- Agregar FK de recurring_slot_id a la tabla bookings
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS recurring_slot_id UUID REFERENCES public.recurring_slots(id) ON DELETE SET NULL;

-- 3. Tabla de Créditos y Saldos a Favor de Jugadores (Protocolo Climático / Cancelaciones)
CREATE TABLE IF NOT EXISTS public.customer_credits (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_phone      TEXT NOT NULL,
    customer_name       TEXT NOT NULL,
    amount_ars          NUMERIC(10,2) NOT NULL CHECK (amount_ars > 0),
    status              TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'USED', 'EXPIRED', 'REFUNDED')),
    source_booking_id   UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    reason              TEXT NOT NULL DEFAULT 'Cancelación por mal tiempo / lluvia',
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_customer_credits_phone ON public.customer_credits(tenant_id, customer_phone, status);

-- 4. Tabla de Lista de Espera Automática (Horarios Pico)
CREATE TABLE IF NOT EXISTS public.waitlists (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    court_id            UUID REFERENCES public.courts(id) ON DELETE CASCADE, -- NULL = cualquier cancha
    date                DATE NOT NULL,
    time_slot           TEXT NOT NULL, -- Ej: '20:00'
    customer_name       TEXT NOT NULL,
    customer_phone      TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'NOTIFIED', 'EXPIRED', 'CLAIMED')),
    priority_expires_at TIMESTAMPTZ, -- Ventana de 10 minutos de prioridad
    notified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlists_search ON public.waitlists(tenant_id, date, time_slot, status);

-- 5. Tablas para Módulo de Torneos Exprés (Fútbol y Pádel)
CREATE TABLE IF NOT EXISTS public.tournaments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    sport               TEXT NOT NULL, -- 'PADEL', 'FUTBOL_5', etc.
    format              TEXT NOT NULL DEFAULT 'PLAYOFFS' CHECK (format IN ('PLAYOFFS', 'GROUPS_AND_PLAYOFFS')),
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    status              TEXT NOT NULL DEFAULT 'REGISTRATION' CHECK (status IN ('REGISTRATION', 'IN_PROGRESS', 'COMPLETED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tournament_categories (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id       UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    name                TEXT NOT NULL, -- Ej: '4ta Caballeros', '6ta Damas', 'F5 Libre'
    max_teams           INT NOT NULL DEFAULT 8
);

CREATE TABLE IF NOT EXISTS public.tournament_teams (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id         UUID NOT NULL REFERENCES public.tournament_categories(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    player_1            TEXT NOT NULL,
    player_2            TEXT,
    phone               TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tournament_matches (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id         UUID NOT NULL REFERENCES public.tournament_categories(id) ON DELETE CASCADE,
    round               TEXT NOT NULL CHECK (round IN ('CUARTOS', 'SEMIFINAL', 'FINAL')),
    match_number        INT NOT NULL,
    team_a_id           UUID REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
    team_b_id           UUID REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
    score_team_a        TEXT, -- Ej: '6 6' o '4'
    score_team_b        TEXT, -- Ej: '4 2' o '2'
    winner_team_id      UUID REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
    court_name          TEXT,
    scheduled_time      TEXT,
    status              TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'PLAYING', 'FINISHED'))
);

-- 6. Campos para Mercado Pago Marketplace Split en tenants
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS mp_collector_id TEXT,
ADD COLUMN IF NOT EXISTS mp_connected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS mp_refresh_token TEXT;

-- Habilitar RLS en nuevas tablas
ALTER TABLE public.recurring_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para tenants y service_role
CREATE POLICY "Tenants acceden a sus propios turnos fijos" ON public.recurring_slots
    FOR ALL USING (tenant_id = public.get_my_tenant_id() OR auth.role() = 'service_role');

CREATE POLICY "Tenants acceden a sus propios créditos" ON public.customer_credits
    FOR ALL USING (tenant_id = public.get_my_tenant_id() OR auth.role() = 'service_role');

CREATE POLICY "Tenants acceden a su lista de espera" ON public.waitlists
    FOR ALL USING (tenant_id = public.get_my_tenant_id() OR auth.role() = 'service_role');

CREATE POLICY "Acceso público a torneos" ON public.tournaments
    FOR SELECT USING (true);

CREATE POLICY "Tenants administran sus torneos" ON public.tournaments
    FOR ALL USING (tenant_id = public.get_my_tenant_id() OR auth.role() = 'service_role');
