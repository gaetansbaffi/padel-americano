// Types du moteur Americano. Le moteur ne manipule que des identifiants de
// joueurs (string) : aucune dépendance à React ni au stockage.

export type Gender = 'H' | 'F';

export type Team = [string, string];

export interface PlannedMatch {
  teamA: Team;
  teamB: Team;
}

export interface PlannedRotation {
  /** Un match par terrain, dans l'ordre des terrains. */
  matches: PlannedMatch[];
  /** Joueurs présents mais au repos pendant cette rotation. */
  resting: string[];
  /** Joueurs absents (non disponibles) pendant cette rotation. */
  absent: string[];
}

export interface GenerateInput {
  /** Joueurs à planifier (ordre = ordre d'affichage). */
  playerIds: string[];
  courts: number;
  /** Nombre cible de matchs par joueur (historique compris). */
  targetMatches: number;
  /** Sexe facultatif, utilisé seulement si `preferMixed` est vrai. */
  genders?: Record<string, Gender | undefined>;
  preferMixed?: boolean;
  /**
   * Par défaut (false), la mixité ne passe qu'après tous les autres critères
   * (partenaires, adversaires, matchs identiques). Si vrai, elle passe avant
   * la variété des adversaires (mais toujours après les partenaires et les
   * matchs identiques).
   */
  mixedBeforeOpponents?: boolean;
  /** Joueurs indisponibles pour la première rotation générée. */
  absentFirstRotation?: string[];
  /**
   * Rotations déjà jouées / verrouillées. Elles ne sont jamais modifiées :
   * elles servent à calculer les matchs restants et l'historique des
   * partenaires/adversaires.
   */
  history?: PlannedRotation[];
  /** Graine du générateur pseudo-aléatoire (résultat déterministe). */
  seed?: number;
  /** Nombre de tentatives indépendantes (la meilleure est conservée). */
  restarts?: number;
}

export interface GenerateResult {
  /** Nouvelles rotations uniquement (l'historique n'est pas répété). */
  rotations: PlannedRotation[];
  /** Nombre de matchs à jouer par joueur dans les nouvelles rotations. */
  plannedNeeds: Record<string, number>;
  warnings: string[];
}
