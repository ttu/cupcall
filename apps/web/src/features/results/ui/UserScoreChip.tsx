import type { ReactElement } from 'react';
import type { UserRankChip } from '../domain/types';

declare const rankBrand: unique symbol;
/**
 * A user's leaderboard position (1-based). Branded locally — `UserRankChip.rank` isn't branded
 * upstream, so this stays a UserScoreChip-local invariant rather than a codebase-wide type.
 */
type Rank = number & { readonly [rankBrand]: 'Rank' };
const toRank = (n: number): Rank => n as Rank;

function ordinal(n: Rank): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

type Props = { rank: UserRankChip };

export function UserScoreChip({ rank }: Props): ReactElement {
  return (
    <div className="flex items-center gap-4">
      <div className="text-right">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
          Your points
        </div>
        <div className="flex items-center gap-2 justify-end mt-0.5">
          <span className="text-2xl font-black font-cup-display text-ink">{rank.points}</span>
        </div>
      </div>
      <span className="w-px h-9 bg-line" />
      <div className="text-right">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Rank</div>
        <div className="text-2xl font-black mt-0.5 font-cup-display text-green-600">
          {ordinal(toRank(rank.rank))}
        </div>
      </div>
    </div>
  );
}
