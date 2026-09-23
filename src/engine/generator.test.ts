import { describe, expect, it } from 'vitest';
import { analyzeSchedule, findViolations } from './analysis';
import { generateSchedule } from './generator';
import type { GenerateInput, PlannedRotation } from './types';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`);

function run(input: Partial<GenerateInput> & { n: number; courts: number; target: number }) {
  const playerIds = ids(input.n);
  const result = generateSchedule({ ...input, playerIds, targetMatches: input.target });
  const quality = analyzeSchedule(result.rotations, playerIds, input.genders);
  return { playerIds, result, quality };
}

/** Vérifications communes à toute configuration compatible. */
function expectSoundSchedule(
  rotations: PlannedRotation[],
  playerIds: string[],
  target: number,
  courts: number,
) {
  const n = playerIds.length;
  const q = analyzeSchedule(rotations, playerIds);

  // Contraintes absolues.
  expect(findViolations(rotations)).toEqual([]);
  for (const rot of rotations) expect(rot.matches.length).toBeLessThanOrEqual(courts);

  // Nombre de matchs.
  expect(q.totalMatches).toBe((n * target) / 4);
  expect(q.minMatches).toBe(target);
  expect(q.maxMatches).toBe(target);

  // Repos : même nombre pour tous, et jamais deux repos d'affilée quand il y
  // a au moins autant de joueurs en jeu qu'au repos.
  expect(q.minRests).toBe(q.maxRests);
  const perRotation = Math.min(courts, Math.floor(n / 4)) * 4;
  if (n - perRotation <= perRotation) expect(q.maxConsecutiveRests).toBeLessThanOrEqual(1);

  // Partenaires : répétitions minimales et réparties équitablement.
  expect(q.maxSamePartner).toBe(q.idealMaxSamePartner);
  expect(q.partnerRepeats).toBe(q.minPossiblePartnerRepeats);
  const low = Math.floor(target / (n - 1));
  const high = Math.ceil(target / (n - 1));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const c = q.partnerCounts.get(`${playerIds[i]}|${playerIds[j]}`) ?? 0;
      if (target >= n - 1) {
        expect(c).toBeGreaterThanOrEqual(low);
      }
      expect(c).toBeLessThanOrEqual(high);
    }
  }
  return q;
}

describe('generateSchedule – configurations prioritaires', () => {
  const cases: [number, number, number, number][] = [
    // joueurs, terrains, matchs par joueur, rotations attendues
    [4, 1, 8, 8],
    [5, 1, 4, 5],
    [5, 1, 8, 10],
    [6, 1, 8, 12],
    [7, 1, 8, 14],
    [8, 2, 8, 8],
    [9, 2, 8, 9],
    [10, 2, 8, 10],
    [11, 2, 8, 11],
    [12, 3, 8, 8],
    [13, 3, 8, 9],
    [14, 3, 8, 10],
    [15, 3, 8, 10],
    [16, 4, 8, 8],
  ];

  it.each(cases)('%i joueurs / %i terrain(s) / %i matchs', (n, courts, target, rotations) => {
    const { playerIds, result } = run({ n, courts, target });
    expect(result.warnings).toEqual([]);
    expect(result.rotations).toHaveLength(rotations);
    expectSoundSchedule(result.rotations, playerIds, target, courts);
  });

  it.each([
    [5, 1, 8],
    [6, 1, 8],
    [7, 1, 8],
    [11, 2, 8],
    [15, 3, 8],
  ])('%i joueurs / %i terrain(s) / %i matchs : robuste sur plusieurs graines', (n, courts, target) => {
    for (let seed = 2; seed <= 6; seed++) {
      const { playerIds, result } = run({ n, courts, target, seed });
      expectSoundSchedule(result.rotations, playerIds, target, courts);
    }
  });

  it('4 joueurs / 1 terrain / 3 matchs : les 3 équipes possibles une fois chacune', () => {
    const { quality } = run({ n: 4, courts: 1, target: 3 });
    expect(quality.totalMatches).toBe(3);
    expect(quality.partnerRepeats).toBe(0);
    expect(quality.identicalMatchRepeats).toBe(0);
  });

  it('5 joueurs / 1 terrain / 4 matchs : 1 repos chacun, chaque paire une seule fois', () => {
    const { playerIds, result, quality } = run({ n: 5, courts: 1, target: 4 });
    expect(quality.totalMatches).toBe(5);
    for (const p of quality.players) expect(p.rests).toBe(1);
    expect(quality.partnerRepeats).toBe(0);
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        expect(quality.partnerCounts.get(`${playerIds[i]}|${playerIds[j]}`)).toBe(1);
      }
    }
    expect(result.rotations.map((r) => r.resting.length)).toEqual([1, 1, 1, 1, 1]);
  });

  it('5 joueurs / 1 terrain / 8 matchs : 2 repos chacun, chaque paire exactement 2 fois', () => {
    const { quality } = run({ n: 5, courts: 1, target: 8 });
    expect(quality.totalMatches).toBe(10);
    for (const p of quality.players) expect(p.rests).toBe(2);
    expect([...quality.partnerCounts.values()]).toEqual(new Array(10).fill(2));
  });

  it('11 joueurs / 2 terrains / 8 matchs : 22 matchs', () => {
    expect(run({ n: 11, courts: 2, target: 8 }).quality.totalMatches).toBe(22);
  });

  it('15 joueurs / 3 terrains / 8 matchs : 30 matchs', () => {
    expect(run({ n: 15, courts: 3, target: 8 }).quality.totalMatches).toBe(30);
  });

  it('16 joueurs / 4 terrains / 8 matchs : 32 matchs sans partenaire répété', () => {
    const { quality } = run({ n: 16, courts: 4, target: 8 });
    expect(quality.totalMatches).toBe(32);
    expect(quality.partnerRepeats).toBe(0);
    expect(quality.identicalMatchRepeats).toBe(0);
  });
});

describe('generateSchedule – adversaires', () => {
  it.each([
    [5, 1],
    [6, 1],
    [7, 1],
    [8, 2],
    [9, 2],
    [10, 2],
    [11, 2],
    [12, 3],
    [13, 3],
    [14, 3],
  ])('%i joueurs / %i terrain(s) : répétitions d’adversaires au minimum théorique', (n, courts) => {
    for (const seed of [1, 2]) {
      const { quality } = run({ n, courts, target: 8, seed });
      expect(quality.opponentRepeats).toBe(quality.minPossibleOpponentRepeats);
    }
  });

  it.each([5, 6, 7])(
    '%i joueurs / 1 terrain : personne n’affronte le même joueur plus que l’idéal',
    (n) => {
      // Régression : les mêmes joueurs se reposaient ensemble et se
      // retrouvaient jusqu'à 6 fois adversaires sur 8 matchs (6 joueurs).
      for (const seed of [1, 2, 3]) {
        const { quality } = run({ n, courts: 1, target: 8, seed });
        expect(quality.maxSameOpponent).toBe(quality.idealMaxSameOpponent);
      }
    },
  );

  it('bornes affichées pour 11 joueurs / 8 matchs : 33 répétitions minimum, idéal 2', () => {
    const { quality } = run({ n: 11, courts: 2, target: 8 });
    expect(quality.minPossibleOpponentRepeats).toBe(33);
    expect(quality.idealMaxSameOpponent).toBe(2);
  });
});

describe('generateSchedule – cas particuliers', () => {
  it('plus de terrains que nécessaire : seuls les terrains utiles sont utilisés', () => {
    const { playerIds, result } = run({ n: 6, courts: 3, target: 4 });
    expectSoundSchedule(result.rotations, playerIds, 4, 1);
  });

  it('respecte les absences à la première rotation', () => {
    const absent = ['P1', 'P2'];
    const { playerIds, result } = run({ n: 8, courts: 2, target: 8, absentFirstRotation: absent });
    const first = result.rotations[0];
    expect(first.absent).toEqual(absent);
    const firstPlayers = first.matches.flatMap((m) => [...m.teamA, ...m.teamB]);
    for (const id of absent) expect(firstPlayers).not.toContain(id);
    expect(first.matches).toHaveLength(1);
    const q = analyzeSchedule(result.rotations, playerIds);
    expect(findViolations(result.rotations)).toEqual([]);
    expect(q.minMatches).toBe(8);
    expect(q.maxMatches).toBe(8);
  });

  it('5 joueurs dont 1 absent au début : chacun joue 4 matchs', () => {
    const { result, quality } = run({ n: 5, courts: 1, target: 4, absentFirstRotation: ['P5'] });
    expect(findViolations(result.rotations)).toEqual([]);
    expect(quality.minMatches).toBe(4);
    expect(quality.maxMatches).toBe(4);
    expect(result.rotations).toHaveLength(5);
  });

  it('cible incompatible : planning au mieux, écart de 1 match maximum', () => {
    const { result, quality } = run({ n: 5, courts: 1, target: 6 });
    expect(findViolations(result.rotations)).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(quality.maxMatches).toBe(6);
    expect(quality.minMatches).toBe(5);
    expect(quality.totalMatches).toBe(7);
  });

  it('moins de 4 joueurs : aucun match, avertissement', () => {
    const { result } = run({ n: 3, courts: 1, target: 8 });
    expect(result.rotations).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('est déterministe pour une même graine', () => {
    const a = run({ n: 11, courts: 2, target: 8, seed: 42 }).result;
    const b = run({ n: 11, courts: 2, target: 8, seed: 42 }).result;
    expect(a).toEqual(b);
  });

  it('mixité prioritaire sur les adversaires : 8H/8F → toutes les équipes mixtes, sans partenaire répété', () => {
    const playerIds = ids(16);
    const genders = Object.fromEntries(playerIds.map((id, i) => [id, i % 2 ? 'F' : 'H'] as const));
    const { result, quality } = run({
      n: 16,
      courts: 4,
      target: 8,
      genders,
      preferMixed: true,
      mixedBeforeOpponents: true,
    });
    expectSoundSchedule(result.rotations, playerIds, 8, 4);
    expect(quality.partnerRepeats).toBe(0);
    expect(quality.nonMixedTeams).toBe(0);
  });

  it('mixité prioritaire : 6H/4F → équipes mixtes maximisées sans dégrader les partenaires', () => {
    const playerIds = ids(10);
    const genders = Object.fromEntries(playerIds.map((id, i) => [id, i < 6 ? 'H' : 'F'] as const));
    const withMix = run({ n: 10, courts: 2, target: 8, genders, preferMixed: true, mixedBeforeOpponents: true });
    const without = run({ n: 10, courts: 2, target: 8, genders });
    expectSoundSchedule(withMix.result.rotations, playerIds, 8, 2);
    expect(withMix.quality.nonMixedTeams).toBeLessThan(without.quality.nonMixedTeams);
  });

  it('mixité : ne dégrade pas les répétitions de partenaires', () => {
    const playerIds = ids(8);
    const genders = Object.fromEntries(playerIds.map((id, i) => [id, i < 4 ? 'H' : 'F'] as const));
    const { quality } = run({ n: 8, courts: 2, target: 8, genders, preferMixed: true });
    expect(quality.partnerRepeats).toBe(quality.minPossiblePartnerRepeats);
    expect(quality.maxSamePartner).toBe(quality.idealMaxSamePartner);
  });
});

describe('generateSchedule – régénération du futur', () => {
  it('conserve l’historique et complète jusqu’à la cible', () => {
    const playerIds = ids(12);
    const full = generateSchedule({ playerIds, courts: 3, targetMatches: 8, seed: 3 });
    const history = full.rotations.slice(0, 3);
    const rest = generateSchedule({
      playerIds,
      courts: 3,
      targetMatches: 8,
      history,
      seed: 99,
    });
    const all = [...history, ...rest.rotations];
    expectSoundSchedule(all, playerIds, 8, 3);
  });

  it('un joueur retiré en cours de tournoi n’apparaît plus dans le futur', () => {
    const playerIds = ids(9);
    const full = generateSchedule({ playerIds, courts: 2, targetMatches: 8 });
    const history = full.rotations.slice(0, 2);
    const remaining = playerIds.filter((id) => id !== 'P9');
    const next = generateSchedule({ playerIds: remaining, courts: 2, targetMatches: 8, history });
    expect(findViolations([...history, ...next.rotations])).toEqual([]);
    for (const rot of next.rotations) {
      const everyone = rot.matches.flatMap((m) => [...m.teamA, ...m.teamB]);
      expect(everyone).not.toContain('P9');
    }
    const q = analyzeSchedule([...history, ...next.rotations], remaining);
    expect(q.maxMatches - q.minMatches).toBeLessThanOrEqual(1);
    expect(q.maxMatches).toBe(8);
  });
});
