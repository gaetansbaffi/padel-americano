// Contrôle de vraisemblance d'un score avant validation.

/** Message d'alerte, ou null si le score paraît cohérent. */
export function scoreWarning(a: number, b: number, pointsPerMatch: number | null): string | null {
  if (a === 0 && b === 0) return 'Score 0–0 : le match a-t-il bien été joué ?';
  if (pointsPerMatch !== null && a + b !== pointsPerMatch) {
    return `Le total fait ${a + b} points au lieu de ${pointsPerMatch}.`;
  }
  return null;
}
