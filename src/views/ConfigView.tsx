import { useEffect, useRef, useState } from 'react';
import { estimateTournament, type Gender } from '../engine';
import { exportTournamentJson, parseTournamentJson } from '../state/storage';
import {
  activePlayers,
  createTournament,
  lockedRotationCount,
  newPlayerId,
  planSignature,
  regeneratePlanning,
  removePlayer,
  updateConfig,
  type Player,
  type Tournament,
  type TournamentConfig,
} from '../state/tournament';
import { useConfirm, useDialog } from './Dialog';
import { formatDuration } from './format';

interface Props {
  tournament: Tournament;
  onChange: (t: Tournament) => void;
  onGenerated: () => void;
}

export default function ConfigView({ tournament: t, onChange, onGenerated }: Props) {
  const config = t.config;
  const set = (patch: Partial<TournamentConfig>) => onChange(updateConfig(t, patch));
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const players = activePlayers(config);
  const locked = lockedRotationCount(t);
  const started = locked > 0;
  const absentCount = started ? 0 : config.absentFirstRotation.length;
  const estimate = estimateTournament({
    playerCount: players.length,
    courts: config.courts,
    targetMatches: config.targetMatches,
    absentFirstCount: absentCount,
    totalMinutes: config.totalMinutes,
    matchMinutes: config.matchMinutes,
    breakMinutes: config.breakMinutes,
  });
  const hasPlanning = t.rotations.length > 0;
  const configChanged = hasPlanning && t.planSignature !== planSignature(config);

  async function generate(seed?: number) {
    if (hasPlanning) {
      const future = t.rotations.length - locked;
      const ok =
        locked === 0
          ? await confirm('Remplacer le planning ?', 'Aucun score n’a encore été saisi.', 'Remplacer')
          : await confirm(
              'Régénérer le planning futur ?',
              `Les ${locked} première(s) rotation(s) contenant des scores sont conservées telles quelles.\n` +
                `Les ${future} rotation(s) suivante(s) seront recalculées, y compris la rotation en cours si aucun score n’y est saisi.`,
              'Régénérer',
            );
      if (!ok) return;
    }
    setBusy(true);
    // Laisse le temps d'afficher « Génération… » avant le calcul (≈ 0,3 s).
    window.setTimeout(() => {
      const base = seed === undefined ? t : updateConfig(t, { seed });
      onChange(regeneratePlanning(base));
      setBusy(false);
      onGenerated();
    }, 30);
  }

  return (
    <div className="stack">
      <section className="card">
        <label className="field">
          <span>Nom du tournoi</span>
          <input value={config.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
      </section>

      <PlayersSection tournament={t} onChange={onChange} started={started} />

      <section className="card">
        <h2>Paramètres</h2>
        <div className="grid-2">
          <NumberField label="Terrains" value={config.courts} min={1} max={20} onChange={(v) => set({ courts: v })} />
          <NumberField
            label="Matchs par joueur"
            value={config.targetMatches}
            min={1}
            max={40}
            onChange={(v) => set({ targetMatches: v })}
          />
          <NumberField
            label="Durée disponible"
            suffix="min"
            value={config.totalMinutes}
            min={0}
            max={1440}
            onChange={(v) => set({ totalMinutes: v })}
          />
          <NumberField
            label="Durée d'un match"
            suffix="min"
            value={config.matchMinutes}
            min={1}
            max={240}
            onChange={(v) => set({ matchMinutes: v })}
          />
          <NumberField
            label="Entre rotations"
            suffix="min"
            value={config.breakMinutes}
            min={0}
            max={120}
            onChange={(v) => set({ breakMinutes: v })}
          />
          <OptionalNumberField
            label="Points par match"
            hint="facultatif"
            value={config.pointsPerMatch}
            min={1}
            max={200}
            onChange={(v) => set({ pointsPerMatch: v })}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={config.preferMixed}
            onChange={(e) => set({ preferMixed: e.target.checked })}
          />
          Favoriser les équipes mixtes (H/F)
        </label>
        {config.preferMixed && (
          <label className="check sub">
            <input
              type="checkbox"
              checked={config.mixedBeforeOpponents}
              onChange={(e) => set({ mixedBeforeOpponents: e.target.checked })}
            />
            Mixité prioritaire sur la variété des adversaires
          </label>
        )}
        {config.preferMixed && (
          <p className="hint">
            {config.mixedBeforeOpponents
              ? 'La mixité passe après l’égalité des matchs, les repos, les partenaires et les matchs identiques, mais avant la variété des adversaires.'
              : 'La mixité ne départage que des plannings équivalents sur tous les autres critères : son effet peut être limité. Cochez l’option ci-dessus pour la renforcer.'}
          </p>
        )}
      </section>

      <FeasibilityCard
        estimate={estimate}
        playerCount={players.length}
        target={config.targetMatches}
        totalMinutes={config.totalMinutes}
        started={started}
        onUseTarget={(m) => set({ targetMatches: m })}
      />

      <section className="card">
        {configChanged && (
          <div className="banner banner-warn">
            La configuration a changé depuis la génération du planning. Régénérez pour l’appliquer.
          </div>
        )}
        {hasPlanning && t.warnings.map((w) => <div key={w} className="banner banner-warn">{w}</div>)}
        <button
          className="btn btn-primary btn-block"
          disabled={busy || estimate.errors.length > 0}
          onClick={() => generate()}
        >
          {busy ? 'Génération…' : hasPlanning ? (started ? 'Régénérer le planning futur' : 'Régénérer le planning') : 'Générer le planning'}
        </button>
        {hasPlanning && (
          <button
            className="btn btn-block"
            disabled={busy || estimate.errors.length > 0}
            onClick={() => generate(config.seed + 1)}
          >
            Autre tirage
          </button>
        )}
        {started && (
          <p className="hint">
            {locked} rotation(s) avec scores verrouillée(s) : leurs matchs ne seront jamais modifiés.
          </p>
        )}
      </section>

      <DataSection tournament={t} onChange={onChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function PlayersSection({
  tournament: t,
  onChange,
  started,
}: {
  tournament: Tournament;
  onChange: (t: Tournament) => void;
  started: boolean;
}) {
  const config = t.config;
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const confirm = useConfirm();
  const active = activePlayers(config);
  const withdrawn = config.players.filter((p) => p.withdrawn);

  const setPlayers = (players: Player[]) => onChange(updateConfig(t, { players }));
  const patchPlayer = (id: string, patch: Partial<Player>) =>
    setPlayers(config.players.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  function add() {
    const names = draft
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    const existing = new Set(config.players.map((p) => p.name.toLowerCase()));
    const duplicates = names.filter((n, i) => existing.has(n.toLowerCase()) || names.indexOf(n) !== i);
    if (duplicates.length) {
      setError(`Déjà présent : ${duplicates.join(', ')}`);
      return;
    }
    setError('');
    setDraft('');
    setPlayers([...config.players, ...names.map((name) => ({ id: newPlayerId(), name }))]);
  }

  async function remove(p: Player) {
    const next = removePlayer(t, p.id);
    if (next.config.players.some((x) => x.id === p.id)) {
      const ok = await confirm(
        `Retirer ${p.name} ?`,
        'Ce joueur figure déjà dans le planning : ses matchs sont conservés, et il sera exclu du planning futur après régénération.',
        'Retirer',
        true,
      );
      if (!ok) return;
    }
    onChange(next);
  }

  function toggleAbsent(id: string) {
    const set = new Set(config.absentFirstRotation);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange(updateConfig(t, { absentFirstRotation: [...set] }));
  }

  return (
    <section className="card">
      <h2>
        Joueurs <span className="count">{active.length}</span>
      </h2>
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={draft}
          placeholder="Nom (ou plusieurs, séparés par des virgules)"
          onChange={(e) => setDraft(e.target.value)}
          enterKeyHint="done"
        />
        <button className="btn btn-primary" type="submit">
          Ajouter
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <ul className="player-list">
        {active.map((p, i) => (
          <li key={p.id} className="player-row">
            <span className="player-num">{i + 1}</span>
            <input
              className="player-name"
              value={p.name}
              aria-label={`Nom du joueur ${i + 1}`}
              onChange={(e) => patchPlayer(p.id, { name: e.target.value })}
            />
            {config.preferMixed && (
              <GenderToggle value={p.gender} onChange={(gender) => patchPlayer(p.id, { gender })} />
            )}
            {!started && (
              <button
                className={`chip ${config.absentFirstRotation.includes(p.id) ? 'chip-on' : ''}`}
                onClick={() => toggleAbsent(p.id)}
                title="Absent à la première rotation"
              >
                Absent R1
              </button>
            )}
            <button className="icon-btn" onClick={() => remove(p)} aria-label={`Retirer ${p.name}`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      {withdrawn.length > 0 && (
        <>
          <h3>Retirés</h3>
          <ul className="player-list">
            {withdrawn.map((p) => (
              <li key={p.id} className="player-row withdrawn">
                <span className="player-name-static">{p.name}</span>
                <button className="btn btn-small" onClick={() => patchPlayer(p.id, { withdrawn: undefined })}>
                  Réintégrer
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function GenderToggle({ value, onChange }: { value?: Gender; onChange: (g?: Gender) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Sexe">
      {(['H', 'F'] as const).map((g) => (
        <button key={g} className={value === g ? 'on' : ''} onClick={() => onChange(value === g ? undefined : g)}>
          {g}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FeasibilityCard({
  estimate,
  playerCount,
  target,
  totalMinutes,
  started,
  onUseTarget,
}: {
  estimate: ReturnType<typeof estimateTournament>;
  playerCount: number;
  target: number;
  totalMinutes: number;
  started: boolean;
  onUseTarget: (m: number) => void;
}) {
  if (estimate.errors.length) {
    return (
      <section className="card">
        <h2>Faisabilité</h2>
        {estimate.errors.map((e) => (
          <div key={e} className="banner banner-error">
            {e}
          </div>
        ))}
      </section>
    );
  }
  const alternatives = estimate.suggestions.filter((m) => m !== target);
  return (
    <section className="card">
      <h2>Faisabilité</h2>
      {started && <p className="hint">Estimation pour un tournoi complet, à titre indicatif.</p>}
      <dl className="facts">
        <div>
          <dt>Matchs</dt>
          <dd>{estimate.totalMatches}</dd>
        </div>
        <div>
          <dt>Rotations</dt>
          <dd>{estimate.rotations}</dd>
        </div>
        <div>
          <dt>Terrains utilisés</dt>
          <dd>{estimate.courtsUsed}</dd>
        </div>
        <div>
          <dt>Durée estimée</dt>
          <dd>{formatDuration(estimate.durationMinutes)}</dd>
        </div>
      </dl>
      {estimate.compatible ? (
        <div className="banner banner-ok">
          {playerCount} × {target} / 4 = {(playerCount * target) / 4} matchs : tous les joueurs joueront exactement {target} matchs.
        </div>
      ) : (
        <div className="banner banner-warn">
          <p>
            {playerCount} × {target} / 4 n’est pas entier : impossible que chacun joue exactement {target} matchs
            (certains en joueraient un de moins).
          </p>
          <div className="btn-row">
            {alternatives.map((m) => (
              <button key={m} className="btn btn-small btn-primary" onClick={() => onUseTarget(m)}>
                Utiliser {m} matchs
              </button>
            ))}
          </div>
        </div>
      )}
      {!estimate.fitsInTime && (
        <div className="banner banner-warn">
          <p>
            Durée dépassée : {estimate.rotations} rotations nécessaires, {estimate.maxRotationsInTime} possibles en{' '}
            {formatDuration(totalMinutes)}.
          </p>
          {estimate.maxTargetInTime !== null && estimate.maxTargetInTime !== target && (
            <button className="btn btn-small btn-primary" onClick={() => onUseTarget(estimate.maxTargetInTime!)}>
              Utiliser {estimate.maxTargetInTime} matchs par joueur
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

// Export / import par copier-coller : fonctionne partout, y compris quand
// le téléchargement de fichiers est bloqué. Le texte se transmet facilement
// (WhatsApp, e-mail…) d'un appareil à l'autre.
function DataSection({ tournament: t, onChange }: { tournament: Tournament; onChange: (t: Tournament) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const exportArea = useRef<HTMLTextAreaElement>(null);
  const [panel, setPanel] = useState<'export' | 'import' | null>(null);
  const [pasted, setPasted] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const confirm = useConfirm();
  const choose = useDialog();

  function open(next: 'export' | 'import') {
    setPanel(panel === next ? null : next);
    setMessage(null);
  }

  async function copy() {
    const text = exportTournamentJson(t);
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ kind: 'ok', text: 'Copié. Collez-le dans « Importer » sur l’autre appareil.' });
    } catch {
      exportArea.current?.select();
      setMessage({ kind: 'ok', text: 'Texte sélectionné : copiez-le (Ctrl+C ou appui long → Copier).' });
    }
  }

  async function importText(text: string) {
    let imported: Tournament;
    try {
      imported = parseTournamentJson(text);
    } catch (e) {
      setMessage({ kind: 'error', text: `Import impossible : ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    const ok = await confirm(
      'Remplacer le tournoi actuel ?',
      `Le tournoi « ${imported.config.name} » (${imported.config.players.length} joueurs) remplacera celui de cet appareil.`,
      'Remplacer',
      true,
    );
    if (!ok) return;
    onChange(imported);
    setPasted('');
    setPanel(null);
    setMessage(null);
  }

  async function reset() {
    const choice = await choose({
      title: 'Nouveau tournoi ?',
      message: 'Le tournoi actuel (planning et scores) sera effacé de cet appareil. Exportez-le d’abord pour le garder.',
      actions:
        t.config.players.length > 0
          ? [
              { label: 'Garder les joueurs', value: 'keep', variant: 'primary' },
              { label: 'Tout effacer', value: 'all', variant: 'danger' },
            ]
          : [{ label: 'Tout effacer', value: 'all', variant: 'danger' }],
    });
    if (!choice) return;
    const fresh = createTournament();
    onChange(
      choice === 'keep'
        ? updateConfig(fresh, {
            players: activePlayers(t.config).map(({ id, name, gender }) => ({ id, name, gender })),
            courts: t.config.courts,
            preferMixed: t.config.preferMixed,
          })
        : fresh,
    );
  }

  return (
    <section className="card">
      <h2>Données</h2>
      <p className="hint">Le tournoi est sauvegardé automatiquement sur cet appareil.</p>
      <div className="btn-row">
        <button className={`btn ${panel === 'export' ? 'btn-selected' : ''}`} onClick={() => open('export')}>
          Exporter
        </button>
        <button className={`btn ${panel === 'import' ? 'btn-selected' : ''}`} onClick={() => open('import')}>
          Importer
        </button>
        <button className="btn btn-danger" onClick={reset}>
          Nouveau tournoi
        </button>
      </div>

      {panel === 'export' && (
        <div className="data-panel">
          <label className="field" htmlFor="export-json">
            <span>Sauvegarde du tournoi (JSON)</span>
          </label>
          <textarea id="export-json" ref={exportArea} readOnly value={exportTournamentJson(t)} rows={5} />
          <button className="btn btn-primary" onClick={copy}>
            Copier
          </button>
        </div>
      )}

      {panel === 'import' && (
        <div className="data-panel">
          <label className="field" htmlFor="import-json">
            <span>Collez ici une sauvegarde exportée</span>
          </label>
          <textarea
            id="import-json"
            value={pasted}
            rows={5}
            placeholder='{"version": 1, …}'
            onChange={(e) => setPasted(e.target.value)}
          />
          <div className="btn-row">
            <button className="btn btn-primary btn-grow" disabled={!pasted.trim()} onClick={() => importText(pasted)}>
              Importer ce texte
            </button>
            <button className="btn" onClick={() => fileInput.current?.click()}>
              Fichier .json…
            </button>
          </div>
          <input
            id="import-file"
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) await importText(await file.text());
            }}
          />
        </div>
      )}

      {message && <div className={`banner ${message.kind === 'ok' ? 'banner-ok' : 'banner-error'}`}>{message.text}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------

function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <OptionalNumberField
      label={label}
      value={value}
      min={min}
      max={max}
      suffix={suffix}
      onChange={(v) => v !== null && onChange(v)}
      required
    />
  );
}

function OptionalNumberField({
  label,
  hint,
  value,
  min,
  max,
  suffix,
  required,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number | null;
  min: number;
  max: number;
  suffix?: string;
  required?: boolean;
  onChange: (v: number | null) => void;
}) {
  // Texte local : on peut effacer le champ pendant la saisie sans perdre la valeur.
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  return (
    <label className="field">
      <span>
        {label} {hint && <em>({hint})</em>}
      </span>
      <div className="input-suffix">
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={text}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9]/g, '');
            setText(v);
            if (v === '') {
              if (!required) onChange(null);
              return;
            }
            const n = Number(v);
            if (n >= min && n <= max) onChange(n);
          }}
          onBlur={() => setText(value === null ? '' : String(value))}
        />
        {suffix && <span>{suffix}</span>}
      </div>
    </label>
  );
}
