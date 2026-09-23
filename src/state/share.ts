// Textes prêts à coller dans WhatsApp / SMS.

import { computeStandings } from '../engine';
import { allMatches, type Tournament } from './tournament';

type Names = Map<string, string>;

const name = (names: Names, id: string) => names.get(id) ?? '?';
const team = (names: Names, ids: readonly string[]) => ids.map((id) => name(names, id)).join(' & ');

export function rotationText(t: Tournament, index: number, names: Names): string {
  const rotation = t.rotations[index];
  if (!rotation) return '';
  const lines = [`🎾 ${t.config.name} — Rotation ${index + 1}/${t.rotations.length}`];
  for (const m of rotation.matches) {
    const score = m.score ? ` (${m.score.a}–${m.score.b})` : '';
    lines.push(`Terrain ${m.court} : ${team(names, m.teamA)} vs ${team(names, m.teamB)}${score}`);
  }
  if (rotation.resting.length) lines.push(`Repos : ${rotation.resting.map((id) => name(names, id)).join(', ')}`);
  if (rotation.absent.length) lines.push(`Absents : ${rotation.absent.map((id) => name(names, id)).join(', ')}`);
  return lines.join('\n');
}

export function standingsText(t: Tournament, names: Names): string {
  const matches = allMatches(t);
  const played = matches.filter((m) => m.score).length;
  const rows = computeStandings(
    t.config.players.map((p) => p.id),
    matches,
  ).filter((r) => r.played > 0 || !t.config.players.find((p) => p.id === r.id)?.withdrawn);
  const lines = [`🏆 ${t.config.name} — Classement (${played}/${matches.length} matchs joués)`];
  for (const r of rows) {
    const diff = r.diff > 0 ? `+${r.diff}` : `${r.diff}`;
    lines.push(`${r.rank}. ${name(names, r.id)} — ${r.pointsFor} pts (${diff}) · ${r.wins}V ${r.losses}D`);
  }
  return lines.join('\n');
}
