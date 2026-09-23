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

/** Un match vu comme deux camps (listes d'identifiants crédités). */
interface Game {
  a: readonly string[];
  b: readonly string[];
  score: MatchScore;
}

/**
 * Classement par défaut : points marqués, puis différence de points, puis
 * victoires. Les ex æquo stricts partagent le même rang.
 */
function rank(ids: string[], games: Game[]): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    ids.map((id) => [
      id,
      { id, rank: 0, played: 0, wins: 0, draws: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, diff: 0 },
    ]),
  );

  for (const g of games) {
    const sides: [readonly string[], number, number][] = [
      [g.a, g.score.a, g.score.b],
      [g.b, g.score.b, g.score.a],
    ];
    for (const [side, scored, conceded] of sides) {
      for (const id of side) {
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
  const order = ids.reduce((m, id, i) => m.set(id, i), new Map<string, number>());
  const cmp = (x: StandingRow, y: StandingRow) =>
    y.pointsFor - x.pointsFor || y.diff - x.diff || y.wins - x.wins;
  list.sort((x, y) => cmp(x, y) || order.get(x.id)! - order.get(y.id)!);
  list.forEach((row, i) => {
    row.rank = i > 0 && cmp(list[i - 1], row) === 0 ? list[i - 1].rank : i + 1;
  });
  return list;
}

/** Classement individuel. */
export function computeStandings(playerIds: string[], matches: ScoredMatch[]): StandingRow[] {
  return rank(
    playerIds,
    matches.flatMap((m) => (m.score ? [{ a: m.teamA, b: m.teamB, score: m.score }] : [])),
  );
}

/** Classement par équipes (binômes fixes) : une ligne par équipe. */
export function computeTeamStandings(
  teams: { id: string; players: Team }[],
  matches: ScoredMatch[],
): StandingRow[] {
  const teamOf = new Map<string, string>();
  for (const t of teams) for (const p of t.players) teamOf.set(p, t.id);
  const games: Game[] = [];
  for (const m of matches) {
    const a = teamOf.get(m.teamA[0]);
    const b = teamOf.get(m.teamB[0]);
    if (m.score && a && b) games.push({ a: [a], b: [b], score: m.score });
  }
  return rank(
    teams.map((t) => t.id),
    games,
  );
}
