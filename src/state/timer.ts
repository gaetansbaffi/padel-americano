// Chrono de rotation. L'état est sauvegardé avec le tournoi : recharger la
// page ne fait pas perdre le temps écoulé.

export interface RotationTimer {
  /** Rotation à laquelle le chrono se rapporte. */
  rotation: number;
  /** Horodatage (ms) du dernier démarrage, null si en pause. */
  startedAt: number | null;
  /** Temps écoulé cumulé avant le dernier démarrage (ms). */
  elapsedMs: number;
}

export function elapsedMs(timer: RotationTimer, now: number): number {
  return timer.elapsedMs + (timer.startedAt === null ? 0 : Math.max(0, now - timer.startedAt));
}

/** Temps restant en ms (négatif une fois le temps dépassé). */
export function remainingMs(timer: RotationTimer | undefined, durationMs: number, now: number): number {
  return durationMs - (timer ? elapsedMs(timer, now) : 0);
}

export function isRunning(timer: RotationTimer | undefined): boolean {
  return !!timer && timer.startedAt !== null;
}

/** Chrono de la rotation donnée (un chrono d'une autre rotation ne compte pas). */
export function timerFor(timer: RotationTimer | undefined, rotation: number): RotationTimer | undefined {
  return timer && timer.rotation === rotation ? timer : undefined;
}

export function startTimer(timer: RotationTimer | undefined, rotation: number, now: number): RotationTimer {
  const current = timerFor(timer, rotation);
  if (current && current.startedAt !== null) return current;
  return { rotation, startedAt: now, elapsedMs: current?.elapsedMs ?? 0 };
}

export function pauseTimer(timer: RotationTimer, now: number): RotationTimer {
  if (timer.startedAt === null) return timer;
  return { ...timer, startedAt: null, elapsedMs: elapsedMs(timer, now) };
}

/** « 12:05 », ou « −0:42 » une fois le temps dépassé. */
export function formatClock(ms: number): string {
  const negative = ms < 0;
  // Arrondi au-dessus : l'affichage passe à 0:00 au moment exact de la fin.
  const total = negative ? Math.floor(-ms / 1000) : Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${negative ? '−' : ''}${m}:${String(s).padStart(2, '0')}`;
}
