import { useState } from 'react';
import { summarize, type ArchivedTournament } from '../state/history';
import { useConfirm } from './Dialog';
import QualityView from './QualityView';
import StandingsView from './StandingsView';

interface Props {
  history: ArchivedTournament[];
  onRecreate: (entry: ArchivedTournament) => void;
  onDelete: (id: string) => void;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

export default function HistoryView({ history, onRecreate, onDelete }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const confirm = useConfirm();
  const opened = history.find((h) => h.id === openId);

  async function recreate(entry: ArchivedTournament) {
    const s = summarize(entry.tournament);
    const who = s.format === 'teams' ? `${s.participants} équipes` : `${s.participants} joueurs`;
    const ok = await confirm(
      `Recréer « ${s.name} » ?`,
      `Nouveau tournoi avec les mêmes ${who} et les mêmes réglages, sans score. ` +
        'Le tournoi en cours sera rangé dans l’historique.',
      'Recréer',
    );
    if (ok) onRecreate(entry);
  }

  async function remove(entry: ArchivedTournament) {
    const ok = await confirm(
      'Supprimer ce tournoi de l’historique ?',
      `« ${entry.tournament.config.name} » du ${formatDate(entry.tournament.createdAt)} sera définitivement supprimé de cet appareil.`,
      'Supprimer',
      true,
    );
    if (ok) {
      onDelete(entry.id);
      if (openId === entry.id) setOpenId(null);
    }
  }

  if (opened) {
    const names = new Map(opened.tournament.config.players.map((p) => [p.id, p.name]));
    return (
      <div className="stack">
        <div className="history-detail-head">
          <button className="btn btn-small" onClick={() => setOpenId(null)}>
            ‹ Historique
          </button>
          <button className="btn btn-small btn-primary" onClick={() => recreate(opened)}>
            Recréer
          </button>
        </div>
        <p className="hint">
          {opened.tournament.config.name} · {formatDate(opened.tournament.createdAt)} · consultation seule
        </p>
        <StandingsView tournament={opened.tournament} />
        <QualityView tournament={opened.tournament} names={names} />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="card empty">
        <p>Aucun tournoi archivé pour l’instant.</p>
        <p className="hint">
          Quand vous commencez un nouveau tournoi (ou en importez un), le précédent est rangé ici automatiquement.
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="hint">Tournois précédents, enregistrés sur cet appareil ({history.length}).</p>
      {history.map((entry) => {
        const s = summarize(entry.tournament);
        return (
          <section key={entry.id} className="card history-item">
            <div className="history-top">
              <div className="history-title">
                <strong>{s.name}</strong>
                <span>
                  {formatDate(s.date)} · {s.format === 'teams' ? `${s.participants} équipes` : `${s.participants} joueurs`}
                </span>
              </div>
              <span className={`pill ${s.finished ? 'pill-done' : ''}`}>
                {s.finished ? 'Terminé' : `${s.played}/${s.total} matchs`}
              </span>
            </div>
            {s.winners.length > 0 && (
              <p className="history-winner">
                🏆 {s.winners.join(' · ')}
              </p>
            )}
            <div className="btn-row">
              <button className="btn btn-small btn-grow" onClick={() => setOpenId(entry.id)}>
                Voir
              </button>
              <button className="btn btn-small btn-primary btn-grow" onClick={() => recreate(entry)}>
                Recréer
              </button>
              <button className="btn btn-small btn-ghost" onClick={() => remove(entry)} aria-label={`Supprimer ${s.name}`}>
                Supprimer
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
