'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';
import type { PlayerId, PoolId, TeamId, UserId } from '@cup/engine';
import type { CardView } from '../domain/types';
import { OwnerCardEditor } from './OwnerCardEditor';
import { OwnerEditBanner } from './OwnerEditBanner';
import { PredictStepper } from './PredictStepper';
import { Button, Icon } from '@/shared/ui';

type Props = {
  card: CardView;
  poolId: PoolId;
  targetUserId: UserId;
  teams: { id: TeamId; name: string }[];
  players: { id: PlayerId; name: string; team: TeamId }[];
  isDev: boolean;
};

export function CreatorPredictEdit({
  card,
  poolId,
  targetUserId,
  teams,
  players,
  isDev,
}: Props): ReactElement {
  const [editEnabled, setEditEnabled] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <span className="pill-lock">
          <Icon name="lock" size={14} />
          Locked
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditEnabled((v) => !v)}
          data-testid="creator-edit-toggle"
        >
          <Icon name="edit" size={13} />
          {editEnabled ? 'Stop editing' : 'Edit my card'}
        </Button>
      </div>

      {editEnabled && <OwnerEditBanner />}

      {editEnabled ? (
        <OwnerCardEditor
          card={card}
          poolId={poolId}
          targetUserId={targetUserId}
          teams={teams}
          players={players}
        />
      ) : (
        <PredictStepper card={card} teams={teams} players={players} isDev={isDev} />
      )}
    </div>
  );
}
