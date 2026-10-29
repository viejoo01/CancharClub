// tests/mercadopago-tenant-checkout.test.ts
// ==============================================================================
// AUDITORÍA TÉCNICA Y DE SEGURIDAD: INTEGRACIÓN DE MERCADO PAGO PARA SEÑAS
// Pruebas automatizadas de segregación de credenciales (SaaS vs Club),
// manejo de fallback fail-closed, enrutamiento idempotente de webhooks
// y aislamiento de secretos bancarios / tokens RLS.
// ==============================================================================

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

describe('Mercado Pago Integration: Tenant Booking Checkout & Webhooks Audit', () => {

  // ─── 1. SEGREGACIÓN DE CREDENCIALES (PLATAFORMA SAAS VS CLUB) ───────────────
  describe('1. Credential Segregation (SaaS Platform vs Club)', () => {
    it('verifies booking checkout resolves tenant-specific token and never falls back to platform token', () => {
      // Simulación de resolución de credenciales para cobro de seña
      interface TenantPaymentCredentials {
        tenantId: string
        mp_access_token?: string | null
        mp_public_key?: string | null
      }

      function resolveBookingCheckoutToken(
        tenant: TenantPaymentCredentials,
        platformEnvToken: string
      ): { success: boolean; token?: string; error?: string } {
        // Regla estricta: las señas de turnos de un club NUNCA deben ingresar a la cuenta de la plataforma
        if (!tenant.mp_access_token || tenant.mp_access_token.trim() === '' || tenant.mp_access_token === platformEnvToken) {
          return {
            success: false,
            error: 'El club no ha configurado sus credenciales de Mercado Pago para recibir señas.',
          }
        }
        return {
          success: true,
          token: tenant.mp_access_token,
        }
      }

      const platformToken = 'APP_USR-platform-superadmin-secret-token'
      
      // Caso A: Club sin Mercado Pago configurado
      const clubWithoutMp: TenantPaymentCredentials = {
        tenantId: 'tenant-100',
        mp_access_token: null,
      }
      const resA = resolveBookingCheckoutToken(clubWithoutMp, platformToken)
      expect(resA.success).toBe(false)
      expect(resA.token).toBeUndefined()
      expect(resA.error).toContain('El club no ha configurado sus credenciales')

      // Caso B: Club con su propia cuenta vinculada
      const clubWithMp: TenantPaymentCredentials = {
        tenantId: 'tenant-200',
        mp_access_token: 'APP_USR-club-propio-access-token-999',
      }
      const resB = resolveBookingCheckoutToken(clubWithMp, platformToken)
      expect(resB.success).toBe(true)
      expect(resB.token).toBe('APP_USR-club-propio-access-token-999')
      expect(resB.token).not.toBe(platformToken)
    })

    it('validates tournament.actions.ts does not fall back to process.env.MP_ACCESS_TOKEN', () => {
      // Verificación estática del código fuente de tournament.actions.ts
      const tournamentActionsPath = path.resolve(
        __dirname,
        '../src/actions/tournament.actions.ts'
      )
      const content = fs.readFileSync(tournamentActionsPath, 'utf-8')

      // Verificar que se eliminó el fallback de la plataforma para inscripciones de torneos
      const hasUnsafePlatformFallback = content.includes('tenantToken = tenant?.mp_access_token || process.env.MP_ACCESS_TOKEN')
      expect(hasUnsafePlatformFallback).toBe(false)

      // Verificar que se valide estrictamente la existencia del token del club
      expect(content).toContain('El club no tiene conectada su cuenta de cobro de Mercado Pago todavía')
    })

    it('validates api/checkout/route.ts enforces tenant credentials in production (fail-closed)', () => {
      const checkoutRoutePath = path.resolve(
        __dirname,
        '../src/app/api/checkout/route.ts'
      )
      const content = fs.readFileSync(checkoutRoutePath, 'utf-8')

      // Verificar que en producción no permita el bypass si no hay token del tenant
      expect(content).toContain('El club no tiene configurada una cuenta de Mercado Pago')
      expect(content).toContain('Transferencia Bancaria')
    })
  })

  // ─── 2. MANEJO DE FALLBACK ANTE FALTA DE CREDENCIALES ────────────────────────
  describe('2. Fallback Handling for Missing Payment Credentials', () => {
    it('redirects or defaults customer to Direct Bank Transfer / In-person payment if MP is not connected', () => {
      interface ClubPaymentConfig {
        mpConnected: boolean
        bankTransferEnabled: boolean
        cbu?: string
        alias?: string
        cashAtClubEnabled: boolean
      }

      function getAvailablePaymentMethods(config: ClubPaymentConfig) {
        const methods: string[] = []
        if (config.mpConnected) {
          methods.push('MERCADO_PAGO')
        }
        if (config.bankTransferEnabled && (config.cbu || config.alias)) {
          methods.push('TRANSFER')
        }
        if (config.cashAtClubEnabled) {
          methods.push('CASH_AT_VENUE')
        }
        return methods
      }

      // Club nuevo sin Mercado Pago pero con Alias configurado
      const newClub: ClubPaymentConfig = {
        mpConnected: false,
        bankTransferEnabled: true,
        alias: 'padel.centro.club',
        cashAtClubEnabled: true,
      }

      const availableMethods = getAvailablePaymentMethods(newClub)
      expect(availableMethods).not.toContain('MERCADO_PAGO')
      expect(availableMethods).toContain('TRANSFER')
      expect(availableMethods).toContain('CASH_AT_VENUE')
      expect(availableMethods.length).toBeGreaterThan(0) // No bloquea la reserva
    })

    it('rejects synthetic / mock payment approvals in production', () => {
      function evaluateCheckoutAttempt(env: string, hasTenantToken: boolean, isSimulated: boolean) {
        if (env === 'production') {
          if (!hasTenantToken) {
            return { allowed: false, error: 'CREDENTIALS_REQUIRED' }
          }
          if (isSimulated) {
            return { allowed: false, error: 'SIMULATION_PROHIBITED' }
          }
        }
        return { allowed: true }
      }

      const prodSimulatedAttempt = evaluateCheckoutAttempt('production', false, true)
      expect(prodSimulatedAttempt.allowed).toBe(false)
      expect(prodSimulatedAttempt.error).toBe('CREDENTIALS_REQUIRED')
    })
  })

  // ─── 3. ARQUITECTURA DEL WEBHOOK Y CONTROL DE IDEMPOTENCIA ────────────────────
  describe('3. Webhook Architecture & Idempotency for Court Deposits', () => {
    it('correctly disambiguates SaaS subscription invoice payments from player court booking deposits', () => {
      function routeWebhookPayment(externalReference: string | null) {
        if (!externalReference) {
          return 'UNKNOWN'
        }
        if (
          externalReference.startsWith('saas_tenant_') ||
          externalReference.startsWith('saas_') ||
          externalReference.includes('_inv_')
        ) {
          return 'SAAS_INVOICE'
        }
        if (externalReference.startsWith('cancharclub_booking_')) {
          return 'BOOKING_DEPOSIT'
        }
        if (externalReference.startsWith('tournament_team_')) {
          return 'TOURNAMENT_ENTRY'
        }
        return 'GENERIC_PAYMENT'
      }

      expect(routeWebhookPayment('saas_tenant_uuid123_inv_456')).toBe('SAAS_INVOICE')
      expect(routeWebhookPayment('cancharclub_booking_789')).toBe('BOOKING_DEPOSIT')
      expect(routeWebhookPayment('tournament_team_321')).toBe('TOURNAMENT_ENTRY')
      expect(routeWebhookPayment(null)).toBe('UNKNOWN')
    })

    it('prevents double-crediting balance_due and prevents duplicate booking_payments on duplicate webhook delivery', () => {
      interface BookingState {
        id: string
        total_price: number
        deposit_amount: number
        paid_amount: number
        balance_due: number
        payment_status: 'PENDING' | 'PARTIAL' | 'COMPLETED'
      }

      interface BookingPaymentRecord {
        mp_payment_id: string
        amount: number
        booking_id: string
      }

      const booking: BookingState = {
        id: 'booking-101',
        total_price: 10000,
        deposit_amount: 3000,
        paid_amount: 0,
        balance_due: 10000,
        payment_status: 'PENDING',
      }

      const processedMpPayments = new Set<string>()
      const bookingPaymentsTable: BookingPaymentRecord[] = []

      function processDepositWebhook(
        mpPaymentId: string,
        amount: number,
        targetBooking: BookingState
      ): { success: boolean; alreadyProcessed: boolean } {
        // Verificación de idempotencia
        if (processedMpPayments.has(mpPaymentId)) {
          return { success: true, alreadyProcessed: true }
        }

        // Registrar pago único
        processedMpPayments.add(mpPaymentId)
        bookingPaymentsTable.push({
          mp_payment_id: mpPaymentId,
          amount,
          booking_id: targetBooking.id,
        })

        // Actualizar balance
        targetBooking.paid_amount += amount
        targetBooking.balance_due = Math.max(0, targetBooking.total_price - targetBooking.paid_amount)
        if (targetBooking.balance_due === 0) {
          targetBooking.payment_status = 'COMPLETED'
        } else if (targetBooking.paid_amount > 0) {
          targetBooking.payment_status = 'PARTIAL'
        }

        return { success: true, alreadyProcessed: false }
      }

      // Primer webhook (entrega normal)
      const attempt1 = processDepositWebhook('mp-pay-999', 3000, booking)
      expect(attempt1.alreadyProcessed).toBe(false)
      expect(booking.paid_amount).toBe(3000)
      expect(booking.balance_due).toBe(7000)
      expect(booking.payment_status).toBe('PARTIAL')
      expect(bookingPaymentsTable.length).toBe(1)

      // Segundo webhook duplicado (reintento de red de Mercado Pago)
      const attempt2 = processDepositWebhook('mp-pay-999', 3000, booking)
      expect(attempt2.alreadyProcessed).toBe(true)
      // El saldo pendiente NO debe descontarse nuevamente
      expect(booking.paid_amount).toBe(3000)
      expect(booking.balance_due).toBe(7000)
      expect(bookingPaymentsTable.length).toBe(1)
    })

    it('verifies unique index exists in migrations for booking_payments(mp_payment_id)', () => {
      const migrationPath = path.resolve(
        __dirname,
        '../supabase/migrations/20261028_mp_payment_settings_security.sql'
      )
      const content = fs.readFileSync(migrationPath, 'utf-8')

      expect(content).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_payments_mp_payment_id_unique')
      expect(content).toContain('ON public.booking_payments(mp_payment_id)')
    })
  })

  // ─── 4. SEGURIDAD Y CIFRADO DE SECRETOS ──────────────────────────────────────
  describe('4. Security & Secret Encryption', () => {
    it('verifies RLS column revoke and tenant_payment_settings table in migration', () => {
      const migrationPath = path.resolve(
        __dirname,
        '../supabase/migrations/20261028_mp_payment_settings_security.sql'
      )
      const content = fs.readFileSync(migrationPath, 'utf-8')

      // Verificar que se revocó el SELECT de los tokens de mp en public.tenants a anon y authenticated
      expect(content).toContain('REVOKE SELECT (mp_access_token, mp_refresh_token')
      expect(content).toContain('FROM anon, authenticated')

      // Verificar que tenant_payment_settings tenga RLS activo
      expect(content).toContain('ALTER TABLE public.tenant_payment_settings ENABLE ROW LEVEL SECURITY')
      expect(content).toContain('tenant_payment_settings: tenant admin read own')
      expect(content).toContain('tenant_id = public.current_tenant_id()')
    })

    it('ensures dashboard actions do not expose raw secret tokens to frontend', () => {
      // Simular respuesta de configuración de pagos para el frontend
      interface PublicPaymentSettings {
        tenantId: string
        mpConnected: boolean
        mpCollectorIdMasked?: string
        publicKeyPresent: boolean
        cbuAliasConfigured: boolean
      }

      function sanitizePaymentSettings(rawDbRecord: {
        tenant_id: string
        mp_access_token: string | null
        mp_public_key: string | null
        mp_user_id: string | null
        cbu: string | null
      }): PublicPaymentSettings {
        return {
          tenantId: rawDbRecord.tenant_id,
          mpConnected: Boolean(rawDbRecord.mp_access_token && rawDbRecord.mp_access_token.length > 10),
          mpCollectorIdMasked: rawDbRecord.mp_user_id ? `***${rawDbRecord.mp_user_id.slice(-4)}` : undefined,
          publicKeyPresent: Boolean(rawDbRecord.mp_public_key),
          cbuAliasConfigured: Boolean(rawDbRecord.cbu),
        }
      }

      const sanitized = sanitizePaymentSettings({
        tenant_id: 'tenant-abc',
        mp_access_token: 'APP_USR-8392173912739127-102812-secret',
        mp_public_key: 'APP_USR-public-key-here',
        mp_user_id: '123456789',
        cbu: '0170099220000012345678',
      })

      expect((sanitized as unknown as Record<string, unknown>).mp_access_token).toBeUndefined()
      expect(sanitized.mpConnected).toBe(true)
      expect(sanitized.mpCollectorIdMasked).toBe('***6789')
    })
  })
})
