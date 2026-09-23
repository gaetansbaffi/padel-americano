// Calculs de faisabilité : compatibilité de la cible, taille des rotations,
// estimation de durée.
//
// `perMatch` = nombre d'« entités » par match : 4 joueurs en Americano
// individuel, 2 équipes en Americano par équipes.

export type PerMatch = 2 | 4;

/** Un planning parfaitement équitable exige N × M / perMatch entier. */
export function isTargetCompatible(count: number, target: number, perMatch: PerMatch = 4): boolean {
  return count >= perMatch && target > 0 && (count * target) % perMatch === 0;
}

/**
 * Valeurs compatibles les plus proches de `target` (une ou deux valeurs à
 * égale distance, triées). Renvoie `[target]` si la cible est déjà valide.
 */
export function nearestCompatibleTargets(count: number, target: number, perMatch: PerMatch = 4): number[] {
  if (count < perMatch) return [];
  for (let d = 0; d <= 4; d++) {
    const found = [target - d, target + d].filter(
      (m, i) => (d > 0 || i === 0) && isTargetCompatible(count, m, perMatch),
    );
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * Ajuste les besoins (matchs restants par entité) pour que leur somme soit
 * divisible par `perMatch`. On retire un match à ceux qui ont le plus gros
 * besoin (en partant de la fin de la liste en cas d'égalité) : l'écart final
 * reste au plus de 1.
 */
export function trimNeeds(needs: number[], perMatch: PerMatch = 4): number[] {
  const result = needs.slice();
  let excess = result.reduce((s, n) => s + n, 0) % perMatch;
  while (excess > 0) {
    let best = -1;
    for (let i = result.length - 1; i >= 0; i--) {
      if (best < 0 || result[i] > result[best]) best = i;
    }
    if (best < 0 || result[best] === 0) break;
    result[best]--;
    excess--;
  }
  return result;
}

/**
 * Nombre de matchs par rotation. On cherche le plus petit nombre de rotations
 * compatible avec le nombre de terrains, les participants disponibles et les
 * absences à la première rotation, puis on répartit les matchs le plus
 * uniformément possible entre les rotations.
 */
export function planRotationSizes(
  needs: number[],
  absentFirst: boolean[],
  courts: number,
  perMatch: PerMatch = 4,
): number[] {
  const totalMatches = Math.floor(needs.reduce((s, n) => s + n, 0) / perMatch);
  if (totalMatches === 0 || courts <= 0) return [];

  const eligible = needs.filter((n) => n > 0).length;
  const eligibleFirst = needs.filter((n, i) => n > 0 && !absentFirst[i]).length;
  const capOther = Math.min(courts, Math.floor(eligible / perMatch));
  const capFirst = Math.min(courts, Math.floor(eligibleFirst / perMatch));
  if (capOther === 0) return [];

  const maxNeed = Math.max(...needs);
  const maxNeedAbsent = Math.max(0, ...needs.filter((_, i) => absentFirst[i]));
  let rotations = Math.max(1, maxNeed, maxNeedAbsent > 0 ? maxNeedAbsent + 1 : 0);
  while (capFirst + (rotations - 1) * capOther < totalMatches) rotations++;

  const caps = Array.from({ length: rotations }, (_, r) => (r === 0 ? capFirst : capOther));
  const sizes = new Array<number>(rotations).fill(0);
  for (let m = 0; m < totalMatches; m++) {
    let best = -1;
    for (let r = 0; r < rotations; r++) {
      if (sizes[r] < caps[r] && (best < 0 || sizes[r] < sizes[best])) best = r;
    }
    sizes[best]++;
  }
  return sizes;
}

export interface EstimateInput {
  /** Nombre de joueurs (individuel) ou d'équipes (par équipes). */
  playerCount: number;
  courts: number;
  targetMatches: number;
  absentFirstCount: number;
  totalMinutes: number;
  matchMinutes: number;
  breakMinutes: number;
  perMatch?: PerMatch;
}

export interface TournamentEstimate {
  compatible: boolean;
  suggestions: number[];
  totalMatches: number;
  rotations: number;
  courtsUsed: number;
  durationMinutes: number;
  maxRotationsInTime: number;
  fitsInTime: boolean;
  /** Plus grande cible compatible qui tient dans la durée disponible. */
  maxTargetInTime: number | null;
  errors: string[];
}

function rotationsFor(input: EstimateInput, target: number): number[] {
  const perMatch = input.perMatch ?? 4;
  const needs = trimNeeds(new Array(input.playerCount).fill(target), perMatch);
  const absent = needs.map((_, i) => i < input.absentFirstCount);
  return planRotationSizes(needs, absent, input.courts, perMatch);
}

function durationOf(rotations: number, input: EstimateInput): number {
  if (rotations === 0) return 0;
  return rotations * input.matchMinutes + (rotations - 1) * input.breakMinutes;
}

export function estimateTournament(input: EstimateInput): TournamentEstimate {
  const perMatch = input.perMatch ?? 4;
  const errors: string[] = [];
  if (input.playerCount < perMatch) {
    errors.push(perMatch === 4 ? 'Il faut au moins 4 joueurs.' : 'Il faut au moins 2 équipes.');
  }
  if (input.courts < 1) errors.push('Il faut au moins 1 terrain.');
  if (input.targetMatches < 1) errors.push('Le nombre de matchs doit être au moins 1.');
  if (input.matchMinutes < 1) errors.push('La durée des matchs doit être positive.');

  const sizes = errors.length ? [] : rotationsFor(input, input.targetMatches);
  const rotations = sizes.length;
  const slot = input.matchMinutes + input.breakMinutes;
  const maxRotationsInTime =
    slot > 0 ? Math.max(0, Math.floor((input.totalMinutes + input.breakMinutes) / slot)) : 0;

  let maxTargetInTime: number | null = null;
  if (!errors.length) {
    for (let m = 1; m <= 40; m++) {
      if (!isTargetCompatible(input.playerCount, m, perMatch)) continue;
      if (rotationsFor(input, m).length <= maxRotationsInTime) maxTargetInTime = m;
    }
  }

  return {
    compatible: isTargetCompatible(input.playerCount, input.targetMatches, perMatch),
    suggestions: nearestCompatibleTargets(input.playerCount, input.targetMatches, perMatch),
    totalMatches: sizes.reduce((s, n) => s + n, 0),
    rotations,
    courtsUsed: Math.max(0, ...sizes),
    durationMinutes: durationOf(rotations, input),
    maxRotationsInTime,
    fitsInTime: rotations <= maxRotationsInTime,
    maxTargetInTime,
    errors,
  };
}
