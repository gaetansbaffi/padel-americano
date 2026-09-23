import { describe, expect, it } from 'vitest';
import { archiveTournament, HISTORY_LIMIT, recreateTournament, removeFromHistory, summarize } from './history';
import { loadHistory, saveHistory } from './storage';
import {
  addTeam,
  createTournament,
  regeneratePlanning,
  removePlayer,
  setMatchScore,
  updateConfig,
  type Tournament,
} from './tournament';

function individual(n = 5, when = new Date('2026-09-20T10:00:00Z')): Tournament {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Joueur ${i + 1}` }));
  return regeneratePlanning(
    updateConfig(createTournament(when), { name: 'Jeudi soir', players, courts: 1, targetMatches: 4, pointsPerMatch: 24 }),
  );
}

function finish(t: Tournament): Tournament {
  let out = t;
  for (const r of t.rotations) for (const m of r.matches) out = setMatchScore(out, m.id, { a: 15, b: 9 });
  return out;
}

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe('historique', () => {
  it('n’archive que les tournois ayant un planning, sans doublon', () => {
    expect(archiveTournament([], createTournament())).toEqual([]);
    const t = individual();
    let h = archiveTournament([], t);
    expect(h).toHaveLength(1);
    // Même tournoi archivé à nouveau (après des scores) : une seule entrée, à jour.
    const scored = finish(t);
    h = archiveTournament(h, scored);
    expect(h).toHaveLength(1);
    expect(h[0].tournament).toEqual(scored);
  });

  it('les plus récents en tête, limite de taille, suppression', () => {
    let h = archiveTournament([], individual(5, new Date('2026-01-01T00:00:00Z')));
    h = archiveTournament(h, individual(5, new Date('2026-02-01T00:00:00Z')));
    expect(h.map((e) => e.id)).toEqual(['2026-02-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']);
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = archiveTournament(h, individual(5, new Date(Date.UTC(2025, 0, 1, 0, i))));
    expect(h).toHaveLength(HISTORY_LIMIT);
    expect(removeFromHistory(h, h[0].id)).toHaveLength(HISTORY_LIMIT - 1);
  });

  it('résumé : vainqueur seulement quand le tournoi est terminé', () => {
    const t = individual();
    expect(summarize(t)).toMatchObject({ name: 'Jeudi soir', participants: 5, played: 0, total: 5, finished: false, winners: [] });
    const done = summarize(finish(t));
    expect(done.finished).toBe(true);
    expect(done.winners.length).toBeGreaterThan(0);
  });

  it('recréer : mêmes joueurs et réglages, sans planning ; les retirés ne sont pas repris', () => {
    const t = removePlayer(finish(individual()), 'p4');
    const again = recreateTournament(t, new Date('2026-10-01T00:00:00Z'));
    expect(again.rotations).toEqual([]);
    expect(again.createdAt).toBe('2026-10-01T00:00:00.000Z');
    expect(again.config.players.map((p) => p.name)).toEqual(['Joueur 1', 'Joueur 2', 'Joueur 3', 'Joueur 4']);
    expect(again.config).toMatchObject({ name: 'Jeudi soir', courts: 1, targetMatches: 4, pointsPerMatch: 24 });
  });

  it('recréer en mode par équipes garde les mêmes binômes', () => {
    let t = updateConfig(createTournament(), { format: 'teams', courts: 2, targetMatches: 3 });
    for (const [a, b] of [['Alice', 'Bruno'], ['Chloé', 'David'], ['Emma', 'Farid'], ['Gaëlle', 'Hugo']]) t = addTeam(t, a, b);
    t = regeneratePlanning(t);
    const again = recreateTournament(t);
    expect(again.config.format).toBe('teams');
    expect(again.config.teams).toEqual(t.config.teams);
    // Et le nouveau tournoi se génère normalement.
    expect(regeneratePlanning(again).rotations).toHaveLength(3);
  });

  it('sauvegarde et relecture ; les entrées illisibles sont ignorées', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    const h = archiveTournament([], individual());
    expect(saveHistory(h, storage)).toBe(true);
    expect(loadHistory(storage)).toEqual(h);
    storage.setItem('padel-americano/history', JSON.stringify([...h, { id: 'x', archivedAt: 'y', tournament: { foo: 1 } }]));
    expect(loadHistory(storage)).toEqual(h);
  });
});
