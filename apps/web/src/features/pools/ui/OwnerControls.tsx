'use client';

import type { ReactElement } from 'react';
import type { LeaderboardEntry } from '../domain/types';
import type { UserId } from '@cup/engine';
import { MemberRow } from './MemberRow';
import { DangerZone } from './DangerZone';

type Props = {
  poolId: string;
  members: LeaderboardEntry[];
  currentUserId: UserId;
};

export function OwnerControls({ poolId, members, currentUserId }: Props): ReactElement {
  const otherMembers = members.filter((m) => m.userId !== currentUserId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="turf" style={{ padding: '8px 16px' }}>
          <span className="display" style={{ fontSize: 15, color: 'var(--on-dark)' }}>
            Members
          </span>
        </div>

        {otherMembers.length === 0 ? (
          <p style={{ padding: '14px 16px', fontSize: 13, color: 'var(--ink-muted)' }}>
            No other members yet.
          </p>
        ) : (
          <div className="divide">
            {otherMembers.map((member, i) => (
              <MemberRow key={member.userId} member={member} avatarIndex={i} poolId={poolId} />
            ))}
          </div>
        )}
      </div>

      <DangerZone poolId={poolId} />
    </div>
  );
}
