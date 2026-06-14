'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';
import type { CardView } from '../domain/types';
import { GroupScoresSection } from './GroupScoresSection';
import { BracketSection } from './BracketSection';
import { SpecialsSection } from './SpecialsSection';
import { DevControls } from './DevControls';
import { Icon, cn } from '@/shared/ui';

type Step = 'groups' | 'bracket' | 'specials';

const STEPS: { id: Step; label: string; n: number }[] = [
  { id: 'groups', label: 'Group Stage', n: 1 },
  { id: 'bracket', label: 'Bracket', n: 2 },
  { id: 'specials', label: 'Special Bets', n: 3 },
];

type Props = {
  card: CardView;
  teams: { id: string; name: string }[];
  players: { id: string; name: string; team: string }[];
  isDev: boolean;
};

export function PredictStepper({ card, teams, players, isDev }: Props): ReactElement {
  const [step, setStep] = useState<Step>('groups');
  // 'partial' cards have per-item locked state; globally lock only for 'locked'
  const locked = card.status === 'locked';

  function isStepDone(s: Step): boolean {
    if (s === 'groups')
      return card.groups.every((g) => g.matches.every((m) => m.predictedHome !== null));
    if (s === 'bracket')
      return card.bracket.rounds.every((r) => r.ties.every((t) => t.pickedWinnerId !== null));
    if (s === 'specials') return card.specials.every((b) => b.value !== null);
    return false;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Dev controls */}
      <DevControls poolId={card.poolId} isDev={isDev} locked={locked} />

      {/* Step indicator tabs */}
      <nav aria-label="Card sections" className="flex border-b border-line-soft">
        {STEPS.map(({ id, label, n }) => {
          const active = step === id;
          const done = isStepDone(id) && !active;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setStep(id)}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex-1 pt-[11px] px-3 pb-3.5 bg-transparent border-0 cursor-pointer flex items-center justify-center gap-2 font-cup-ui text-[13px] font-bold transition-colors',
                active ? 'text-ink shadow-[inset_0_-3px_0_var(--green-500)]' : 'text-ink-muted',
              )}
            >
              <span
                className={cn(
                  'w-5.5 h-5.5 rounded-full grid place-items-center text-[11px] font-extrabold shrink-0',
                  active
                    ? 'bg-green-500 text-[oklch(0.18_0.02_160)]'
                    : done
                      ? 'bg-green-050 text-green-700 shadow-[inset_0_0_0_1px_var(--green-300)]'
                      : 'bg-surface-2 text-ink-muted',
                )}
              >
                {done ? <Icon name="check" size={11} color="var(--green-700)" /> : n}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
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
