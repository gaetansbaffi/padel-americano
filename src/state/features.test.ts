import { describe, expect, it } from 'vitest';
import { scoreWarning } from './scoreCheck';
import { rotationText, standingsText } from './share';
import { formatClock, isRunning, pauseTimer, remainingMs, startTimer, timerFor } from './timer';
import { createTournament, regeneratePlanning, setMatchScore, updateConfig, type Tournament } from './tournament';

const MIN = 60_000;

describe('chrono de rotation', () => {
  it('décompte, se met en pause et reprend sans perdre de temps', () => {
    let timer = startTimer(undefined, 0, 1_000);
    expect(isRunning(timer)).toBe(true);
    expect(remainingMs(timer, 12 * MIN, 1_000 + 2 * MIN)).toBe(10 * MIN);

    timer = pauseTimer(timer, 1_000 + 2 * MIN);
    expect(isRunning(timer)).toBe(false);
    // En pause, le temps ne s'écoule plus.
    expect(remainingMs(timer, 12 * MIN, 1_000 + 9 * MIN)).toBe(10 * MIN);

    timer = startTimer(timer, 0, 5_000_000);
    expect(remainingMs(timer, 12 * MIN, 5_000_000 + MIN)).toBe(9 * MIN);
  });

  it('un chrono ne s’applique qu’à sa rotation', () => {
    const timer = startTimer(undefined, 2, 0);
    expect(timerFor(timer, 2)).toBe(timer);
    expect(timerFor(timer, 3)).toBeUndefined();
    expect(startTimer(timer, 3, 500)).toEqual({ rotation: 3, startedAt: 500, elapsedMs: 0 });
  });

  it('affiche mm:ss et le dépassement', () => {
    expect(formatClock(12 * MIN)).toBe('12:00');
    expect(formatClock(61_500)).toBe('1:02');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-42_300)).toBe('−0:42');
  });
});

describe('contrôle du score', () => {
  it('signale un total incohérent avec les points par match', () => {
    expect(scoreWarning(15, 9, 24)).toBeNull();
    expect(scoreWarning(15, 8, 24)).toMatch(/23 points au lieu de 24/);
  });

  it('signale un 0–0 et accepte tout score sans total fixé', () => {
    expect(scoreWarning(0, 0, null)).toMatch(/0–0/);
    expect(scoreWarning(6, 6, null)).toBeNull();
  });
});

describe('textes à partager', () => {
  function sample(): { t: Tournament; names: Map<string, string> } {
    const players = ['Alice', 'Bruno', 'Chloé', 'David', 'Emma'].map((name, i) => ({ id: `p${i}`, name }));
    let t = regeneratePlanning(updateConfig(createTournament(), { name: 'Open du jeudi', players, courts: 1, targetMatches: 4 }));
    t = setMatchScore(t, t.rotations[0].matches[0].id, { a: 15, b: 9 });
    return { t, names: new Map(players.map((p) => [p.id, p.name])) };
  }

  it('rotation : terrains, équipes, score et repos', () => {
    const { t, names } = sample();
    const text = rotationText(t, 0, names);
    const lines = text.split('\n');
    expect(lines[0]).toBe('🎾 Open du jeudi — Rotation 1/5');
    expect(lines[1]).toMatch(/^Terrain 1 : \S+ & \S+ vs \S+ & \S+ \(15–9\)$/);
    expect(lines[2]).toMatch(/^Repos : \S+$/);
  });

  it('classement : rang, points, différence et bilan', () => {
    const { t, names } = sample();
    const lines = standingsText(t, names).split('\n');
    expect(lines[0]).toBe('🏆 Open du jeudi — Classement (1/5 matchs joués)');
    expect(lines[1]).toMatch(/^1\. \S+ — 15 pts \(\+6\) · 1V 0D$/);
    expect(lines).toHaveLength(6);
  });
});
