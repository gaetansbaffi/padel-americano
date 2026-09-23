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
//     la rotation précédente, puis au groupe qui a le moins partagé le
//     terrain. Le calendrier des repos est ensuite rééquilibré globalement
//     (échanges de repos entre rotations, sans dégrader l'équité).
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
   *  répétitions adversaires, max même adversaire, paires à ce max,
   *  matchs identiques, équipes non mixtes, Σ carrés adversaires].
   * Les sommes de carrés affinent la répartition (répétitions étalées plutôt
   * que concentrées) ; celle des adversaires n'est qu'un raffinement final.
   */
  score(order: number[]): Score {
    const opponentMax = PairTracker.histMax(this.opponentHist);
    const raw = [
      this.partnerRepeats,
      PairTracker.histMax(this.partnerHist),
      this.partnerSq,
      this.opponentRepeats,
      opponentMax,
      // Nombre de paires au maximum : donne à la recherche un cap pour faire
      // baisser le maximum, une paire après l'autre.
      opponentMax > 0 ? this.opponentHist[opponentMax] : 0,
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
  /** together[i * n + j] : rotations où i et j ont joué tous les deux. */
  together: Int32Array;
}

/**
 * Choisit `k` joueurs parmi des ex æquo de priorité. Critère : le groupe qui
 * a le moins partagé le terrain (somme des co-présences de toutes ses paires,
 * joueurs déjà retenus compris), puis le moins de matchs enchaînés. Les
 * combinaisons sont toutes évaluées quand elles sont peu nombreuses, sinon
 * choix glouton. `tied` est déjà dans un ordre aléatoire : à égalité, le
 * premier trouvé gagne.
 */
function chooseTied(
  tied: number[],
  k: number,
  fixed: number[],
  together: Int32Array,
  playStreak: number[],
  n: number,
): number[] {
  if (k <= 0) return [];
  if (k >= tied.length) return tied.slice(0, k);
  const cost = (group: number[]) => {
    let c = 0;
    for (let x = 0; x < group.length; x++) {
      const a = group[x];
      c += playStreak[a];
      for (const f of fixed) c += together[a * n + f] * 100;
      for (let y = x + 1; y < group.length; y++) c += together[a * n + group[y]] * 100;
    }
    return c;
  };

  let combos = 1;
  for (let i = 0; i < k; i++) combos = (combos * (tied.length - i)) / (i + 1);
  if (combos <= 5000) {
    let best: number[] = [];
    let bestCost = Infinity;
    const pick: number[] = [];
    const walk = (start: number) => {
      if (pick.length === k) {
        const c = cost(pick);
        if (c < bestCost) {
          bestCost = c;
          best = pick.slice();
        }
        return;
      }
      for (let i = start; i <= tied.length - (k - pick.length); i++) {
        pick.push(tied[i]);
        walk(i + 1);
        pick.pop();
      }
    };
    walk(0);
    return best;
  }

  // Trop de combinaisons : ajout glouton du joueur le moins « déjà vu ».
  const chosen: number[] = [];
  while (chosen.length < k) {
    let best = -1;
    let bestCost = Infinity;
    for (const c of tied) {
      if (chosen.includes(c)) continue;
      const cst = cost([...chosen, c]);
      if (cst < bestCost) {
        best = c;
        bestCost = cst;
      }
    }
    chosen.push(best);
  }
  return chosen;
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
  const together = initial.together.slice();
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

    const priority = (a: number, b: number) =>
      need[b] - need[a] || Number(restedLast[b]) - Number(restedLast[a]);
    const tie = new Map<number, number>();
    for (const i of eligible) tie.set(i, rng());
    eligible.sort((a, b) => priority(a, b) || tie.get(a)! - tie.get(b)!);

    // Les joueurs strictement prioritaires jouent. Parmi les ex æquo de la
    // limite, on choisit ceux qui ont le moins joué ensemble jusqu'ici : sinon
    // les mêmes joueurs se reposent toujours ensemble et, sur un terrain, se
    // retrouvent toujours dans le même match (adversaires trop répétés).
    const slots = matches * 4;
    const playing: number[] = [];
    if (slots > 0) {
      const boundary = eligible[slots - 1];
      const tied = eligible.filter((i) => priority(i, boundary) === 0);
      playing.push(...eligible.filter((i) => priority(i, boundary) < 0));
      playing.push(...chooseTied(tied, slots - playing.length, playing, together, playStreak, n));
    }
    const isPlaying = new Array<boolean>(n).fill(false);
    for (const i of playing) {
      isPlaying[i] = true;
      need[i]--;
    }
    for (const a of playing) for (const b of playing) if (a !== b) together[a * n + b]++;
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

/**
 * Améliore le calendrier des repos dans son ensemble. Mouvement : x joue en
 * r1 et se repose en r2, y l'inverse → on échange (le nombre de matchs de
 * chacun ne change pas). On garde l'échange s'il équilibre la co-présence des
 * joueurs sur le terrain (somme des carrés) sans dégrader les repos : pas plus
 * de repos consécutifs, ni de séries de repos ou de matchs plus longues.
 * Sur un seul terrain, deux joueurs co-présents sont dans le même match : sans
 * cet équilibrage, certaines paires s'affrontent beaucoup trop souvent.
 */
function balanceRests(
  sets: number[][],
  n: number,
  initial: PlayerState,
  absentFirst: boolean[],
  rng: Rng,
): number[][] {
  const R = sets.length;
  if (R < 2) return sets;
  const play = sets.map((s) => {
    const row = new Array<boolean>(n).fill(false);
    for (const i of s) row[i] = true;
    return row;
  });
  const co = initial.together.slice();
  for (const s of sets) for (const a of s) for (const b of s) if (a !== b) co[a * n + b]++;

  // [repos consécutifs, plus longue série de repos, plus longue série de matchs]
  const restStats = (i: number): [number, number, number] => {
    let rest = initial.restedLast[i] ? 1 : 0;
    let streak = initial.playStreak[i];
    let b2b = 0;
    let maxRest = 0;
    let maxPlay = 0;
    for (let r = 0; r < R; r++) {
      if (play[r][i]) {
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
  let limitRest = 0;
  let limitPlay = 0;
  for (let i = 0; i < n; i++) {
    const [, mr, mp] = restStats(i);
    limitRest = Math.max(limitRest, mr);
    limitPlay = Math.max(limitPlay, mp);
  }

  const iterations = 300 * R;
  for (let it = 0; it < iterations; it++) {
    const r1 = randInt(rng, R);
    const r2 = randInt(rng, R);
    if (r1 === r2) continue;
    const x = sets[r1][randInt(rng, sets[r1].length)];
    if (x === undefined || play[r2][x] || (r2 === 0 && absentFirst[x])) continue;
    const ys = sets[r2].filter((y) => !play[r1][y] && !(r1 === 0 && absentFirst[y]));
    if (ys.length === 0) continue;
    const y = ys[randInt(rng, ys.length)];

    // Variation de la somme des carrés de co-présence.
    let delta = 0;
    for (let z = 0; z < n; z++) {
      if (z === x || z === y) continue;
      const d = Number(play[r2][z]) - Number(play[r1][z]);
      if (d === 0) continue;
      const cx = co[x * n + z];
      const cy = co[y * n + z];
      delta += (cx + d) ** 2 - cx ** 2 + (cy - d) ** 2 - cy ** 2;
    }
    if (delta > 0) continue;

    const before = restStats(x)[0] + restStats(y)[0];
    play[r1][x] = false;
    play[r2][x] = true;
    play[r2][y] = false;
    play[r1][y] = true;
    const sx = restStats(x);
    const sy = restStats(y);
    const ok =
      sx[0] + sy[0] <= before &&
      Math.max(sx[1], sy[1]) <= limitRest &&
      Math.max(sx[2], sy[2]) <= limitPlay &&
      (delta < 0 || rng() < 0.5);
    if (!ok) {
      play[r1][x] = true;
      play[r2][x] = false;
      play[r2][y] = true;
      play[r1][y] = false;
      continue;
    }
    sets[r1] = sets[r1].map((i) => (i === x ? y : i));
    sets[r2] = sets[r2].map((i) => (i === y ? x : i));
    for (let z = 0; z < n; z++) {
      if (z === x || z === y) continue;
      const d = Number(play[r2][z]) - Number(play[r1][z]);
      co[x * n + z] += d;
      co[z * n + x] += d;
      co[y * n + z] -= d;
      co[z * n + y] -= d;
    }
  }
  return sets;
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
const STRICT_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8];
/** Variante : la mixité passe avant la variété des adversaires. */
const MIXED_PRIORITY_ORDER = [0, 1, 2, 6, 7, 3, 4, 5, 8];


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
  const playingSets = balanceRests(
    selectPlayers(sizes, courts, absentFirst, initial, rng),
    n,
    initial,
    absentFirst,
    rng,
  );

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
    together: new Int32Array(n * n),
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
    const played = [...inRotation.keys()].filter((i) => inRotation[i]);
    for (const a of played) for (const b of played) if (a !== b) initial.together[a * n + b]++;
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
