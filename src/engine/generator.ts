// Générateur de planning Americano.
//
// Principe (simple et déterministe) :
//  1. Besoins : matchs restants par joueur = cible − matchs déjà joués,
//     ajustés pour que la somme soit divisible par 4.
//  2. Tailles des rotations : nombre minimal de rotations, matchs répartis
//     uniformément (voir planRotationSizes).
//  3. Qui joue ? Rotation par rotation, on fait jouer les joueurs ayant le
//     plus de matchs restants (ce choix glouton garantit que chacun atteint
//     son quota). En cas d'égalité : priorité à ceux qui étaient au repos à
//     la rotation précédente, puis à ceux qui ont le moins enchaîné de matchs.
//  4. Qui avec qui ? Recherche locale : on échange deux joueurs d'une même
//     rotation tant que le score lexicographique ne se dégrade pas
//     (partenaires > adversaires > matchs identiques > mixité).
//  5. Plusieurs tentatives avec des graines dérivées ; la meilleure gagne.
//
// Les étapes 3 et 4 ne déplacent jamais un joueur d'une rotation à une autre,
// donc les contraintes absolues (pas de doublon dans un match, pas de joueur
// sur deux terrains) sont vraies par construction.

import { planRotationSizes, trimNeeds } from './feasibility';
import { createRng, randInt, shuffle, type Rng } from './rng';
import type { GenerateInput, GenerateResult, PlannedRotation } from './types';

type Score = number[];

export function compareScores(a: Score, b: Score): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Compteurs incrémentaux de partenaires, adversaires et matchs identiques. */
class PairTracker {
  private readonly partner: Int32Array;
  private readonly opponent: Int32Array;
  private readonly partnerHist: number[] = [0];
  private readonly opponentHist: number[] = [0];
  private readonly matchKeys = new Map<number, number>();
  private partnerRepeats = 0;
  private partnerSq = 0;
  private opponentRepeats = 0;
  private opponentSq = 0;
  private duplicates = 0;
  private nonMixed = 0;

  constructor(
    private readonly n: number,
    /** 0 = inconnu, 1 = H, 2 = F ; null si la mixité n'est pas demandée. */
    private readonly genders: number[] | null,
  ) {
    this.partner = new Int32Array(n * n);
    this.opponent = new Int32Array(n * n);
  }

  reset() {
    this.partner.fill(0);
    this.opponent.fill(0);
    this.partnerHist.fill(0);
    this.opponentHist.fill(0);
    this.matchKeys.clear();
    this.partnerRepeats = this.partnerSq = 0;
    this.opponentRepeats = this.opponentSq = 0;
    this.duplicates = this.nonMixed = 0;
  }

  private pairKey(a: number, b: number): number {
    return a < b ? a * this.n + b : b * this.n + a;
  }

  private static bumpHist(hist: number[], from: number, to: number) {
    while (hist.length <= to) hist.push(0);
    if (from > 0) hist[from]--;
    if (to > 0) hist[to]++;
  }

  private bumpPartner(a: number, b: number, d: number) {
    const k = this.pairKey(a, b);
    const old = this.partner[k];
    const nw = old + d;
    this.partner[k] = nw;
    this.partnerRepeats += Math.max(0, nw - 1) - Math.max(0, old - 1);
    this.partnerSq += nw * nw - old * old;
    PairTracker.bumpHist(this.partnerHist, old, nw);
    if (this.genders) {
      const ga = this.genders[a];
      if (ga !== 0 && ga === this.genders[b]) this.nonMixed += d;
    }
  }

  private bumpOpponent(a: number, b: number, d: number) {
    const k = this.pairKey(a, b);
    const old = this.opponent[k];
    const nw = old + d;
    this.opponent[k] = nw;
    this.opponentRepeats += Math.max(0, nw - 1) - Math.max(0, old - 1);
    this.opponentSq += nw * nw - old * old;
    PairTracker.bumpHist(this.opponentHist, old, nw);
  }

  /** Ajoute (d = 1) ou retire (d = −1) le match a,b contre c,d. */
  apply(a: number, b: number, c: number, e: number, d: 1 | -1) {
    this.bumpPartner(a, b, d);
    this.bumpPartner(c, e, d);
    this.bumpOpponent(a, c, d);
    this.bumpOpponent(a, e, d);
    this.bumpOpponent(b, c, d);
    this.bumpOpponent(b, e, d);
    const t1 = this.pairKey(a, b);
    const t2 = this.pairKey(c, e);
    const nn = this.n * this.n;
    const key = t1 < t2 ? t1 * nn + t2 : t2 * nn + t1;
    const old = this.matchKeys.get(key) ?? 0;
    const nw = old + d;
    this.matchKeys.set(key, nw);
    this.duplicates += Math.max(0, nw - 1) - Math.max(0, old - 1);
  }

  applySlots(slots: number[], match: number, d: 1 | -1) {
    const o = match * 4;
    this.apply(slots[o], slots[o + 1], slots[o + 2], slots[o + 3], d);
  }

  private static histMax(hist: number[]): number {
    for (let i = hist.length - 1; i > 0; i--) if (hist[i] > 0) return i;
    return 0;
  }

  /**
   * Score à minimiser, critères réordonnés selon `order`. Ordre naturel :
   * [répétitions partenaires, max même partenaire, Σ carrés partenaires,
   *  répétitions adversaires, max même adversaire, matchs identiques,
   *  équipes non mixtes, Σ carrés adversaires].
   * Les sommes de carrés affinent la répartition (répétitions étalées plutôt
   * que concentrées) ; celle des adversaires n'est qu'un raffinement final.
   */
  score(order: number[]): Score {
    const raw = [
      this.partnerRepeats,
      PairTracker.histMax(this.partnerHist),
      this.partnerSq,
      this.opponentRepeats,
      PairTracker.histMax(this.opponentHist),
      this.duplicates,
      this.nonMixed,
      this.opponentSq,
    ];
    return order.map((k) => raw[k]);
  }
}

interface Candidate {
  /** Pour chaque rotation : joueurs en positions [A1, A2, B1, B2] par match. */
  slots: number[][];
  score: Score;
}

interface PlayerState {
  need: number[];
  restedLast: boolean[];
  playStreak: number[];
}

/** Étape 3 : choix des joueurs de chaque rotation. */
function selectPlayers(
  sizes: number[],
  courts: number,
  absentFirst: boolean[],
  initial: PlayerState,
  rng: Rng,
): number[][] {
  const need = initial.need.slice();
  const restedLast = initial.restedLast.slice();
  const playStreak = initial.playStreak.slice();
  const n = need.length;
  const result: number[][] = [];
  // Garde-fou : quelques rotations supplémentaires si des besoins restent
  // insatisfaits (cas dégradés, ex. joueur ajouté en cours de tournoi).
  const maxRotations = sizes.length + 20;

  for (let r = 0; r < maxRotations; r++) {
    const eligible: number[] = [];
    for (let i = 0; i < n; i++) {
      if (need[i] > 0 && !(r === 0 && absentFirst[i])) eligible.push(i);
    }
    if (r >= sizes.length && eligible.length < 4) break;
    const wanted =
      r < sizes.length ? sizes[r] : Math.min(courts, Math.floor(eligible.length / 4));
    const matches = Math.min(wanted, Math.floor(eligible.length / 4));

    const tie = new Map<number, number>();
    for (const i of eligible) tie.set(i, rng());
    eligible.sort(
      (a, b) =>
        need[b] - need[a] ||
        Number(restedLast[b]) - Number(restedLast[a]) ||
        playStreak[a] - playStreak[b] ||
        tie.get(a)! - tie.get(b)!,
    );
    const playing = eligible.slice(0, matches * 4);
    const isPlaying = new Array<boolean>(n).fill(false);
    for (const i of playing) {
      isPlaying[i] = true;
      need[i]--;
    }
    for (let i = 0; i < n; i++) {
      restedLast[i] = !isPlaying[i];
      playStreak[i] = isPlaying[i] ? playStreak[i] + 1 : 0;
    }
    result.push(playing);
  }
  // Supprime les rotations vides finales éventuelles.
  while (result.length > 0 && result[result.length - 1].length === 0) result.pop();
  return result;
}

/** Métriques de repos : [séries de repos max, repos consécutifs, séries de matchs max]. */
function restScore(playingSets: number[][], n: number, initial: PlayerState): Score {
  let maxRestStreak = 0;
  let backToBack = 0;
  let maxPlayStreak = 0;
  for (let i = 0; i < n; i++) {
    let rest = initial.restedLast[i] ? 1 : 0;
    let play = initial.playStreak[i];
    for (const set of playingSets) {
      if (set.includes(i)) {
        play++;
        rest = 0;
      } else {
        if (rest > 0) backToBack++;
        rest++;
        play = 0;
      }
      maxRestStreak = Math.max(maxRestStreak, rest);
      maxPlayStreak = Math.max(maxPlayStreak, play);
    }
  }
  return [maxRestStreak, backToBack, maxPlayStreak];
}

/** Ordre des critères de PairTracker.score() : celui du cahier des charges. */
const STRICT_ORDER = [0, 1, 2, 3, 4, 5, 6, 7];
/** Variante : la mixité passe avant la variété des adversaires. */
const MIXED_PRIORITY_ORDER = [0, 1, 2, 5, 6, 3, 4, 7];

/**
 * Recherche locale itérée : descente par échanges de deux joueurs d'une même
 * rotation (équipes différentes), puis petite perturbation aléatoire quand la
 * descente stagne ; on revient au meilleur état si la perturbation n'a rien
 * apporté.
 */
function localSearch(
  slots: number[][],
  tracker: PairTracker,
  rebuild: () => void,
  rng: Rng,
  order: number[],
) {
  const active = slots.filter((s) => s.length >= 4);
  if (active.length === 0) return;
  const evaluate = () => tracker.score(order);
  // Échange s[i..i+width) et s[j..j+width) : width = 1 échange deux joueurs,
  // width = 2 échange deux équipes de matchs différents (les partenaires ne
  // changent pas, seules les oppositions changent).
  const swap = (s: number[], i: number, j: number, width: number) => {
    const mi = i >> 2;
    const mj = j >> 2;
    tracker.applySlots(s, mi, -1);
    if (mj !== mi) tracker.applySlots(s, mj, -1);
    for (let k = 0; k < width; k++) [s[i + k], s[j + k]] = [s[j + k], s[i + k]];
    tracker.applySlots(s, mi, 1);
    if (mj !== mi) tracker.applySlots(s, mj, 1);
  };
  const randomMove = (): [number[], number, number, number] | null => {
    const s = active[randInt(rng, active.length)];
    if (s.length >= 8 && rng() < 0.3) {
      const ti = randInt(rng, s.length / 2);
      const tj = randInt(rng, s.length / 2);
      return ti >> 1 === tj >> 1 ? null : [s, ti * 2, tj * 2, 2];
    }
    const i = randInt(rng, s.length);
    const j = randInt(rng, s.length);
    return i >> 1 === j >> 1 ? null : [s, i, j, 1]; // même équipe : sans effet
  };

  const playersPerRotation = Math.max(...active.map((s) => s.length));
  let budget = 6000 * active.length;
  const patience = 150 * playersPerRotation + 300;
  let best = evaluate();
  const bestSlots = active.map((s) => s.slice());

  while (budget > 0) {
    // Descente.
    let current = evaluate();
    let stale = 0;
    while (budget > 0 && stale < patience) {
      budget--;
      const move = randomMove();
      if (!move) continue;
      swap(...move);
      const next = evaluate();
      const cmp = compareScores(next, current);
      if (cmp <= 0) {
        stale = cmp < 0 ? 0 : stale + 1;
        current = next;
      } else {
        swap(...move);
        stale++;
      }
    }
    // Conserve le meilleur état, sinon y revient.
    if (compareScores(current, best) <= 0) {
      best = current;
      active.forEach((s, r) => (bestSlots[r] = s.slice()));
    } else {
      active.forEach((s, r) => s.splice(0, s.length, ...bestSlots[r]));
      rebuild();
    }
    // Perturbation.
    for (let k = 0; k < 3; k++) {
      const move = randomMove();
      if (move) swap(...move);
    }
  }
  active.forEach((s, r) => s.splice(0, s.length, ...bestSlots[r]));
  rebuild();
}

/**
 * Disposition initiale d'une rotation : mélange aléatoire, en formant d'abord
 * des équipes H/F quand la mixité est demandée.
 */
function initialArrangement(players: number[], genders: number[] | null, rng: Rng): number[] {
  const shuffled = shuffle(players, rng);
  if (!genders) return shuffled;
  const men = shuffled.filter((i) => genders[i] === 1);
  const women = shuffled.filter((i) => genders[i] === 2);
  const others = shuffled.filter((i) => genders[i] === 0);
  const teams: number[][] = [];
  while (men.length && women.length) teams.push([men.pop()!, women.pop()!]);
  const leftovers = [...men, ...women, ...others];
  for (let i = 0; i + 1 < leftovers.length; i += 2) teams.push([leftovers[i], leftovers[i + 1]]);
  return shuffle(teams, rng).flat();
}

function buildCandidate(
  sizes: number[],
  courts: number,
  absentFirst: boolean[],
  initial: PlayerState,
  history: number[][],
  genders: number[] | null,
  order: number[],
  rng: Rng,
): Candidate {
  const n = initial.need.length;
  const playingSets = selectPlayers(sizes, courts, absentFirst, initial, rng);

  // Écart au quota : doit valoir 0 quand la configuration est réalisable.
  const played = new Array<number>(n).fill(0);
  for (const set of playingSets) for (const i of set) played[i]++;
  const deviation = played.reduce((s, p, i) => s + Math.abs(p - initial.need[i]), 0);

  const slots = playingSets.map((set) => initialArrangement(set, genders, rng));
  const tracker = new PairTracker(n, genders);
  const rebuild = () => {
    tracker.reset();
    for (const m of history) tracker.apply(m[0], m[1], m[2], m[3], 1);
    for (const s of slots) for (let m = 0; m < s.length / 4; m++) tracker.applySlots(s, m, 1);
  };
  rebuild();

  // Étape 4 : recherche locale.
  localSearch(slots, tracker, rebuild, rng, order);

  return {
    slots,
    score: [deviation, ...restScore(playingSets, n, initial), ...tracker.score(order)],
  };
}

function genderCode(g: string | undefined): number {
  return g === 'H' ? 1 : g === 'F' ? 2 : 0;
}

export function generateSchedule(input: GenerateInput): GenerateResult {
  const ids = input.playerIds;
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i]));
  const warnings: string[] = [];
  const historyRotations = input.history ?? [];

  // Historique : matchs joués, derniers repos, rencontres passées.
  const playedBefore = new Array<number>(n).fill(0);
  const historyMatches: number[][] = [];
  const initial: PlayerState = {
    need: [],
    restedLast: new Array<boolean>(n).fill(false),
    playStreak: new Array<number>(n).fill(0),
  };
  for (const rot of historyRotations) {
    const inRotation = new Array<boolean>(n).fill(false);
    for (const m of rot.matches) {
      const four = [...m.teamA, ...m.teamB].map((id) => index.get(id) ?? -1);
      for (const i of four) {
        if (i >= 0) {
          playedBefore[i]++;
          inRotation[i] = true;
        }
      }
      if (four.every((i) => i >= 0)) historyMatches.push(four);
    }
    for (let i = 0; i < n; i++) {
      initial.restedLast[i] = !inRotation[i];
      initial.playStreak[i] = inRotation[i] ? initial.playStreak[i] + 1 : 0;
    }
  }

  const rawNeeds = ids.map((_, i) => Math.max(0, input.targetMatches - playedBefore[i]));
  initial.need = trimNeeds(rawNeeds);
  const trimmed = rawNeeds.reduce((s, x, i) => s + (x - initial.need[i]), 0);
  if (trimmed > 0) {
    warnings.push(
      `Cible non compatible : ${trimmed} joueur(s) joueront un match de moins que les autres.`,
    );
  }

  const absentSet = new Set(input.absentFirstRotation ?? []);
  const absentFirst = ids.map((id) => absentSet.has(id));
  const sizes = planRotationSizes(initial.need, absentFirst, input.courts);
  if (n < 4) warnings.push('Il faut au moins 4 joueurs pour générer des matchs.');

  const genders = input.preferMixed
    ? ids.map((id) => genderCode(input.genders?.[id]))
    : null;

  const order = genders && input.mixedBeforeOpponents ? MIXED_PRIORITY_ORDER : STRICT_ORDER;
  const seed = input.seed ?? 1;
  const restarts = Math.max(1, input.restarts ?? 8);
  let best: Candidate | null = null;
  for (let k = 0; k < restarts; k++) {
    const rng = createRng(Math.imul(seed, 0x9e3779b1) + k * 0x85ebca6b);
    const candidate = buildCandidate(
      sizes,
      input.courts,
      absentFirst,
      initial,
      historyMatches,
      genders,
      order,
      rng,
    );
    if (!best || compareScores(candidate.score, best.score) < 0) best = candidate;
  }

  const rotations: PlannedRotation[] = (best?.slots ?? []).map((s, r) => {
    const playing = new Set(s);
    const matches = [];
    for (let m = 0; m < s.length / 4; m++) {
      const o = m * 4;
      matches.push({
        teamA: [ids[s[o]], ids[s[o + 1]]] as [string, string],
        teamB: [ids[s[o + 2]], ids[s[o + 3]]] as [string, string],
      });
    }
    const absent = r === 0 ? ids.filter((id) => absentSet.has(id)) : [];
    const resting = ids.filter((id, i) => !playing.has(i) && !(r === 0 && absentSet.has(id)));
    return { matches, resting, absent };
  });

  if (best && best.score[0] > 0) {
    warnings.push(
      "Impossible d'attribuer exactement le même nombre de matchs à tous les joueurs : planning au mieux.",
    );
  }

  const plannedNeeds: Record<string, number> = {};
  ids.forEach((id, i) => (plannedNeeds[id] = initial.need[i]));
  return { rotations, plannedNeeds, warnings };
}
