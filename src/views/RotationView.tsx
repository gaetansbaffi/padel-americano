import { useEffect, useState } from 'react';
import {
  currentRotationIndex,
  isRotationComplete,
  participantLabels,
  setMatchScore,
  setTimer,
  type Match,
  type Rotation,
  type Tournament,
  type TournamentConfig,
} from '../state/tournament';
import { rotationText } from '../state/share';
import { scoreWarning } from '../state/scoreCheck';
import { useWakeLock } from './device';
import { useConfirm } from './Dialog';
import { formatDuration, teamLabel } from './format';
import ShareButton from './ShareButton';
import TimerCard from './TimerCard';

interface Props {
  tournament: Tournament;
  names: Map<string, string>;
  onChange: (t: Tournament) => void;
  onGoToConfig: () => void;
  onGoToStandings: () => void;
}

export default function RotationView({ tournament: t, names, onChange, onGoToConfig, onGoToStandings }: Props) {
  const current = currentRotationIndex(t);
  // null = suivre automatiquement la rotation en cours.
  const [pinned, setPinned] = useState<number | null>(null);
  // Écran allumé tant qu'un tournoi est en cours et que cet onglet est affiché.
  useWakeLock(current >= 0);

  if (t.rotations.length === 0) {
    return (
      <div className="card empty">
        <p>Aucun planning pour l’instant.</p>
        <button className="btn btn-primary" onClick={onGoToConfig}>
          Configurer le tournoi
        </button>
      </div>
    );
  }

  const last = t.rotations.length - 1;
  const shown = Math.min(pinned ?? (current === -1 ? last : current), last);
  const rotation = t.rotations[shown];
  const next = current >= 0 ? t.rotations[current + 1] : undefined;
  const { matchMinutes, breakMinutes } = t.config;
  const startsAt = shown * (matchMinutes + breakMinutes);

  function go(index: number) {
    setPinned(index === current ? null : index);
  }

  function save(matchId: string, score: Match['score']) {
    const updated = setMatchScore(t, matchId, score);
    onChange(updated);
    // Rotation terminée : on revient au suivi automatique de la rotation en cours.
    if (score && isRotationComplete(updated.rotations[shown])) setPinned(null);
  }

  const state = shown === current ? 'current' : isRotationComplete(rotation) ? 'done' : 'upcoming';

  return (
    <div className="stack">
      {current === -1 && (
        <div className="card finished">
          <p>Tournoi terminé, bravo à tous !</p>
          <button className="btn btn-primary" onClick={onGoToStandings}>
            Voir le classement
          </button>
        </div>
      )}

      <div className={`rotation-head ${state}`}>
        <button className="icon-btn big" onClick={() => go(shown - 1)} disabled={shown === 0} aria-label="Rotation précédente">
          ‹
        </button>
        <div className="rotation-title">
          <strong>Rotation {shown + 1}</strong>
          <span>
            {state === 'current' ? 'En cours' : state === 'done' ? 'Terminée' : 'À venir'} · {shown + 1}/{t.rotations.length}
            {' · '}début ≈ +{formatDuration(startsAt)}
          </span>
        </div>
        <button className="icon-btn big" onClick={() => go(shown + 1)} disabled={shown === last} aria-label="Rotation suivante">
          ›
        </button>
      </div>
      {pinned !== null && current >= 0 && pinned !== current && (
        <button className="btn btn-block btn-small" onClick={() => setPinned(null)}>
          Revenir à la rotation en cours ({current + 1})
        </button>
      )}

      {shown === current && (
        <TimerCard
          rotation={current}
          durationMinutes={matchMinutes}
          timer={t.timer}
          onChange={(timer) => onChange(setTimer(t, timer))}
        />
      )}

      {rotation.matches.length === 0 && (
        <div className="card">Aucun match pendant cette rotation (pas assez de joueurs présents).</div>
      )}
      {rotation.matches.map((m) => (
        <MatchCard
          key={m.id}
          match={m}
          names={names}
          pointsPerMatch={t.config.pointsPerMatch}
          onSave={(score) => save(m.id, score)}
        />
      ))}

      <RestList rotation={rotation} names={names} config={t.config} />

      <ShareButton label={`Copier la rotation ${shown + 1}`} getText={() => rotationText(t, shown, names)} />

      {next && shown === current && (
        <section className="card next">
          <h2>Prochaine rotation ({current + 2})</h2>
          <RotationSummary rotation={next} names={names} config={t.config} />
          <ShareButton
            label={`Copier la rotation ${current + 2}`}
            className="btn btn-small"
            getText={() => rotationText(t, current + 1, names)}
          />
        </section>
      )}
    </div>
  );
}

function RestList({ rotation, names, config }: { rotation: Rotation; names: Map<string, string>; config: TournamentConfig }) {
  if (rotation.resting.length === 0 && rotation.absent.length === 0) return null;
  return (
    <section className="card rest">
      {rotation.resting.length > 0 && (
        <p>
          <strong>Au repos :</strong> {participantLabels(rotation.resting, config, names).join(', ')}
        </p>
      )}
      {rotation.absent.length > 0 && (
        <p>
          <strong>Absents :</strong> {participantLabels(rotation.absent, config, names).join(', ')}
        </p>
      )}
    </section>
  );
}

export function RotationSummary({
  rotation,
  names,
  config,
}: {
  rotation: Rotation;
  names: Map<string, string>;
  config: TournamentConfig;
}) {
  return (
    <>
      <ul className="summary">
        {rotation.matches.map((m) => (
          <li key={m.id}>
            <span className="court">T{m.court}</span>
            <span>
              {teamLabel(m.teamA, names)} <em>vs</em> {teamLabel(m.teamB, names)}
            </span>
            {m.score && (
              <span className="mini-score">
                {m.score.a}–{m.score.b}
              </span>
            )}
          </li>
        ))}
      </ul>
      {rotation.resting.length > 0 && (
        <p className="hint">Repos : {participantLabels(rotation.resting, config, names).join(', ')}</p>
      )}
      {rotation.absent.length > 0 && (
        <p className="hint">Absents : {participantLabels(rotation.absent, config, names).join(', ')}</p>
      )}
    </>
  );
}

function MatchCard({
  match,
  names,
  pointsPerMatch,
  onSave,
}: {
  match: Match;
  names: Map<string, string>;
  pointsPerMatch: number | null;
  onSave: (score: Match['score']) => void;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(!match.score);
  const [a, setA] = useState(match.score ? String(match.score.a) : '');
  const [b, setB] = useState(match.score ? String(match.score.b) : '');

  useEffect(() => {
    setEditing(!match.score);
    setA(match.score ? String(match.score.a) : '');
    setB(match.score ? String(match.score.b) : '');
  }, [match.id, match.score]);

  const valid = /^\d+$/.test(a) && /^\d+$/.test(b);
  const warning = valid ? scoreWarning(Number(a), Number(b), pointsPerMatch) : null;

  // Avec un total de points fixe, saisir un score complète l'autre.
  function change(side: 'a' | 'b', raw: string) {
    const v = raw.replace(/[^0-9]/g, '').slice(0, 3);
    const other = pointsPerMatch !== null && v !== '' && Number(v) <= pointsPerMatch ? String(pointsPerMatch - Number(v)) : null;
    if (side === 'a') {
      setA(v);
      if (other !== null) setB(other);
    } else {
      setB(v);
      if (other !== null) setA(other);
    }
  }

  const winner = match.score ? (match.score.a > match.score.b ? 'a' : match.score.b > match.score.a ? 'b' : null) : null;

  return (
    <section className={`card match ${match.score ? 'scored' : ''}`}>
      <div className="match-head">
        <span className="court-badge">Terrain {match.court}</span>
        {match.score && !editing && <span className="done-badge">✓ Validé</span>}
      </div>
      <div className="match-body">
        <TeamBlock label="Équipe A" team={match.teamA} names={names} win={winner === 'a'} />
        <div className="score-col">
          {editing ? (
            <input
              className="score-input"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label="Score équipe A"
              value={a}
              onChange={(e) => change('a', e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          ) : (
            <span className="score-final">{match.score?.a}</span>
          )}
        </div>
        <TeamBlock label="Équipe B" team={match.teamB} names={names} win={winner === 'b'} />
        <div className="score-col">
          {editing ? (
            <input
              className="score-input"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label="Score équipe B"
              value={b}
              onChange={(e) => change('b', e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          ) : (
            <span className="score-final">{match.score?.b}</span>
          )}
        </div>
      </div>
      {editing && warning && <p className="score-warning">⚠ {warning}</p>}
      {editing ? (
        <div className="btn-row">
          <button
            className="btn btn-primary btn-grow"
            disabled={!valid}
            onClick={async () => {
              if (warning) {
                const ok = await confirm(
                  `Vérifier le score du terrain ${match.court}`,
                  `${warning}\n\nScore saisi : ${a}–${b}.`,
                  'Valider quand même',
                );
                if (!ok) return;
              }
              onSave({ a: Number(a), b: Number(b) });
              setEditing(false);
            }}
          >
            Valider le score
          </button>
          {match.score && (
            <button className="btn" onClick={() => setEditing(false)}>
              Annuler
            </button>
          )}
        </div>
      ) : (
        <div className="btn-row">
          <button className="btn btn-small" onClick={() => setEditing(true)}>
            Modifier le score
          </button>
          <button
            className="btn btn-small btn-ghost"
            onClick={async () => {
              const ok = await confirm(
                `Effacer le score du terrain ${match.court} ?`,
                'Le match redevient « à jouer ». Les joueurs du match ne changent pas.',
                'Effacer',
                true,
              );
              if (ok) onSave(undefined);
            }}
          >
            Effacer
          </button>
        </div>
      )}
    </section>
  );
}

function TeamBlock({
  label,
  team,
  names,
  win,
}: {
  label: string;
  team: readonly string[];
  names: Map<string, string>;
  win: boolean;
}) {
  return (
    <div className={`team ${win ? 'win' : ''}`} aria-label={label}>
      {team.map((id) => (
        <span key={id}>{names.get(id) ?? '?'}</span>
      ))}
    </div>
  );
}
