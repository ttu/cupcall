'use client';

import type { ReactElement } from 'react';
import { saveGroupScore } from '../api/actions';
import type { GroupView } from '../domain/types';
import { GroupJumpNav } from './GroupJumpNav';
import { GroupCard } from './GroupCard';

type Props = {
  groups: GroupView[];
  poolId: string;
  locked: boolean;
  onSave?: (matchId: string, home: number, away: number) => void;
};

export function GroupScoresSection({ groups, poolId, locked, onSave }: Props): ReactElement {
  async function handleSave(matchId: string, home: number, away: number): Promise<void> {
    if (onSave) {
      onSave(matchId, home, away);
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
