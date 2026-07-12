import type { BracketRoundResultView, KnockoutMatchView } from './types';

function isMatchDecided(match: KnockoutMatchView): boolean {
  return match.actualHome !== null && match.actualAway !== null;
}

export function getRoundPlayedCount(round: BracketRoundResultView): {
  played: number;
  total: number;
} {
  return {
    played: round.matches.filter(isMatchDecided).length,
    total: round.matches.length,
  };
}

export function isRoundInProgress(round: BracketRoundResultView): boolean {
  const { played, total } = getRoundPlayedCount(round);
  return played > 0 && played < total;
}

/**
 * The round the mobile accordion should auto-expand: the round currently being
 * played, else the most recently completed round, else the first round (covers
 * the pre-tournament state where nothing has been decided yet).
 */
export function pickDefaultExpandedRound(rounds: BracketRoundResultView[]): string | null {
  if (rounds.length === 0) return null;

  const inProgress = rounds.find(isRoundInProgress);
  if (inProgress) return inProgress.label;

  const fullyPlayed = [...rounds]
    .reverse()
    .find((r) => getRoundPlayedCount(r).played === r.matches.length && r.matches.length > 0);
  if (fullyPlayed) return fullyPlayed.label;

  return rounds[0]!.label;
}
