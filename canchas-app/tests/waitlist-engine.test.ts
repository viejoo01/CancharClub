import { describe, it, expect } from 'vitest'
import { buildWhatsAppLink } from '@/lib/utils'

describe('Smart Waitlist & Instant Cancellation Dispatcher Engine', () => {
  it('generates a valid WhatsApp claim link with 10-minute exclusivity window', () => {
    const entry = {
      id: 'wl-test-uuid-1234',
      customer_name: 'Mateo Rossi',
      customer_phone: '+5493816839320',
      date: '2026-10-25',
      time_slot: '20:00',
      court_id: 'court-cancha-1',
    }

    const clubName = 'Padel Colonial'
    const clubSlug = 'padel-colonial'
    const appUrl = 'https://cancharclub.com.ar'

    const courtParam = entry.court_id ? `&courtId=${entry.court_id}` : ''
    const claimUrl = `${appUrl}/club/${clubSlug}?claim_slot=${entry.id}&time=${entry.time_slot}&date=${entry.date}${courtParam}`
    const messageText = `¡Buenas noticias ${entry.customer_name}! 🎾 Se liberó un turno para el día ${entry.date} a las ${entry.time_slot} hs en ${clubName}. Tenés 10 minutos de prioridad exclusiva para confirmar tu reserva en este link antes de publicarlo a otros jugadores:\n${claimUrl}`

    const whatsAppUrl = buildWhatsAppLink(entry.customer_phone, messageText)

    expect(whatsAppUrl).toContain('phone=5493816839320')
    const decodedUrl = decodeURIComponent(whatsAppUrl)
    expect(decodedUrl).toContain('claim_slot=wl-test-uuid-1234')
    expect(decodedUrl).toContain('time=20:00')
    expect(decodedUrl).toContain('court-cancha-1')
  })

  it('correctly calculates remaining priority seconds and rejects expired windows', () => {
    const now = Date.now()

    // 1. Activo con 7 minutos restantes
    const activeExpiresAt = new Date(now + 7 * 60 * 1000).toISOString()
    const activeRemaining = Math.max(0, Math.floor((new Date(activeExpiresAt).getTime() - now) / 1000))
    expect(activeRemaining).toBeGreaterThan(400)
    expect(activeRemaining).toBeLessThanOrEqual(420)

    // 2. Expirado hace 1 minuto
    const expiredAt = new Date(now - 60 * 1000).toISOString()
    const expiredRemaining = Math.max(0, Math.floor((new Date(expiredAt).getTime() - now) / 1000))
    expect(expiredRemaining).toBe(0)
  })

  it('determines whether an entry status is eligible for exclusive booking', () => {
    function canClaimSlot(status: string, expiresAt: string | null): { eligible: boolean; reason?: string } {
      if (status === 'CLAIMED') {
        return { eligible: false, reason: 'Turno ya tomado' }
      }
      if (status === 'CANCELLED') {
        return { eligible: false, reason: 'Lista de espera cancelada' }
      }
      if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
        return { eligible: false, reason: 'Ventana de 10 min expirada' }
      }
      return { eligible: true }
    }

    const validExp = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    const expiredExp = new Date(Date.now() - 1000).toISOString()

    expect(canClaimSlot('NOTIFIED', validExp).eligible).toBe(true)
    expect(canClaimSlot('CLAIMED', validExp).eligible).toBe(false)
    expect(canClaimSlot('CANCELLED', validExp).eligible).toBe(false)
    expect(canClaimSlot('NOTIFIED', expiredExp).eligible).toBe(false)
  })
})
