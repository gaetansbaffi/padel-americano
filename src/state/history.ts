// Historique des tournois (sur cet appareil) et recréation d'un tournoi.

import { standingsRows } from './share';
import { activePlayers, activeTeams, allMatches, createTournament, type Tournament } from './tournament';

export interface ArchivedTournament {
  /** Identifiant de l'archive (= date de création du tournoi). */
  id: string;
  archivedAt: string;
  tournament: Tournament;
}

/** Au-delà, les plus anciens tournois sont oubliés (place limitée sur l'appareil). */
export const HISTORY_LIMIT = 50;

/** Un tournoi mérite d'être archivé dès qu'un planning a été généré. */
export function shouldArchive(t: Tournament): boolean {
  return t.rotations.length > 0;
}

/**
 * Ajoute (ou met à jour) un tournoi en tête de l'historique. Un même tournoi
 * archivé deux fois n'apparaît qu'une fois, dans sa dernière version.
 */
export function archiveTournament(
  history: ArchivedTournament[],
  t: Tournament,
  now = new Date(),
): ArchivedTournament[] {
  if (!shouldArchive(t)) return history;
  const id = t.createdAt;
  const entry: ArchivedTournament = { id, archivedAt: now.toISOString(), tournament: t };
  return [entry, ...history.filter((h) => h.id !== id)].slice(0, HISTORY_LIMIT);
}

export function removeFromHistory(history: ArchivedTournament[], id: string): ArchivedTournament[] {
  return history.filter((h) => h.id !== id);
}

/**
 * Nouveau tournoi avec les mêmes joueurs (ou les mêmes équipes) et les mêmes
 * réglages, sans planning ni score. Les joueurs et équipes retirés ne sont
 * pas repris.
 */
export function recreateTournament(source: Tournament, now = new Date()): Tournament {
  const fresh = createTournament(now);
  const c = source.config;
  const players = activePlayers(c).map(({ id, name, gender }) => (gender ? { id, name, gender } : { id, name }));
  const kept = new Set(players.map((p) => p.id));
  const teams = activeTeams(c)
    .filter((team) => team.players.every((p) => kept.has(p)))
    .map(({ id, players: members }) => ({ id, players: members }));
  return {
    ...fresh,
    config: {
      ...fresh.config,
      name: c.name,
      format: c.format,
      players,
      teams,
      courts: c.courts,
      totalMinutes: c.totalMinutes,
      matchMinutes: c.matchMinutes,
      breakMinutes: c.breakMinutes,
      targetMatches: c.targetMatches,
      pointsPerMatch: c.pointsPerMatch,
      preferMixed: c.preferMixed,
      mixedBeforeOpponents: c.mixedBeforeOpponents,
    },
  };
}

export interface TournamentSummary {
  name: string;
  date: string;
  format: Tournament['config']['format'];
  participants: number;
  played: number;
  total: number;
  finished: boolean;
  /** Vainqueur(s) (ex æquo possibles), seulement si le tournoi est terminé. */
  winners: string[];
}

export function summarize(t: Tournament): TournamentSummary {
  const matches = allMatches(t);
  const played = matches.filter((m) => m.score).length;
  const finished = matches.length > 0 && played === matches.length;
  const names = new Map(t.config.players.map((p) => [p.id, p.name]));
  const winners = finished
    ? standingsRows(t, names)
        .filter((r) => r.row.rank === 1)
        .map((r) => r.label)
    : [];
  return {
    name: t.config.name,
    date: t.createdAt,
    format: t.config.format,
    participants: t.config.format === 'teams' ? activeTeams(t.config).length : activePlayers(t.config).length,
    played,
    total: matches.length,
    finished,
    winners,
  };
}
