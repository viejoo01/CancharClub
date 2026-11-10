import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('tenant_invoices Multi-Tenant RLS & Index Security Audit', () => {
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261110_tenant_invoices_rls_and_indexes.sql')

  describe('1. Migration SQL Structural & Invariant Verification', () => {
    it('migration file exists in both repository locations', () => {
      expect(fs.existsSync(migrationPath)).toBe(true)
      const rootPath = path.resolve(process.cwd(), '../supabase/migrations/20261110_tenant_invoices_rls_and_indexes.sql')
      expect(fs.existsSync(rootPath)).toBe(true)
    })

    it('enforces and forces Row Level Security (RLS) on tenant_invoices', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8')
      expect(sql).toContain('ALTER TABLE IF EXISTS public.tenant_invoices ENABLE ROW LEVEL SECURITY;')
      expect(sql).toContain('ALTER TABLE IF EXISTS public.tenant_invoices FORCE ROW LEVEL SECURITY;')
    })

    it('creates strict superadmin and service_role management policy', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8')
      expect(sql).toContain('CREATE POLICY "tenant_invoices: superadmin y service_role manage"')
      expect(sql).toContain("auth.role() = 'service_role'")
      expect(sql).toContain("public.current_user_role() = 'SUPERADMIN'")
    })

    it('restricts tenant access strictly to FOR SELECT, forbidding client INSERT/UPDATE/DELETE', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8')
      expect(sql).toContain('CREATE POLICY "tenant_invoices: tenant_admin read own" ON public.tenant_invoices')
      expect(sql).toContain('FOR SELECT')
      
      // Ensure no client modification policy exists
      expect(sql).not.toContain('CREATE POLICY "tenant_invoices: tenant_admin update"')
      expect(sql).not.toContain('CREATE POLICY "tenant_invoices: tenant_admin insert"')
      expect(sql).not.toContain('CREATE POLICY "tenant_invoices: tenant_admin delete"')
    })

    it('enforces rigorous multi-tenant identity verification (tenant_id, profile function, and JWT claim)', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8')
      expect(sql).toContain('tenant_id IS NOT NULL')
      expect(sql).toContain('tenant_id = public.current_tenant_id()')
      expect(sql).toContain("NULLIF(auth.jwt() ->> 'tenant_id', '')::UUID = tenant_id")
      expect(sql).toContain("public.current_user_role() IN ('TENANT_ADMIN', 'TENANT_STAFF')")
    })

    it('defines all 4 essential performance indexes for billing, webhooks, and dunning', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8')
      
      // A. Tenant created_at ordering index
      expect(sql).toContain('idx_tenant_invoices_tenant_created')
      expect(sql).toContain('(tenant_id, created_at DESC)')

      // B. Mercado Pago payment lookup index (partial)
      expect(sql).toContain('idx_tenant_invoices_mp_payment_id')
      expect(sql).toContain('WHERE mp_payment_id IS NOT NULL')

      // C. Mercado Pago preference lookup index (partial)
      expect(sql).toContain('idx_tenant_invoices_mp_preference_id')
      expect(sql).toContain('WHERE mp_preference_id IS NOT NULL')

      // D. Dunning unpaid invoices index (partial)
      expect(sql).toContain('idx_tenant_invoices_unpaid_due_date')
      expect(sql).toContain("WHERE status = 'UNPAID'")
    })
  })

  describe('2. Multi-Tenant Cross-Access Prevention Logic', () => {
    // Simular el evaluador de predicados RLS
    function evaluateTenantInvoiceAccess(params: {
      rowTenantId: string
      userTenantId: string | null
      jwtTenantId?: string | null
      userRole: 'SUPERADMIN' | 'TENANT_ADMIN' | 'TENANT_STAFF' | 'PLAYER' | 'ANON'
      authRole: 'authenticated' | 'anon' | 'service_role'
      command: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
    }): boolean {
      // 1. Service role o superadmin
      if (params.authRole === 'service_role' || params.userRole === 'SUPERADMIN') {
        return true
      }

      // 2. Si es comando de modificación (INSERT, UPDATE, DELETE), denegar siempre al cliente
      if (params.command !== 'SELECT') {
        return false
      }

      // 3. Jugador o usuario anónimo: 0 acceso
      if (params.userRole === 'PLAYER' || params.userRole === 'ANON' || params.authRole === 'anon') {
        return false
      }

      // 4. Verificación de rol administrativo del club
      const isTenantAdminOrStaff = params.userRole === 'TENANT_ADMIN' || params.userRole === 'TENANT_STAFF'
      if (!isTenantAdminOrStaff) {
        return false
      }

      // 5. Verificación estricta de pertenencia al mismo tenant_id
      const matchesProfileTenant = params.userTenantId !== null && params.userTenantId === params.rowTenantId
      const matchesJwtTenant = params.jwtTenantId ? params.jwtTenantId === params.rowTenantId : false

      return Boolean(params.rowTenantId) && (matchesProfileTenant || matchesJwtTenant)
    }

    const CLUB_A_ID = '11111111-1111-1111-1111-111111111111'
    const CLUB_B_ID = '22222222-2222-2222-2222-222222222222'

    it('allows Club A Admin to read Club A invoices', () => {
      const allowed = evaluateTenantInvoiceAccess({
        rowTenantId: CLUB_A_ID,
        userTenantId: CLUB_A_ID,
        userRole: 'TENANT_ADMIN',
        authRole: 'authenticated',
        command: 'SELECT',
      })
      expect(allowed).toBe(true)
    })

    it('strictly forbids Club A Admin from reading Club B invoices (Cross-Tenant Leak Prevention)', () => {
      const allowed = evaluateTenantInvoiceAccess({
        rowTenantId: CLUB_B_ID,
        userTenantId: CLUB_A_ID,
        userRole: 'TENANT_ADMIN',
        authRole: 'authenticated',
        command: 'SELECT',
      })
      expect(allowed).toBe(false)
    })

    it('strictly forbids Club A Staff from reading Club B invoices', () => {
      const allowed = evaluateTenantInvoiceAccess({
        rowTenantId: CLUB_B_ID,
        userTenantId: CLUB_A_ID,
        userRole: 'TENANT_STAFF',
        authRole: 'authenticated',
        command: 'SELECT',
      })
      expect(allowed).toBe(false)
    })

    it('forbids Club Admin from updating or paying their own invoice directly from client', () => {
      const allowed = evaluateTenantInvoiceAccess({
        rowTenantId: CLUB_A_ID,
        userTenantId: CLUB_A_ID,
        userRole: 'TENANT_ADMIN',
        authRole: 'authenticated',
        command: 'UPDATE',
      })
      expect(allowed).toBe(false)
    })

    it('forbids Players from viewing any SaaS invoices', () => {
      const allowed = evaluateTenantInvoiceAccess({
        rowTenantId: CLUB_A_ID,
        userTenantId: CLUB_A_ID,
        userRole: 'PLAYER',
        authRole: 'authenticated',
        command: 'SELECT',
      })
      expect(allowed).toBe(false)
    })

    it('forbids unauthenticated / anonymous users from reading any invoice', () => {
      const allowed = evaluateTenantInvoiceAccess({
        rowTenantId: CLUB_A_ID,
        userTenantId: null,
        userRole: 'ANON',
        authRole: 'anon',
        command: 'SELECT',
      })
      expect(allowed).toBe(false)
    })

    it('allows server service_role to manage all invoices for payment webhooks and crons', () => {
      const allowed = evaluateTenantInvoiceAccess({
        rowTenantId: CLUB_A_ID,
        userTenantId: null,
        userRole: 'ANON',
        authRole: 'service_role',
        command: 'UPDATE',
      })
      expect(allowed).toBe(true)
    })
  })
})
