export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

export function teamLabel(team: readonly string[], names: Map<string, string>): string {
  return team.map((id) => names.get(id) ?? '?').join(' & ');
}
