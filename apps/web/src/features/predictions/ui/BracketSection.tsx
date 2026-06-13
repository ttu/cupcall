'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
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
  poolId: string;
  locked: boolean;
  onPick?: (bracketMatchKey: string, winner: string) => void;
  onFinishSave?: (match: 'final' | 'bronze', home: number, away: number) => void;
};

export function BracketSection({
  bracket,
  poolId,
  locked,
  onPick,
  onFinishSave,
}: Props): ReactElement {
  const [pendingMatchKey, setPendingMatchKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handlePick(bracketMatchKey: string, winner: string) {
    if (onPick) {
      onPick(bracketMatchKey, winner);
      return;
    }
    setPendingMatchKey(bracketMatchKey);
    startTransition(async () => {
      await saveKnockoutPick({ poolId, bracketMatchKey, winner });
      setPendingMatchKey(null);
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
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      {!locked && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'var(--green-050)',
            border: '1px solid var(--green-300)',
            fontSize: 13,
            color: 'var(--green-700)',
          }}
        >
          <span style={{ fontWeight: 800 }}>⚡</span>
          <span>
            Pick the winner of each tie. Your group stage predictions determine who fills each slot.
          </span>
        </div>
      )}

      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {bracket.rounds.map((round, i) => (
            <div
              key={round.label}
              data-testid={`bracket-round-${round.label}`}
              style={{ minWidth: 190, paddingTop: columnPaddingTop(i) }}
            >
              <div
                className="eyebrow"
                style={{ color: 'var(--ink-muted)', marginBottom: 8, paddingLeft: 2 }}
              >
                {round.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: columnItemGap(i) }}>
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

          <div style={{ minWidth: 220, paddingTop: columnPaddingTop(finalColumnIndex) }}>
            <div
              className="eyebrow"
              style={{ color: 'var(--ink-muted)', marginBottom: 8, paddingLeft: 2 }}
            >
              Final
            </div>
            <FinalCard
              match={bracket.final}
              matchKey="final"
              poolId={poolId}
              locked={locked || bracket.final.locked}
              onSave={handleFinishSave}
              onPickWinner={handlePick}
            />
            <div
              className="eyebrow"
              style={{ color: 'var(--ink-muted)', margin: '16px 0 8px', paddingLeft: 2 }}
            >
              3rd Place
            </div>
            <FinalCard
              match={bracket.bronze}
              matchKey="bronze"
              poolId={poolId}
              locked={locked || bracket.bronze.locked}
              onSave={handleFinishSave}
              onPickWinner={handlePick}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
