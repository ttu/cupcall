'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';
import type { CardView } from '../domain/types';
import { GroupScoresSection } from './GroupScoresSection';
import { BracketSection } from './BracketSection';
import { SpecialsSection } from './SpecialsSection';
import { DevControls } from './DevControls';
import { Icon } from '@/shared/ui';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Dev controls */}
      <DevControls poolId={card.poolId} isDev={isDev} />

      {/* Step indicator tabs */}
      <nav
        aria-label="Card sections"
        style={{ display: 'flex', borderBottom: '1px solid var(--line-soft)' }}
      >
        {STEPS.map(({ id, label, n }) => {
          const active = step === id;
          const done = isStepDone(id) && !active;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setStep(id)}
              aria-current={active ? 'step' : undefined}
              style={{
                flex: 1,
                padding: '11px 12px 14px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                boxShadow: active ? 'inset 0 -3px 0 var(--green-500)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontFamily: 'var(--font-ui)',
                fontSize: 13,
                fontWeight: 700,
                color: active ? 'var(--ink)' : 'var(--ink-muted)',
                transition: 'color .15s',
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 11,
                  fontWeight: 800,
                  background: active
                    ? 'var(--green-500)'
                    : done
                      ? 'var(--green-050)'
                      : 'var(--surface-2)',
                  color: active
                    ? 'oklch(0.18 0.02 160)'
                    : done
                      ? 'var(--green-700)'
                      : 'var(--ink-muted)',
                  boxShadow: done ? 'inset 0 0 0 1px var(--green-300)' : undefined,
                  flexShrink: 0,
                }}
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
