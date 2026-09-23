// Classement calculé à partir des matchs ayant un score.

import type { Team } from './types';

export interface MatchScore {
  a: number;
  b: number;
}

export interface ScoredMatch {
  teamA: Team;
  teamB: Team;
  score?: MatchScore;
}

export interface StandingRow {
  id: string;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
}

/**
 * Classement par défaut : points marqués, puis différence de points, puis
 * victoires. Les joueurs strictement à égalité partagent le même rang.
 */
export function computeStandings(playerIds: string[], matches: ScoredMatch[]): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    playerIds.map((id) => [
      id,
      { id, rank: 0, played: 0, wins: 0, draws: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, diff: 0 },
    ]),
  );

  for (const m of matches) {
    if (!m.score) continue;
    const sides: [Team, number, number][] = [
      [m.teamA, m.score.a, m.score.b],
      [m.teamB, m.score.b, m.score.a],
    ];
    for (const [team, scored, conceded] of sides) {
      for (const id of team) {
        const row = rows.get(id);
        if (!row) continue;
        row.played++;
        row.pointsFor += scored;
        row.pointsAgainst += conceded;
        if (scored > conceded) row.wins++;
        else if (scored < conceded) row.losses++;
        else row.draws++;
      }
    }
  }

  const list = [...rows.values()];
  for (const row of list) row.diff = row.pointsFor - row.pointsAgainst;
  const order = playerIds.reduce((m, id, i) => m.set(id, i), new Map<string, number>());
  const cmp = (x: StandingRow, y: StandingRow) =>
    y.pointsFor - x.pointsFor || y.diff - x.diff || y.wins - x.wins;
  list.sort((x, y) => cmp(x, y) || order.get(x.id)! - order.get(y.id)!);
  list.forEach((row, i) => {
    row.rank = i > 0 && cmp(list[i - 1], row) === 0 ? list[i - 1].rank : i + 1;
  });
  return list;
}
