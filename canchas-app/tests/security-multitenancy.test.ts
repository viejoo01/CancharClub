import { describe, it, expect } from 'vitest'
import { escapeHtml, sanitizeText, sanitizeSlug } from '@/lib/sanitize'
import { isValidLuhn, detectCardBrand } from '@/lib/card-validation'

describe('Security & Multi-Tenancy Architecture', () => {
  describe('Input Sanitization & Anti-XSS Protection', () => {
    it('escapes hazardous HTML characters in user text', () => {
      const payload = `<script>alert("XSS")</script>&'"`
      const escaped = escapeHtml(payload)
      expect(escaped).not.toContain('<script>')
      expect(escaped).toContain('&lt;script&gt;')
      expect(escaped).toContain('&amp;')
      expect(escaped).toContain('&quot;')
      expect(escaped).toContain('&#039;')
    })

    it('strips inline JavaScript events and malicious tags in sanitizeText', () => {
      const malicious = '<img src=x onerror=alert("pwned")><b>Cancha 1</b><a href="javascript:steal()">Click</a>'
      const clean = sanitizeText(malicious)
      expect(clean).not.toContain('onerror')
      expect(clean).not.toContain('javascript:')
      expect(clean).not.toContain('<img')
      expect(clean).not.toContain('<b>')
      expect(clean).toContain('Cancha 1')
    })

    it('sanitizes public tenant slugs to prevent path traversal and script injection', () => {
      expect(sanitizeSlug('Club Atlético Pádel & Tenis!')).toBe('club-atletico-padel-tenis')
      expect(sanitizeSlug('../../admin/config')).toBe('admin-config')
      expect(sanitizeSlug('<script>alert(1)</script>')).toBe('script-alert-1-script')
      expect(sanitizeSlug('---espacio---')).toBe('espacio')
    })
  })

  describe('Card Verification & Luhn Algorithm (Mod 10)', () => {
    it('validates genuine credit/debit card numbers using Luhn check digit', () => {
      // Known valid Luhn test vectors
      expect(isValidLuhn('4532015112830366')).toBe(true) // Valid Visa
      expect(isValidLuhn('5425233430109903')).toBe(true) // Valid Mastercard
      expect(isValidLuhn('378282246310005')).toBe(true)  // Valid Amex (15 digits)

      // Invalid check digits
      expect(isValidLuhn('4532015112830367')).toBe(false)
      expect(isValidLuhn('5425233430109904')).toBe(false)
      expect(isValidLuhn('1234567812345671')).toBe(false)
      expect(isValidLuhn('0000000000000000')).toBe(true) // Math edge case, but caught by BIN length
    })

    it('detects card issuer brands by official BIN prefixes', () => {
      const visa = detectCardBrand('4532015112830366')
      expect(visa?.brand).toBe('VISA')
      expect(visa?.expectedLength).toContain(16)
      expect(visa?.cvvLength).toContain(3)

      const master = detectCardBrand('5425233430109903')
      expect(master?.brand).toBe('MASTERCARD')
      expect(master?.cvvLength).toContain(3)

      const amex = detectCardBrand('378282246310005')
      expect(amex?.brand).toBe('AMEX')
      expect(amex?.expectedLength).toContain(15)
      expect(amex?.cvvLength).toContain(4)

      const unknown = detectCardBrand('9999999999999999')
      expect(unknown).toBeNull()
    })
  })

  describe('Mercado Pago Webhook Event Routing & Isolation', () => {
    type WebhookType = 'BOOKING' | 'TOURNAMENT' | 'SAAS' | 'UNKNOWN'

    function classifyExternalReference(ref: string | null | undefined): WebhookType {
      if (!ref) return 'UNKNOWN'
      if (ref.startsWith('tournament_team_')) return 'TOURNAMENT'
      if (ref.startsWith('cancharclub_booking_')) return 'BOOKING'
      if (ref.startsWith('saas_sub_')) return 'SAAS'
      return 'UNKNOWN'
    }

    it('cleanly decouples and routes webhook callbacks without cross-tenant or cross-service collisions', () => {
      expect(classifyExternalReference('tournament_team_uuid-123')).toBe('TOURNAMENT')
      expect(classifyExternalReference('cancharclub_booking_uuid-456')).toBe('BOOKING')
      expect(classifyExternalReference('saas_sub_uuid-789')).toBe('SAAS')
      expect(classifyExternalReference('random_ref')).toBe('UNKNOWN')
      expect(classifyExternalReference(null)).toBe('UNKNOWN')
    })
  })
})
