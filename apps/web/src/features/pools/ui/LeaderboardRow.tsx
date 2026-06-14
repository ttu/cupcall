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
};

export function LeaderboardRow({
  entry,
  rank,
  avatarIndex,
  isSelf,
  href,
  canViewCards,
}: Props): ReactElement {
  const row = (
    <div
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
      <span className="display tnum text-base text-ink text-right">{entry.pointsTotal}</span>
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
