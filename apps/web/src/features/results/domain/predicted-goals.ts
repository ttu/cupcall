/**
 * Looks up the predicted goals for one team from a team-identity-keyed predicted score
 * (see `KnockoutMatchView.predictedGoalsByTeam` / `KnockoutMatrixCell.predictedScoreByTeam`).
 *
 * Returns null when there's no snapshot at all, `teamId` is null, or `teamId` isn't one of
 * the two teams in the snapshot (e.g. a fallback display id that predates/diverges from it).
 */
export function resolveGoalsByTeamId(
  scoreByTeam: { teamId: string; goals: number }[] | null,
  teamId: string | null,
): number | null {
  if (scoreByTeam === null || teamId === null) return null;
  return scoreByTeam.find((s) => s.teamId === teamId)?.goals ?? null;
}
