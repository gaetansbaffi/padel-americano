// Sauvegarde locale (localStorage) et import/export JSON.

import type { ArchivedTournament } from './history';
import type { Match, Player, Rotation, TeamEntry, Tournament } from './tournament';

export const STORAGE_KEY = 'padel-americano/tournament';

export function loadTournament(storage: Storage = localStorage): Tournament | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? parseTournamentJson(raw) : null;
  } catch {
    return null;
  }
}

export function saveTournament(t: Tournament, storage: Storage = localStorage): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(t));
    return true;
  } catch {
    return false;
  }
}

export const HISTORY_KEY = 'padel-americano/history';

/** Historique sauvegardé ; les entrées illisibles sont ignorées. */
export function loadHistory(storage: Storage = localStorage): ArchivedTournament[] {
  try {
    const raw = storage.getItem(HISTORY_KEY);
    const data: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data)) return [];
    return data.flatMap((e) => {
      if (!isObj(e) || !isStr(e.id) || !isStr(e.archivedAt)) return [];
      try {
        return [{ id: e.id, archivedAt: e.archivedAt, tournament: parseTournamentJson(JSON.stringify(e.tournament)) }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function saveHistory(history: ArchivedTournament[], storage: Storage = localStorage): boolean {
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(history));
    return true;
  } catch {
    return false;
  }
}

export function exportTournamentJson(t: Tournament): string {
  return JSON.stringify(t, null, 2);
}

// ---------------------------------------------------------------------------
// Validation d'un fichier importé : on refuse tout ce qui pourrait casser
// l'application plutôt que de l'importer à moitié.

class ImportError extends Error {}

function fail(message: string): never {
  throw new ImportError(message);
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isInteger(v);

function checkTeam(v: unknown, where: string): [string, string] {
  if (!Array.isArray(v) || v.length !== 2 || !v.every(isStr)) fail(`${where} : équipe invalide.`);
  return [v[0], v[1]];
}

function checkMatch(v: unknown, where: string): Match {
  if (!isObj(v) || !isStr(v.id) || !isInt(v.court)) fail(`${where} : match invalide.`);
  const match: Match = {
    id: v.id,
    court: v.court,
    teamA: checkTeam(v.teamA, where),
    teamB: checkTeam(v.teamB, where),
  };
  if (v.score !== undefined) {
    const s = v.score;
    if (!isObj(s) || !isInt(s.a) || !isInt(s.b) || s.a < 0 || s.b < 0) fail(`${where} : score invalide.`);
    match.score = { a: s.a, b: s.b };
  }
  return match;
}

function checkRotation(v: unknown, i: number): Rotation {
  const where = `Rotation ${i + 1}`;
  if (!isObj(v) || !Array.isArray(v.matches)) fail(`${where} invalide.`);
  const ids = (x: unknown) => (Array.isArray(x) && x.every(isStr) ? x : fail(`${where} : liste de joueurs invalide.`));
  return {
    index: i,
    matches: v.matches.map((m, c) => checkMatch(m, `${where}, terrain ${c + 1}`)),
    resting: ids(v.resting ?? []),
    absent: ids(v.absent ?? []),
  };
}

function checkPlayer(v: unknown): Player {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.name)) fail('Joueur invalide.');
  const player: Player = { id: v.id, name: v.name };
  if (v.gender === 'H' || v.gender === 'F') player.gender = v.gender;
  if (v.withdrawn === true) player.withdrawn = true;
  return player;
}

export function parseTournamentJson(text: string): Tournament {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    fail("Le fichier n'est pas un JSON valide.");
  }
  if (!isObj(data) || data.version !== 1 || !isObj(data.config) || !Array.isArray(data.rotations)) {
    fail("Ce fichier n'est pas un tournoi Padel Americano.");
  }
  const c = data.config;
  const num = (v: unknown, name: string, min: number) =>
    isInt(v) && v >= min ? v : fail(`Configuration : « ${name} » invalide.`);
  if (!isStr(c.name) || !Array.isArray(c.players)) fail('Configuration invalide.');

  const players = c.players.map(checkPlayer);
  if (new Set(players.map((p) => p.id)).size !== players.length) fail('Identifiants de joueurs en double.');
  const playerIds = new Set(players.map((p) => p.id));
  // Champs ajoutés avec le mode par équipes : absents des anciens fichiers.
  const teams: TeamEntry[] = Array.isArray(c.teams)
    ? c.teams.map((x) => {
        if (!isObj(x) || !isStr(x.id)) fail('Équipe invalide.');
        const members = checkTeam(x.players, 'Équipe');
        if (!members.every((id) => playerIds.has(id))) fail('Équipe : joueur inconnu.');
        return x.withdrawn === true ? { id: x.id, players: members, withdrawn: true } : { id: x.id, players: members };
      })
    : [];
  const rotations = data.rotations.map(checkRotation);
  const known = new Set(players.map((p) => p.id));
  for (const r of rotations) {
    for (const m of r.matches) {
      for (const id of [...m.teamA, ...m.teamB]) {
        if (!known.has(id)) fail(`Rotation ${r.index + 1} : joueur inconnu (${id}).`);
      }
    }
  }

  const now = new Date().toISOString();
  const tm = data.timer;
  const timer =
    isObj(tm) && isInt(tm.rotation) && isInt(tm.elapsedMs) && (tm.startedAt === null || isInt(tm.startedAt))
      ? { rotation: tm.rotation, startedAt: tm.startedAt as number | null, elapsedMs: tm.elapsedMs }
      : undefined;
  return {
    version: 1,
    config: {
      name: c.name,
      format: c.format === 'teams' ? 'teams' : 'individual',
      players,
      teams,
      courts: num(c.courts, 'terrains', 1),
      totalMinutes: num(c.totalMinutes, 'durée disponible', 0),
      matchMinutes: num(c.matchMinutes, 'durée des matchs', 1),
      breakMinutes: num(c.breakMinutes, 'durée entre rotations', 0),
      targetMatches: num(c.targetMatches, 'matchs par joueur', 1),
      pointsPerMatch: c.pointsPerMatch == null ? null : num(c.pointsPerMatch, 'points par match', 1),
      preferMixed: c.preferMixed === true,
      mixedBeforeOpponents: c.mixedBeforeOpponents === true,
      absentFirstRotation: Array.isArray(c.absentFirstRotation)
        ? c.absentFirstRotation.filter((id): id is string => isStr(id) && known.has(id))
        : [],
      seed: isInt(c.seed) ? c.seed : 1,
    },
    rotations,
    planSignature: isStr(data.planSignature) ? data.planSignature : null,
    warnings: Array.isArray(data.warnings) ? data.warnings.filter(isStr) : [],
    ...(timer ? { timer } : {}),
    createdAt: isStr(data.createdAt) ? data.createdAt : now,
    updatedAt: isStr(data.updatedAt) ? data.updatedAt : now,
  };
}
