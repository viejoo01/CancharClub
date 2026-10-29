-- ==============================================================================
-- CANCHARCLUB MIGRATION: 20261029_atomic_cash_payment_and_gist.sql
-- 1. Verificación e idoneidad de la columna booked_at y restricción EXCLUDE GIST
-- 2. Columna balance_due en public.bookings
-- 3. Función RPC atómica public.register_cash_payment_atomic
-- ==============================================================================

-- 1. Habilitar extensión btree_gist si no existe
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Asegurar que public.bookings tenga la columna balance_due
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS balance_due NUMERIC(10,2) DEFAULT 0;

-- 3. Asegurar que la función helper para el predicado de exclusión esté al día
CREATE OR REPLACE FUNCTION public.booking_is_active(status text)
RETURNS boolean AS $$
  SELECT status IN (
    'SLOT_LOCKED',
    'pending_lock',
    'pending_deposit',
    'confirmed',
    'confirmed_cash',
    'completed'
  );
$$ LANGUAGE sql IMMUTABLE;

-- Asegurar columna generada is_active_slot si no existiera
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'is_active_slot'
  ) THEN
    ALTER TABLE public.bookings
      ADD COLUMN is_active_slot BOOLEAN GENERATED ALWAYS AS (
        public.booking_is_active(status)
      ) STORED;
  END IF;
END $$;

-- 4. Garantizar la restricción de exclusión GIST excl_bookings_no_overlap sobre (court_id, booked_at)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'excl_bookings_no_overlap'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT excl_bookings_no_overlap
      EXCLUDE USING GIST (
        court_id  WITH =,
        booked_at WITH &&
      )
      WHERE (is_active_slot = TRUE);
  END IF;
END $$;

-- 5. Función RPC Atómica para Cobro de Mostrador
CREATE OR REPLACE FUNCTION public.register_cash_payment_atomic(
  p_booking_id UUID,
  p_tenant_id UUID,
  p_amount_cents INT,
  p_staff_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking RECORD;
  v_total_accredited_cents BIGINT := 0;
  v_pending_balance_cents BIGINT := 0;
  v_effective_amount_cents BIGINT := 0;
  v_amount_ars NUMERIC(10,2) := 0;
  v_new_total_accredited_cents BIGINT := 0;
  v_new_balance_due_cents BIGINT := 0;
  v_is_fully_paid BOOLEAN := FALSE;
  v_new_status TEXT;
  v_today_arg DATE;
  v_now_timestamptz TIMESTAMPTZ := NOW();
  v_formatted_amount TEXT;
  v_time_str TEXT;
  v_note_entry TEXT;
  v_updated_notes TEXT;
  v_payment_id UUID;
BEGIN
  -- A. Validar parámetros requeridos
  IF p_booking_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_OR_BOOKING_REQUIRED: Parámetros booking_id y tenant_id son obligatorios.';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: El monto a cobrar debe ser mayor a cero.';
  END IF;

  -- B. Obtener la reserva bloqueando la fila para actualización atómica (anti race condition)
  SELECT
    id,
    tenant_id,
    price_total_cents,
    deposit_cents,
    payment_method,
    staff_notes,
    status,
    paid_at,
    balance_paid_at,
    customer_name,
    customer_phone,
    recurring_slot_id
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: Reserva no encontrada o no pertenece al club.';
  END IF;

  -- C. Blindaje contra cobro de turnos de abonados fijos
  IF v_booking.recurring_slot_id IS NOT NULL 
     OR v_booking.payment_method::text = 'abono_fijo' 
     OR (v_booking.staff_notes IS NOT NULL AND v_booking.staff_notes ILIKE '%ABONO FIJO%') THEN
    RAISE EXCEPTION 'ABONO_FIJO_RESTRICTED: Este turno corresponde a un Abonado Fijo cubierto por mensualidad. El cobro del abono se realiza de forma única desde la sección Turnos Fijos.';
  END IF;

  -- D. Calcular pagos acreditados reales
  -- REGLA DE INTEGRIDAD FINANCIERA:
  -- Si status = 'pending_deposit', ningún pago fue acreditado aún ($0 acreditado),
  -- por lo que el cliente adeuda la totalidad del valor de la cancha.
  IF LOWER(v_booking.status::text) IN ('pending_deposit', 'pending_lock', 'pending') THEN
    SELECT COALESCE(SUM(amount_cents), 0)
    INTO v_total_accredited_cents
    FROM public.booking_payments
    WHERE booking_id = p_booking_id AND tenant_id = p_tenant_id;
  ELSE
    SELECT COALESCE(SUM(amount_cents), 0)
    INTO v_total_accredited_cents
    FROM public.booking_payments
    WHERE booking_id = p_booking_id AND tenant_id = p_tenant_id;

    -- Si no hay registros en booking_payments, usar deposit_cents previo solo si status ya estaba confirmado/pagado
    IF v_total_accredited_cents = 0 AND COALESCE(v_booking.deposit_cents, 0) > 0 THEN
      v_total_accredited_cents := COALESCE(v_booking.deposit_cents, 0);
    END IF;
  END IF;

  -- E. Calcular saldo restante adeudado real
  v_pending_balance_cents := GREATEST(0, COALESCE(v_booking.price_total_cents, 0) - v_total_accredited_cents);

  IF v_pending_balance_cents <= 0 THEN
    RAISE EXCEPTION 'ALREADY_PAID: El turno ya se encuentra totalmente saldado ($0 pendiente).';
  END IF;

  -- F. Topar el cobro al saldo pendiente
  v_effective_amount_cents := LEAST(p_amount_cents, v_pending_balance_cents);
  v_amount_ars := ROUND((v_effective_amount_cents::NUMERIC / 100.0), 2);

  -- G. Determinar fecha en huso horario oficial de Argentina
  v_today_arg := (TIMEZONE('America/Argentina/Buenos_Aires', v_now_timestamptz))::DATE;

  -- H. Insertar cobro en booking_payments (Si falla, rollback automático total)
  INSERT INTO public.booking_payments (
    tenant_id,
    booking_id,
    amount_ars,
    amount_cents,
    payment_method,
    payment_type,
    payment_date,
    registered_at,
    received_by_profile_id,
    notes
  ) VALUES (
    p_tenant_id,
    p_booking_id,
    v_amount_ars,
    v_effective_amount_cents,
    'cash',
    CASE WHEN v_total_accredited_cents = 0 THEN 'DEPOSIT' ELSE 'BALANCE' END,
    v_today_arg,
    v_now_timestamptz,
    p_staff_id,
    p_notes
  ) RETURNING id INTO v_payment_id;

  -- I. Recalcular total pagado y saldo pendiente
  v_new_total_accredited_cents := v_total_accredited_cents + v_effective_amount_cents;
  v_new_balance_due_cents := GREATEST(0, COALESCE(v_booking.price_total_cents, 0) - v_new_total_accredited_cents);
  v_is_fully_paid := (v_new_balance_due_cents = 0);
  v_new_status := CASE WHEN v_is_fully_paid THEN 'confirmed_cash' ELSE 'confirmed' END;

  -- J. Formatear notas de auditoría
  v_formatted_amount := TO_CHAR(v_amount_ars, 'FM999,999,999.00');
  v_time_str := TO_CHAR(TIMEZONE('America/Argentina/Buenos_Aires', v_now_timestamptz), 'HH24:MI');
  v_note_entry := 'Cobro $' || v_formatted_amount || ' (Efectivo) a las ' || v_time_str || ' hs [' || TO_CHAR(v_now_timestamptz, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || ']' ||
                  CASE WHEN p_notes IS NOT NULL AND length(trim(p_notes)) > 0 THEN ' - ' || trim(p_notes) ELSE '' END;

  IF v_booking.staff_notes IS NOT NULL AND length(trim(v_booking.staff_notes)) > 0 THEN
    v_updated_notes := v_booking.staff_notes || ' | ' || v_note_entry;
  ELSE
    v_updated_notes := v_note_entry;
  END IF;

  -- K. Actualizar reserva en bookings
  UPDATE public.bookings
  SET
    deposit_cents = v_new_total_accredited_cents,
    staff_deposit_amount_cents = v_new_total_accredited_cents,
    payment_method = CASE
      WHEN v_booking.payment_method IS NOT NULL AND v_booking.payment_method::text != 'cash' AND v_total_accredited_cents > 0
      THEN v_booking.payment_method
      ELSE 'cash'::public.payment_method
    END,
    paid_at = COALESCE(v_booking.paid_at, v_now_timestamptz),
    balance_paid_at = CASE WHEN v_is_fully_paid THEN v_now_timestamptz ELSE v_booking.balance_paid_at END,
    status = v_new_status::public.booking_status,
    balance_due = ROUND((v_new_balance_due_cents::NUMERIC / 100.0), 2),
    staff_notes = v_updated_notes,
    updated_at = v_now_timestamptz
  WHERE id = p_booking_id AND tenant_id = p_tenant_id;

  -- L. Devolver resultado atómico estructurado
  RETURN jsonb_build_object(
    'success', TRUE,
    'payment_id', v_payment_id,
    'booking_id', p_booking_id,
    'amount_charged_cents', v_effective_amount_cents,
    'amount_charged_ars', v_amount_ars,
    'total_paid_cents', v_new_total_accredited_cents,
    'total_paid_ars', ROUND((v_new_total_accredited_cents::NUMERIC / 100.0), 2),
    'balance_due_cents', v_new_balance_due_cents,
    'balance_due_ars', ROUND((v_new_balance_due_cents::NUMERIC / 100.0), 2),
    'status', v_new_status,
    'is_fully_paid', v_is_fully_paid
  );
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION public.register_cash_payment_atomic(UUID, UUID, INT, UUID, TEXT) TO authenticated, service_role;

-- ==============================================================================
-- 6. Función RPC Atómica para Alta de Club (Tenants + Profile + Courts + Price Rules)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.register_club_atomic(
  p_user_id UUID,
  p_club_name TEXT,
  p_slug TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_city TEXT,
  p_plan_id TEXT,
  p_base_slots INT,
  p_selected_sports TEXT[],
  p_description JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  v_court_id UUID;
  v_sport_key TEXT;
  v_sport_enum TEXT;
  v_surface TEXT;
  v_slot_duration INT;
  v_sport_label TEXT;
  v_i INT;
  v_sports_len INT;
BEGIN
  -- Validar que el slug no exista
  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'SLUG_ALREADY_EXISTS: El slug "%" ya se encuentra registrado.', p_slug;
  END IF;

  -- Validar que el email no exista en tenants
  IF EXISTS (SELECT 1 FROM public.tenants WHERE LOWER(email) = LOWER(p_email)) THEN
    RAISE EXCEPTION 'EMAIL_ALREADY_EXISTS: El email "%" ya se encuentra registrado.', p_email;
  END IF;

  -- 1. Insertar Tenant
  INSERT INTO public.tenants (
    name,
    slug,
    email,
    phone_whatsapp,
    city,
    province,
    country,
    timezone,
    is_active,
    subscription_status,
    plan_id,
    base_slots_plan,
    payment_methods,
    description
  ) VALUES (
    p_club_name,
    p_slug,
    p_email,
    p_phone,
    p_city,
    'Tucumán',
    'Argentina',
    'America/Argentina/Tucuman',
    TRUE,
    'ACTIVE',
    p_plan_id,
    p_base_slots,
    ARRAY['CARD', 'MERCADO_PAGO'],
    p_description
  ) RETURNING id INTO v_tenant_id;

  -- 2. Insertar / Actualizar Perfil de Administrador
  INSERT INTO public.profiles (
    id,
    tenant_id,
    full_name,
    role,
    phone
  ) VALUES (
    p_user_id,
    v_tenant_id,
    p_club_name,
    'TENANT_ADMIN',
    p_phone
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = v_tenant_id,
    full_name = p_club_name,
    role = 'TENANT_ADMIN',
    phone = COALESCE(p_phone, profiles.phone);

  -- 3. Sembrar Canchas y Price Rules Iniciales
  v_sports_len := array_length(p_selected_sports, 1);
  IF v_sports_len IS NULL OR v_sports_len = 0 THEN
    p_selected_sports := ARRAY['PADEL', 'FUTBOL'];
    v_sports_len := 2;
  END IF;

  FOR v_i IN 0..(p_base_slots - 1) LOOP
    v_sport_key := UPPER(p_selected_sports[(v_i % v_sports_len) + 1]);

    IF v_sport_key LIKE '%PADEL%' THEN
      v_sport_enum := 'PADEL';
      v_surface := 'CRISTAL';
      v_slot_duration := 90;
      v_sport_label := 'Pádel';
    ELSIF v_sport_key LIKE '%TENIS%' THEN
      v_sport_enum := 'TENIS';
      v_surface := 'POLVO_LADRILLO';
      v_slot_duration := 90;
      v_sport_label := 'Tenis';
    ELSIF v_sport_key LIKE '%BASQUET%' OR v_sport_key LIKE '%BASKET%' THEN
      v_sport_enum := 'BASQUET';
      v_surface := 'CEMENTO';
      v_slot_duration := 60;
      v_sport_label := 'Básquet';
    ELSE
      v_sport_enum := 'FUTBOL5';
      v_surface := 'CESPED_SINTETICO';
      v_slot_duration := 60;
      v_sport_label := 'Fútbol 5';
    END IF;

    -- Insertar cancha
    INSERT INTO public.courts (
      tenant_id,
      name,
      sport,
      surface,
      slot_duration_minutes,
      has_lights,
      is_indoor,
      is_active,
      display_order
    ) VALUES (
      v_tenant_id,
      'Cancha ' || (v_i + 1) || ' (' || v_sport_label || ')',
      v_sport_enum,
      v_surface,
      v_slot_duration,
      TRUE,
      FALSE,
      TRUE,
      v_i + 1
    ) RETURNING id INTO v_court_id;

    -- Insertar regla de precio estándar
    INSERT INTO public.price_rules (
      tenant_id,
      court_id,
      name,
      day_of_week,
      time_from,
      time_to,
      price_cents,
      priority,
      is_active
    ) VALUES (
      v_tenant_id,
      v_court_id,
      'Tarifa Estándar Diaria',
      ARRAY[1, 2, 3, 4, 5, 6, 7],
      '08:00:00'::TIME,
      '23:59:59'::TIME,
      3000000,
      0,
      TRUE
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'tenant_id', v_tenant_id,
    'slug', p_slug
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_club_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT[], JSONB) TO authenticated, service_role;
