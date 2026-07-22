import type { UserId, Points, ScoreBreakdown } from '@cup/engine';
import type { PoolArchiveEntryView } from './types';

export type CategoryBreakdownCell = {
  userId: UserId | null;
  displayName: string;
  isCurrentUser: boolean;
  points: Points;
  isLeader: boolean;
};

export type CategoryBreakdownRow = {
  key: keyof Omit<ScoreBreakdown, 'total'>;
  label: string;
  cells: CategoryBreakdownCell[];
};

const CATEGORY_ROWS: ReadonlyArray<{
  key: keyof Omit<ScoreBreakdown, 'total'>;
  label: string;
}> = [
  { key: 'groupMatches', label: 'Group Matches' },
  { key: 'groupOrder', label: 'Group Order' },
  { key: 'roundOf16', label: 'Round of 16' },
  { key: 'roundOf8', label: 'QF' },
  { key: 'topFourTeams', label: 'SF · Teams' },
  { key: 'topFourPosition', label: 'SF · Position' },
  { key: 'final', label: 'Final' },
  { key: 'bronze', label: 'Bronze' },
  { key: 'specials', label: 'Special Bets' },
];

export function buildCategoryBreakdown(
  entries: PoolArchiveEntryView[],
  viewerUserId: UserId | null,
): CategoryBreakdownRow[] {
  return CATEGORY_ROWS.map(({ key, label }) => {
    const max = entries.reduce((m, e) => Math.max(m, e.breakdown[key]), 0);

    const cells: CategoryBreakdownCell[] = entries.map((entry) => {
      const isCurrentUser = viewerUserId !== null && entry.userId === viewerUserId;
      return {
        userId: entry.userId,
        displayName: isCurrentUser ? 'You' : entry.displayName,
        isCurrentUser,
        points: entry.breakdown[key],
        isLeader: max > 0 && entry.breakdown[key] === max,
      };
    });

    return { key, label, cells };
  });
}
