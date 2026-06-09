import type { ReactElement } from 'react';
import Link from 'next/link';
import type { LeaderboardEntry } from '../domain/types';
import type { UserId } from '@cup/engine';

type Props = {
  entries: LeaderboardEntry[];
  currentUserId: UserId | null;
  poolId: string;
  isOwner: boolean;
  locked: boolean;
  /** When set, card links route through /view/[viewToken]/members/[id] instead of the pool route. */
  viewToken?: string;
};

const MEDALS = ['🥇', '🥈', '🥉'];

export function Leaderboard({
  entries,
  currentUserId,
  poolId,
  isOwner,
  locked,
  viewToken,
}: Props): ReactElement {
  const canViewCards = isOwner || locked;

  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] overflow-hidden bg-white shadow-[var(--shadow-sm)]">
      <div className="px-4 py-2.5 turf">
        <span
          className="text-sm font-bold tracking-widest uppercase text-[var(--on-dark)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Leaderboard
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--ink-muted)] text-center">No members yet.</p>
      ) : (
        <div className="divide">
          {entries.map((entry, i) => {
            const isSelf = currentUserId !== null && entry.userId === currentUserId;
            const rank = i + 1;
            const medal = MEDALS[i];
            const cardHref = viewToken
              ? `/view/${viewToken}/members/${entry.userId}`
              : isSelf
                ? `/pools/${poolId}/predict`
                : `/pools/${poolId}/members/${entry.userId}`;

            return (
              <div
                key={entry.userId}
                className={`flex items-center gap-3 px-4 py-3 ${isSelf ? 'bg-[var(--green-050)]' : ''}`}
              >
                {/* Rank */}
                <span className="w-7 text-center text-sm font-bold text-[var(--ink-muted)] tabular-nums shrink-0">
                  {medal ?? `${rank}.`}
                </span>

                {/* Name */}
                <span
                  className={`flex-1 text-sm truncate ${isSelf ? 'font-semibold text-[var(--green-700)]' : 'text-[var(--ink)]'}`}
                  title={isOwner ? entry.userId : undefined}
                >
                  {entry.displayName}
                  {isSelf && (
                    <span className="ml-1.5 text-xs font-normal text-[var(--ink-muted)]">
                      (you)
                    </span>
                  )}
                </span>

                {/* Score + completion */}
                <div className="flex flex-col items-end shrink-0 gap-0.5">
                  <span className="text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {entry.pointsTotal} pts
                  </span>
                  {entry.completionPercent === null && (
                    <span className="text-[10px] font-medium px-1.5 py-px rounded bg-red-50 text-red-600 border border-red-200 leading-tight">
                      No prediction
                    </span>
                  )}
                  {entry.completionPercent !== null && entry.completionPercent < 100 && (
                    <span className="text-[10px] font-medium px-1.5 py-px rounded bg-amber-50 text-amber-700 border border-amber-200 leading-tight">
                      {entry.completionPercent}% filled
                    </span>
                  )}
                </div>

                {/* Card link */}
                {canViewCards && (
                  <Link
                    href={cardHref}
                    className="shrink-0 text-xs px-2.5 py-1 rounded-md bg-[var(--surface-2)] text-[var(--ink-soft)] hover:bg-[var(--green-050)] hover:text-[var(--green-700)] transition-colors border border-[var(--line-soft)]"
                    aria-label={`View ${isSelf ? 'my' : entry.displayName + "'s"} card`}
                  >
                    {isSelf ? 'My card' : 'View card'}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
