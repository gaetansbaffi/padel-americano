import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { archiveTournament, recreateTournament, removeFromHistory, type ArchivedTournament } from './state/history';
import { loadHistory, loadTournament, saveHistory, saveTournament } from './state/storage';
import { createTournament, currentRotationIndex, type Tournament } from './state/tournament';
import ConfigView from './views/ConfigView';
import HistoryView from './views/HistoryView';
import QualityView from './views/QualityView';
import RotationView from './views/RotationView';
import StandingsView from './views/StandingsView';

type Tab = 'config' | 'rotation' | 'standings' | 'quality' | 'history';

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  {
    id: 'config',
    label: 'Tournoi',
    icon: icon(
      <>
        <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
        <circle cx="16" cy="6" r="2" />
        <circle cx="10" cy="12" r="2" />
        <circle cx="18" cy="18" r="2" />
      </>,
    ),
  },
  {
    id: 'rotation',
    label: 'Matchs',
    icon: icon(
      <>
        <rect x="4" y="3" width="16" height="18" rx="1.5" />
        <path d="M4 12h16M12 3v4M12 17v4" />
      </>,
    ),
  },
  {
    id: 'standings',
    label: 'Classement',
    icon: icon(<path d="M5 20V12h4v8M10 20V6h4v14M15 20v-5h4v5M3 20h18" />),
  },
  {
    id: 'quality',
    label: 'Planning',
    icon: icon(
      <>
        <rect x="4" y="4" width="16" height="17" rx="1.5" />
        <path d="M4 9h16M8 2v4M16 2v4M8 13h3M8 17h6" />
      </>,
    ),
  },
  {
    id: 'history',
    label: 'Historique',
    icon: icon(
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5M12 7v5l3 2" />
      </>,
    ),
  },
];

export default function App() {
  const [tournament, setTournament] = useState<Tournament>(() => loadTournament() ?? createTournament());
  const [tab, setTab] = useState<Tab>(() => (tournament.rotations.length ? 'rotation' : 'config'));
  const [history, setHistory] = useState<ArchivedTournament[]>(() => loadHistory());
  const [saveFailed, setSaveFailed] = useState(false);
  const [historyFailed, setHistoryFailed] = useState(false);

  // Sauvegarde automatique à chaque modification.
  useEffect(() => {
    setSaveFailed(!saveTournament(tournament));
  }, [tournament]);
  useEffect(() => {
    setHistoryFailed(!saveHistory(history));
  }, [history]);

  /** Remplace le tournoi en cours en rangeant l'ancien dans l'historique. */
  function replaceTournament(next: Tournament) {
    setHistory((h) => archiveTournament(h, tournament));
    setTournament(next);
  }

  function recreateFromHistory(entry: ArchivedTournament) {
    replaceTournament(recreateTournament(entry.tournament));
    setTab('config');
  }

  const names = useMemo(
    () => new Map(tournament.config.players.map((p) => [p.id, p.name])),
    [tournament.config.players],
  );

  const current = currentRotationIndex(tournament);
  const status =
    tournament.rotations.length === 0
      ? 'À configurer'
      : current === -1
        ? 'Terminé'
        : `Rotation ${current + 1}/${tournament.rotations.length}`;

  return (
    <div className="app">
      <div className="topbar">
        <header className="app-header">
          <div className="brand">
            <span className="eyebrow">Padel Americano</span>
            <h1>{tournament.config.name || 'Americano'}</h1>
          </div>
          <span className={`status ${current >= 0 ? 'live' : ''}`}>{status}</span>
        </header>
        <div className="courtline" aria-hidden="true" />
      </div>
      {saveFailed && (
        <div className="banner banner-error">
          Sauvegarde locale impossible (stockage plein ou désactivé). Exportez le tournoi pour ne rien perdre.
        </div>
      )}
      {historyFailed && !saveFailed && (
        <div className="banner banner-error">
          Historique plein : supprimez d’anciens tournois dans l’onglet Historique.
        </div>
      )}
      <main className="app-main">
        {tab === 'config' && (
          <ConfigView
            tournament={tournament}
            onChange={setTournament}
            onReplace={replaceTournament}
            onGenerated={() => setTab('rotation')}
          />
        )}
        {tab === 'rotation' && (
          <RotationView
            tournament={tournament}
            names={names}
            onChange={setTournament}
            onGoToConfig={() => setTab('config')}
            onGoToStandings={() => setTab('standings')}
          />
        )}
        {tab === 'standings' && <StandingsView tournament={tournament} />}
        {tab === 'quality' && <QualityView tournament={tournament} names={names} />}
        {tab === 'history' && (
          <HistoryView
            history={history}
            onRecreate={recreateFromHistory}
            onDelete={(id) => setHistory((h) => removeFromHistory(h, id))}
          />
        )}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
