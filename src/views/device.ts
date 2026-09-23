// Accès aux fonctions du téléphone. Tout est facultatif : si le navigateur
// refuse (ancien iPhone, permissions…), l'application continue sans.

import { useEffect } from 'react';

/** Copie dans le presse-papiers ; renvoie false si impossible. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Repli pour les navigateurs sans API presse-papiers.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

let audio: AudioContext | null = null;

/** À appeler depuis un clic : les navigateurs n'autorisent le son qu'après une action. */
export function unlockAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    audio = null;
  }
}

/** Suite de bips (durées en ms). */
export function beep(count = 3, duration = 250, gap = 150, frequency = 880) {
  if (!audio) return;
  const start = audio.currentTime + 0.05;
  for (let i = 0; i < count; i++) {
    const t = start + (i * (duration + gap)) / 1000;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'square';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration / 1000);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + duration / 1000 + 0.02);
  }
}

export function vibrate(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignoré
  }
}

/** Garde l'écran allumé tant que `active` est vrai (et que la page est visible). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const l = await navigator.wakeLock.request('screen');
        if (cancelled) void l.release();
        else lock = l;
      } catch {
        // refusé : pas grave
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [active]);
}
