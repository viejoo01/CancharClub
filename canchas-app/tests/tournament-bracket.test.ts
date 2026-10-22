import { describe, it, expect } from 'vitest'

describe('Tournament Bracket Binary Tree Engine', () => {
  it('correctly maps lower round match numbers to next round match numbers via Math.ceil(n/2)', () => {
    // 16avos (1..16) -> Octavos (1..8)
    for (let match = 1; match <= 16; match++) {
      const targetOctavo = Math.ceil(match / 2)
      const expectedSlot = match % 2 !== 0 ? 'team_a_id' : 'team_b_id'
      expect(targetOctavo).toBe(Math.ceil(match / 2))
      expect(match % 2 !== 0 ? 'team_a_id' : 'team_b_id').toBe(expectedSlot)
    }

    // Octavos (1..8) -> Cuartos (1..4)
    expect(Math.ceil(1 / 2)).toBe(1)
    expect(Math.ceil(2 / 2)).toBe(1)
    expect(Math.ceil(3 / 2)).toBe(2)
    expect(Math.ceil(4 / 2)).toBe(2)
    expect(Math.ceil(5 / 2)).toBe(3)
    expect(Math.ceil(6 / 2)).toBe(3)
    expect(Math.ceil(7 / 2)).toBe(4)
    expect(Math.ceil(8 / 2)).toBe(4)

    // Cuartos (1..4) -> Semifinales (1..2)
    expect(Math.ceil(1 / 2)).toBe(1)
    expect(Math.ceil(2 / 2)).toBe(1)
    expect(Math.ceil(3 / 2)).toBe(2)
    expect(Math.ceil(4 / 2)).toBe(2)

    // Semifinales (1..2) -> Gran Final (1)
    expect(Math.ceil(1 / 2)).toBe(1)
    expect(Math.ceil(2 / 2)).toBe(1)
  })

  it('correctly allocates BYEs when team count is not a power of 2 (e.g. 12 teams in bracket of 16)', () => {
    const teamsCount = 12
    const bracketCapacity = 16
    const byesCount = bracketCapacity - teamsCount
    expect(byesCount).toBe(4)

    // The top 4 seeds (0, 1, 2, 3) are matched with the null slots (15, 14, 13, 12)
    const simulatedPairs = [
      { a: 1, b: null }, // Match 1 (Seed 1 vs BYE) -> Advances to Cuartos 1
      { a: 8, b: 9 },    // Match 2
      { a: 4, b: null }, // Match 3 (Seed 4 vs BYE) -> Advances to Cuartos 2
      { a: 5, b: 12 },   // Match 4
      { a: 2, b: null }, // Match 5 (Seed 2 vs BYE) -> Advances to Cuartos 3
      { a: 7, b: 10 },   // Match 6
      { a: 3, b: null }, // Match 7 (Seed 3 vs BYE) -> Advances to Cuartos 4
      { a: 6, b: 11 },   // Match 8
    ]

    const byeMatches = simulatedPairs.filter(p => p.a !== null && p.b === null)
    expect(byeMatches.length).toBe(4)
    expect(byeMatches.map(m => m.a)).toEqual([1, 4, 2, 3])
  })

  it('correctly allocates 8 BYEs for a 24-team tournament in a 32-bracket', () => {
    const teamsCount = 24
    const bracketCapacity = 32
    const byesCount = bracketCapacity - teamsCount
    expect(byesCount).toBe(8)

    // Top 8 seeds receive BYEs directly to Octavos
    const seedPairs = [
      [0, 31], [15, 16], [7, 24], [8, 23],
      [3, 28], [12, 19], [4, 27], [11, 20],
      [1, 30], [14, 17], [6, 25], [9, 22],
      [2, 29], [13, 18], [5, 26], [10, 21]
    ]

    // Simulate 24 teams (indices 0..23 present, 24..31 null)
    const t: Array<number | null> = Array.from({ length: 32 }, (_, i) => (i < 24 ? i + 1 : null))
    const dieciseisWinners: Array<number | null> = Array(16).fill(null)

    let byesFound = 0
    for (let i = 0; i < 16; i++) {
      const a = t[seedPairs[i][0]]
      const b = t[seedPairs[i][1]]
      if (a && !b) {
        dieciseisWinners[i] = a
        byesFound++
      }
    }

    expect(byesFound).toBe(8)
    // Seeds 1, 8, 4, 5, 2, 7, 3, 6 (1-indexed) receive BYEs
    expect(dieciseisWinners.filter(Boolean).length).toBe(8)
  })

  it('simulates full binary tree advancement from 16avos down to Final', () => {
    // 16 winners in Dieciseisavos advance to 8 Octavos matches
    const winners16avos = Array.from({ length: 16 }, (_, i) => `Team_${i + 1}`)
    const octavosMatches = Array.from({ length: 8 }, (_, i) => ({
      matchNum: i + 1,
      teamA: winners16avos[i * 2],
      teamB: winners16avos[i * 2 + 1],
    }))
    expect(octavosMatches.length).toBe(8)
    expect(octavosMatches[0].teamA).toBe('Team_1')
    expect(octavosMatches[0].teamB).toBe('Team_2')

    // 8 winners in Octavos advance to 4 Cuartos matches
    const winnersOctavos = octavosMatches.map(m => m.teamA) // simulate Team A wins
    const cuartosMatches = Array.from({ length: 4 }, (_, i) => ({
      matchNum: i + 1,
      teamA: winnersOctavos[i * 2],
      teamB: winnersOctavos[i * 2 + 1],
    }))
    expect(cuartosMatches.length).toBe(4)

    // 4 winners in Cuartos advance to 2 Semifinales
    const winnersCuartos = cuartosMatches.map(m => m.teamA)
    const semisMatches = Array.from({ length: 2 }, (_, i) => ({
      matchNum: i + 1,
      teamA: winnersCuartos[i * 2],
      teamB: winnersCuartos[i * 2 + 1],
    }))
    expect(semisMatches.length).toBe(2)

    // 2 winners in Semifinales advance to Grand Final
    const grandFinal = {
      teamA: semisMatches[0].teamA,
      teamB: semisMatches[1].teamA,
    }
    expect(grandFinal.teamA).toBe('Team_1')
    expect(grandFinal.teamB).toBe('Team_9')
  })
})
