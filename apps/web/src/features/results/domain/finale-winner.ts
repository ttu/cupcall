import type { Tournament } from '@cup/engine';

/**
 * For Final: both participants are SF winners — return the SF winner that is NOT the picked Final winner.
 * For Bronze: both participants are SF losers — for each SF, find the team the user did NOT pick to win.
 */
export function derivePredictedOpponent(
  matchKey: string,
  bracket: Tournament['bracket'],
  pickMap: Map<string, string>,
  effectivePick: string | null,
): string | null {
  const prog = bracket.progression.find((p) => p.match === matchKey);
  if (!prog || prog.from.length !== 2) return null;
  const sf1Key = prog.from[0];
  const sf2Key = prog.from[1];
  if (!sf1Key || !sf2Key) return null;
  const pickedWinner = effectivePick;

  if (matchKey !== bracket.bronzeMatch) {
    // Final: participants are SF winners
    const finalist1 = pickMap.get(sf1Key) ?? null;
    const finalist2 = pickMap.get(sf2Key) ?? null;
    if (finalist1 && finalist2) {
      return finalist1 === pickedWinner ? finalist2 : finalist1;
    }
    return null;
  }

  // Bronze: participants are SF losers
  const sfLoser = (sfKey: string): string | null => {
    const sfProg = bracket.progression.find((p) => p.match === sfKey);
    if (!sfProg || sfProg.from.length !== 2) return null;
    const qf1Key = sfProg.from[0];
    const qf2Key = sfProg.from[1];
    if (!qf1Key || !qf2Key) return null;
    const sfWinner = pickMap.get(sfKey) ?? null;
    if (!sfWinner) return null;
    const team1 = pickMap.get(qf1Key) ?? null;
    const team2 = pickMap.get(qf2Key) ?? null;
    if (team1 && sfWinner !== team1) return team1;
    if (team2 && sfWinner !== team2) return team2;
    return null;
  };

  const loser1 = sfLoser(sf1Key);
  const loser2 = sfLoser(sf2Key);
  if (!loser1 || !loser2) return null;
  return loser1 === pickedWinner ? loser2 : loser1;
}

/**
 * Derives the implied winner of a Final or Bronze match from the predicted score
 * and the bracket picks, mirroring what deriveFinishWinner does at save time.
 *
 * Used when no explicit knockout pick was stored for the match (typically because
 * the score was saved before the SF/QF bracket picks were filled in), but the
 * feeder picks are now present and allow the winner to be inferred.
 *
 * Returns null when: score is tied, feeder picks are missing, or the bracket
 * progression cannot be resolved.
 */
export function deriveImplicitFinaleWinner(
  matchKey: string,
  bracket: Tournament['bracket'],
  pickMap: Map<string, string>,
  homeGoals: number,
  awayGoals: number,
): string | null {
  if (homeGoals === awayGoals) return null;

  const prog = bracket.progression.find((p) => p.match === matchKey);
  if (!prog || prog.from.length !== 2) return null;
  const [from1, from2] = prog.from;
  if (!from1 || !from2) return null;

  if (matchKey !== bracket.bronzeMatch) {
    // Final: home side = sf1 winner, away side = sf2 winner
    const homeSide = pickMap.get(from1) ?? null;
    const awaySide = pickMap.get(from2) ?? null;
    if (!homeSide || !awaySide) return null;
    return homeGoals > awayGoals ? homeSide : awaySide;
  }

  // Bronze: home side = sf1 loser, away side = sf2 loser
  const getSfLoser = (sfKey: string): string | null => {
    const sfProg = bracket.progression.find((p) => p.match === sfKey);
    if (!sfProg || sfProg.from.length !== 2) return null;
    const [qf1Key, qf2Key] = sfProg.from;
    if (!qf1Key || !qf2Key) return null;
    const sfWinner = pickMap.get(sfKey) ?? null;
    if (!sfWinner) return null;
    const team1 = pickMap.get(qf1Key) ?? null;
    const team2 = pickMap.get(qf2Key) ?? null;
    if (team1 && sfWinner !== team1) return team1;
    if (team2 && sfWinner !== team2) return team2;
    return null;
  };

  const homeSide = getSfLoser(from1);
  const awaySide = getSfLoser(from2);
  if (!homeSide || !awaySide) return null;
  return homeGoals > awayGoals ? homeSide : awaySide;
}

/**
 * Resolves the implicit Final/Bronze winner from a finish score, preferring the
 * homeTeamId/awayTeamId identity snapshot captured at save time over any live
 * re-derivation from the current bracket picks.
 *
 * The snapshot must win when present: picks can change after a score was saved
 * (e.g. the user edits an SF pick), and invalidation only deletes the stale
 * explicit Final/Bronze knockout pick — it never touches the finish-score row.
 * Re-deriving from the CURRENT pickMap in that state would silently reattribute
 * the already-entered goals to whichever team is now feeding the slot, which is
 * the exact bug class fixed in commit edaa4d0.
 *
 * `deriveFromPicks` is only invoked for legacy rows that predate the snapshot
 * (migration 0008) and haven't been backfilled yet.
 */
export function resolveFinaleWinner(
  score:
    | { home: number; away: number; homeTeamId?: string | null; awayTeamId?: string | null }
    | undefined,
  deriveFromPicks: (home: number, away: number) => string | null,
): string | null {
  if (score === undefined || score.home === score.away) return null;
  if (score.homeTeamId != null && score.awayTeamId != null) {
    return score.home > score.away ? score.homeTeamId : score.awayTeamId;
  }
  return deriveFromPicks(score.home, score.away);
}
