import type { ReactElement } from 'react';
import Link from 'next/link';
import type { LeaderboardEntry } from '../domain/types';
import type { UserId } from '@cup/engine';

type Props = {
  entries: LeaderboardEntry[];
  currentUserId: UserId;
  poolId: string;
  isOwner: boolean;
  locked: boolean;
};

const MEDALS = ['🥇', '🥈', '🥉'];

export function Leaderboard({
  entries,
  currentUserId,
  poolId,
  isOwner,
  locked,
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
            const isSelf = entry.userId === currentUserId;
            const rank = i + 1;
            const medal = MEDALS[i];
            const cardHref = isSelf
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
                >
                  {entry.displayName}
                  {isSelf && (
                    <span className="ml-1.5 text-xs font-normal text-[var(--ink-muted)]">
                      (you)
                    </span>
                  )}
                </span>

                {/* Score */}
                <span className="text-sm font-semibold tabular-nums text-[var(--ink)] shrink-0">
                  {entry.pointsTotal} pts
                </span>

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
