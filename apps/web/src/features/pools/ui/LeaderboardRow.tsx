import type { ReactElement } from 'react';
import Link from 'next/link';
import type { LeaderboardEntry } from '../domain/types';
import { Avatar } from '@/shared/ui';

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
      style={{
        display: 'grid',
        gridTemplateColumns: '34px 1fr 60px 60px',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        background: isSelf ? 'var(--green-050)' : undefined,
      }}
    >
      <span className="lb-rank" style={{ fontSize: 16 }}>
        {rank}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Avatar name={entry.displayName} index={avatarIndex} size={28} />
        <span
          style={{
            fontSize: 13,
            fontWeight: isSelf ? 700 : 600,
            color: isSelf ? 'var(--green-700)' : 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.displayName}
        </span>
      </div>
      <span
        className="display tnum"
        style={{ fontSize: 16, color: 'var(--ink)', textAlign: 'right' }}
      >
        {entry.pointsTotal}
      </span>
      <span style={{ fontSize: 11, color: 'var(--ink-muted)', textAlign: 'right' }}>
        {entry.completionPercent ?? '–'}%
      </span>
    </div>
  );

  return canViewCards ? (
    <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
      {row}
    </Link>
  ) : (
    row
  );
}
