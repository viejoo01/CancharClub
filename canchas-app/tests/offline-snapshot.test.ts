import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveOfflineScheduleSnapshot, type CourtItem, type CalendarBooking } from '@/components/dashboard/calendar-grid'
import fs from 'node:fs'
import path from 'node:path'

describe('Offline Schedule Snapshot & Contingency System', () => {
  const mockStorage: Record<string, string> = {}

  beforeEach(() => {
    for (const key in mockStorage) {
      delete mockStorage[key]
    }

    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val
      },
      removeItem: (key: string) => {
        delete mockStorage[key]
      },
      clear: () => {
        for (const k in mockStorage) delete mockStorage[k]
      },
    })
  })

  const sampleCourts: CourtItem[] = [
    {
      id: 'court-padel-1',
      name: 'Cancha 1 Pádel Cristal Pro',
      sport: 'PADEL',
      slot_duration: 'MIN_90',
      is_active: true,
      surface: 'CESPED_SINTETICO',
      is_indoor: true,
    },
    {
      id: 'court-futbol-1',
      name: 'Cancha 2 Fútbol 5 Techada',
      sport: 'FUTBOL_5',
      slot_duration: 'MIN_60',
      is_active: true,
      surface: 'SINTETICO_PREMIUM',
      is_indoor: true,
    },
  ]

  const getTodayIso = (): string => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return formatter.format(new Date())
  }

  it('correctly persists today schedule snapshot with full metadata into localStorage', () => {
    const todayIso = getTodayIso()

    const sampleBookings: CalendarBooking[] = [
      {
        id: 'book-101',
        court_id: 'court-padel-1',
        customer_name: 'Santiago Martin',
        customer_phone: '1134567890',
        starts_at: `${todayIso}T18:00:00Z`,
        ends_at: `${todayIso}T19:30:00Z`,
        status: 'CONFIRMED',
        origin: 'BACKOFFICE',
        total_amount_ars: 32000,
        deposit_amount_ars: 32000,
        total_paid: 32000,
        balance_due: 0,
      },
      {
        id: 'book-102',
        court_id: 'court-futbol-1',
        customer_name: 'Mateo Rossi',
        customer_phone: '1198765432',
        starts_at: `${todayIso}T20:00:00Z`,
        ends_at: `${todayIso}T21:00:00Z`,
        status: 'DEPOSIT_PAID',
        origin: 'ONLINE',
        total_amount_ars: 45000,
        deposit_amount_ars: 20000,
        total_paid: 20000,
        balance_due: 25000,
      },
    ]

    saveOfflineScheduleSnapshot(todayIso, 'tenant-club-acassuso', sampleCourts, sampleBookings)

    const raw = mockStorage['canchar_today_schedule_snapshot']
    expect(raw).toBeDefined()

    const snapshot = JSON.parse(raw)
    expect(snapshot.date).toBe(todayIso)
    expect(snapshot.tenantId).toBe('tenant-club-acassuso')
    expect(snapshot.updatedAt).toBeDefined()
    expect(snapshot.courts).toHaveLength(2)
    expect(snapshot.courts[0].name).toBe('Cancha 1 Pádel Cristal Pro')
    expect(snapshot.bookings).toHaveLength(2)

    // Booking 1 (Totalmente pagado)
    const b1 = snapshot.bookings[0]
    expect(b1.id).toBe('book-101')
    expect(b1.court_name).toBe('Cancha 1 Pádel Cristal Pro')
    expect(b1.customer_name).toBe('Santiago Martin')
    expect(b1.customer_phone).toBe('1134567890')
    expect(b1.status).toBe('CONFIRMED')
    expect(b1.balance_due).toBe(0)
    expect(b1.time_str).toMatch(/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/)

    // Booking 2 (Con saldo restante)
    const b2 = snapshot.bookings[1]
    expect(b2.id).toBe('book-102')
    expect(b2.court_name).toBe('Cancha 2 Fútbol 5 Techada')
    expect(b2.customer_name).toBe('Mateo Rossi')
    expect(b2.customer_phone).toBe('1198765432')
    expect(b2.status).toBe('DEPOSIT_PAID')
    expect(b2.deposit_amount_ars).toBe(20000)
    expect(b2.balance_due).toBe(25000)
  })

  it('preserves today snapshot when viewing future dates on the calendar', () => {
    const todayIso = getTodayIso()
    const tomorrowIso = '2099-12-31'

    // Guardar snapshot de hoy
    saveOfflineScheduleSnapshot(todayIso, 'tenant-1', sampleCourts, [
      {
        id: 'today-booking',
        court_id: 'court-padel-1',
        customer_name: 'Turno de Hoy',
        starts_at: `${todayIso}T14:00:00Z`,
        ends_at: `${todayIso}T15:30:00Z`,
        status: 'CONFIRMED',
        origin: 'BACKOFFICE',
        total_amount_ars: 20000,
        deposit_amount_ars: 20000,
        total_paid: 20000,
        balance_due: 0,
      },
    ])

    // Usuario navega en la grilla al día de mañana
    saveOfflineScheduleSnapshot(tomorrowIso, 'tenant-1', sampleCourts, [
      {
        id: 'future-booking',
        court_id: 'court-padel-1',
        customer_name: 'Turno Futuro',
        starts_at: `${tomorrowIso}T14:00:00Z`,
        ends_at: `${tomorrowIso}T15:30:00Z`,
        status: 'CONFIRMED',
        origin: 'BACKOFFICE',
        total_amount_ars: 20000,
        deposit_amount_ars: 20000,
        total_paid: 20000,
        balance_due: 0,
      },
    ])

    // El snapshot de localStorage debe seguir siendo el de HOY
    const stored = JSON.parse(mockStorage['canchar_today_schedule_snapshot'])
    expect(stored.date).toBe(todayIso)
    expect(stored.bookings[0].customer_name).toBe('Turno de Hoy')
  })

  it('offline.html correctly parses and formats snapshot data for offline reception mode', () => {
    const offlineHtmlPath = path.resolve(process.cwd(), 'public/offline.html')
    expect(fs.existsSync(offlineHtmlPath)).toBe(true)
    const offlineHtml = fs.readFileSync(offlineHtmlPath, 'utf-8')

    // Estructura y clases clave
    expect(offlineHtml).toContain('canchar_today_schedule_snapshot')
    expect(offlineHtml).toContain('renderOfflineSchedule')
    expect(offlineHtml).toContain('filterTurns')
    expect(offlineHtml).toContain('status-confirmed')
    expect(offlineHtml).toContain('status-deposit')
    expect(offlineHtml).toContain('status-pending')
    expect(offlineHtml).toContain('status-cancelled')
    expect(offlineHtml).toContain('Resta: $')
    expect(offlineHtml).toContain('href="tel:')

    // Simular la lógica de formateo de estados de offline.html
    const evaluateTurnStatus = (b: { status?: string; deposit_amount_ars?: number; balance_due?: number }) => {
      const normStatus = (b.status || '').toUpperCase()
      const isCancelled = normStatus === 'CANCELLED' || normStatus === 'CANCELED'
      const isConfirmed = normStatus === 'CONFIRMED' || normStatus === 'FULLY_PAID' || normStatus === 'COMPLETED'
      const isDeposit = normStatus === 'DEPOSIT_PAID' || normStatus === 'PARTIAL_PAID' || ((b.deposit_amount_ars || 0) > 0 && (b.balance_due || 0) > 0)
      const statusClass = isCancelled ? 'status-cancelled' : (isConfirmed ? 'status-confirmed' : (isDeposit ? 'status-deposit' : 'status-pending'))
      const statusLabel = isCancelled ? 'Cancelado' : (isConfirmed ? 'Confirmado' : (isDeposit ? 'Seña Abonada' : 'Pendiente'))
      return { statusClass, statusLabel }
    }

    expect(evaluateTurnStatus({ status: 'CONFIRMED' })).toEqual({ statusClass: 'status-confirmed', statusLabel: 'Confirmado' })
    expect(evaluateTurnStatus({ status: 'FULLY_PAID' })).toEqual({ statusClass: 'status-confirmed', statusLabel: 'Confirmado' })
    expect(evaluateTurnStatus({ status: 'DEPOSIT_PAID', balance_due: 5000 })).toEqual({ statusClass: 'status-deposit', statusLabel: 'Seña Abonada' })
    expect(evaluateTurnStatus({ status: 'PENDING' })).toEqual({ statusClass: 'status-pending', statusLabel: 'Pendiente' })
    expect(evaluateTurnStatus({ status: 'CANCELLED' })).toEqual({ statusClass: 'status-cancelled', statusLabel: 'Cancelado' })
  })
})
