import { describe, expect, it } from 'vitest';
import {
  estimateTournament,
  isTargetCompatible,
  nearestCompatibleTargets,
  planRotationSizes,
  trimNeeds,
} from './feasibility';

describe('compatibilité de la cible', () => {
  it('N × M / 4 doit être entier', () => {
    expect(isTargetCompatible(5, 4)).toBe(true);
    expect(isTargetCompatible(5, 6)).toBe(false);
    expect(isTargetCompatible(6, 8)).toBe(true);
    expect(isTargetCompatible(6, 7)).toBe(false);
    expect(isTargetCompatible(3, 4)).toBe(false);
  });

  it('propose la ou les valeurs compatibles les plus proches', () => {
    expect(nearestCompatibleTargets(5, 8)).toEqual([8]);
    expect(nearestCompatibleTargets(5, 6)).toEqual([4, 8]);
    expect(nearestCompatibleTargets(5, 7)).toEqual([8]);
    expect(nearestCompatibleTargets(6, 7)).toEqual([6, 8]);
    expect(nearestCompatibleTargets(7, 9)).toEqual([8]);
    expect(nearestCompatibleTargets(11, 1)).toEqual([4]);
  });
});

describe('planRotationSizes', () => {
  it('répartit uniformément les matchs', () => {
    expect(planRotationSizes(new Array(14).fill(8), new Array(14).fill(false), 3)).toEqual([
      3, 3, 3, 3, 3, 3, 3, 3, 2, 2,
    ]);
  });

  it('tient compte des absents à la première rotation', () => {
    const absent = [true, true, false, false, false, false, false, false];
    expect(planRotationSizes(new Array(8).fill(8), absent, 2)).toEqual([1, 2, 2, 2, 2, 2, 2, 2, 1]);
  });

  it('trimNeeds rend la somme divisible par 4', () => {
    expect(trimNeeds([6, 6, 6, 6, 6])).toEqual([6, 6, 6, 5, 5]);
    expect(trimNeeds([8, 8, 8, 8, 8])).toEqual([8, 8, 8, 8, 8]);
  });
});

describe('estimateTournament', () => {
  const base = {
    playerCount: 16,
    courts: 4,
    targetMatches: 8,
    absentFirstCount: 0,
    totalMinutes: 120,
    matchMinutes: 12,
    breakMinutes: 2,
  };

  it('calcule rotations et durée', () => {
    const e = estimateTournament(base);
    expect(e.totalMatches).toBe(32);
    expect(e.rotations).toBe(8);
    expect(e.durationMinutes).toBe(8 * 12 + 7 * 2);
    expect(e.fitsInTime).toBe(true);
  });

  it('signale un dépassement de durée et propose une cible qui tient', () => {
    const e = estimateTournament({ ...base, totalMinutes: 60 });
    expect(e.fitsInTime).toBe(false);
    expect(e.maxRotationsInTime).toBe(4);
    expect(e.maxTargetInTime).toBe(4);
  });
});
