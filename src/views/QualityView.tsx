import { useMemo } from 'react';
import { analyzeSchedule, findViolations } from '../engine';
import type { Tournament } from '../state/tournament';
import { RotationSummary } from './RotationView';

interface Props {
  tournament: Tournament;
  names: Map<string, string>;
}

export default function QualityView({ tournament: t, names }: Props) {
  const allPlayers = t.config.players;
  const players = allPlayers.filter((p) => !p.withdrawn);
  const quality = useMemo(() => {
    const active = allPlayers.filter((p) => !p.withdrawn);
    return analyzeSchedule(
      t.rotations,
      active.map((p) => p.id),
      Object.fromEntries(active.map((p) => [p.id, p.gender])),
    );
  }, [t.rotations, allPlayers]);
  const violations = useMemo(() => findViolations(t.rotations), [t.rotations]);

  if (t.rotations.length === 0) return <div className="card empty">Aucun planning généré.</div>;

  const q = quality;
  const hasGenders = t.config.preferMixed && players.some((p) => p.gender);
  const items: { label: string; value: string; ok: boolean | null; detail?: string }[] = [
    {
      label: 'Matchs par joueur',
      value: q.minMatches === q.maxMatches ? `${q.minMatches}` : `${q.minMatches} à ${q.maxMatches}`,
      ok: q.minMatches === q.maxMatches,
    },
    {
      label: 'Repos par joueur',
      value: q.minRests === q.maxRests ? `${q.minRests}` : `${q.minRests} à ${q.maxRests}`,
      ok: q.minRests === q.maxRests,
      detail: `au plus ${q.maxConsecutiveRests} repos d’affilée`,
    },
    {
      label: 'Répétitions de partenaires',
      value: `${q.partnerRepeats}`,
      ok: q.partnerRepeats <= q.minPossiblePartnerRepeats,
      detail: `minimum théorique : ${q.minPossiblePartnerRepeats}`,
    },
    {
      label: 'Max de matchs avec le même partenaire',
      value: `${q.maxSamePartner}`,
      ok: q.maxSamePartner <= q.idealMaxSamePartner,
      detail: `idéal : ${q.idealMaxSamePartner}`,
    },
    {
      label: 'Répétitions d’adversaires',
      value: `${q.opponentRepeats}`,
      ok: null,
      detail: `max ${q.maxSameOpponent} fois le même adversaire`,
    },
    {
      label: 'Matchs identiques répétés',
      value: `${q.identicalMatchRepeats}`,
      ok: q.identicalMatchRepeats === 0,
    },
  ];
  if (hasGenders) {
    items.push({ label: 'Équipes non mixtes', value: `${q.nonMixedTeams}`, ok: q.nonMixedTeams === 0 });
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>Qualité du planning</h2>
        <p className="hint">
          {q.totalMatches} matchs · {q.rotations} rotations
        </p>
        {violations.length > 0 && (
          <div className="banner banner-error">
            {violations.map((v) => (
              <div key={v}>{v}</div>
            ))}
          </div>
        )}
        <ul className="quality-list">
          {items.map((it) => (
            <li key={it.label} className={it.ok === null ? 'neutral' : it.ok ? 'ok' : 'warn'}>
              <span className="q-label">
                {it.label}
                {it.detail && <small>{it.detail}</small>}
              </span>
              <span className="q-value">{it.value}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card table-card">
        <h2>Par joueur</h2>
        <div className="table-scroll">
          <table className="standings">
            <thead>
              <tr>
                <th className="left">Joueur</th>
                <th title="Matchs">M</th>
                <th title="Repos">R</th>
                <th title="Partenaires différents">Part.</th>
                <th title="Maximum de matchs avec le même partenaire">Max P</th>
                <th title="Maximum de matchs contre le même adversaire">Max A</th>
              </tr>
            </thead>
            <tbody>
              {q.players.map((p) => (
                <tr key={p.id}>
                  <td className="left name">{names.get(p.id) ?? '?'}</td>
                  <td>{p.matches}</td>
                  <td>
                    {p.rests}
                    {p.absences > 0 && <small> +{p.absences} abs.</small>}
                  </td>
                  <td>{p.distinctPartners}</td>
                  <td>{p.maxSamePartner}</td>
                  <td>{p.maxSameOpponent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Planning complet</h2>
        {t.rotations.map((r) => (
          <div key={r.index} className="plan-rotation">
            <h3>Rotation {r.index + 1}</h3>
            <RotationSummary rotation={r} names={names} />
          </div>
        ))}
      </section>
    </div>
  );
}
