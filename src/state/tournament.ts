// État du tournoi et opérations pures (sans React), faciles à tester.

import {
  generateSchedule,
  generateTeamSchedule,
  type Gender,
  type MatchScore,
  type PlannedRotation,
  type Team,
  type TeamRotation,
} from '../engine';
import type { RotationTimer } from './timer';

export interface Player {
  id: string;
  name: string;
  gender?: Gender;
  /** Joueur retiré en cours de tournoi : conservé pour l'historique. */
  withdrawn?: boolean;
}

/** Americano individuel (partenaires tournants) ou par équipes (binômes fixes). */
export type Format = 'individual' | 'teams';

/** Binôme fixe du mode par équipes. */
export interface TeamEntry {
  id: string;
  players: Team;
  /** Équipe retirée en cours de tournoi : conservée pour l'historique. */
  withdrawn?: boolean;
}

export interface TournamentConfig {
  name: string;
  format: Format;
  players: Player[];
  /** Équipes du mode par équipes (leurs joueurs sont dans `players`). */
  teams: TeamEntry[];
  courts: number;
  totalMinutes: number;
  matchMinutes: number;
  breakMinutes: number;
  targetMatches: number;
  /** Total de points par match (ex. 24) pour compléter le score adverse ; null = libre. */
  pointsPerMatch: number | null;
  preferMixed: boolean;
  mixedBeforeOpponents: boolean;
  absentFirstRotation: string[];
  seed: number;
}

export interface Match {
  id: string;
  court: number;
  teamA: Team;
  teamB: Team;
  score?: MatchScore;
}

export interface Rotation {
  index: number;
  matches: Match[];
  resting: string[];
  absent: string[];
}

export interface Tournament {
  version: 1;
  config: TournamentConfig;
  rotations: Rotation[];
  /** Signature de la configuration ayant servi à générer le planning. */
  planSignature: string | null;
  warnings: string[];
  /** Chrono de la rotation en cours (facultatif). */
  timer?: RotationTimer;
  createdAt: string;
  updatedAt: string;
}

export function newPlayerId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function createTournament(now = new Date()): Tournament {
  return {
    version: 1,
    config: {
      name: 'Americano',
      format: 'individual',
      players: [],
      teams: [],
      courts: 2,
      totalMinutes: 120,
      matchMinutes: 12,
      breakMinutes: 2,
      targetMatches: 8,
      pointsPerMatch: null,
      preferMixed: false,
      mixedBeforeOpponents: false,
      absentFirstRotation: [],
      seed: 1,
    },
    rotations: [],
    planSignature: null,
    warnings: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function activePlayers(config: TournamentConfig): Player[] {
  return config.players.filter((p) => !p.withdrawn);
}

export function activeTeams(config: TournamentConfig): TeamEntry[] {
  return config.teams.filter((t) => !t.withdrawn);
}

/** Nombre de participants planifiés : joueurs, ou équipes en mode par équipes. */
export function participantCount(config: TournamentConfig): number {
  return config.format === 'teams' ? activeTeams(config).length : activePlayers(config).length;
}

/** « Alice & Bruno ». */
export function teamName(team: TeamEntry, names: Map<string, string>): string {
  return team.players.map((id) => names.get(id) ?? '?').join(' & ');
}

/**
 * Libellés d'une liste de joueurs (repos, absents) : en mode par équipes, les
 * deux joueurs d'une équipe sont regroupés (« Alice & Bruno »).
 */
export function participantLabels(ids: string[], config: TournamentConfig, names: Map<string, string>): string[] {
  if (config.format !== 'teams') return ids.map((id) => names.get(id) ?? '?');
  const set = new Set(ids);
  const labels: string[] = [];
  const done = new Set<string>();
  for (const team of config.teams) {
    if (team.players.every((p) => set.has(p))) {
      labels.push(teamName(team, names));
      team.players.forEach((p) => done.add(p));
    }
  }
  for (const id of ids) if (!done.has(id)) labels.push(names.get(id) ?? '?');
  return labels;
}

export function isRotationComplete(rotation: Rotation): boolean {
  return rotation.matches.every((m) => m.score !== undefined);
}

/** Première rotation non terminée, ou −1 si tout est joué (ou pas de planning). */
export function currentRotationIndex(t: Tournament): number {
  return t.rotations.findIndex((r) => !isRotationComplete(r));
}

/**
 * Nombre de rotations verrouillées : toutes celles jusqu'à la dernière
 * rotation contenant au moins un score. Elles ne sont jamais régénérées.
 */
export function lockedRotationCount(t: Tournament): number {
  for (let r = t.rotations.length - 1; r >= 0; r--) {
    if (t.rotations[r].matches.some((m) => m.score !== undefined)) return r + 1;
  }
  return 0;
}

export function hasScores(t: Tournament): boolean {
  return lockedRotationCount(t) > 0;
}

/** Champs de configuration qui influencent le planning. */
export function planSignature(config: TournamentConfig): string {
  if (config.format === 'teams') {
    return JSON.stringify({
      format: 'teams',
      teams: activeTeams(config).map((t) => [t.id, ...t.players]),
      courts: config.courts,
      target: config.targetMatches,
      absent: [...config.absentFirstRotation].sort(),
      seed: config.seed,
    });
  }
  return JSON.stringify({
    players: activePlayers(config).map((p) => [p.id, config.preferMixed ? p.gender ?? '' : '']),
    courts: config.courts,
    target: config.targetMatches,
    mixed: config.preferMixed,
    mixedFirst: config.preferMixed && config.mixedBeforeOpponents,
    absent: [...config.absentFirstRotation].sort(),
    seed: config.seed,
  });
}

function toPlanned(rotation: Rotation): PlannedRotation {
  return {
    matches: rotation.matches.map((m) => ({ teamA: m.teamA, teamB: m.teamB })),
    resting: rotation.resting,
    absent: rotation.absent,
  };
}

function touch(t: Tournament): Tournament {
  return { ...t, updatedAt: new Date().toISOString() };
}

/**
 * (Re)génère le planning. Les rotations verrouillées (déjà commencées) sont
 * conservées telles quelles ; seules les suivantes sont recalculées.
 */
export function regeneratePlanning(t: Tournament): Tournament {
  if (t.config.format === 'teams') return regenerateTeamPlanning(t);
  const locked = lockedRotationCount(t);
  const kept = t.rotations.slice(0, locked);
  const players = activePlayers(t.config);
  const playerIds = players.map((p) => p.id);
  const present = new Set(playerIds);

  const result = generateSchedule({
    playerIds,
    courts: t.config.courts,
    targetMatches: t.config.targetMatches,
    genders: Object.fromEntries(players.map((p) => [p.id, p.gender])),
    preferMixed: t.config.preferMixed,
    mixedBeforeOpponents: t.config.mixedBeforeOpponents,
    // Les absences ne concernent que la toute première rotation du tournoi.
    absentFirstRotation:
      locked === 0 ? t.config.absentFirstRotation.filter((id) => present.has(id)) : [],
    history: kept.map(toPlanned),
    seed: t.config.seed,
  });

  const fresh: Rotation[] = result.rotations.map((rot, i) => {
    const index = locked + i;
    return {
      index,
      matches: rot.matches.map((m, c) => ({
        id: `r${index + 1}-t${c + 1}`,
        court: c + 1,
        teamA: m.teamA,
        teamB: m.teamB,
      })),
      resting: rot.resting,
      absent: rot.absent,
    };
  });

  return touch({
    ...t,
    rotations: [...kept, ...fresh],
    planSignature: planSignature(t.config),
    warnings: result.warnings,
  });
}

/** Variante par équipes : le moteur travaille sur les équipes, les matchs gardent les joueurs. */
function regenerateTeamPlanning(t: Tournament): Tournament {
  const locked = lockedRotationCount(t);
  const kept = t.rotations.slice(0, locked);
  const teams = activeTeams(t.config);
  const byId = new Map(t.config.teams.map((team) => [team.id, team]));
  const teamOf = new Map<string, string>();
  for (const team of t.config.teams) for (const p of team.players) teamOf.set(p, team.id);
  const absentPlayers = new Set(t.config.absentFirstRotation);

  const history: TeamRotation[] = kept.map((rot) => ({
    matches: rot.matches.flatMap((m) => {
      const a = teamOf.get(m.teamA[0]);
      const b = teamOf.get(m.teamB[0]);
      return a && b ? [[a, b] as [string, string]] : [];
    }),
    resting: [],
    absent: [],
  }));

  const result = generateTeamSchedule({
    teamIds: teams.map((team) => team.id),
    courts: t.config.courts,
    targetMatches: t.config.targetMatches,
    // Une équipe est absente si l'un de ses joueurs l'est (première rotation seulement).
    absentFirstRotation:
      locked === 0 ? teams.filter((team) => team.players.some((p) => absentPlayers.has(p))).map((team) => team.id) : [],
    history,
    seed: t.config.seed,
  });

  const members = (ids: string[]) => ids.flatMap((id) => byId.get(id)?.players ?? []);
  const fresh: Rotation[] = result.rotations.map((rot, i) => {
    const index = locked + i;
    return {
      index,
      matches: rot.matches.map(([a, b], c) => ({
        id: `r${index + 1}-t${c + 1}`,
        court: c + 1,
        teamA: byId.get(a)!.players,
        teamB: byId.get(b)!.players,
      })),
      resting: members(rot.resting),
      absent: members(rot.absent),
    };
  });

  return touch({
    ...t,
    rotations: [...kept, ...fresh],
    planSignature: planSignature(t.config),
    warnings: result.warnings,
  });
}

/**
 * Change de format. Passer en « par équipes » sans équipe définie forme des
 * binômes avec les joueurs dans l'ordre de la liste (modifiables ensuite).
 */
export function setFormat(t: Tournament, format: Format): Tournament {
  if (format === 'teams' && t.config.teams.length === 0) {
    const players = activePlayers(t.config);
    const teams: TeamEntry[] = [];
    for (let i = 0; i + 1 < players.length; i += 2) {
      teams.push({ id: newPlayerId(), players: [players[i].id, players[i + 1].id] });
    }
    return updateConfig(t, { format, teams });
  }
  return updateConfig(t, { format });
}

/** Joueurs actifs sans équipe (mode par équipes). */
export function playersWithoutTeam(config: TournamentConfig): Player[] {
  const inTeam = new Set(config.teams.flatMap((team) => team.players));
  return activePlayers(config).filter((p) => !inTeam.has(p.id));
}

export function addTeam(t: Tournament, name1: string, name2: string): Tournament {
  const a: Player = { id: newPlayerId(), name: name1 };
  const b: Player = { id: newPlayerId(), name: name2 };
  return updateConfig(t, {
    players: [...t.config.players, a, b],
    teams: [...t.config.teams, { id: newPlayerId(), players: [a.id, b.id] }],
  });
}

/**
 * Supprime une équipe si elle n'a encore aucun match planifié ; sinon elle
 * est seulement marquée « retirée » (ses matchs sont conservés).
 */
export function removeTeam(t: Tournament, teamId: string): Tournament {
  const team = t.config.teams.find((x) => x.id === teamId);
  if (!team) return t;
  const scheduled = scheduledPlayerIds(t);
  const inPlanning = team.players.some((p) => scheduled.has(p));
  const members = new Set(team.players);
  return updateConfig(t, {
    teams: inPlanning
      ? t.config.teams.map((x) => (x.id === teamId ? { ...x, withdrawn: true } : x))
      : t.config.teams.filter((x) => x.id !== teamId),
    players: inPlanning ? t.config.players : t.config.players.filter((p) => !members.has(p.id)),
    absentFirstRotation: t.config.absentFirstRotation.filter((id) => !members.has(id)),
  });
}

export function setMatchScore(t: Tournament, matchId: string, score: MatchScore | undefined): Tournament {
  return touch({
    ...t,
    rotations: t.rotations.map((r) =>
      r.matches.some((m) => m.id === matchId)
        ? { ...r, matches: r.matches.map((m) => (m.id === matchId ? { ...m, score } : m)) }
        : r,
    ),
  });
}

export function setTimer(t: Tournament, timer: RotationTimer | undefined): Tournament {
  return touch({ ...t, timer });
}

export function updateConfig(t: Tournament, patch: Partial<TournamentConfig>): Tournament {
  return touch({ ...t, config: { ...t.config, ...patch } });
}

/** Identifiants des joueurs présents dans au moins un match du planning. */
export function scheduledPlayerIds(t: Tournament): Set<string> {
  const ids = new Set<string>();
  for (const r of t.rotations) for (const m of r.matches) [...m.teamA, ...m.teamB].forEach((id) => ids.add(id));
  return ids;
}

/**
 * Supprime un joueur s'il n'apparaît dans aucun match ; sinon il est
 * seulement marqué « retiré » pour ne jamais modifier les matchs existants.
 */
export function removePlayer(t: Tournament, playerId: string): Tournament {
  const inPlanning = scheduledPlayerIds(t).has(playerId);
  const players = inPlanning
    ? t.config.players.map((p) => (p.id === playerId ? { ...p, withdrawn: true } : p))
    : t.config.players.filter((p) => p.id !== playerId);
  return updateConfig(t, {
    players,
    absentFirstRotation: t.config.absentFirstRotation.filter((id) => id !== playerId),
  });
}

export function allMatches(t: Tournament): Match[] {
  return t.rotations.flatMap((r) => r.matches);
}
