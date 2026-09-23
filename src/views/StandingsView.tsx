import { computeStandings } from '../engine';
import { allMatches, type Tournament } from '../state/tournament';

export default function StandingsView({ tournament: t }: { tournament: Tournament }) {
  const players = t.config.players;
  const rows = computeStandings(
    players.map((p) => p.id),
    allMatches(t),
  );
  const byId = new Map(players.map((p) => [p.id, p]));
  const played = allMatches(t).filter((m) => m.score).length;

  if (players.length === 0) return <div className="card empty">Aucun joueur.</div>;

  return (
    <div className="stack">
      <section className="card table-card">
        <h2>Classement</h2>
        <p className="hint">
          {played} match(s) joué(s) · tri : points marqués, puis différence, puis victoires.
        </p>
        <div className="table-scroll">
          <table className="standings">
            <thead>
              <tr>
                <th>#</th>
                <th className="left">Joueur</th>
                <th title="Matchs joués">J</th>
                <th title="Victoires">V</th>
                <th title="Défaites">D</th>
                <th title="Points marqués">PM</th>
                <th title="Points encaissés">PE</th>
                <th title="Différence de points">+/−</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = byId.get(r.id);
                return (
                  <tr key={r.id} className={p?.withdrawn ? 'withdrawn' : ''}>
                    <td className="rank">{r.rank}</td>
                    <td className="left name">
                      {p?.name ?? '?'}
                      {p?.withdrawn && <small> (retiré)</small>}
                      {r.draws > 0 && <small className="draws"> · {r.draws} nul{r.draws > 1 ? 's' : ''}</small>}
                    </td>
                    <td>{r.played}</td>
                    <td>{r.wins}</td>
                    <td>{r.losses}</td>
                    <td className="strong">{r.pointsFor}</td>
                    <td>{r.pointsAgainst}</td>
                    <td className={r.diff > 0 ? 'pos' : r.diff < 0 ? 'neg' : ''}>
                      {r.diff > 0 ? `+${r.diff}` : r.diff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
