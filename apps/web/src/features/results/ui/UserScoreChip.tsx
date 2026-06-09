import type { ReactElement } from 'react';
import type { UserRankChip } from '../domain/types';

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

type Props = { rank: UserRankChip };

export function UserScoreChip({ rank }: Props): ReactElement {
  return (
    <div className="flex items-center gap-4">
      <div className="text-right">
        <div
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--ink-muted)' }}
        >
          Your points
        </div>
        <div className="flex items-center gap-2 justify-end mt-0.5">
          <span
            className="text-2xl font-black"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}
          >
            {rank.points}
          </span>
        </div>
      </div>
      <span className="w-px h-9" style={{ background: 'var(--line)' }} />
      <div className="text-right">
        <div
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--ink-muted)' }}
        >
          Rank
        </div>
        <div
          className="text-2xl font-black mt-0.5"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--green-600)' }}
        >
          {ordinal(rank.rank)}
        </div>
      </div>
    </div>
  );
}
