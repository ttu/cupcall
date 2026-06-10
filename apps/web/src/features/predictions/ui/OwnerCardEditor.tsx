'use client';

import type { ReactElement } from 'react';
import { useTransition } from 'react';
import type { CardView } from '../domain/types';
import { GroupScoresSection } from './GroupScoresSection';
import { BracketSection } from './BracketSection';
import { SpecialsSection } from './SpecialsSection';
import { CompletionBar } from './CompletionBar';
import {
  ownerSaveGroupScore,
  ownerSaveKnockoutPick,
  ownerSaveFinishScore,
  ownerSaveSpecialBet,
} from '../api/actions';

type Props = {
  card: CardView;
  poolId: string;
  targetUserId: string;
  teams: { id: string; name: string }[];
  players: { id: string; name: string; team: string }[];
};

export function OwnerCardEditor({
  card,
  poolId,
  targetUserId,
  teams,
  players,
}: Props): ReactElement {
  const [, startTransition] = useTransition();

  function handleGroupSave(matchId: string, home: number, away: number) {
    startTransition(() => {
      void ownerSaveGroupScore({ poolId, targetUserId, matchId, home, away });
    });
  }

  function handlePick(bracketMatchKey: string, winner: string) {
    startTransition(() => {
      void ownerSaveKnockoutPick({ poolId, targetUserId, bracketMatchKey, winner });
    });
  }

  function handleFinishSave(match: 'final' | 'bronze', home: number, away: number) {
    startTransition(() => {
      void ownerSaveFinishScore({ poolId, targetUserId, match, home, away });
    });
  }

  function handleSpecialSave(betKey: string, value: string | number | boolean) {
    startTransition(() => {
      void ownerSaveSpecialBet({ poolId, targetUserId, betKey, value });
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <CompletionBar percent={card.completionPercent} />

      <GroupScoresSection
        groups={card.groups}
        poolId={poolId}
        locked={false}
        onSave={handleGroupSave}
      />

      <BracketSection
        bracket={card.bracket}
        poolId={poolId}
        locked={false}
        onPick={handlePick}
        onFinishSave={handleFinishSave}
      />

      {card.specials.length > 0 && (
        <SpecialsSection
          specials={card.specials}
          poolId={poolId}
          locked={false}
          teams={teams}
          players={players}
          onSave={handleSpecialSave}
        />
      )}
    </div>
  );
}
