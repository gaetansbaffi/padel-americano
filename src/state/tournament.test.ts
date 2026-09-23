import { describe, expect, it } from 'vitest';
import { exportTournamentJson, parseTournamentJson } from './storage';
import {
  createTournament,
  currentRotationIndex,
  lockedRotationCount,
  regeneratePlanning,
  removePlayer,
  setMatchScore,
  updateConfig,
  type Tournament,
} from './tournament';

function withPlayers(n: number, courts: number): Tournament {
  const t = createTournament();
  return updateConfig(t, {
    courts,
    players: Array.from({ length: n }, (_, i) => ({ id: `id${i + 1}`, name: `Joueur ${i + 1}` })),
  });
}

describe('tournoi', () => {
  it('génère le planning et suit la rotation courante', () => {
    let t = regeneratePlanning(withPlayers(8, 2));
    expect(t.rotations).toHaveLength(8);
    expect(currentRotationIndex(t)).toBe(0);
    for (const m of t.rotations[0].matches) t = setMatchScore(t, m.id, { a: 15, b: 9 });
    expect(currentRotationIndex(t)).toBe(1);
    expect(lockedRotationCount(t)).toBe(1);
  });

  it('la régénération conserve les matchs ayant un score, à l’identique', () => {
    let t = regeneratePlanning(withPlayers(9, 2));
    const firstMatch = t.rotations[0].matches[0];
    t = setMatchScore(t, firstMatch.id, { a: 12, b: 12 });
    const lockedBefore = t.rotations.slice(0, 1);

    t = updateConfig(t, { seed: 7 });
    const after = regeneratePlanning(t);
    expect(after.rotations.slice(0, 1)).toEqual(lockedBefore);
    expect(after.rotations[0].matches[0].score).toEqual({ a: 12, b: 12 });
    const counts = new Map<string, number>();
    for (const r of after.rotations) {
      for (const m of r.matches) for (const id of [...m.teamA, ...m.teamB]) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(new Set(counts.values())).toEqual(new Set([8]));
  });

  it('un joueur déjà planifié est retiré, jamais supprimé', () => {
    const t = regeneratePlanning(withPlayers(8, 2));
    const removed = removePlayer(t, 'id1');
    expect(removed.config.players.find((p) => p.id === 'id1')?.withdrawn).toBe(true);
    expect(removed.rotations).toEqual(t.rotations);

    const fresh = removePlayer(withPlayers(8, 2), 'id1');
    expect(fresh.config.players.some((p) => p.id === 'id1')).toBe(false);
  });

  it('les absences ne concernent que la première rotation', () => {
    const t = regeneratePlanning(updateConfig(withPlayers(8, 2), { absentFirstRotation: ['id3'] }));
    expect(t.rotations[0].absent).toEqual(['id3']);
    const ids = t.rotations[0].matches.flatMap((m) => [...m.teamA, ...m.teamB]);
    expect(ids).not.toContain('id3');
  });
});

describe('import / export JSON', () => {
  it('aller-retour sans perte', () => {
    let t = regeneratePlanning(withPlayers(6, 1));
    t = setMatchScore(t, t.rotations[0].matches[0].id, { a: 20, b: 4 });
    expect(parseTournamentJson(exportTournamentJson(t))).toEqual(t);
  });

  it('refuse un fichier invalide avec un message explicite', () => {
    expect(() => parseTournamentJson('pas du json')).toThrow(/JSON valide/);
    expect(() => parseTournamentJson('{"foo":1}')).toThrow(/pas un tournoi/);
    const t = regeneratePlanning(withPlayers(4, 1));
    const broken = JSON.parse(exportTournamentJson(t));
    broken.rotations[0].matches[0].teamA = ['id1', 'inconnu'];
    expect(() => parseTournamentJson(JSON.stringify(broken))).toThrow(/joueur inconnu/);
  });
});
