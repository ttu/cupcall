'use client';

import type { ReactElement } from 'react';
import type { MatchId, PoolId } from '@cup/engine';
import { saveGroupScore } from '../api/actions';
import type { GroupView } from '../domain/types';
import { GroupJumpNav } from './GroupJumpNav';
import { GroupCard } from './GroupCard';

type Props = {
  groups: GroupView[];
  poolId: PoolId;
  locked: boolean;
  onSave?: (matchId: MatchId, home: number, away: number) => Promise<void>;
};

export function GroupScoresSection({ groups, poolId, locked, onSave }: Props): ReactElement {
  async function handleSave(matchId: MatchId, home: number, away: number): Promise<void> {
    if (onSave) {
      await onSave(matchId, home, away);
      return;
    }
    await saveGroupScore({ poolId, matchId, home, away });
  }

  return (
    <section aria-label="Group stage predictions" className="flex flex-col gap-6">
      <GroupJumpNav groups={groups} />
      {groups.map((group) => (
        <GroupCard
          key={group.groupId}
          group={group}
          poolId={poolId}
          locked={locked}
          onSave={handleSave}
        />
      ))}
    </section>
  );
}
