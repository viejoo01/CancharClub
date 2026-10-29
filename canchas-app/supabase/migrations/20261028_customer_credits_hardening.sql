-- MIGRACIÓN CANCHARCLUB: BLINDAJE TRANSACCIONAL DE BILLETERA Y CRÉDITOS (customer_credits)
-- Previene condiciones de carrera, doble gasto y saldo negativo mediante transacciones atómicas con bloqueo FOR UPDATE.

-- 1. Función RPC para consumo atómico de créditos con bloqueo exclusivo de filas (FOR UPDATE)
CREATE OR REPLACE FUNCTION public.consume_customer_credits_atomic(
    p_tenant_id UUID,
    p_phone_variants TEXT[],
    p_amount_to_use NUMERIC,
    p_booking_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_credit RECORD;
    v_total_available NUMERIC := 0;
    v_needed NUMERIC;
    v_applied NUMERIC := 0;
    v_remaining_balance NUMERIC := 0;
    v_now TIMESTAMPTZ := NOW();
    v_credit_amount NUMERIC;
    v_new_remaining NUMERIC;
    v_short_booking_id TEXT := '';
BEGIN
    -- Validaciones de entrada
    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Identificador de club requerido');
    END IF;

    IF p_amount_to_use IS NULL OR p_amount_to_use <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Monto a aplicar inválido');
    END IF;

    IF p_phone_variants IS NULL OR array_length(p_phone_variants, 1) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Identificador de teléfono requerido');
    END IF;

    IF p_booking_id IS NOT NULL THEN
        v_short_booking_id := SUBSTRING(p_booking_id::TEXT FROM 1 FOR 8);
    END IF;

    -- 1. Calcular saldo disponible total bajo bloqueo transaccional FOR UPDATE
    -- Esto bloquea todas las filas disponibles del usuario en este club para que ninguna
    -- transacción concurrente pueda gastarlas en paralelo.
    FOR v_credit IN
        SELECT id, amount_ars, customer_phone, customer_name, expires_at
        FROM public.customer_credits
        WHERE tenant_id = p_tenant_id
          AND customer_phone = ANY(p_phone_variants)
          AND status = 'AVAILABLE'
          AND (expires_at IS NULL OR expires_at > v_now)
        ORDER BY created_at ASC
        FOR UPDATE
    LOOP
        v_total_available := v_total_available + v_credit.amount_ars;
    END LOOP;

    IF v_total_available <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No disponés de saldo a favor disponible',
            'applied_amount', 0,
            'remaining_balance', 0
        );
    END IF;

    -- Monto a descontar no puede superar el total disponible
    v_needed := LEAST(v_total_available, ROUND(p_amount_to_use, 2));

    -- 2. Consumir créditos fila por fila
    FOR v_credit IN
        SELECT id, amount_ars, customer_phone, customer_name, expires_at
        FROM public.customer_credits
        WHERE tenant_id = p_tenant_id
          AND customer_phone = ANY(p_phone_variants)
          AND status = 'AVAILABLE'
          AND (expires_at IS NULL OR expires_at > v_now)
        ORDER BY created_at ASC
        FOR UPDATE
    LOOP
        EXIT WHEN v_needed <= 0;

        v_credit_amount := v_credit.amount_ars;

        IF v_credit_amount <= v_needed THEN
            -- Consumo total de esta fila
            UPDATE public.customer_credits
            SET status = 'USED',
                used_at = v_now,
                source_booking_id = p_booking_id,
                reason = COALESCE(
                    p_reason, 
                    CASE WHEN p_booking_id IS NOT NULL 
                         THEN 'Utilizado en reserva ' || v_short_booking_id 
                         ELSE 'Utilizado en reserva' 
                    END
                )
            WHERE id = v_credit.id;

            v_needed := v_needed - v_credit_amount;
            v_applied := v_applied + v_credit_amount;
        ELSE
            -- Consumo parcial: mutar fila original con el saldo remanente e insertar fila USED
            v_new_remaining := v_credit_amount - v_needed;

            UPDATE public.customer_credits
            SET amount_ars = v_new_remaining
            WHERE id = v_credit.id;

            INSERT INTO public.customer_credits (
                tenant_id,
                customer_phone,
                customer_name,
                amount_ars,
                status,
                source_booking_id,
                reason,
                used_at,
                expires_at
            ) VALUES (
                p_tenant_id,
                v_credit.customer_phone,
                v_credit.customer_name,
                v_needed,
                'USED',
                p_booking_id,
                COALESCE(
                    p_reason, 
                    CASE WHEN p_booking_id IS NOT NULL 
                         THEN 'Utilizado en reserva ' || v_short_booking_id 
                         ELSE 'Utilizado en reserva' 
                    END
                ),
                v_now,
                v_credit.expires_at
            );

            v_applied := v_applied + v_needed;
            v_needed := 0;
        END IF;
    END LOOP;

    v_remaining_balance := GREATEST(0, v_total_available - v_applied);

    RETURN jsonb_build_object(
        'success', true,
        'applied_amount', v_applied,
        'remaining_balance', v_remaining_balance
    );
END;
$$;

-- 2. Función RPC para reversión atómica de créditos de una reserva cancelada
CREATE OR REPLACE FUNCTION public.refund_customer_credits_atomic(
    p_tenant_id UUID,
    p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INT := 0;
    v_short_booking_id TEXT := '';
BEGIN
    IF p_tenant_id IS NULL OR p_booking_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Parámetros inválidos');
    END IF;

    v_short_booking_id := SUBSTRING(p_booking_id::TEXT FROM 1 FOR 8);

    UPDATE public.customer_credits
    SET status = 'AVAILABLE',
        used_at = NULL,
        source_booking_id = NULL,
        reason = 'Saldo reintegrado por cancelación de reserva ' || v_short_booking_id
    WHERE tenant_id = p_tenant_id
      AND status = 'USED'
      AND (
          source_booking_id = p_booking_id
          OR reason ILIKE '%' || v_short_booking_id || '%'
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'refunded_count', v_count
    );
END;
$$;
