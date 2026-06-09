'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';
import type { CardView } from '../domain/types';
import { GroupScoresSection } from './GroupScoresSection';
import { BracketSection } from './BracketSection';
import { SpecialsSection } from './SpecialsSection';
import { CompletionBar } from './CompletionBar';
import { DevControls } from './DevControls';

type Step = 'groups' | 'bracket' | 'specials';

const STEPS: { id: Step; label: string }[] = [
  { id: 'groups', label: 'Group Stage' },
  { id: 'bracket', label: 'Bracket' },
  { id: 'specials', label: 'Special Bets' },
];

type Props = {
  card: CardView;
  teams: { id: string; name: string }[];
  players: { id: string; name: string; team: string }[];
  isDev: boolean;
};

export function PredictStepper({ card, teams, players, isDev }: Props): ReactElement {
  const [step, setStep] = useState<Step>('groups');
  const locked = card.status === 'locked';

  return (
    <div className="flex flex-col gap-4">
      {/* Progress */}
      <CompletionBar percent={card.completionPercent} />

      {/* Dev controls */}
      <DevControls poolId={card.poolId} isDev={isDev} />

      {/* Incomplete warning */}
      {card.completionPercent < 100 && (
        <div className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 flex items-center gap-2">
          <span aria-hidden="true">⚠</span>
          <span>
            {locked
              ? 'Prediction was incomplete when the tournament started.'
              : 'Your prediction is not complete — fill in all sections to earn full points.'}
          </span>
        </div>
      )}

      {/* Lock notice */}
      {locked && (
        <div className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5 text-sm text-[var(--ink-soft)] flex items-center gap-2">
          <span aria-hidden="true">🔒</span>
          <span>Predictions are locked — tournament has started.</span>
        </div>
      )}

      {/* Step tabs */}
      <nav
        aria-label="Card sections"
        className="flex gap-1 bg-[var(--surface-2)] rounded-[var(--radius-sm)] p-1"
      >
        {STEPS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setStep(id)}
            aria-current={step === id ? 'step' : undefined}
            className={
              'flex-1 py-2 px-3 text-sm font-medium rounded-md transition-all ' +
              (step === id
                ? 'bg-white text-[var(--ink)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink)]')
            }
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Section content */}
      {step === 'groups' && (
        <GroupScoresSection groups={card.groups} poolId={card.poolId} locked={locked} />
      )}
      {step === 'bracket' && (
        <BracketSection bracket={card.bracket} poolId={card.poolId} locked={locked} />
      )}
      {step === 'specials' && (
        <SpecialsSection
          specials={card.specials}
          poolId={card.poolId}
          locked={locked}
          teams={teams}
          players={players}
        />
      )}
    </div>
  );
}
