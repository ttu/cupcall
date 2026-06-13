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
      <div className="card" style={{ padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--ink-muted)', fontSize: 14, margin: 0 }}>No members yet.</p>
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
        <div
          className="card"
          style={{ marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
        >
          <div
            className="eyebrow"
            style={{
              display: 'grid',
              gridTemplateColumns: '34px 1fr 60px 60px',
              gap: 8,
              padding: '10px 16px 8px',
              color: 'var(--ink-muted)',
              borderBottom: '1px solid var(--line-soft)',
            }}
          >
            <span>#</span>
            <span>Player</span>
            <span style={{ textAlign: 'right' }}>Pts</span>
            <span style={{ textAlign: 'right' }}>%</span>
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
