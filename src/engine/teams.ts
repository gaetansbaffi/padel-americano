// Americano par équipes : des binômes fixes se rencontrent à tour de rôle.
//
// Même démarche que le mode individuel (generator.ts), avec 2 équipes par
// match au lieu de 4 joueurs :
//  1. matchs restants par équipe, somme rendue paire ;
//  2. nombre minimal de rotations ;
//  3. équipes qui jouent à chaque rotation (priorité aux besoins, repos
//     étalés et rééquilibrés) — fonctions partagées avec le mode individuel ;
//  4. appariement des équipes dans chaque rotation par recherche locale :
//     répétitions d'adversaires, puis maximum face à la même équipe.

import { planRotationSizes, trimNeeds } from './feasibility';
import {
  balanceRests,
  compareScores,
  restScore,
  selectPlayers,
  stateFromHistory,
  type PlayerState,
} from './generator';
import { createRng, randInt, shuffle, type Rng } from './rng';

/** Un match par terrain : [équipe A, équipe B]. */
export interface TeamRotation {
  matches: [string, string][];
  resting: string[];
  absent: string[];
}

export interface TeamGenerateInput {
  teamIds: string[];
  courts: number;
  /** Nombre cible de matchs par équipe (historique compris). */
  targetMatches: number;
  /** Équipes indisponibles pour la première rotation générée. */
  absentFirstRotation?: string[];
  /** Rotations déjà jouées, jamais modifiées. */
  history?: TeamRotation[];
  seed?: number;
  restarts?: number;
}

export interface TeamGenerateResult {
  rotations: TeamRotation[];
  warnings: string[];
}

/** Compteurs incrémentaux des rencontres entre équipes. */
class OpponentTracker {
  private readonly count: Int32Array;
  private readonly hist: number[] = [0];
  private repeats = 0;
  private squares = 0;

  constructor(private readonly n: number) {
    this.count = new Int32Array(n * n);
  }

  apply(a: number, b: number, d: 1 | -1) {
    const k = a < b ? a * this.n + b : b * this.n + a;
    const old = this.count[k];
    const nw = old + d;
    this.count[k] = nw;
    this.repeats += Math.max(0, nw - 1) - Math.max(0, old - 1);
    this.squares += nw * nw - old * old;
    while (this.hist.length <= nw) this.hist.push(0);
    if (old > 0) this.hist[old]--;
    if (nw > 0) this.hist[nw]++;
  }

  /** [répétitions, max face à la même équipe, paires à ce max, Σ carrés]. */
  score(): number[] {
    let max = 0;
    for (let i = this.hist.length - 1; i > 0; i--) {
      if (this.hist[i] > 0) {
        max = i;
        break;
      }
    }
    return [this.repeats, max, max > 0 ? this.hist[max] : 0, this.squares];
  }
}

/**
 * Recherche locale sur les rencontres. Deux mouvements :
 *  - échanger deux équipes de matchs différents d'une même rotation ;
 *  - échanger un repos entre deux rotations (x joue en r1 et se repose en r2,
 *    y l'inverse) : le nombre de matchs de chacun ne change pas, et on refuse
 *    tout échange qui dégraderait les repos (repos consécutifs, séries).
 * Le second mouvement est indispensable : certains choix de « qui joue »
 * rendent impossible un tournoi où chaque équipe rencontre chaque autre une
 * seule fois, quel que soit l'appariement.
 */
function pairMatches(
  slots: number[][],
  history: [number, number][],
  n: number,
  initial: PlayerState,
  absentFirst: boolean[],
  rng: Rng,
): number[] {
  const tracker = new OpponentTracker(n);
  for (const [a, b] of history) tracker.apply(a, b, 1);
  for (const s of slots) for (let m = 0; m < s.length; m += 2) tracker.apply(s[m], s[m + 1], 1);
  const R = slots.length;
  if (R === 0) return tracker.score();

  const withinRotation = (s: number[], i: number, j: number) => {
    const mi = i & ~1;
    const mj = j & ~1;
    tracker.apply(s[mi], s[mi + 1], -1);
    tracker.apply(s[mj], s[mj + 1], -1);
    [s[i], s[j]] = [s[j], s[i]];
    tracker.apply(s[mi], s[mi + 1], 1);
    tracker.apply(s[mj], s[mj + 1], 1);
  };
  // Remplace, en position p de la rotation s, l'équipe par `team`.
  const replace = (s: number[], p: number, team: number) => {
    const m = p & ~1;
    tracker.apply(s[m], s[m + 1], -1);
    s[p] = team;
    tracker.apply(s[m], s[m + 1], 1);
  };

  // [repos consécutifs, plus longue série de repos, plus longue série de matchs]
  const restStats = (i: number): [number, number, number] => {
    let rest = initial.restedLast[i] ? 1 : 0;
    let streak = initial.playStreak[i];
    let b2b = 0;
    let maxRest = 0;
    let maxPlay = 0;
    for (const s of slots) {
      if (s.includes(i)) {
        streak++;
        rest = 0;
      } else {
        if (rest > 0) b2b++;
        rest++;
        streak = 0;
      }
      maxRest = Math.max(maxRest, rest);
      maxPlay = Math.max(maxPlay, streak);
    }
    return [b2b, maxRest, maxPlay];
  };
  // Une alternance stricte repos/match coupe les équipes en deux groupes qui
  // ne se rencontrent jamais : on tolère jusqu'à 2 repos (ou matchs) de
  // suite, en minimisant ensuite le nombre de repos consécutifs.
  let limitRest = 2;
  let limitPlay = 2;
  let b2bTotal = 0;
  for (let i = 0; i < n; i++) {
    const [b2b, mr, mp] = restStats(i);
    limitRest = Math.max(limitRest, mr);
    limitPlay = Math.max(limitPlay, mp);
    b2bTotal += b2b;
  }
  const evaluate = () => [...tracker.score(), b2bTotal];

  let current = evaluate();
  let stale = 0;
  const patience = 600 * Math.max(4, ...slots.map((s) => s.length)) + 500;
  for (let it = 0; it < 6000 * R && stale < patience; it++) {
    if (rng() < 0.5) {
      // Échange dans une rotation.
      const s = slots[randInt(rng, R)];
      if (s.length < 4) continue;
      const i = randInt(rng, s.length);
      const j = randInt(rng, s.length);
      if (i >> 1 === j >> 1) continue; // même match : sans effet
      withinRotation(s, i, j);
      const next = evaluate();
      const cmp = compareScores(next, current);
      if (cmp <= 0) {
        stale = cmp < 0 ? 0 : stale + 1;
        current = next;
      } else {
        withinRotation(s, i, j);
        stale++;
      }
      continue;
    }

    // Échange de repos entre deux rotations.
    const r1 = randInt(rng, R);
    const r2 = randInt(rng, R);
    if (r1 === r2 || slots[r1].length === 0 || slots[r2].length === 0) continue;
    const p1 = randInt(rng, slots[r1].length);
    const x = slots[r1][p1];
    if (slots[r2].includes(x) || (r2 === 0 && absentFirst[x])) continue;
    const p2 = randInt(rng, slots[r2].length);
    const y = slots[r2][p2];
    if (slots[r1].includes(y) || (r1 === 0 && absentFirst[y])) continue;

    const before = restStats(x)[0] + restStats(y)[0];
    replace(slots[r1], p1, y);
    replace(slots[r2], p2, x);
    const sx = restStats(x);
    const sy = restStats(y);
    b2bTotal += sx[0] + sy[0] - before;
    const next = evaluate();
    const cmp = compareScores(next, current);
    const restsOk = Math.max(sx[1], sy[1]) <= limitRest && Math.max(sx[2], sy[2]) <= limitPlay;
    if (restsOk && cmp <= 0) {
      stale = cmp < 0 ? 0 : stale + 1;
      current = next;
    } else {
      b2bTotal -= sx[0] + sy[0] - before;
      replace(slots[r2], p2, y);
      replace(slots[r1], p1, x);
      stale++;
    }
  }
  return current;
}

export function generateTeamSchedule(input: TeamGenerateInput): TeamGenerateResult {
  const ids = input.teamIds;
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i]));
  const warnings: string[] = [];

  const historyPairs: [number, number][] = [];
  const historySets = (input.history ?? []).map((rot) => {
    const set: number[] = [];
    for (const [a, b] of rot.matches) {
      const ia = index.get(a) ?? -1;
      const ib = index.get(b) ?? -1;
      if (ia >= 0) set.push(ia);
      if (ib >= 0) set.push(ib);
      if (ia >= 0 && ib >= 0) historyPairs.push([ia, ib]);
    }
    return set;
  });
  const { initial, playedBefore } = stateFromHistory(n, historySets);

  const rawNeeds = ids.map((_, i) => Math.max(0, input.targetMatches - playedBefore[i]));
  initial.need = trimNeeds(rawNeeds, 2);
  const trimmed = rawNeeds.reduce((s, x, i) => s + (x - initial.need[i]), 0);
  if (trimmed > 0) {
    warnings.push(`Cible non compatible : ${trimmed} équipe(s) joueront un match de moins que les autres.`);
  }
  if (n < 2) warnings.push('Il faut au moins 2 équipes pour générer des matchs.');

  const absentSet = new Set(input.absentFirstRotation ?? []);
  const absentFirst = ids.map((id) => absentSet.has(id));
  const sizes = planRotationSizes(initial.need, absentFirst, input.courts, 2);

  const seed = input.seed ?? 1;
  const restarts = Math.max(1, input.restarts ?? 8);
  let best: { slots: number[][]; score: number[] } | null = null;
  for (let k = 0; k < restarts; k++) {
    const rng = createRng(Math.imul(seed, 0x9e3779b1) + k * 0x85ebca6b + 0x7f4a7c15);
    const sets = balanceRests(
      selectPlayers(sizes, input.courts, absentFirst, initial, rng, 2),
      n,
      initial,
      absentFirst,
      rng,
    );
    const played = new Array<number>(n).fill(0);
    for (const s of sets) for (const i of s) played[i]++;
    const deviation = played.reduce((s, p, i) => s + Math.abs(p - initial.need[i]), 0);
    const slots = sets.map((s) => shuffle(s, rng));
    // pairing = [répétitions, max adversaire, paires au max, Σ carrés, repos consécutifs]
    const pairing = pairMatches(slots, historyPairs, n, initial, absentFirst, rng);
    const [maxRestStreak, , maxPlayStreak] = restScore(slots, n, initial);
    const score = [deviation, maxRestStreak, ...pairing, maxPlayStreak];
    if (!best || compareScores(score, best.score) < 0) best = { slots, score };
  }

  if (best && best.score[0] > 0) {
    warnings.push("Impossible d'attribuer exactement le même nombre de matchs à toutes les équipes : planning au mieux.");
  }

  const rotations: TeamRotation[] = (best?.slots ?? []).map((s, r) => {
    const playing = new Set(s);
    const matches: [string, string][] = [];
    for (let m = 0; m < s.length; m += 2) matches.push([ids[s[m]], ids[s[m + 1]]]);
    const absent = r === 0 ? ids.filter((id) => absentSet.has(id)) : [];
    const resting = ids.filter((id, i) => !playing.has(i) && !(r === 0 && absentSet.has(id)));
    return { matches, resting, absent };
  });
  return { rotations, warnings };
}

// ---------------------------------------------------------------------------
// Qualité d'un planning par équipes.

export interface TeamQuality {
  teams: { id: string; matches: number; rests: number; absences: number; distinctOpponents: number; maxSameOpponent: number }[];
  rotations: number;
  totalMatches: number;
  minMatches: number;
  maxMatches: number;
  minRests: number;
  maxRests: number;
  maxConsecutiveRests: number;
  opponentRepeats: number;
  minPossibleOpponentRepeats: number;
  maxSameOpponent: number;
  idealMaxSameOpponent: number;
}

export function analyzeTeamSchedule(rotations: TeamRotation[], teamIds: string[]): TeamQuality {
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const counts = new Map<string, number>();
  const matches = new Map(teamIds.map((id) => [id, 0]));
  const absences = new Map(teamIds.map((id) => [id, 0]));
  const streak = new Map(teamIds.map((id) => [id, 0]));
  let maxConsecutiveRests = 0;
  let totalMatches = 0;
  for (const rot of rotations) {
    const playing = new Set<string>();
    for (const [a, b] of rot.matches) {
      totalMatches++;
      counts.set(key(a, b), (counts.get(key(a, b)) ?? 0) + 1);
      for (const id of [a, b]) {
        playing.add(id);
        matches.set(id, (matches.get(id) ?? 0) + 1);
      }
    }
    const absent = new Set(rot.absent);
    for (const id of teamIds) {
      if (absent.has(id)) absences.set(id, absences.get(id)! + 1);
      const s = !playing.has(id) && !absent.has(id) ? streak.get(id)! + 1 : 0;
      streak.set(id, s);
      maxConsecutiveRests = Math.max(maxConsecutiveRests, s);
    }
  }
  const others = Math.max(1, teamIds.length - 1);
  const teams = teamIds.map((id) => {
    const values = teamIds.filter((o) => o !== id).map((o) => counts.get(key(id, o)) ?? 0);
    const played = matches.get(id)!;
    const absent = absences.get(id)!;
    return {
      id,
      matches: played,
      rests: rotations.length - played - absent,
      absences: absent,
      distinctOpponents: values.filter((v) => v > 0).length,
      maxSameOpponent: Math.max(0, ...values),
    };
  });
  const pick = (f: (t: (typeof teams)[number]) => number) => teams.map(f);
  return {
    teams,
    rotations: rotations.length,
    totalMatches,
    minMatches: Math.min(...pick((t) => t.matches)),
    maxMatches: Math.max(...pick((t) => t.matches)),
    minRests: Math.min(...pick((t) => t.rests)),
    maxRests: Math.max(...pick((t) => t.rests)),
    maxConsecutiveRests,
    opponentRepeats: [...counts.values()].reduce((s, c) => s + Math.max(0, c - 1), 0),
    minPossibleOpponentRepeats: Math.ceil(teams.reduce((s, t) => s + Math.max(0, t.matches - others), 0) / 2),
    maxSameOpponent: Math.max(0, ...pick((t) => t.maxSameOpponent)),
    idealMaxSameOpponent: Math.max(0, ...pick((t) => Math.ceil(t.matches / others))),
  };
}

/** Contraintes absolues d'un planning par équipes. */
export function findTeamViolations(rotations: TeamRotation[]): string[] {
  const errors: string[] = [];
  rotations.forEach((rot, r) => {
    const seen = new Set<string>();
    rot.matches.forEach(([a, b], c) => {
      if (a === b) errors.push(`Rotation ${r + 1}, terrain ${c + 1} : une équipe joue contre elle-même.`);
      for (const id of [a, b]) {
        if (seen.has(id)) errors.push(`Rotation ${r + 1} : ${id} joue sur deux terrains.`);
        seen.add(id);
      }
    });
    for (const id of [...rot.resting, ...rot.absent]) {
      if (seen.has(id)) errors.push(`Rotation ${r + 1} : ${id} est à la fois au repos/absente et en jeu.`);
    }
  });
  return errors;
}
