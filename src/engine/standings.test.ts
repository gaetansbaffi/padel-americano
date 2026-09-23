import { describe, expect, it } from 'vitest';
import { computeStandings } from './standings';

describe('computeStandings', () => {
  it('cumule victoires, points et différence, et trie par points marqués', () => {
    const rows = computeStandings(
      ['A', 'B', 'C', 'D', 'E'],
      [
        { teamA: ['A', 'B'], teamB: ['C', 'D'], score: { a: 15, b: 9 } },
        { teamA: ['A', 'C'], teamB: ['B', 'E'], score: { a: 10, b: 14 } },
        { teamA: ['C', 'E'], teamB: ['A', 'D'] }, // pas encore joué
      ],
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.B).toMatchObject({ played: 2, wins: 2, losses: 0, pointsFor: 29, pointsAgainst: 19, diff: 10 });
    expect(byId.A).toMatchObject({ played: 2, wins: 1, losses: 1, pointsFor: 25, pointsAgainst: 23 });
    expect(byId.D).toMatchObject({ played: 1, wins: 0, losses: 1, pointsFor: 9 });
    expect(rows.map((r) => r.id)).toEqual(['B', 'A', 'C', 'E', 'D']);
    expect(rows[0].rank).toBe(1);
  });

  it('départage par différence puis victoires ; égalité parfaite = même rang', () => {
    const rows = computeStandings(
      ['A', 'B', 'C', 'D'],
      [
        { teamA: ['A', 'B'], teamB: ['C', 'D'], score: { a: 12, b: 12 } },
      ],
    );
    expect(rows.every((r) => r.rank === 1)).toBe(true);
    expect(rows.every((r) => r.draws === 1)).toBe(true);
  });
});
