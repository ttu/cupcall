'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { saveSpecialBet } from '../api/actions';
import type { SpecialBetView } from '../domain/types';
import { SpecialBetCard } from './SpecialBetCard';
import { SpecialsFooter } from './SpecialsFooter';

type Props = {
  specials: SpecialBetView[];
  poolId: string;
  locked: boolean;
  teams: { id: string; name: string }[];
  players: { id: string; name: string; team: string }[];
  onSave?: (betKey: string, value: string | number | boolean) => void;
};

export function SpecialsSection({
  specials,
  poolId,
  locked,
  teams,
  players,
  onSave,
}: Props): ReactElement {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const allFilled = specials.every((b) => b.value !== null);

  function handleSave(betKey: string, value: string | number | boolean) {
    if (onSave) {
      onSave(betKey, value);
      return;
    }
    setPendingKey(betKey);
    setSaveError(null);
    startTransition(async () => {
      try {
        await saveSpecialBet({ poolId, betKey, value });
      } catch (error) {
        setSaveError('Could not save your pick. Please try again.');
        console.error('saveSpecialBet failed', error);
      } finally {
        setPendingKey(null);
      }
    });
  }

  return (
    <section
      data-testid="specials-section"
      aria-label="Special bets"
      className="flex flex-col gap-3"
    >
      {saveError && (
        <p role="alert" className="text-xs text-danger">
          {saveError}
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {specials.map((bet) => (
          <SpecialBetCard
            key={bet.key}
            bet={bet}
            locked={locked || bet.locked}
            isPending={pendingKey === bet.key}
            teams={teams}
            players={players}
            onSave={handleSave}
          />
        ))}
      </div>
      {!locked && <SpecialsFooter poolId={poolId} allFilled={allFilled} />}
    </section>
  );
}
