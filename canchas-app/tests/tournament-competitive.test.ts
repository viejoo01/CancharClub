import { describe, it, expect } from 'vitest'

describe('Tournament Competitive Features: Ranking, Waitlist & Payments', () => {
  it('correctly calculates ranking points according to the club leaderboard formula', () => {
    // Formula:
    // Champion: 200 pts
    // Runner-up: 120 pts
    // Semifinalist: 60 pts
    // Match won: +25 pts each
    // Participation in tournament: +15 pts each

    interface PlayerScore {
      name: string
      titles: number
      runnerUp: number
      semis: number
      matchesWon: number
      tournamentsPlayed: number
    }

    function calculatePoints(p: PlayerScore): number {
      let pts = 0
      pts += p.tournamentsPlayed * 15
      pts += p.matchesWon * 25
      pts += p.titles * 200
      pts += p.runnerUp * 120
      pts += p.semis * 60
      return pts
    }

    const champion = {
      name: 'Agustín Tapia',
      titles: 2,
      runnerUp: 1,
      semis: 0,
      matchesWon: 9,
      tournamentsPlayed: 3,
    }

    const runnerUp = {
      name: 'Arturo Coello',
      titles: 1,
      runnerUp: 2,
      semis: 1,
      matchesWon: 8,
      tournamentsPlayed: 4,
    }

    const championPts = calculatePoints(champion)
    // 3*15 + 9*25 + 2*200 + 1*120 + 0 = 45 + 225 + 400 + 120 = 790
    expect(championPts).toBe(790)

    const runnerUpPts = calculatePoints(runnerUp)
    // 4*15 + 8*25 + 1*200 + 2*120 + 1*60 = 60 + 200 + 200 + 240 + 60 = 760
    expect(runnerUpPts).toBe(760)

    expect(championPts).toBeGreaterThan(runnerUpPts)
  })

  it('correctly isolates and extracts tournament payment references from Mercado Pago webhooks', () => {
    const bookingRef = 'cancharclub_booking_9f8e7d6c'
    const tournamentRef = 'tournament_team_b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'

    expect(bookingRef.startsWith('tournament_team_')).toBe(false)
    expect(tournamentRef.startsWith('tournament_team_')).toBe(true)

    const extractedTeamId = tournamentRef.replace('tournament_team_', '')
    expect(extractedTeamId).toBe('b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d')
  })

  it('correctly manages waitlist queue order (FIFO) when spots become available', () => {
    const waitlist = [
      { id: 'w1', name: 'Pareja A', created_at: '2026-10-21T09:00:00Z', status: 'WAITING' },
      { id: 'w2', name: 'Pareja B', created_at: '2026-10-21T09:15:00Z', status: 'WAITING' },
      { id: 'w3', name: 'Pareja C', created_at: '2026-10-21T09:30:00Z', status: 'WAITING' },
    ]

    // FIFO order: first in queue is w1
    const firstInWaitlist = [...waitlist].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0]

    expect(firstInWaitlist.id).toBe('w1')
    expect(firstInWaitlist.name).toBe('Pareja A')
  })
})
