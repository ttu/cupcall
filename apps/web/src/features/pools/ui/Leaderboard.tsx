import type { ReactElement } from 'react';
import type { LeaderboardEntry } from '../domain/types';
import type { UserId } from '@cup/engine';
import { Podium, cardHref } from './Podium';
import { LeaderboardRow } from './LeaderboardRow';

type Props = {
  entries: LeaderboardEntry[];
  currentUserId: UserId | null;
  poolId: string;
  isOwner: boolean;
  locked: boolean;
  viewToken?: string;
};

export function Leaderboard({
  entries,
  currentUserId,
  poolId,
  isOwner,
  locked,
  viewToken,
}: Props): ReactElement {
  const canViewCards = isOwner || locked;

  if (entries.length === 0) {
    return (
      <div className="card py-8 px-6 text-center">
        <p className="text-ink-muted text-sm m-0">No members yet.</p>
      </div>
    );
  }

  const ranked4plus = entries.slice(3);

  return (
    <div>
      {entries.length >= 1 && (
        <Podium
          entries={entries}
          currentUserId={currentUserId}
          poolId={poolId}
          canViewCards={canViewCards}
          {...(viewToken !== undefined ? { viewToken } : {})}
        />
      )}

      {ranked4plus.length > 0 && (
        <div className="card mt-0 rounded-tl-none rounded-tr-none">
          <div className="eyebrow grid [grid-template-columns:34px_1fr_60px_60px] gap-2 px-4 pt-[10px] pb-2 text-ink-muted border-b border-line-soft">
            <span>#</span>
            <span>Player</span>
            <span className="text-right">Pts</span>
            <span className="text-right">%</span>
          </div>
          <div className="divide">
            {ranked4plus.map((entry, i) => (
              <LeaderboardRow
                key={entry.userId}
                entry={entry}
                rank={i + 4}
                avatarIndex={entries.indexOf(entry)}
                isSelf={currentUserId !== null && entry.userId === currentUserId}
                href={cardHref(entry, poolId, currentUserId, viewToken)}
                canViewCards={canViewCards}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
