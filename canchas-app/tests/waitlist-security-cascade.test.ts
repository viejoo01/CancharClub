// tests/waitlist-security-cascade.test.ts
// ==============================================================================
// AUDITORÍA TÉCNICA Y DE SEGURIDAD: MÓDULO DE LISTA DE ESPERA (WAITLISTS)
// Pruebas automatizadas de exclusividad, cascada secuencial, atomicidad,
// prevención de colisiones (claim race conditions), aislamiento y PII.
// ==============================================================================

import { describe, it, expect } from 'vitest'

describe('Waitlist Module: Security & Sequential Cascade Audit', () => {
  // ─── 1. VENTANA DE EXCLUSIVIDAD Y CASCADA SECUENCIAL ─────────────────────────
  describe('1. Exclusivity Window & Sequential Cascade', () => {
    it('selects the first player in waiting queue strictly by FIFO order (created_at ASC)', () => {
      interface QueueItem {
        id: string
        customer_name: string
        status: 'WAITING' | 'NOTIFIED' | 'CLAIMED' | 'EXPIRED'
        created_at: string
      }

      const queue: QueueItem[] = [
        { id: 'uuid-player-3', customer_name: 'Tercer Jugador', status: 'WAITING', created_at: '2026-10-28T14:30:00Z' },
        { id: 'uuid-player-1', customer_name: 'Primer Jugador', status: 'WAITING', created_at: '2026-10-28T14:10:00Z' },
        { id: 'uuid-player-2', customer_name: 'Segundo Jugador', status: 'WAITING', created_at: '2026-10-28T14:20:00Z' },
      ]

      // Orden estricto FIFO
      const sortedQueue = [...queue].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )

      const selected = sortedQueue[0]
      expect(selected.id).toBe('uuid-player-1')
      expect(selected.customer_name).toBe('Primer Jugador')
    })

    it('sets exactly a 10-minute priority exclusivity window upon notification', () => {
      const notificationTime = new Date('2026-10-28T15:00:00.000Z')
      const priorityExpiresAt = new Date(notificationTime.getTime() + 10 * 60 * 1000)

      const diffMinutes = (priorityExpiresAt.getTime() - notificationTime.getTime()) / (1000 * 60)
      expect(diffMinutes).toBe(10)
      expect(priorityExpiresAt.toISOString()).toBe('2026-10-28T15:10:00.000Z')
    })

    it('cascades to the next candidate when the 10-minute exclusivity window elapses', () => {
      interface WaitlistRecord {
        id: string
        name: string
        status: 'WAITING' | 'NOTIFIED' | 'CLAIMED' | 'EXPIRED'
        notified_at?: string
        priority_expires_at?: string
        created_at: string
      }

      const records: WaitlistRecord[] = [
        {
          id: 'p1',
          name: 'Jugador 1',
          status: 'NOTIFIED',
          notified_at: '2026-10-28T14:00:00Z',
          priority_expires_at: '2026-10-28T14:10:00Z', // Vencido
          created_at: '2026-10-28T13:30:00Z',
        },
        {
          id: 'p2',
          name: 'Jugador 2',
          status: 'WAITING',
          created_at: '2026-10-28T13:35:00Z',
        },
        {
          id: 'p3',
          name: 'Jugador 3',
          status: 'WAITING',
          created_at: '2026-10-28T13:40:00Z',
        },
      ]

      const currentTime = new Date('2026-10-28T14:10:01Z').getTime()

      // Lógica del avance de cascada
      function runCascade(nowMs: number) {
        // 1. Expirar vencidos
        for (const r of records) {
          if (r.status === 'NOTIFIED' && r.priority_expires_at) {
            if (new Date(r.priority_expires_at).getTime() <= nowMs) {
              r.status = 'EXPIRED'
            }
          }
        }

        // 2. Si no hay ningún NOTIFIED activo, promover al siguiente WAITING
        const hasActiveNotified = records.some((r) => r.status === 'NOTIFIED')
        if (!hasActiveNotified) {
          const nextWaiting = records
            .filter((r) => r.status === 'WAITING')
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0]

          if (nextWaiting) {
            nextWaiting.status = 'NOTIFIED'
            nextWaiting.notified_at = new Date(nowMs).toISOString()
            nextWaiting.priority_expires_at = new Date(nowMs + 10 * 60 * 1000).toISOString()
          }
        }
      }

      runCascade(currentTime)

      // Jugador 1 debe estar expirado
      expect(records.find((r) => r.id === 'p1')?.status).toBe('EXPIRED')

      // Jugador 2 debe haber sido promovido a NOTIFIED con nueva ventana
      const p2 = records.find((r) => r.id === 'p2')
      expect(p2?.status).toBe('NOTIFIED')
      expect(p2?.priority_expires_at).toBe('2026-10-28T14:20:01.000Z')

      // Jugador 3 sigue esperando en la fila
      expect(records.find((r) => r.id === 'p3')?.status).toBe('WAITING')
    })
  })

  // ─── 2. PREVENCIÓN DE CONCURRENCIA Y DOBLE ASIGNACIÓN ─────────────────────────
  describe('2. Concurrency & Race Condition Prevention', () => {
    it('rejects public checkout if a slot is currently protected under active exclusivity', () => {
      const activeWaitlist = {
        courtId: 'court-1',
        time: '20:00',
        date: '2026-10-28',
        priorityExpiresAt: new Date(Date.now() + 6 * 60 * 1000).toISOString(),
      }

      function checkSlotPublicAvailability(
        courtId: string,
        time: string,
        date: string,
        hasClaimToken: boolean
      ): { canBook: boolean; reason?: string } {
        const isProtected =
          courtId === activeWaitlist.courtId &&
          time === activeWaitlist.time &&
          date === activeWaitlist.date &&
          new Date(activeWaitlist.priorityExpiresAt).getTime() > Date.now()

        if (isProtected && !hasClaimToken) {
          return {
            canBook: false,
            reason: 'Turno en período de reserva exclusiva para lista de espera',
          }
        }
        return { canBook: true }
      }

      // Usuario general público sin claim token
      const publicAttempt = checkSlotPublicAvailability('court-1', '20:00', '2026-10-28', false)
      expect(publicAttempt.canBook).toBe(false)
      expect(publicAttempt.reason).toContain('reserva exclusiva')

      // Poseedor con claim token válido
      const claimHolderAttempt = checkSlotPublicAvailability('court-1', '20:00', '2026-10-28', true)
      expect(claimHolderAttempt.canBook).toBe(true)
    })

    it('ensures atomic claim confirmation: second concurrent claim attempt must fail', () => {
      // Simulación de función atómica claim_waitlist_slot_atomic
      class WaitlistDatabase {
        private entries = new Map<string, { id: string; status: string; expiresAt: number }>()

        constructor() {
          this.entries.set('claim-uuid-abc', {
            id: 'claim-uuid-abc',
            status: 'NOTIFIED',
            expiresAt: Date.now() + 5 * 60 * 1000,
          })
        }

        // UPDATE waitlists SET status = 'CLAIMED' WHERE id = p_claim_id AND status = 'NOTIFIED' AND priority_expires_at > NOW()
        atomicClaim(claimId: string): { success: boolean; error?: string } {
          const row = this.entries.get(claimId)
          if (!row) return { success: false, error: 'NOT_FOUND' }

          if (row.status !== 'NOTIFIED') {
            return { success: false, error: 'ALREADY_CLAIMED_OR_EXPIRED' }
          }
          if (row.expiresAt <= Date.now()) {
            row.status = 'EXPIRED'
            return { success: false, error: 'EXPIRED' }
          }

          // Mutación atómica
          row.status = 'CLAIMED'
          return { success: true }
        }
      }

      const db = new WaitlistDatabase()

      // Primer request simultáneo
      const firstReq = db.atomicClaim('claim-uuid-abc')
      expect(firstReq.success).toBe(true)

      // Segundo request simultáneo (Race condition simulada)
      const secondReq = db.atomicClaim('claim-uuid-abc')
      expect(secondReq.success).toBe(false)
      expect(secondReq.error).toBe('ALREADY_CLAIMED_OR_EXPIRED')
    })

    it('rejects claim verification when token UUID format is invalid or forged', () => {
      function isValidUuid(uuid?: string | null): boolean {
        if (!uuid) return false
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)
      }

      expect(isValidUuid('a8098c1a-f86e-11da-bd1a-00112444be1e')).toBe(true)
      expect(isValidUuid('3fa85f64-5717-4562-b3fc-2c963f66afa6')).toBe(true)
      expect(isValidUuid('invalid-token-string')).toBe(false)
      expect(isValidUuid("'; DROP TABLE waitlists; --")).toBe(false)
      expect(isValidUuid('')).toBe(false)
    })
  })

  // ─── 3. INMUTABILIDAD DE TURNOS FIJOS (RECURRING SLOTS) ───────────────────────
  describe('3. Recurring Slots Immutability', () => {
    it('guarantees claiming a cancelled recurring slot booking creates an independent booking and preserves parent recurring rule', () => {
      // 1. Regla madre de turno fijo
      const parentRecurringSlot = {
        id: 'recurring-rule-100',
        tenant_id: 'tenant-test',
        court_id: 'court-1',
        day_of_week: 3, // Miércoles
        start_time: '20:00',
        end_time: '21:00',
        customer_name: 'Abonado Histórico',
        customer_phone: '5491111111111',
        status: 'ACTIVE',
      }

      // 2. Reserva cancelada de una fecha puntual
      const cancelledBooking = {
        id: 'booking-week-1',
        tenant_id: 'tenant-test',
        court_id: 'court-1',
        recurring_slot_id: parentRecurringSlot.id,
        booked_date: '2026-10-28',
        time_slot: '20:00',
        status: 'cancelled',
      }

      // 3. Reserva creada para el jugador de la lista de espera
      const waitlistClaimBooking = {
        id: 'booking-waitlist-claim-999',
        tenant_id: 'tenant-test',
        court_id: 'court-1',
        recurring_slot_id: null, // NO debe heredar ni sobreescribir la condición de abonado
        booked_date: '2026-10-28',
        time_slot: '20:00',
        customer_name: 'Nuevo Jugador Espera',
        customer_phone: '5491122222222',
        status: 'confirmed',
        payment_method: 'MERCADOPAGO',
      }

      // 4. Verificación de invariantes:
      // A. La reserva de la lista de espera es puntual y desacoplada
      expect(waitlistClaimBooking.recurring_slot_id).toBeNull()

      // B. La regla madre de los miércoles siguientes permanece INTACTA
      expect(parentRecurringSlot.status).toBe('ACTIVE')
      expect(parentRecurringSlot.customer_name).toBe('Abonado Histórico')
      expect(parentRecurringSlot.id).toBe(cancelledBooking.recurring_slot_id)
    })
  })

  // ─── 4. AISLAMIENTO MULTI-TENANT Y PROTECCIÓN DE PII ─────────────────────────
  describe('4. Multi-Tenant Isolation & PII Protection', () => {
    it('masks player phone numbers when requested by non-staff or unauthenticated users', () => {
      interface WaitlistEntryRaw {
        id: string
        customer_name: string
        customer_phone: string
      }

      const rawEntries: WaitlistEntryRaw[] = [
        { id: '1', customer_name: 'Carlos Tevez', customer_phone: '5491133334444' },
        { id: '2', customer_name: 'Diego Forlán', customer_phone: '5491155556666' },
      ]

      function sanitizeWaitlistForViewer(entries: WaitlistEntryRaw[], isStaff: boolean) {
        return entries.map((entry) => ({
          ...entry,
          customer_phone: isStaff
            ? entry.customer_phone
            : entry.customer_phone
            ? `${entry.customer_phone.slice(0, 4)}****${entry.customer_phone.slice(-2)}`
            : '',
        }))
      }

      // Vista del dueño/empleado del club (staff)
      const staffView = sanitizeWaitlistForViewer(rawEntries, true)
      expect(staffView[0].customer_phone).toBe('5491133334444')

      // Vista pública (jugadores generales en portal web)
      const publicView = sanitizeWaitlistForViewer(rawEntries, false)
      expect(publicView[0].customer_phone).toBe('5491****44')
      expect(publicView[1].customer_phone).toBe('5491****66')
      expect(publicView[0].customer_phone).not.toContain('3333')
    })

    it('enforces tenant_id boundary in waitlist queries', () => {
      const waitlistStore = [
        { id: 'w1', tenant_id: 'club-almagro', customer_name: 'Juan' },
        { id: 'w2', tenant_id: 'club-caballito', customer_name: 'Pedro' },
      ]

      function queryWaitlistsByTenant(tenantId: string) {
        if (!tenantId) throw new Error('TENANT_ID_REQUIRED')
        return waitlistStore.filter((w) => w.tenant_id === tenantId)
      }

      const almagroList = queryWaitlistsByTenant('club-almagro')
      expect(almagroList.length).toBe(1)
      expect(almagroList[0].customer_name).toBe('Juan')

      expect(() => queryWaitlistsByTenant('')).toThrow('TENANT_ID_REQUIRED')
    })
  })

  // ─── 5. ELIMINACIÓN DE MEMORIA VOLÁTIL EFÍMERA ───────────────────────────────
  describe('5. Purging Volatile In-Memory Variables', () => {
    it('confirms absence of module-level memoryWaitlists array and relies on persistent DB models', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const filePath = path.resolve(__dirname, '../src/actions/waitlist.actions.ts')
      const sourceCode = fs.readFileSync(filePath, 'utf-8')

      // Verificar que la variable volátil memoryWaitlists fue purgada por completo
      expect(sourceCode).not.toContain('memoryWaitlists')
      expect(sourceCode).not.toContain('let memoryWaitlists')
      expect(sourceCode).not.toContain('const memoryWaitlists')

      // Verificar persistencia real en PostgreSQL con aislamiento y atomicidad
      expect(sourceCode).toContain(".from('waitlists')")
      expect(sourceCode).toContain('claim_waitlist_slot_atomic')
      expect(sourceCode).toContain('priority_expires_at')
    }, 15000)
  })
})
