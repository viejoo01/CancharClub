-- ==============================================================================
-- CANCHARCLUB MIGRATION: 20261110_settle_booking_balance.sql
-- Función RPC Atómica para Cobro de Saldo Restante en Mostrador
-- Soporta Efectivo, Transferencia Bancaria, Mercado Pago (QR/Point), Tarjetas y Billetera
-- ==============================================================================

-- 1. Función RPC Atómica Principal: settle_booking_balance
CREATE OR REPLACE FUNCTION public.settle_booking_balance(
  p_booking_id UUID,
  p_tenant_id UUID,
  p_amount_cents INT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'cash',
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
  v_new_status public.booking_status;
  v_today_arg DATE;
  v_now_timestamptz TIMESTAMPTZ := NOW();
  v_formatted_amount TEXT;
  v_time_str TEXT;
  v_note_entry TEXT;
  v_updated_notes TEXT;
  v_payment_id UUID;
  
  -- Normalización de método de pago
  v_norm_method TEXT;
  v_method_db_text TEXT;
  v_method_label TEXT;
  v_enum_payment_method public.payment_method;
BEGIN
  -- A. Validar parámetros requeridos
  IF p_booking_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_OR_BOOKING_REQUIRED: Parámetros booking_id y tenant_id son obligatorios.';
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

  -- D. Calcular pagos acreditados reales desde booking_payments
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

    -- Si no hay registros en booking_payments, usar deposit_cents previo si status ya estaba confirmado
    IF v_total_accredited_cents = 0 AND COALESCE(v_booking.deposit_cents, 0) > 0 THEN
      v_total_accredited_cents := COALESCE(v_booking.deposit_cents, 0);
    END IF;
  END IF;

  -- E. Calcular saldo restante adeudado real
  v_pending_balance_cents := GREATEST(0, COALESCE(v_booking.price_total_cents, 0) - v_total_accredited_cents);

  IF v_pending_balance_cents <= 0 THEN
    RAISE EXCEPTION 'ALREADY_PAID: El turno ya se encuentra totalmente saldado ($0 pendiente).';
  END IF;

  -- F. Determinar el monto efectivo a cobrar
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    v_effective_amount_cents := v_pending_balance_cents;
  ELSE
    v_effective_amount_cents := LEAST(p_amount_cents, v_pending_balance_cents);
  END IF;

  v_amount_ars := ROUND((v_effective_amount_cents::NUMERIC / 100.0), 2);

  -- G. Normalizar método de pago
  v_norm_method := LOWER(COALESCE(TRIM(p_payment_method), 'cash'));

  IF v_norm_method IN ('transfer', 'transferencia', 'bank_transfer') THEN
    v_method_db_text := 'TRANSFERENCIA';
    v_method_label := 'Transferencia';
    v_enum_payment_method := 'bank_transfer'::public.payment_method;
  ELSIF v_norm_method IN ('mercadopago', 'mercadopago_qr', 'mp', 'qr', 'mp_qr') THEN
    v_method_db_text := 'MERCADO_PAGO';
    v_method_label := 'Mercado Pago';
    v_enum_payment_method := 'mercadopago'::public.payment_method;
  ELSIF v_norm_method IN ('debit_card', 'tarjeta_debito', 'debito') THEN
    v_method_db_text := 'TARJETA_DEBITO';
    v_method_label := 'Tarjeta Débito';
    v_enum_payment_method := 'cash'::public.payment_method; -- Mapeo fallback seguro al enum legacy
  ELSIF v_norm_method IN ('credit_card', 'tarjeta_credito', 'credito') THEN
    v_method_db_text := 'TARJETA_CREDITO';
    v_method_label := 'Tarjeta Crédito';
    v_enum_payment_method := 'cash'::public.payment_method;
  ELSIF v_norm_method IN ('wallet', 'saldo', 'account_credit', 'customer_credit') THEN
    v_method_db_text := 'SALDO_BILLETERA';
    v_method_label := 'Saldo a Favor';
    v_enum_payment_method := 'account_credit'::public.payment_method;
  ELSE
    v_method_db_text := 'EFECTIVO';
    v_method_label := 'Efectivo';
    v_enum_payment_method := 'cash'::public.payment_method;
  END IF;

  -- H. Determinar fecha en huso horario oficial de Argentina
  v_today_arg := (TIMEZONE('America/Argentina/Buenos_Aires', v_now_timestamptz))::DATE;

  -- I. Insertar cobro en booking_payments (Auditoría inmutable de ingresos)
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
    notes,
    created_at
  ) VALUES (
    p_tenant_id,
    p_booking_id,
    v_amount_ars,
    v_effective_amount_cents,
    v_method_db_text,
    CASE 
      WHEN v_total_accredited_cents = 0 AND v_effective_amount_cents = v_booking.price_total_cents THEN 'TOTAL'
      WHEN v_total_accredited_cents = 0 THEN 'DEPOSIT' 
      ELSE 'BALANCE' 
    END,
    v_today_arg,
    v_now_timestamptz,
    p_staff_id,
    p_notes,
    v_now_timestamptz
  ) RETURNING id INTO v_payment_id;

  -- J. Recalcular total pagado y saldo pendiente
  v_new_total_accredited_cents := v_total_accredited_cents + v_effective_amount_cents;
  v_new_balance_due_cents := GREATEST(0, COALESCE(v_booking.price_total_cents, 0) - v_new_total_accredited_cents);
  v_is_fully_paid := (v_new_balance_due_cents = 0);
  v_new_status := CASE WHEN v_is_fully_paid THEN 'confirmed_cash'::public.booking_status ELSE 'confirmed'::public.booking_status END;

  -- K. Formatear notas de auditoría
  v_formatted_amount := TO_CHAR(v_amount_ars, 'FM999,999,999.00');
  v_time_str := TO_CHAR(TIMEZONE('America/Argentina/Buenos_Aires', v_now_timestamptz), 'HH24:MI');
  v_note_entry := 'Cobro $' || v_formatted_amount || ' (' || v_method_label || ') a las ' || v_time_str || ' hs [' || TO_CHAR(v_now_timestamptz, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || ']' ||
                  CASE WHEN p_notes IS NOT NULL AND length(trim(p_notes)) > 0 THEN ' - ' || trim(p_notes) ELSE '' END;

  IF v_booking.staff_notes IS NOT NULL AND length(trim(v_booking.staff_notes)) > 0 THEN
    v_updated_notes := v_booking.staff_notes || ' | ' || v_note_entry;
  ELSE
    v_updated_notes := v_note_entry;
  END IF;

  -- L. Actualizar reserva en bookings de forma atómica
  UPDATE public.bookings
  SET
    deposit_cents = v_new_total_accredited_cents,
    staff_deposit_amount_cents = v_new_total_accredited_cents,
    payment_method = CASE
      WHEN v_booking.payment_method IS NOT NULL AND v_booking.payment_method::text != 'cash' AND v_total_accredited_cents > 0
      THEN v_booking.payment_method
      ELSE v_enum_payment_method
    END,
    paid_at = COALESCE(v_booking.paid_at, v_now_timestamptz),
    balance_paid_at = CASE WHEN v_is_fully_paid THEN v_now_timestamptz ELSE v_booking.balance_paid_at END,
    status = v_new_status,
    balance_due = ROUND((v_new_balance_due_cents::NUMERIC / 100.0), 2),
    staff_notes = v_updated_notes,
    updated_at = v_now_timestamptz
  WHERE id = p_booking_id AND tenant_id = p_tenant_id;

  -- M. Devolver resultado estructurado en formato JSONB
  RETURN jsonb_build_object(
    'success', TRUE,
    'payment_id', v_payment_id,
    'booking_id', p_booking_id,
    'amount_charged_cents', v_effective_amount_cents,
    'amount_charged_ars', v_amount_ars,
    'payment_method', v_method_db_text,
    'payment_method_label', v_method_label,
    'total_paid_cents', v_new_total_accredited_cents,
    'total_paid_ars', ROUND((v_new_total_accredited_cents::NUMERIC / 100.0), 2),
    'balance_due_cents', v_new_balance_due_cents,
    'balance_due_ars', ROUND((v_new_balance_due_cents::NUMERIC / 100.0), 2),
    'status', v_new_status::text,
    'is_fully_paid', v_is_fully_paid,
    'registered_at', v_now_timestamptz
  );
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.settle_booking_balance(UUID, UUID, INT, TEXT, UUID, TEXT) TO authenticated, service_role;

-- 2. Actualizar register_cash_payment_atomic para delegar en settle_booking_balance (Retrocompatibilidad 100%)
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
BEGIN
  RETURN public.settle_booking_balance(
    p_booking_id := p_booking_id,
    p_tenant_id := p_tenant_id,
    p_amount_cents := p_amount_cents,
    p_payment_method := 'cash',
    p_staff_id := p_staff_id,
    p_notes := p_notes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_cash_payment_atomic(UUID, UUID, INT, UUID, TEXT) TO authenticated, service_role;
