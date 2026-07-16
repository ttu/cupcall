import type { MatchRow } from '@cup/db';

/**
 * Derives the actual winner of a knockout match. `winnerTeamId` is only stored in the DB when
 * the match was decided by penalties (a regulation-time draw); for regulation/extra-time winners
 * the score is the authoritative source.
 */
export function resolveActualWinner(match: MatchRow | null): string | null {
  if (!match) return null;
  if (match.winnerTeamId) return match.winnerTeamId;
  if (
    match.status === 'final' &&
    match.homeGoals !== null &&
    match.awayGoals !== null &&
    match.homeGoals !== match.awayGoals
  ) {
    return match.homeGoals > match.awayGoals ? match.homeTeamId : match.awayTeamId;
  }
  return null;
}

/** Teams that have already lost a final knockout match and cannot advance further. */
export function computeKnockoutEliminatedTeams(allMatches: MatchRow[]): Set<string> {
  const eliminated = new Set<string>();
  for (const m of allMatches) {
    if (m.stage === 'group' || m.status !== 'final') continue;
    const winner = resolveActualWinner(m);
    if (winner === null) continue;
    if (m.homeTeamId && m.homeTeamId !== winner) eliminated.add(m.homeTeamId);
    if (m.awayTeamId && m.awayTeamId !== winner) eliminated.add(m.awayTeamId);
  }
  return eliminated;
}
