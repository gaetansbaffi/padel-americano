// Textes prêts à coller dans WhatsApp / SMS.

import { computeStandings, computeTeamStandings, type StandingRow } from '../engine';
import { allMatches, participantLabels, teamName, type Tournament } from './tournament';

type Names = Map<string, string>;

const team = (names: Names, ids: readonly string[]) => ids.map((id) => names.get(id) ?? '?').join(' & ');

export function rotationText(t: Tournament, index: number, names: Names): string {
  const rotation = t.rotations[index];
  if (!rotation) return '';
  const lines = [`🎾 ${t.config.name} — Rotation ${index + 1}/${t.rotations.length}`];
  for (const m of rotation.matches) {
    const score = m.score ? ` (${m.score.a}–${m.score.b})` : '';
    lines.push(`Terrain ${m.court} : ${team(names, m.teamA)} vs ${team(names, m.teamB)}${score}`);
  }
  if (rotation.resting.length) lines.push(`Repos : ${participantLabels(rotation.resting, t.config, names).join(', ')}`);
  if (rotation.absent.length) lines.push(`Absents : ${participantLabels(rotation.absent, t.config, names).join(', ')}`);
  return lines.join('\n');
}

/** Lignes du classement avec leur libellé (joueur ou équipe), sans les retirés n'ayant pas joué. */
export function standingsRows(t: Tournament, names: Names): { row: StandingRow; label: string; withdrawn: boolean }[] {
  const matches = allMatches(t);
  if (t.config.format === 'teams') {
    const byId = new Map(t.config.teams.map((x) => [x.id, x]));
    return computeTeamStandings(t.config.teams, matches)
      .map((row) => ({ row, label: teamName(byId.get(row.id)!, names), withdrawn: !!byId.get(row.id)?.withdrawn }))
      .filter((r) => r.row.played > 0 || !r.withdrawn);
  }
  const byId = new Map(t.config.players.map((p) => [p.id, p]));
  return computeStandings(
    t.config.players.map((p) => p.id),
    matches,
  )
    .map((row) => ({ row, label: names.get(row.id) ?? '?', withdrawn: !!byId.get(row.id)?.withdrawn }))
    .filter((r) => r.row.played > 0 || !r.withdrawn);
}

export function standingsText(t: Tournament, names: Names): string {
  const matches = allMatches(t);
  const played = matches.filter((m) => m.score).length;
  const lines = [`🏆 ${t.config.name} — Classement (${played}/${matches.length} matchs joués)`];
  for (const { row: r, label } of standingsRows(t, names)) {
    const diff = r.diff > 0 ? `+${r.diff}` : `${r.diff}`;
    lines.push(`${r.rank}. ${label} — ${r.pointsFor} pts (${diff}) · ${r.wins}V ${r.losses}D`);
  }
  return lines.join('\n');
}
