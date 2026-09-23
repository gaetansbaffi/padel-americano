import { describe, expect, it } from 'vitest';
import { rotationText, standingsText } from './share';
import { exportTournamentJson, parseTournamentJson } from './storage';
import {
  addTeam,
  createTournament,
  participantLabels,
  playersWithoutTeam,
  regeneratePlanning,
  removeTeam,
  setFormat,
  setMatchScore,
  updateConfig,
  type Tournament,
} from './tournament';

function teamTournament(teamCount: number, courts: number, target: number): Tournament {
  let t = updateConfig(createTournament(), { format: 'teams', courts, targetMatches: target, name: 'Open équipes' });
  for (let i = 0; i < teamCount; i++) t = addTeam(t, `A${i + 1}`, `B${i + 1}`);
  return t;
}

const names = (t: Tournament) => new Map(t.config.players.map((p) => [p.id, p.name]));

describe('mode par équipes', () => {
  it('génère un tournoi où les binômes restent fixes', () => {
    const t = regeneratePlanning(teamTournament(6, 3, 5));
    expect(t.rotations).toHaveLength(5);
    const pairs = new Set(t.config.teams.map((x) => [...x.players].sort().join('|')));
    for (const r of t.rotations) {
      for (const m of r.matches) {
        expect(pairs.has([...m.teamA].sort().join('|'))).toBe(true);
        expect(pairs.has([...m.teamB].sort().join('|'))).toBe(true);
      }
    }
    // Tournoi complet : chaque équipe rencontre les 5 autres une fois.
    const meetings = new Set(t.rotations.flatMap((r) => r.matches.map((m) => [m.teamA[0], m.teamB[0]].sort().join('|'))));
    expect(meetings.size).toBe(15);
  });

  it('équipes au repos regroupées dans les libellés et le texte partagé', () => {
    const t = regeneratePlanning(teamTournament(5, 2, 4));
    const rot = t.rotations[0];
    expect(rot.resting).toHaveLength(2); // les deux joueurs de l'équipe au repos
    const labels = participantLabels(rot.resting, t.config, names(t));
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatch(/^A\d & B\d$/);
    expect(rotationText(t, 0, names(t))).toContain(`Repos : ${labels[0]}`);
  });

  it('classement partagé par équipe', () => {
    let t = regeneratePlanning(teamTournament(4, 2, 3));
    const m = t.rotations[0].matches[0];
    t = setMatchScore(t, m.id, { a: 16, b: 8 });
    const lines = standingsText(t, names(t)).split('\n');
    expect(lines).toHaveLength(5); // titre + 4 équipes
    expect(lines[1]).toMatch(/^1\. A\d & B\d — 16 pts \(\+8\) · 1V 0D$/);
  });

  it('régénération : les matchs avec score sont conservés, les équipes complètent leur quota', () => {
    let t = regeneratePlanning(teamTournament(8, 4, 7));
    for (const m of t.rotations[0].matches) t = setMatchScore(t, m.id, { a: 12, b: 9 });
    const kept = t.rotations[0];
    const after = regeneratePlanning(updateConfig(t, { seed: 42 }));
    expect(after.rotations[0]).toEqual(kept);
    const played = new Map<string, number>();
    for (const r of after.rotations) for (const m of r.matches) for (const id of [m.teamA[0], m.teamB[0]]) played.set(id, (played.get(id) ?? 0) + 1);
    expect(new Set(played.values())).toEqual(new Set([7]));
  });

  it('passer en mode équipes forme des binômes dans l’ordre de la liste', () => {
    const players = ['Alice', 'Bruno', 'Chloé', 'David', 'Emma'].map((name, i) => ({ id: `p${i}`, name }));
    const t = setFormat(updateConfig(createTournament(), { players }), 'teams');
    expect(t.config.teams.map((x) => x.players)).toEqual([
      ['p0', 'p1'],
      ['p2', 'p3'],
    ]);
    expect(playersWithoutTeam(t.config).map((p) => p.name)).toEqual(['Emma']);
  });

  it('une équipe déjà planifiée est retirée, jamais supprimée', () => {
    const t = regeneratePlanning(teamTournament(4, 2, 3));
    const id = t.config.teams[0].id;
    const removed = removeTeam(t, id);
    expect(removed.config.teams.find((x) => x.id === id)?.withdrawn).toBe(true);
    expect(removed.rotations).toEqual(t.rotations);
    const fresh = removeTeam(teamTournament(4, 2, 3), id);
    expect(fresh.config.teams).toHaveLength(4);
  });

  it('export / import conserve le format et les équipes ; un ancien fichier reste individuel', () => {
    const t = regeneratePlanning(teamTournament(4, 2, 3));
    expect(parseTournamentJson(exportTournamentJson(t))).toEqual(t);
    const old = JSON.parse(exportTournamentJson(createTournament()));
    delete old.config.format;
    delete old.config.teams;
    const parsed = parseTournamentJson(JSON.stringify(old));
    expect(parsed.config.format).toBe('individual');
    expect(parsed.config.teams).toEqual([]);
  });
});
