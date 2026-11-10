---
name: mercadopago-saas-payments
description: Protocolo estricto para cobros, señas automáticas, débito automático recurrente, validación bancaria real y webhooks de Mercado Pago MLA en CancharClub y plataformas SaaS.
---

# Mercado Pago MLA & SaaS Billing — Skill de Pagos y Facturación

Esta skill rige la integración con la pasarela de pagos Mercado Pago (MLA) y el motor de cobros SaaS. Es de cumplimiento obligatorio para evitar fraudes, inconsistencias contables o cobros duplicados.

---

## 1. Reglas Cardinales de Integración Financiera

### A. Prohibición Absoluta de Mocks y Aprobaciones Sintéticas
* **Arquitectura Fail-Closed**: Si falta el access token, las credenciales están revocadas, el webhook falla o la pasarela responde con error, el sistema **debe abortar la operación**, registrar el fallo y dejar la factura o reserva en estado `UNPAID` o `PENDING`.
* **Prohibido Simular Estados**: Queda terminantemente prohibido usar flags simuladas (`let hasFunds = true`, `isApproved = true`) o generar IDs sintéticos (`deb_saas_...`) para simular cobros exitosos sin respuesta bancaria HTTP real.

### B. Prohibición de Almacenar `card_token`
* Los `card_token` generados por el SDK/Brick de Mercado Pago en el frontend son de **un solo uso** y expiran en minutos. **Nunca se guardan en la base de datos**.
* Para cobros futuros, se deben almacenar únicamente los identificadores permanentes emitidos por la API:
  - `mp_preapproval_id` (para suscripciones recurrentes vía `/preapproval`).
  - `mp_customer_id` y `mp_card_id` (vía Customers & Cards API).
  - Metadata no sensible: `last_four_digits`, `payment_method_id` (ej: `visa`, `master`) y `card_status = 'VALIDATED'`.

---

## 2. Flujo de Alta de Tarjeta y Validación Bancaria Real

Al recibir un token de tarjeta desde el frontend del dueño del club:
1. **Validación Bancaria Requerida**:
   * **Opción Suscripción**: Crear el contrato en `/preapproval` con estado `authorized`. MP se encarga de validar el medio con la red emisora.
   * **Opción Cargo Test**: Ejecutar un cargo de validación contra `/v1/payments` (ej: importe mínimo) y exigir estrictamente:
     ```typescript
     if (payment.status !== 'approved' || payment.status_detail !== 'accredited') {
       throw new Error(`Tarjeta rechazada por el banco: ${payment.status_detail}`);
     }
     ```
   * Si el cargo aprueba, ejecutar de inmediato el reembolso automático:
     ```http
     POST /v1/payments/{payment_id}/refunds
     ```
2. **Rechazo Bancario**: Si devuelve `rejected` (fondos insuficientes, código de seguridad inválido, high risk), **abortar la persistencia**, no guardar la tarjeta y retornar el error exacto al usuario.

---

## 3. Idempotencia y Prevención de Dobles Cobros

Toda petición de creación de pago o suscripción a Mercado Pago debe incorporar el encabezado HTTP:
```http
X-Idempotency-Key: invoice_{invoice_id}_attempt_{attempt_number}_{timestamp}
```
Esto garantiza que ante reintentos por timeout de red o microcortes, Mercado Pago no duplique transacciones.

---

## 4. Escalera de Mora (Dunning) e Invariantes de Estado

### Invariante de Estado de Pago
Si existe al menos una factura `UNPAID` vencida, el flag `isPaid` del club es estrictamente `false`, incluso si el club tiene tarjeta guardada.

### A. Clubes con Débito Automático Configurado
* **Día 0 (Fecha de Vencimiento)**: Se dispara el intento de cobro autónomo.
  * Si aprueba: Factura `PAID`, suscripción `ACTIVE`.
  * Si rechaza: Se registra el código de fallo en `tenant_invoices`, estado `UNPAID`, y se programa reintento a 24 horas: `next_retry_at = NOW() + INTERVAL '24 hours'`.
* **Día 1**: Intento 2 automático. Si falla nuevamente, se notifica al dueño del club formalmente.
* **Día 2 en adelante**: Comienza el devengamiento de mora diaria (+3% acumulativo) sobre el saldo adeudado.

### B. Período de Prueba Finalizado / Pago Manual
* **Días 1 a 7**: Ventana de pago manual con precio congelado sin recargo (`PAYMENT_PENDING`).
* **Día 8 a 12**: Estado `GRACE_PERIOD`. Comienza recargo del 3% diario (Día 8 = 1 día de mora, Día 9 = 2 días, etc.).
* **Días 13 y 14**: `PARTIALLY_SUSPENDED`. Se suspende el portal público de reservas (los jugadores no pueden sacar turnos online; el dueño aún puede entrar al panel).
* **Día 15+**: `LOCKED`. Bloqueo operativo total de la cuenta hasta la cancelación de la deuda.

---

## 5. Webhooks Oficiales y Confirmación Sincrónica

* El estado de una reserva o factura **solo** cambia a `PAID` / `CONFIRMED` cuando:
  1. La respuesta sincrónica de la API devuelve `status === 'approved'` y `status_detail === 'accredited'`.
  2. O cuando el webhook oficial (`payment.created`, `payment.updated`, `subscription_authorized_payment`) es recibido y validado con la clave secreta `x-signature`.
* Registrar siempre el `payment_id`, `merchant_order_id` y `payment_method_id` en las tablas auditables de la base de datos.
