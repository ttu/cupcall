import type { ReactElement } from 'react';
import Link from 'next/link';
import type { LeaderboardEntry } from '../domain/types';
import { Avatar, cn } from '@/shared/ui';

type Props = {
  entry: LeaderboardEntry;
  rank: number;
  avatarIndex: number;
  isSelf: boolean;
  href: string;
  canViewCards: boolean;
  lastDayPts?: number;
};

export function LeaderboardRow({
  entry,
  rank,
  avatarIndex,
  isSelf,
  href,
  canViewCards,
  lastDayPts = 0,
}: Props): ReactElement {
  const row = (
    <div
      data-testid={`leaderboard-row-${rank}`}
      className={cn(
        'grid items-center gap-2 px-4 py-2.5 grid-cols-[34px_1fr_60px_60px]',
        isSelf && 'bg-green-050',
      )}
    >
      <span className="lb-rank text-base">{rank}</span>
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar name={entry.displayName} index={avatarIndex} size={28} />
        <span
          className={cn(
            'text-[13px] truncate',
            isSelf ? 'font-bold text-green-700' : 'font-semibold text-ink',
          )}
        >
          {entry.displayName}
        </span>
      </div>
      <div className="text-right leading-tight">
        <div data-testid="leaderboard-points" className="display tnum text-base text-ink">
          {entry.pointsTotal}
        </div>
        {lastDayPts > 0 && (
          <div className="text-[10px] font-bold text-green-600 tabular-nums">+{lastDayPts}</div>
        )}
      </div>
      <span className="text-[11px] text-ink-muted text-right">
        {entry.completionPercent ?? '–'}%
      </span>
    </div>
  );

  return canViewCards ? (
    <Link href={href} className="no-underline block">
      {row}
    </Link>
  ) : (
    row
  );
}
