import { useMemo } from 'react';
import { analyzeSchedule, analyzeTeamSchedule, findTeamViolations, findViolations, type TeamRotation } from '../engine';
import { activeTeams, teamName, type Tournament } from '../state/tournament';
import { RotationSummary } from './RotationView';

/** Texte de référence d'un compteur de répétitions. */
function minimumDetail(value: number, minimum: number): string {
  if (minimum > 0 && value <= minimum) return `minimum possible : ${minimum}, impossible de faire moins`;
  return `minimum théorique : ${minimum}`;
}

interface Props {
  tournament: Tournament;
  names: Map<string, string>;
}

export default function QualityView(props: Props) {
  return props.tournament.config.format === 'teams' ? <TeamQualityView {...props} /> : <PlayerQualityView {...props} />;
}

type Item = { label: string; value: string; ok: boolean | null; detail?: string };

/** Liste des indicateurs, avec l'explication du comptage des répétitions. */
function QualitySummary({ title, subtitle, items, violations }: { title: string; subtitle: string; items: Item[]; violations: string[] }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="hint">{subtitle}</p>
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
      <p className="hint">
        Une répétition = une rencontre de plus que la première : deux adversaires qui s’affrontent 3 fois comptent
        pour 2 répétitions. Avec plus de matchs que d’adversaires possibles, certaines répétitions sont
        inévitables ; le minimum indiqué est le meilleur résultat mathématiquement possible.
      </p>
    </section>
  );
}

function FullPlanning({ tournament: t, names }: Props) {
  return (
    <section className="card">
      <h2>Planning complet</h2>
      {t.rotations.map((r) => (
        <div key={r.index} className="plan-rotation">
          <h3>Rotation {r.index + 1}</h3>
          <RotationSummary rotation={r} names={names} config={t.config} />
        </div>
      ))}
    </section>
  );
}

function PlayerQualityView({ tournament: t, names }: Props) {
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
  const items: Item[] = [
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
      detail: minimumDetail(q.partnerRepeats, q.minPossiblePartnerRepeats),
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
      ok: q.opponentRepeats <= q.minPossibleOpponentRepeats,
      detail: minimumDetail(q.opponentRepeats, q.minPossibleOpponentRepeats),
    },
    {
      label: 'Max de matchs contre le même adversaire',
      value: `${q.maxSameOpponent}`,
      // L'idéal est une borne théorique, pas toujours atteignable avec les
      // critères prioritaires : au-dessus, on reste neutre plutôt qu'en alerte.
      ok: q.maxSameOpponent <= q.idealMaxSameOpponent ? true : null,
      detail:
        q.maxSameOpponent <= q.idealMaxSameOpponent
          ? `idéal : ${q.idealMaxSameOpponent}`
          : `idéal théorique : ${q.idealMaxSameOpponent} (pas toujours atteignable)`,
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
      <QualitySummary
        title="Qualité du planning"
        subtitle={`${q.totalMatches} matchs · ${q.rotations} rotations`}
        items={items}
        violations={violations}
      />

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

      <FullPlanning tournament={t} names={names} />
    </div>
  );
}

/** Mode par équipes : les indicateurs portent sur les équipes (binômes fixes). */
function TeamQualityView({ tournament: t, names }: Props) {
  const teams = t.config.teams;
  const teamRotations = useMemo<TeamRotation[]>(() => {
    const teamOf = new Map<string, string>();
    for (const team of teams) for (const p of team.players) teamOf.set(p, team.id);
    const toTeams = (ids: string[]) => [...new Set(ids.map((id) => teamOf.get(id)).filter((x): x is string => !!x))];
    return t.rotations.map((r) => ({
      matches: r.matches.flatMap((m) => {
        const a = teamOf.get(m.teamA[0]);
        const b = teamOf.get(m.teamB[0]);
        return a && b ? [[a, b] as [string, string]] : [];
      }),
      resting: toTeams(r.resting),
      absent: toTeams(r.absent),
    }));
  }, [t.rotations, teams]);
  const q = useMemo(
    () => analyzeTeamSchedule(teamRotations, activeTeams(t.config).map((x) => x.id)),
    [teamRotations, t.config],
  );
  const violations = useMemo(() => findTeamViolations(teamRotations), [teamRotations]);

  if (t.rotations.length === 0) return <div className="card empty">Aucun planning généré.</div>;

  const byId = new Map(teams.map((x) => [x.id, x]));
  const items: Item[] = [
    {
      label: 'Matchs par équipe',
      value: q.minMatches === q.maxMatches ? `${q.minMatches}` : `${q.minMatches} à ${q.maxMatches}`,
      ok: q.minMatches === q.maxMatches,
    },
    {
      label: 'Repos par équipe',
      value: q.minRests === q.maxRests ? `${q.minRests}` : `${q.minRests} à ${q.maxRests}`,
      ok: q.minRests === q.maxRests,
      detail: `au plus ${q.maxConsecutiveRests} repos d’affilée`,
    },
    {
      label: 'Répétitions d’adversaires',
      value: `${q.opponentRepeats}`,
      ok: q.opponentRepeats <= q.minPossibleOpponentRepeats,
      detail: minimumDetail(q.opponentRepeats, q.minPossibleOpponentRepeats),
    },
    {
      label: 'Max de matchs contre la même équipe',
      value: `${q.maxSameOpponent}`,
      ok: q.maxSameOpponent <= q.idealMaxSameOpponent ? true : null,
      detail:
        q.maxSameOpponent <= q.idealMaxSameOpponent
          ? `idéal : ${q.idealMaxSameOpponent}`
          : `idéal théorique : ${q.idealMaxSameOpponent} (pas toujours atteignable)`,
    },
  ];

  return (
    <div className="stack">
      <QualitySummary
        title="Qualité du planning"
        subtitle={`${q.totalMatches} matchs · ${q.rotations} rotations · ${q.teams.length} équipes`}
        items={items}
        violations={violations}
      />

      <section className="card table-card">
        <h2>Par équipe</h2>
        <div className="table-scroll">
          <table className="standings">
            <thead>
              <tr>
                <th className="left">Équipe</th>
                <th title="Matchs">M</th>
                <th title="Repos">R</th>
                <th title="Équipes adverses différentes">Adv.</th>
                <th title="Maximum de matchs contre la même équipe">Max A</th>
              </tr>
            </thead>
            <tbody>
              {q.teams.map((x) => (
                <tr key={x.id}>
                  <td className="left name">{byId.get(x.id) ? teamName(byId.get(x.id)!, names) : '?'}</td>
                  <td>{x.matches}</td>
                  <td>
                    {x.rests}
                    {x.absences > 0 && <small> +{x.absences} abs.</small>}
                  </td>
                  <td>{x.distinctOpponents}</td>
                  <td>{x.maxSameOpponent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <FullPlanning tournament={t} names={names} />
    </div>
  );
}
