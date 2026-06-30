import type { LeaderboardEntry } from '@cup/db';
import type { ScoreBreakdown, UserId, Points } from '@cup/engine';

export type CategoryLeader = {
  displayName: string;
  points: Points;
  isCurrentUser: boolean;
};

export type CategoryTopThree = Partial<
  Record<keyof Omit<ScoreBreakdown, 'total'>, CategoryLeader[]>
>;

const CATEGORY_KEYS: ReadonlyArray<keyof Omit<ScoreBreakdown, 'total'>> = [
  'groupMatches',
  'groupOrder',
  'roundOf16',
  'roundOf8',
  'topFour',
  'final',
  'bronze',
  'specials',
] as const;

export function deriveTopByCategory(
  leaderboard: LeaderboardEntry[],
  currentUserId: UserId | undefined,
): CategoryTopThree {
  const result: CategoryTopThree = {};
  for (const key of CATEGORY_KEYS) {
    const leaders = leaderboard
      .filter((e) => e.breakdown != null && e.breakdown[key] > 0)
      .sort((a, b) => b.breakdown![key] - a.breakdown![key])
      .slice(0, 3)
      .map((e) => ({
        displayName: e.userId === currentUserId ? 'You' : e.displayName,
        points: e.breakdown![key],
        isCurrentUser: e.userId === currentUserId,
      }));
    if (leaders.length > 0) result[key] = leaders;
  }
  return result;
}
