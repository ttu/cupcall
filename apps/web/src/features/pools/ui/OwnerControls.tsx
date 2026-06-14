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
    <div className="flex flex-col gap-4">
      <div className="card overflow-hidden">
        <div className="turf py-2 px-4">
          <span className="display text-[15px] text-on-dark">Members</span>
        </div>

        {otherMembers.length === 0 ? (
          <p className="py-3.5 px-4 text-[13px] text-ink-muted">No other members yet.</p>
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
