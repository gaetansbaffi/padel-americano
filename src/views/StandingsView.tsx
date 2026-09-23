import { standingsRows, standingsText } from '../state/share';
import { allMatches, type Tournament } from '../state/tournament';
import ShareButton from './ShareButton';

export default function StandingsView({ tournament: t }: { tournament: Tournament }) {
  const teamsMode = t.config.format === 'teams';
  const names = new Map(t.config.players.map((p) => [p.id, p.name]));
  const rows = standingsRows(t, names);
  const played = allMatches(t).filter((m) => m.score).length;

  if (rows.length === 0) return <div className="card empty">{teamsMode ? 'Aucune équipe.' : 'Aucun joueur.'}</div>;

  return (
    <div className="stack">
      <section className="card table-card">
        <h2>{teamsMode ? 'Classement des équipes' : 'Classement'}</h2>
        <p className="hint">
          {played} match(s) joué(s) · tri : points marqués, puis différence, puis victoires.
        </p>
        <div className="table-scroll">
          <table className="standings">
            <thead>
              <tr>
                <th>#</th>
                <th className="left">{teamsMode ? 'Équipe' : 'Joueur'}</th>
                <th title="Matchs joués">J</th>
                <th title="Victoires">V</th>
                <th title="Défaites">D</th>
                <th title="Points marqués">PM</th>
                <th title="Points encaissés">PE</th>
                <th title="Différence de points">+/−</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ row: r, label, withdrawn }) => (
                <tr key={r.id} className={withdrawn ? 'withdrawn' : ''}>
                  <td className="rank">{r.rank}</td>
                  <td className="left name">
                    {label}
                    {withdrawn && <small> ({teamsMode ? 'retirée' : 'retiré'})</small>}
                    {r.draws > 0 && <small className="draws"> · {r.draws} nul{r.draws > 1 ? 's' : ''}</small>}
                  </td>
                  <td>{r.played}</td>
                  <td>{r.wins}</td>
                  <td>{r.losses}</td>
                  <td className="strong">{r.pointsFor}</td>
                  <td>{r.pointsAgainst}</td>
                  <td className={r.diff > 0 ? 'pos' : r.diff < 0 ? 'neg' : ''}>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <ShareButton label="Copier le classement" getText={() => standingsText(t, names)} />
    </div>
  );
}
