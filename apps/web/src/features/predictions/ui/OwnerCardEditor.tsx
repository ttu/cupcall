'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import type { BracketMatchKey, MatchId, PoolId, TeamId } from '@cup/engine';
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
  poolId: PoolId;
  targetUserId: string;
  teams: { id: string; name: string }[];
  players: { id: string; name: string; team: string }[];
};

const DEFAULT_SAVE_ERROR = 'Could not save. Please try again.';

export function OwnerCardEditor({
  card,
  poolId,
  targetUserId,
  teams,
  players,
}: Props): ReactElement {
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toMessage(err: unknown, fallback: string): string {
    return err instanceof Error ? err.message : fallback;
  }

  async function handleGroupSave(matchId: MatchId, home: number, away: number): Promise<void> {
    setError(null);
    try {
      const result = await ownerSaveGroupScore({ poolId, targetUserId, matchId, home, away });
      if (!result.ok) {
        setError(result.error);
        throw new Error(result.error);
      }
    } catch (err) {
      const message = toMessage(err, DEFAULT_SAVE_ERROR);
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  }

  async function handlePick(bracketMatchKey: BracketMatchKey, winner: TeamId): Promise<void> {
    setError(null);
    try {
      const result = await ownerSaveKnockoutPick({ poolId, targetUserId, bracketMatchKey, winner });
      if (!result.ok) setError(result.error);
    } catch (err) {
      setError(toMessage(err, DEFAULT_SAVE_ERROR));
    }
  }

  function handleFinishSave(match: 'final' | 'bronze', home: number, away: number): void {
    setError(null);
    startTransition(async () => {
      try {
        const result = await ownerSaveFinishScore({ poolId, targetUserId, match, home, away });
        if (!result.ok) setError(result.error);
      } catch (err) {
        setError(toMessage(err, DEFAULT_SAVE_ERROR));
      }
    });
  }

  function handleSpecialSave(betKey: string, value: string | number | boolean): void {
    setError(null);
    startTransition(async () => {
      try {
        const result = await ownerSaveSpecialBet({ poolId, targetUserId, betKey, value });
        if (!result.ok) setError(result.error);
      } catch (err) {
        setError(toMessage(err, DEFAULT_SAVE_ERROR));
      }
    });
  }

  // Per-item locked flags reflect the tournament clock, not owner permissions.
  // Clear them so the OR in each section (locked || item.locked) doesn't block editing.
  const unlockedGroups = card.groups.map((g) => ({
    ...g,
    matches: g.matches.map((m) => ({ ...m, locked: false })),
  }));
  const unlockedBracket = {
    ...card.bracket,
    rounds: card.bracket.rounds.map((r) => ({
      ...r,
      ties: r.ties.map((t) => ({ ...t, locked: false })),
    })),
    final: { ...card.bracket.final, locked: false },
    bronze: { ...card.bracket.bronze, locked: false },
  };
  const unlockedSpecials = card.specials.map((s) => ({ ...s, locked: false }));

  return (
    <div className="flex flex-col gap-6">
      <CompletionBar percent={card.completionPercent} />

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <GroupScoresSection
        groups={unlockedGroups}
        poolId={poolId}
        locked={false}
        onSave={handleGroupSave}
      />

      <BracketSection
        bracket={unlockedBracket}
        poolId={poolId}
        locked={false}
        onPick={handlePick}
        onFinishSave={handleFinishSave}
      />

      {card.specials.length > 0 && (
        <SpecialsSection
          specials={unlockedSpecials}
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
