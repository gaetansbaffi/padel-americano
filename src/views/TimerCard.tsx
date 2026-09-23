import { useEffect, useRef, useState } from 'react';
import {
  formatClock,
  isRunning,
  pauseTimer,
  remainingMs,
  startTimer,
  timerFor,
  type RotationTimer,
} from '../state/timer';
import { beep, unlockAudio, vibrate } from './device';

interface Props {
  rotation: number;
  durationMinutes: number;
  timer: RotationTimer | undefined;
  onChange: (timer: RotationTimer | undefined) => void;
}

const ONE_MINUTE = 60_000;

/** Compte à rebours de la rotation en cours, avec bips à 1 min et à la fin. */
export default function TimerCard({ rotation, durationMinutes, timer: rawTimer, onChange }: Props) {
  const timer = timerFor(rawTimer, rotation);
  const duration = durationMinutes * ONE_MINUTE;
  const running = isRunning(timer);
  const [now, setNow] = useState(() => Date.now());
  const remaining = remainingMs(timer, duration, now);
  const previous = useRef(remaining);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  // Alertes au franchissement des seuils (pas au rechargement de la page).
  useEffect(() => {
    const before = previous.current;
    previous.current = remaining;
    if (!running) return;
    if (before > 0 && remaining <= 0) {
      beep(3, 350, 180);
      vibrate([400, 150, 400, 150, 400]);
    } else if (duration > 2 * ONE_MINUTE && before > ONE_MINUTE && remaining <= ONE_MINUTE) {
      beep(1, 200);
      vibrate([200]);
    }
  }, [remaining, running, duration]);

  function start() {
    unlockAudio();
    const at = Date.now();
    setNow(at);
    onChange(startTimer(rawTimer, rotation, at));
  }

  const over = remaining <= 0;
  const status = !timer ? 'Prêt' : running ? (over ? 'Temps écoulé' : 'En cours') : over ? 'Temps écoulé' : 'En pause';

  return (
    <section className={`timer ${running ? 'running' : ''} ${over && timer ? 'over' : ''}`} aria-label="Chrono de la rotation">
      <div className="timer-clock" role="timer" aria-live="off">
        {formatClock(remaining)}
      </div>
      <div className="timer-side">
        <span className="timer-status">{status}</span>
        <div className="btn-row">
          {running ? (
            <button className="btn btn-primary btn-grow" onClick={() => onChange(pauseTimer(timer!, Date.now()))}>
              Pause
            </button>
          ) : (
            <button className="btn btn-primary btn-grow" onClick={start}>
              {timer ? 'Reprendre' : 'Démarrer'}
            </button>
          )}
          {timer && (!running || over) && (
            <button className="btn" onClick={() => onChange(undefined)} aria-label="Remettre le chrono à zéro">
              ↺
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
