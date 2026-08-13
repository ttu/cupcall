'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import type { BracketMatchKey, PoolId, TeamId } from '@cup/engine';
import { bracketMatchKey as bmk, teamId as asTeamId } from '@cup/engine';
import { saveKnockoutPick, saveFinishScore } from '../api/actions';
import type { BracketView } from '../domain/types';
import { TieCard } from './TieCard';
import { FinalCard } from './FinalCard';

const TIE_H = 68;
const TIE_GAP = 8;
const U = TIE_H + TIE_GAP;

function columnPaddingTop(n: number): number {
  return ((Math.pow(2, n) - 1) * U) / 2;
}

function columnItemGap(n: number): number {
  return Math.pow(2, n) * U - TIE_H;
}

type Props = {
  bracket: BracketView;
  poolId: PoolId;
  locked: boolean;
  onPick?: (bracketMatchKey: BracketMatchKey, winner: TeamId) => void | Promise<void>;
  onFinishSave?: (match: 'final' | 'bronze', home: number, away: number) => void;
};

const DEFAULT_PICK_ERROR = 'Could not save your pick. Please try again.';

export function BracketSection({
  bracket,
  poolId,
  locked,
  onPick,
  onFinishSave,
}: Props): ReactElement {
  const [pendingMatchKey, setPendingMatchKey] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handlePick(bracketMatchKey: string, winner: string) {
    setPendingMatchKey(bracketMatchKey);
    setPickError(null);

    if (onPick) {
      try {
        await onPick(bmk(bracketMatchKey), asTeamId(winner));
      } catch (err) {
        setPickError(err instanceof Error ? err.message : DEFAULT_PICK_ERROR);
      } finally {
        setPendingMatchKey(null);
      }
      return;
    }

    startTransition(async () => {
      try {
        const result = await saveKnockoutPick({ poolId, bracketMatchKey, winner });
        if (!result.ok) setPickError(result.error);
      } catch (err) {
        setPickError(err instanceof Error ? err.message : DEFAULT_PICK_ERROR);
      } finally {
        setPendingMatchKey(null);
      }
    });
  }

  function handleFinishSave(match: 'final' | 'bronze', home: number, away: number) {
    if (onFinishSave) {
      onFinishSave(match, home, away);
      return;
    }
    startTransition(() => {
      void saveFinishScore({ poolId, match, home, away });
    });
  }

  const finalColumnIndex = bracket.rounds.length;

  return (
    <section
      data-testid="bracket-section"
      aria-label="Knockout bracket predictions"
      className="flex flex-col gap-3"
    >
      {!locked && (
        <div className="flex items-start gap-2.5 py-2.5 px-3.5 rounded-[10px] bg-green-050 border border-green-300 text-[13px] text-green-700">
          <span className="font-extrabold">⚡</span>
          <span>
            Pick the winner of each tie. Your group stage predictions determine who fills each slot.
          </span>
        </div>
      )}

      {pickError && (
        <p role="alert" className="text-xs text-danger">
          {pickError}
        </p>
      )}

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-4 items-start">
          {bracket.rounds.map((round, i) => (
            <div
              key={round.label}
              data-testid={`bracket-round-${round.label}`}
              className="min-w-47.5"
              style={{ paddingTop: columnPaddingTop(i) }}
            >
              <div className="eyebrow text-ink-muted mb-2 pl-0.5">{round.label}</div>
              <div className="flex flex-col" style={{ gap: columnItemGap(i) }}>
                {round.ties.map((tie) => (
                  <TieCard
                    key={tie.bracketMatchKey}
                    tie={tie}
                    locked={locked || tie.locked}
                    onPick={handlePick}
                    isPending={pendingMatchKey === tie.bracketMatchKey}
                  />
                ))}
              </div>
            </div>
          ))}

          <div className="min-w-55" style={{ paddingTop: columnPaddingTop(finalColumnIndex) }}>
            <div className="eyebrow text-ink-muted mb-2 pl-0.5">Final</div>
            <FinalCard
              match={bracket.final}
              matchKey="final"
              poolId={poolId}
              locked={locked || bracket.final.locked}
              onSave={handleFinishSave}
              onPickWinner={handlePick}
              isPending={pendingMatchKey === 'final'}
            />
            <div className="eyebrow text-ink-muted mt-4 mb-2 pl-0.5">3rd Place</div>
            <FinalCard
              match={bracket.bronze}
              matchKey="bronze"
              poolId={poolId}
              locked={locked || bracket.bronze.locked}
              onSave={handleFinishSave}
              onPickWinner={handlePick}
              isPending={pendingMatchKey === 'bronze'}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
