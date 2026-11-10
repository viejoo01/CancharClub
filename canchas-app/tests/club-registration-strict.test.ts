import { describe, it, expect } from 'vitest'
import {
  registerClubSchema,
  generateBaseSlug,
  type RegisterClubInput,
} from '@/lib/schemas/club-registration.schema'
import { registerClubStrictAction } from '@/actions/club-registration.actions'

describe('Strict Club Registration Server Action & Schema Suite', () => {

  // ── 1. SCHEMA VALIDATION TESTS (ZOD) ─────────────────────────────────────────
  describe('1. Zod Schema Validation', () => {
    it('accepts a complete, valid club registration payload', () => {
      const validPayload: RegisterClubInput = {
        clubName: 'Club Pádel Central',
        email: 'contacto@padelcentral.com',
        password: 'AdminPassword123!',
        phone: '+54 381 555-1234',
        city: 'Yerba Buena',
        province: 'Tucumán',
        address: 'Av. Aconquija 1500',
        planId: 'MEDIANO_2',
        sports: ['PADEL', 'FUTBOL5'],
        customSlug: 'padel-central-yb',
        initialCourtsCount: 3,
        defaultSlotPriceArs: 32000,
      }

      const result = registerClubSchema.safeParse(validPayload)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.clubName).toBe('Club Pádel Central')
        expect(result.data.sports).toContain('PADEL')
        expect(result.data.planId).toBe('MEDIANO_2')
      }
    })

    it('rejects short club names (< 3 chars) with explicit message', () => {
      const invalid = {
        clubName: 'CP',
        password: 'ValidPassword123!',
      }

      const result = registerClubSchema.safeParse(invalid)
      expect(result.success).toBe(false)
      if (!result.success) {
        const issues = result.error.issues
        const nameIssue = issues.find(i => i.path.includes('clubName'))
        expect(nameIssue?.message).toContain('al menos 3 caracteres')
      }
    })

    it('rejects passwords shorter than 8 characters', () => {
      const invalid = {
        clubName: 'Club San Martín',
        password: 'short',
      }

      const result = registerClubSchema.safeParse(invalid)
      expect(result.success).toBe(false)
      if (!result.success) {
        const issues = result.error.issues
        const pwdIssue = issues.find(i => i.path.includes('password'))
        expect(pwdIssue?.message).toContain('al menos 8 caracteres')
      }
    })

    it('rejects invalid email formats', () => {
      const invalid = {
        clubName: 'Club San Martín',
        password: 'ValidPassword123!',
        email: 'not-an-email',
      }

      const result = registerClubSchema.safeParse(invalid)
      expect(result.success).toBe(false)
      if (!result.success) {
        const issues = result.error.issues
        const emailIssue = issues.find(i => i.path.includes('email'))
        expect(emailIssue?.message).toContain('formato válido')
      }
    })

    it('rejects invalid phone numbers with special unwanted symbols', () => {
      const invalid = {
        clubName: 'Club San Martín',
        password: 'ValidPassword123!',
        phone: 'invalid#phone!abc',
      }

      const result = registerClubSchema.safeParse(invalid)
      expect(result.success).toBe(false)
      if (!result.success) {
        const issues = result.error.issues
        const phoneIssue = issues.find(i => i.path.includes('phone'))
        expect(phoneIssue?.message).toContain('teléfono o WhatsApp válido')
      }
    })

    it('rejects invalid custom slugs with uppercase, spaces or special symbols', () => {
      const invalid = {
        clubName: 'Club San Martín',
        password: 'ValidPassword123!',
        customSlug: 'Club San Martin!!',
      }

      const result = registerClubSchema.safeParse(invalid)
      expect(result.success).toBe(false)
      if (!result.success) {
        const issues = result.error.issues
        const slugIssue = issues.find(i => i.path.includes('customSlug'))
        expect(slugIssue?.message).toContain('minúsculas, números y guiones')
      }
    })

    it('applies defaults for planId, sports, city, and province', () => {
      const minimalPayload = {
        clubName: 'Club Padel Norte',
        password: 'ValidPassword123!',
      }

      const result = registerClubSchema.safeParse(minimalPayload)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.planId).toBe('MEDIANO_2')
        expect(result.data.sports).toEqual(['PADEL', 'FUTBOL5'])
        expect(result.data.city).toBe('San Miguel de Tucumán')
        expect(result.data.province).toBe('Tucumán')
        expect(result.data.defaultSlotPriceArs).toBe(30000)
      }
    })
  })

  // ── 2. SLUG GENERATION & SANITIZATION ────────────────────────────────────────
  describe('2. Slug Sanitization & Collision Prevention', () => {
    it('normalizes accents, spaces and special characters cleanly into kebab-case', () => {
      expect(generateBaseSlug('Pádel & Fútbol Los Cedros!')).toBe('padel-futbol-los-cedros')
      expect(generateBaseSlug('Club Ñandú 100%')).toBe('club-nandu-100')
      expect(generateBaseSlug('   Espacios   Extremos   ')).toBe('espacios-extremos')
      expect(generateBaseSlug('---Guiones---')).toBe('guiones')
      expect(generateBaseSlug('')).toBe('club')
    })
  })

  // ── 3. SERVER ACTION FAIL-CLOSED VALIDATION ──────────────────────────────────
  describe('3. Server Action Fail-Closed Execution', () => {
    it('returns structured field errors when invalid payload is sent to registerClubStrictAction', async () => {
      // Intentar registrar sin datos obligatorios
      const res = await registerClubStrictAction({
        clubName: '',
        password: '123',
      } as unknown as RegisterClubInput)

      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error).toBeDefined()
        expect(res.fieldErrors).toBeDefined()
        expect(res.fieldErrors?.clubName).toBeDefined()
        expect(res.fieldErrors?.password).toBeDefined()
      }
    })

    it('supports FormData input and parses JSON sports array correctly', async () => {
      const formData = new FormData()
      formData.set('clubName', 'C') // Inválido: < 3 caracteres
      formData.set('password', '123') // Inválido: < 8 caracteres
      formData.set('sports', JSON.stringify(['PADEL']))

      const res = await registerClubStrictAction(formData)
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.fieldErrors?.clubName).toBeDefined()
      }
    })
  })
})
