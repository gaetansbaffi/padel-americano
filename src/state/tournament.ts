// État du tournoi et opérations pures (sans React), faciles à tester.

import {
  generateSchedule,
  type Gender,
  type MatchScore,
  type PlannedRotation,
  type Team,
} from '../engine';
import type { RotationTimer } from './timer';

export interface Player {
  id: string;
  name: string;
  gender?: Gender;
  /** Joueur retiré en cours de tournoi : conservé pour l'historique. */
  withdrawn?: boolean;
}

export interface TournamentConfig {
  name: string;
  players: Player[];
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
      players: [],
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
