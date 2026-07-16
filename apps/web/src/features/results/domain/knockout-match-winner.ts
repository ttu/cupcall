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

/**
 * Teams that have lost a final knockout match. Note: this includes semifinal losers, but a
 * semifinal loser is not actually out of the tournament — it advances to play Bronze. Callers
 * evaluating pick viability for the Bronze match specifically must exclude
 * {@link computeSemiFinalLoserTeams} from this set; for every other round (R32/R16/QF/Final),
 * this set alone is correct.
 */
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

/** Teams that lost a semifinal — eliminated from Final contention, but still a live Bronze contender. */
export function computeSemiFinalLoserTeams(
  allMatches: MatchRow[],
  semiFinalMatchKeys: Iterable<string>,
): Set<string> {
  const semiFinalKeys = new Set(semiFinalMatchKeys);
  const losers = new Set<string>();
  for (const m of allMatches) {
    if (m.status !== 'final' || !semiFinalKeys.has(m.id)) continue;
    const winner = resolveActualWinner(m);
    if (winner === null) continue;
    if (m.homeTeamId && m.homeTeamId !== winner) losers.add(m.homeTeamId);
    if (m.awayTeamId && m.awayTeamId !== winner) losers.add(m.awayTeamId);
  }
  return losers;
}
