import type { KnockoutMatchView } from './types';

export type FinalPickTier = 'pending' | 'zero' | 'partial' | 'full';

export type FinalPickBreakdown = {
  leftCorrect: boolean;
  rightCorrect: boolean;
  scoreExact: boolean;
  isPending: boolean;
  tier: FinalPickTier;
};

/**
 * Final/Bronze scoring credits each correctly-predicted team independently of which side won
 * (functional-spec §7.3), so this checks pick membership against the actual two participants
 * rather than reusing the winner-oriented `hit` field for team correctness.
 */
export function computeFinalPickBreakdown(
  match: Pick<KnockoutMatchView, 'homeTeamId' | 'awayTeamId' | 'actualHome' | 'actualAway' | 'hit'>,
  pickLeftId: string | null,
  pickRightId: string | null,
): FinalPickBreakdown {
  const isPending = match.actualHome === null || match.actualAway === null;
  if (isPending) {
    return {
      leftCorrect: false,
      rightCorrect: false,
      scoreExact: false,
      isPending: true,
      tier: 'pending',
    };
  }

  const actualParticipants = new Set(
    [match.homeTeamId, match.awayTeamId].filter((id): id is string => id !== null),
  );
  const leftCorrect = pickLeftId !== null && actualParticipants.has(pickLeftId);
  const rightCorrect = pickRightId !== null && actualParticipants.has(pickRightId);
  const scoreExact = match.hit === 'exact';

  const tier: FinalPickTier = scoreExact
    ? 'full'
    : leftCorrect || rightCorrect
      ? 'partial'
      : 'zero';

  return { leftCorrect, rightCorrect, scoreExact, isPending: false, tier };
}
