'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import type { Scoring, ScoreBreakdown } from '@cup/engine';
import type { PoolArchiveEntryView } from '../domain/types';
import { AvatarNameBadge, cn } from '@/shared/ui';

type Props = {
  entry: PoolArchiveEntryView;
  rank: number;
  avatarIndex: number;
  isCurrentUser: boolean;
  scoring: Scoring | null;
  categoryMax: ScoreBreakdown | null;
};

type CategoryRow = {
  label: string;
  key: keyof Omit<ScoreBreakdown, 'total'>;
  hint: (s: Scoring) => string;
};

const CATEGORY_ROWS: CategoryRow[] = [
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
    label: 'SF · Teams',
    key: 'topFourTeams',
    hint: (s) => `per correct semifinalist +${s.roundOf4PerTeam} (max +${s.roundOf4PerTeam * 4})`,
  },
  {
    label: 'SF · Position',
    key: 'topFourPosition',
    hint: (s) =>
      `per correct final standing (1st–4th) +${s.topFourPositionBonus} (max +${s.topFourPositionBonus * 4})`,
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

const RANK_TIER: Partial<Record<number, string>> = { 1: 't1', 2: 't2', 3: 't3' };

export function ArchiveStandingRow({
  entry,
  rank,
  avatarIndex,
  isCurrentUser,
  scoring,
  categoryMax,
}: Props): ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <div data-testid="archive-standing-row" className={cn(isCurrentUser && 'bg-green-050')}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="grid grid-cols-[34px_1fr_auto] items-center gap-3 w-full px-4 py-2.5 cursor-pointer bg-transparent border-0 text-left"
      >
        {expanded ? (
          <>
            <span />
            <span className="flex items-center gap-2.5 min-w-0">
              <AvatarNameBadge
                name={entry.displayName}
                avatarIndex={avatarIndex}
                isCurrentUser={isCurrentUser}
              />
            </span>
            <span className="flex items-center gap-2">
              <span className="lb-pts">{entry.pointsTotal}</span>
              <ChevronIcon expanded />
            </span>
          </>
        ) : (
          <>
            <span className={cn('lb-rank', RANK_TIER[rank])}>{rank}</span>
            <span className="flex items-center gap-2.5 min-w-0">
              <AvatarNameBadge
                name={entry.displayName}
                avatarIndex={avatarIndex}
                isCurrentUser={isCurrentUser}
              />
            </span>
            <span className="lb-pts">{entry.pointsTotal}</span>
          </>
        )}
      </button>

      {expanded && (
        <ul className="list-none m-0 p-0 border-t border-line-soft" role="list">
          {CATEGORY_ROWS.map(({ label, key, hint }) => {
            const pts = entry.breakdown[key];
            const max = categoryMax?.[key] ?? 0;
            const pct = max > 0 ? Math.min(100, Math.round((pts / max) * 100)) : 0;
            return (
              <li key={key} className="px-4 py-[10px] border-b border-line-soft last:border-0">
                <div className="flex items-start justify-between gap-3">
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
                  </span>
                  <span
                    className={cn(
                      'text-[12.5px] font-bold tnum shrink-0 pt-px',
                      pts > 0 ? 'text-ink' : 'text-ink-muted',
                    )}
                  >
                    +{pts}
                  </span>
                </div>
                {categoryMax && (
                  <div
                    className="bar thin mt-1.5"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <i style={{ width: `${pct}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }): ReactElement {
  return (
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
  );
}
