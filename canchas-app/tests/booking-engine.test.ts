import { describe, it, expect } from 'vitest'
import {
  timeStringToMinutes,
  minutesToTimeString,
  generateTimeSlots,
} from '@/lib/time-slots'
import {
  slotDurationToMinutes,
  computeEndsAt,
  bookingStatusLabel,
} from '@/lib/utils'

describe('Booking Engine & Time Slot Architecture', () => {
  describe('Time String & Minute Conversions', () => {
    it('accurately converts HH:mm string to minutes from midnight', () => {
      expect(timeStringToMinutes('00:00')).toBe(0)
      expect(timeStringToMinutes('08:30')).toBe(8 * 60 + 30) // 510
      expect(timeStringToMinutes('14:45')).toBe(14 * 60 + 45) // 885
      expect(timeStringToMinutes('23:59')).toBe(23 * 60 + 59) // 1439
      expect(timeStringToMinutes('')).toBe(0)
    })

    it('accurately converts minutes back to normalized HH:mm string', () => {
      expect(minutesToTimeString(0)).toBe('00:00')
      expect(minutesToTimeString(510)).toBe('08:30')
      expect(minutesToTimeString(885)).toBe('14:45')
      expect(minutesToTimeString(1439)).toBe('23:59')
      // Edge case: overflow past 24h wraps safely
      expect(minutesToTimeString(1440)).toBe('00:00')
      expect(minutesToTimeString(1500)).toBe('01:00')
    })
  })

  describe('Dynamic Club Schedule Slot Generation', () => {
    it('generates strictly bounded slots within opening and closing times', () => {
      const slots = generateTimeSlots('14:00', '16:00', 30)
      expect(slots).toEqual(['14:00', '14:30', '15:00', '15:30', '16:00'])
      expect(slots.length).toBe(5)
    })

    it('handles midnight-crossing schedules (e.g. opens 22:00, closes 01:00 AM)', () => {
      const slots = generateTimeSlots('22:00', '01:00', 60)
      expect(slots).toEqual(['22:00', '23:00', '00:00', '01:00'])
    })
  })

  describe('Slot Duration & EndsAt Computation', () => {
    it('correctly maps SlotDuration enum to minute values', () => {
      expect(slotDurationToMinutes('MIN_60')).toBe(60)
      expect(slotDurationToMinutes('MIN_90')).toBe(90)
      expect(slotDurationToMinutes('MIN_120')).toBe(120)
    })

    it('accurately calculates ends_at ISO timestamp given starts_at and duration', () => {
      const startsAt = '2026-10-21T18:00:00.000Z'
      const ends60 = computeEndsAt(startsAt, 'MIN_60')
      const ends90 = computeEndsAt(startsAt, 'MIN_90')
      const ends120 = computeEndsAt(startsAt, 'MIN_120')

      expect(new Date(ends60).getTime() - new Date(startsAt).getTime()).toBe(60 * 60 * 1000)
      expect(new Date(ends90).getTime() - new Date(startsAt).getTime()).toBe(90 * 60 * 1000)
      expect(new Date(ends120).getTime() - new Date(startsAt).getTime()).toBe(120 * 60 * 1000)
    })
  })

  describe('Booking Conflict Detection & Overlap Rules', () => {
    interface Interval {
      start: number
      end: number
    }

    function hasConflict(existing: Interval, candidate: Interval): boolean {
      // Overlap rule: candidate starts before existing ends AND candidate ends after existing starts
      return candidate.start < existing.end && candidate.end > existing.start
    }

    it('detects direct overlapping bookings on the same court', () => {
      const existing = { start: 600, end: 660 } // 10:00 - 11:00

      // Exact match
      expect(hasConflict(existing, { start: 600, end: 660 })).toBe(true)
      // Inside existing
      expect(hasConflict(existing, { start: 615, end: 645 })).toBe(true)
      // Starts before, ends inside
      expect(hasConflict(existing, { start: 570, end: 630 })).toBe(true)
      // Starts inside, ends after
      expect(hasConflict(existing, { start: 630, end: 690 })).toBe(true)
      // Completely encloses existing
      expect(hasConflict(existing, { start: 540, end: 720 })).toBe(true)
    })

    it('allows contiguous non-overlapping bookings (back-to-back matches)', () => {
      const existing = { start: 600, end: 660 } // 10:00 - 11:00

      // Immediately preceding (ends exactly when existing starts)
      expect(hasConflict(existing, { start: 540, end: 600 })).toBe(false)
      // Immediately following (starts exactly when existing ends)
      expect(hasConflict(existing, { start: 660, end: 720 })).toBe(false)
      // Distinct later slot
      expect(hasConflict(existing, { start: 720, end: 780 })).toBe(false)
    })
  })

  describe('Booking Lifecycle Statuses', () => {
    it('has human-readable labels for all critical booking states', () => {
      expect(bookingStatusLabel('SLOT_LOCKED')).toBe('Bloqueado (checkout)')
      expect(bookingStatusLabel('PENDING_DEPOSIT')).toBe('Seña pendiente')
      expect(bookingStatusLabel('DEPOSIT_PAID')).toBe('Seña abonada')
      expect(bookingStatusLabel('FULLY_PAID')).toBe('Pagado')
      expect(bookingStatusLabel('RAIN_CANCELLED')).toBe('Suspendido por lluvia')
    })
  })
})
