/**
 * Resolves a user's effective pick for a knockout match by team identity rather than by
 * bracket slot. A user's stored pick is keyed by `bracketMatchKey` (a fixed slot), but which
 * two teams actually play in that slot depends on how earlier rounds/groups actually turned
 * out — which can diverge from what the user predicted. When the direct slot pick no longer
 * matches either real participant, fall back to whichever other team in `candidateTeams` (e.g.
 * all of the user's entry-round picks, or all of their picks within the same round) does name
 * one of the real participants — each team can only be picked to advance out of one slot, so
 * this is unambiguous. Returns null when neither the direct pick nor any candidate matches;
 * callers that want to keep showing the raw invalid pick (e.g. an "impossible pick" indicator)
 * should fall back to the direct pick themselves.
 */
export function resolveCrossSlotPick(
  directPick: string | null,
  homeTeamId: string | null,
  awayTeamId: string | null,
  candidateTeams: Set<string>,
): string | null {
  if (homeTeamId === null && awayTeamId === null) return directPick;

  const directValid =
    directPick !== null && (directPick === homeTeamId || directPick === awayTeamId);
  if (directValid) return directPick;

  if (homeTeamId !== null && candidateTeams.has(homeTeamId)) return homeTeamId;
  if (awayTeamId !== null && candidateTeams.has(awayTeamId)) return awayTeamId;

  return null;
}
