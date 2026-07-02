'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import type { ScoreBreakdown, Scoring } from '../domain/types';
import type { CategoryTopThree } from './score-breakdown-utils';
import { cn } from '@/shared/ui';

type Props = {
  breakdown: ScoreBreakdown;
  scoring: Scoring | null;
  topByCategory?: CategoryTopThree;
};

type Row = {
  label: string;
  key: keyof Omit<ScoreBreakdown, 'total'>;
  hint: (s: Scoring) => string;
};

const ROWS: Row[] = [
  {
    label: 'Group Matches',
    key: 'groupMatches',
    hint: (s) =>
      `exact score +${s.groupMatch.exactScore} · correct outcome +${s.groupMatch.correctOutcome}`,
  },
  {
    label: 'Group Order',
    key: 'groupOrder',
    hint: (s) =>
      `all 4 correct +${s.groupOrder.allCorrect} · 2 correct +${s.groupOrder.twoCorrect} · 1 correct +${s.groupOrder.oneCorrect}`,
  },
  {
    label: 'Round of 16',
    key: 'roundOf16',
    hint: (s) => `per correct team +${s.roundOf16PerTeam} (max +${s.roundOf16PerTeam * 16})`,
  },
  {
    label: 'QF',
    key: 'roundOf8',
    hint: (s) => `per correct team +${s.roundOf8PerTeam} (max +${s.roundOf8PerTeam * 8})`,
  },
  {
    label: 'SF',
    key: 'topFour',
    hint: (s) =>
      `all 4 correct +${s.topFourOrder.allCorrect} · 3 correct +${s.topFourOrder.threeCorrect} · 2 correct +${s.topFourOrder.twoCorrect} · 1 correct +${s.topFourOrder.oneCorrect}`,
  },
  {
    label: 'Final',
    key: 'final',
    hint: (s) => `correct team +${s.final.perTeam} (×2) · exact score +${s.final.exactScore}`,
  },
  {
    label: 'Bronze',
    key: 'bronze',
    hint: (s) => `correct team +${s.bronze.perTeam} (×2) · exact score +${s.bronze.exactScore}`,
  },
  {
    label: 'Special Bets',
    key: 'specials',
    hint: () => 'points vary per bet — see Specials tab',
  },
];

export function ScoreBreakdownCard({ breakdown, scoring, topByCategory }: Props): ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card mt-3" data-testid="score-breakdown-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center justify-between w-full p-[14px_16px] cursor-pointer bg-transparent border-0 text-left"
      >
        <span className="eyebrow text-ink-muted">Score breakdown</span>
        <span className="flex items-center gap-2">
          <span className="display tnum text-[20px] leading-none text-ink">{breakdown.total}</span>
          <span className="text-[11.5px] text-ink-muted font-semibold">pts</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className={cn('text-ink-muted transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {expanded && (
        <ul className="list-none m-0 p-0 border-t border-line" role="list">
          {ROWS.map(({ label, key, hint }) => {
            const pts = breakdown[key];
            const leaders = topByCategory?.[key];
            return (
              <li
                key={key}
                className="flex items-start justify-between gap-3 px-4 py-[10px] border-b border-line-soft last:border-0"
              >
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span
                    className={cn(
                      'text-[12.5px] font-bold leading-tight',
                      pts > 0 ? 'text-ink' : 'text-ink-muted',
                    )}
                  >
                    {label}
                  </span>
                  {scoring && (
                    <span className="text-[11px] text-ink-muted font-medium leading-tight">
                      {hint(scoring)}
                    </span>
                  )}
                  {leaders && leaders.length > 0 && (
                    <span className="flex items-center gap-2 mt-0.5">
                      {leaders.map((l) => (
                        <span
                          key={l.displayName}
                          className={cn(
                            'text-[10.5px] leading-tight',
                            l.isCurrentUser ? 'text-ink font-bold' : 'text-ink-muted font-medium',
                          )}
                        >
                          {l.displayName} +{l.points}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'text-[12.5px] font-bold tnum shrink-0 pt-px',
                    pts > 0 ? 'text-ink' : 'text-ink-muted',
                  )}
                >
                  +{pts}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
