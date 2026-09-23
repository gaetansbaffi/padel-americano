// Contrôle de validité et indicateurs de qualité d'un planning.

import type { Gender, PlannedRotation } from './types';

/**
 * Vérifie les contraintes absolues. Renvoie la liste des violations (vide si
 * le planning est valide).
 */
export function findViolations(rotations: PlannedRotation[]): string[] {
  const errors: string[] = [];
  rotations.forEach((rot, r) => {
    const seen = new Set<string>();
    rot.matches.forEach((m, c) => {
      const four = [...m.teamA, ...m.teamB];
      if (new Set(four).size !== 4) {
        errors.push(`Rotation ${r + 1}, terrain ${c + 1} : joueur en double dans le match.`);
      }
      for (const id of new Set(four)) {
        if (seen.has(id)) {
          errors.push(`Rotation ${r + 1} : ${id} joue sur deux terrains.`);
        }
        seen.add(id);
      }
    });
    for (const id of rot.resting) {
      if (seen.has(id)) errors.push(`Rotation ${r + 1} : ${id} est à la fois au repos et en jeu.`);
    }
    for (const id of rot.absent) {
      if (seen.has(id)) errors.push(`Rotation ${r + 1} : ${id} est absent mais joue.`);
    }
  });
  return errors;
}

export interface PlayerQuality {
  id: string;
  matches: number;
  rests: number;
  absences: number;
  distinctPartners: number;
  maxSamePartner: number;
  distinctOpponents: number;
  maxSameOpponent: number;
  maxConsecutiveRests: number;
}

export interface ScheduleQuality {
  players: PlayerQuality[];
  rotations: number;
  totalMatches: number;
  minMatches: number;
  maxMatches: number;
  minRests: number;
  maxRests: number;
  maxConsecutiveRests: number;
  /** Somme sur les paires de max(0, nb de fois partenaires − 1). */
  partnerRepeats: number;
  /** Borne inférieure théorique de `partnerRepeats`. */
  minPossiblePartnerRepeats: number;
  maxSamePartner: number;
  /** Borne inférieure théorique de `maxSamePartner`. */
  idealMaxSamePartner: number;
  opponentRepeats: number;
  maxSameOpponent: number;
  /** Matchs identiques (mêmes deux équipes) au-delà de la première occurrence. */
  identicalMatchRepeats: number;
  /** Équipes non mixtes (seulement parmi les joueurs dont le sexe est connu). */
  nonMixedTeams: number;
  /** Nombre de fois où chaque paire a joué ensemble (clé "a|b", a < b). */
  partnerCounts: Map<string, number>;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function inc(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export function analyzeSchedule(
  rotations: PlannedRotation[],
  playerIds: string[],
  genders?: Record<string, Gender | undefined>,
): ScheduleQuality {
  const partners = new Map<string, number>();
  const opponents = new Map<string, number>();
  const matchKeys = new Map<string, number>();
  const matches = new Map(playerIds.map((id) => [id, 0]));
  const absences = new Map(playerIds.map((id) => [id, 0]));
  const restStreak = new Map(playerIds.map((id) => [id, 0]));
  const maxRestStreak = new Map(playerIds.map((id) => [id, 0]));
  let nonMixedTeams = 0;
  let totalMatches = 0;

  for (const rot of rotations) {
    const playing = new Set<string>();
    for (const m of rot.matches) {
      totalMatches++;
      for (const t of [m.teamA, m.teamB]) {
        inc(partners, pairKey(t[0], t[1]));
        const g0 = genders?.[t[0]];
        if (g0 && g0 === genders?.[t[1]]) nonMixedTeams++;
      }
      for (const a of m.teamA) for (const b of m.teamB) inc(opponents, pairKey(a, b));
      const teams = [pairKey(m.teamA[0], m.teamA[1]), pairKey(m.teamB[0], m.teamB[1])].sort();
      inc(matchKeys, teams.join(' vs '));
      for (const id of [...m.teamA, ...m.teamB]) {
        playing.add(id);
        matches.set(id, (matches.get(id) ?? 0) + 1);
      }
    }
    const absent = new Set(rot.absent);
    for (const id of playerIds) {
      if (absent.has(id)) absences.set(id, absences.get(id)! + 1);
      if (!playing.has(id) && !absent.has(id)) {
        const s = restStreak.get(id)! + 1;
        restStreak.set(id, s);
        maxRestStreak.set(id, Math.max(maxRestStreak.get(id)!, s));
      } else {
        restStreak.set(id, 0);
      }
    }
  }

  const players: PlayerQuality[] = playerIds.map((id) => {
    const partnerValues: number[] = [];
    const opponentValues: number[] = [];
    for (const other of playerIds) {
      if (other === id) continue;
      const p = partners.get(pairKey(id, other)) ?? 0;
      const o = opponents.get(pairKey(id, other)) ?? 0;
      if (p > 0) partnerValues.push(p);
      if (o > 0) opponentValues.push(o);
    }
    const played = matches.get(id)!;
    const absent = absences.get(id)!;
    return {
      id,
      matches: played,
      rests: rotations.length - played - absent,
      absences: absent,
      distinctPartners: partnerValues.length,
      maxSamePartner: Math.max(0, ...partnerValues),
      distinctOpponents: opponentValues.length,
      maxSameOpponent: Math.max(0, ...opponentValues),
      maxConsecutiveRests: maxRestStreak.get(id)!,
    };
  });

  const repeats = (map: Map<string, number>) =>
    [...map.values()].reduce((s, c) => s + Math.max(0, c - 1), 0);
  const n = playerIds.length;
  const others = Math.max(1, n - 1);
  const pick = (f: (p: PlayerQuality) => number) => players.map(f);

  return {
    players,
    rotations: rotations.length,
    totalMatches,
    minMatches: Math.min(...pick((p) => p.matches)),
    maxMatches: Math.max(...pick((p) => p.matches)),
    minRests: Math.min(...pick((p) => p.rests)),
    maxRests: Math.max(...pick((p) => p.rests)),
    maxConsecutiveRests: Math.max(0, ...pick((p) => p.maxConsecutiveRests)),
    partnerRepeats: repeats(partners),
    minPossiblePartnerRepeats: Math.ceil(
      players.reduce((s, p) => s + Math.max(0, p.matches - others), 0) / 2,
    ),
    maxSamePartner: Math.max(0, ...pick((p) => p.maxSamePartner)),
    idealMaxSamePartner: Math.max(0, ...pick((p) => Math.ceil(p.matches / others))),
    opponentRepeats: repeats(opponents),
    maxSameOpponent: Math.max(0, ...pick((p) => p.maxSameOpponent)),
    identicalMatchRepeats: repeats(matchKeys),
    nonMixedTeams,
    partnerCounts: partners,
  };
}
