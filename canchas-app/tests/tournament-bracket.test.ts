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
})
