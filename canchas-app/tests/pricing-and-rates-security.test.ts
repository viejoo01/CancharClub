import { describe, it, expect } from 'vitest'
import { generateClubSlots, getClubBySlug } from '@/config/clubs-catalog'
import type { ClubData } from '@/config/clubs-catalog'

describe('Pricing & Dynamic Rates Security Suite', () => {
  const baseClub: ClubData = {
    ...getClubBySlug('test-club'),
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Club Test Padel & Futbol',
    slug: 'club-test',
    sports: ['PADEL'],
    schedule: {
      opening_time: '14:00',
      closing_time: '23:30',
    },
    courts: [
      {
        id: 'court-padel-1',
        name: 'Cancha 1 (Cristal)',
        sport: 'PADEL',
        features: ['Techada', 'Iluminación LED'],
        pricePerHour: 20000,
        depositPercentage: 0.5,
        slotDurationMinutes: 90,
      },
    ],
    priceRules: [],
  }

  describe('1. Cross-Boundary Slot Evaluation & Lighting Supplement Protection', () => {
    it('picks the higher night/lighting rate when a 90m slot crosses into lighting hours (17:00 to 18:30 crosses 18:00)', () => {
      const clubWithNightLightRule: ClubData = {
        ...baseClub,
        priceRules: [
          {
            id: 'rule-day',
            courtId: 'court-padel-1',
            name: 'Diurno sin luz',
            dayOfWeek: [1, 2, 3, 4, 5, 6, 0],
            timeFrom: '08:00',
            timeTo: '18:00',
            priceArs: 20000,
            depositPct: 50,
          },
          {
            id: 'rule-night',
            courtId: 'court-padel-1',
            name: 'Nocturno con luz artificial',
            dayOfWeek: [1, 2, 3, 4, 5, 6, 0],
            timeFrom: '18:00',
            timeTo: '24:00',
            priceArs: 30000,
            depositPct: 50,
          },
        ],
      }

      // Slot de 17:00 a 18:30 (cruza la frontera de las 18:00 donde encienden las luces del club)
      const slots = generateClubSlots(clubWithNightLightRule, 'PADEL', '2026-10-28')
      const crossSlot = slots.find((s) => s.time === '17:00')

      expect(crossSlot).toBeDefined()
      // Debe liquidar a la tarifa nocturna ($30.000) para cubrir el costo eléctrico de iluminación
      expect(crossSlot?.totalPrice).toBe(30000)
      expect(crossSlot?.depositPrice).toBe(15000)
    })

    it('charges the normal daytime rate if slot completes strictly before lighting boundary', () => {
      const clubWithNightLightRule: ClubData = {
        ...baseClub,
        priceRules: [
          {
            id: 'rule-day',
            courtId: 'court-padel-1',
            name: 'Diurno sin luz',
            dayOfWeek: [1, 2, 3, 4, 5, 6, 0],
            timeFrom: '08:00',
            timeTo: '18:00',
            priceArs: 20000,
            depositPct: 50,
          },
          {
            id: 'rule-night',
            courtId: 'court-padel-1',
            name: 'Nocturno con luz artificial',
            dayOfWeek: [1, 2, 3, 4, 5, 6, 0],
            timeFrom: '18:00',
            timeTo: '24:00',
            priceArs: 30000,
            depositPct: 50,
          },
        ],
      }

      // Slot de 14:00 a 15:30 (plenamente diurno)
      const slots = generateClubSlots(clubWithNightLightRule, 'PADEL', '2026-10-28')
      const daytimeSlot = slots.find((s) => s.time === '14:00')

      expect(daytimeSlot).toBeDefined()
      expect(daytimeSlot?.totalPrice).toBe(20000)
      expect(daytimeSlot?.depositPrice).toBe(10000)
    })
  })

  describe('2. Weekend & Day-of-Week Normalization (Sunday 0 vs 7)', () => {
    it('correctly matches Sunday price rules when stored as ISO 7 in database', () => {
      const clubWithIsoSundayRule: ClubData = {
        ...baseClub,
        priceRules: [
          {
            id: 'rule-weekday',
            courtId: null,
            name: 'Lunes a Viernes',
            dayOfWeek: [1, 2, 3, 4, 5],
            timeFrom: '14:00',
            timeTo: '23:30',
            priceArs: 22000,
            depositPct: 50,
          },
          {
            id: 'rule-sunday-iso',
            courtId: null,
            name: 'Domingo Especial (ISO 7)',
            dayOfWeek: [7], // En PostgreSQL check constraint es 7
            timeFrom: '14:00',
            timeTo: '23:30',
            priceArs: 28000,
            depositPct: 40,
          },
        ],
      }

      // 2026-11-01 es Domingo (getDay() === 0 en JS)
      const sundaySlots = generateClubSlots(clubWithIsoSundayRule, 'PADEL', '2026-11-01')
      const targetSlot = sundaySlots.find((s) => s.time === '17:00')

      expect(targetSlot).toBeDefined()
      // Debe coincidir con la regla de Domingo aunque esté guardada como 7 en BD
      expect(targetSlot?.totalPrice).toBe(28000)
      expect(targetSlot?.depositPrice).toBe(Math.round(28000 * 0.4))
    })

    it('correctly matches Sunday price rules when stored as JS 0', () => {
      const clubWithJsSundayRule: ClubData = {
        ...baseClub,
        priceRules: [
          {
            id: 'rule-sunday-js',
            courtId: null,
            name: 'Domingo Especial (JS 0)',
            dayOfWeek: [0],
            timeFrom: '14:00',
            timeTo: '23:30',
            priceArs: 29000,
            depositPct: 50,
          },
        ],
      }

      // 2026-11-01 es Domingo
      const sundaySlots = generateClubSlots(clubWithJsSundayRule, 'PADEL', '2026-11-01')
      const targetSlot = sundaySlots.find((s) => s.time === '17:00')

      expect(targetSlot).toBeDefined()
      expect(targetSlot?.totalPrice).toBe(29000)
    })

    it('does not leak Sunday rules into Saturday or Monday', () => {
      const clubWithSundayRule: ClubData = {
        ...baseClub,
        priceRules: [
          {
            id: 'rule-sunday',
            courtId: null,
            name: 'Domingo Solamente',
            dayOfWeek: [7],
            timeFrom: '14:00',
            timeTo: '23:30',
            priceArs: 35000,
            depositPct: 50,
          },
          {
            id: 'rule-saturday',
            courtId: null,
            name: 'Sábado Solamente',
            dayOfWeek: [6],
            timeFrom: '14:00',
            timeTo: '23:30',
            priceArs: 26000,
            depositPct: 50,
          },
        ],
      }

      // 2026-10-31 es Sábado (getDay() === 6)
      const saturdaySlots = generateClubSlots(clubWithSundayRule, 'PADEL', '2026-10-31')
      const satSlot = saturdaySlots.find((s) => s.time === '17:00')
      expect(satSlot?.totalPrice).toBe(26000)

      // 2026-11-02 es Lunes (getDay() === 1)
      const mondaySlots = generateClubSlots(clubWithSundayRule, 'PADEL', '2026-11-02')
      const monSlot = mondaySlots.find((s) => s.time === '17:00')
      // No coincide ni sábado ni domingo -> usa precio base de la cancha
      expect(monSlot?.totalPrice).toBe(20000)
    })
  })

  describe('3. Court-Specific vs All-Court Precedence', () => {
    it('prioritizes specific court rate over generic all-court rate', () => {
      const clubWithCourtPrecedence: ClubData = {
        ...baseClub,
        courts: [
          {
            id: 'court-premium',
            name: 'Cancha Central Panorámica',
            sport: 'PADEL',
            features: ['Panorámica', 'WPT'],
            pricePerHour: 25000,
            depositPercentage: 0.5,
            slotDurationMinutes: 90,
          },
          {
            id: 'court-standard',
            name: 'Cancha Standard',
            sport: 'PADEL',
            features: ['Muro'],
            pricePerHour: 20000,
            depositPercentage: 0.5,
            slotDurationMinutes: 90,
          },
        ],
        priceRules: [
          {
            id: 'rule-all-courts',
            courtId: null, // Aplica a todas
            name: 'Tarifa General',
            dayOfWeek: [1, 2, 3, 4, 5],
            timeFrom: '14:00',
            timeTo: '23:30',
            priceArs: 22000,
            depositPct: 50,
          },
          {
            id: 'rule-premium-court',
            courtId: 'court-premium', // Específica
            name: 'Tarifa Panorámica Premium',
            dayOfWeek: [1, 2, 3, 4, 5],
            timeFrom: '14:00',
            timeTo: '23:30',
            priceArs: 32000,
            depositPct: 50,
          },
        ],
      }

      const slots = generateClubSlots(clubWithCourtPrecedence, 'PADEL', '2026-10-28')

      // Cancha 1 (courtIndex 0) empieza a las 14:00
      const premiumSlot = slots.find((s) => s.courtId === 'court-premium' && s.time === '14:00')
      // Cancha 2 (courtIndex 1) tiene escalonamiento de 30 min para flujo parejo -> 14:30
      const standardSlot = slots.find((s) => s.courtId === 'court-standard' && s.time === '14:30')

      expect(premiumSlot).toBeDefined()
      expect(premiumSlot?.totalPrice).toBe(32000)

      expect(standardSlot).toBeDefined()
      expect(standardSlot?.totalPrice).toBe(22000)
    })
  })
})
