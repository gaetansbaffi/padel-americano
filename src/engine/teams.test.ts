import { describe, expect, it } from 'vitest';
import { analyzeTeamSchedule, findTeamViolations, generateTeamSchedule, type TeamRotation } from './teams';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `E${i + 1}`);

function expectSound(rotations: TeamRotation[], teamIds: string[], target: number, courts: number) {
  const n = teamIds.length;
  const q = analyzeTeamSchedule(rotations, teamIds);
  expect(findTeamViolations(rotations)).toEqual([]);
  for (const rot of rotations) expect(rot.matches.length).toBeLessThanOrEqual(courts);
  expect(q.totalMatches).toBe((n * target) / 2);
  expect(q.minMatches).toBe(target);
  expect(q.maxMatches).toBe(target);
  expect(q.minRests).toBe(q.maxRests);
  // Par équipes, jusqu'à 2 repos de suite sont tolérés (sinon, quand la
  // moitié des équipes se repose, les deux moitiés ne se rencontrent jamais).
  const perRotation = Math.min(courts, Math.floor(n / 2)) * 2;
  if (n - perRotation <= perRotation) expect(q.maxConsecutiveRests).toBeLessThanOrEqual(2);
  expect(q.opponentRepeats).toBe(q.minPossibleOpponentRepeats);
  expect(q.maxSameOpponent).toBe(q.idealMaxSameOpponent);
  return q;
}

describe('generateTeamSchedule', () => {
  it.each([
    // équipes, terrains, matchs par équipe, rotations attendues
    [4, 2, 3, 3],
    [5, 2, 4, 5],
    [6, 3, 5, 5],
    [6, 2, 5, 8],
    [7, 3, 6, 7],
    [8, 4, 7, 7],
    [8, 2, 7, 14],
    [8, 4, 8, 8],
    [10, 5, 9, 9],
    [4, 1, 6, 12],
    [6, 1, 5, 15],
  ])('%i équipes / %i terrain(s) / %i matchs', (n, courts, target, rotations) => {
    for (const seed of [1, 2]) {
      const teamIds = ids(n);
      const r = generateTeamSchedule({ teamIds, courts, targetMatches: target, seed });
      expect(r.warnings).toEqual([]);
      expect(r.rotations).toHaveLength(rotations);
      expectSound(r.rotations, teamIds, target, courts);
    }
  });

  it('tournoi complet : chaque équipe rencontre toutes les autres exactement une fois', () => {
    const teamIds = ids(8);
    const r = generateTeamSchedule({ teamIds, courts: 4, targetMatches: 7 });
    const q = analyzeTeamSchedule(r.rotations, teamIds);
    expect(q.opponentRepeats).toBe(0);
    for (const t of q.teams) expect(t.distinctOpponents).toBe(7);
  });

  it('nombre impair d’équipes : une équipe au repos à chaque rotation, chacune une fois', () => {
    const teamIds = ids(5);
    const r = generateTeamSchedule({ teamIds, courts: 2, targetMatches: 4 });
    expect(r.rotations.map((x) => x.resting.length)).toEqual([1, 1, 1, 1, 1]);
    const q = analyzeTeamSchedule(r.rotations, teamIds);
    for (const t of q.teams) expect(t.rests).toBe(1);
  });

  it('respecte les absences à la première rotation', () => {
    const teamIds = ids(6);
    const r = generateTeamSchedule({ teamIds, courts: 3, targetMatches: 5, absentFirstRotation: ['E1'] });
    expect(r.rotations[0].absent).toEqual(['E1']);
    expect(r.rotations[0].matches.flat()).not.toContain('E1');
    const q = analyzeTeamSchedule(r.rotations, teamIds);
    expect(findTeamViolations(r.rotations)).toEqual([]);
    expect(q.minMatches).toBe(5);
    expect(q.maxMatches).toBe(5);
  });

  it('cible incompatible : écart d’un match au plus, avec avertissement', () => {
    const teamIds = ids(5);
    const r = generateTeamSchedule({ teamIds, courts: 2, targetMatches: 3 });
    const q = analyzeTeamSchedule(r.rotations, teamIds);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(q.maxMatches - q.minMatches).toBe(1);
  });

  it('régénération : l’historique est conservé et complété sans répétition évitable', () => {
    const teamIds = ids(8);
    const full = generateTeamSchedule({ teamIds, courts: 4, targetMatches: 7, seed: 4 });
    const history = full.rotations.slice(0, 3);
    const rest = generateTeamSchedule({ teamIds, courts: 4, targetMatches: 7, history, seed: 9 });
    expectSound([...history, ...rest.rotations], teamIds, 7, 4);
  });

  it('est déterministe pour une même graine', () => {
    const a = generateTeamSchedule({ teamIds: ids(7), courts: 3, targetMatches: 6, seed: 5 });
    const b = generateTeamSchedule({ teamIds: ids(7), courts: 3, targetMatches: 6, seed: 5 });
    expect(a).toEqual(b);
  });
});
