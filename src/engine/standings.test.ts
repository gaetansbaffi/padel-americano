import { describe, expect, it } from 'vitest';
import { computeStandings, computeTeamStandings } from './standings';

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

  it('classement par équipes : une ligne par binôme', () => {
    const teams = [
      { id: 'T1', players: ['A', 'B'] as [string, string] },
      { id: 'T2', players: ['C', 'D'] as [string, string] },
      { id: 'T3', players: ['E', 'F'] as [string, string] },
    ];
    const rows = computeTeamStandings(teams, [
      { teamA: ['A', 'B'], teamB: ['C', 'D'], score: { a: 15, b: 9 } },
      { teamA: ['E', 'F'], teamB: ['A', 'B'], score: { a: 12, b: 12 } },
      { teamA: ['C', 'D'], teamB: ['E', 'F'] },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['T1', 'T3', 'T2']);
    expect(rows[0]).toMatchObject({ played: 2, wins: 1, draws: 1, pointsFor: 27, pointsAgainst: 21 });
    expect(rows[2]).toMatchObject({ played: 1, losses: 1, pointsFor: 9 });
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
