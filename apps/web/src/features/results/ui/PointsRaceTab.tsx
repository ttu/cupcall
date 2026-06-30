'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import type { PointsRaceView, ScoreBreakdown, Scoring, LeaderboardEntry } from '../domain/types';
import type { UserId } from '@cup/engine';
import { cn } from '@/shared/ui';
import { RaceView } from './RaceView';
import { MatchMatrix } from './MatchMatrix';
import { KnockoutMatrix } from './KnockoutMatrix';
import { SpecialsMatrix } from './SpecialsMatrix';

type RaceSubTab = 'race' | 'by-group' | 'by-knockout' | 'by-specials';

const SUB_TAB_LABELS: Record<RaceSubTab, string> = {
  race: 'Race',
  'by-group': 'By group stage',
  'by-knockout': 'By knockout',
  'by-specials': 'Specials',
};

type Props = {
  race: PointsRaceView;
  userBreakdown?: ScoreBreakdown | null;
  scoring?: Scoring | null;
  viewerMode?: boolean;
  leaderboard?: LeaderboardEntry[];
  currentUserId?: UserId;
};

export function PointsRaceTab({
  race,
  userBreakdown = null,
  scoring = null,
  viewerMode = false,
  leaderboard,
  currentUserId,
}: Props): ReactElement {
  const [subTab, setSubTab] = useState<RaceSubTab>('race');

  return (
    <div>
      <div className="flex gap-2 mb-5">
        {(['race', 'by-group', 'by-knockout', 'by-specials'] as RaceSubTab[]).map((t) => {
          const active = subTab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setSubTab(t)}
              data-testid={`points-race-subtab-${t}`}
              className={cn(
                'py-[7px] px-4 rounded-cup-sm border-0 cursor-pointer font-cup-ui text-[13px] font-extrabold transition-[background]',
                active
                  ? 'bg-ink-900 text-white shadow-none'
                  : 'bg-surface text-ink-muted shadow-[inset_0_0_0_1px_var(--line)]',
              )}
            >
              {SUB_TAB_LABELS[t]}
            </button>
          );
        })}
      </div>

      {subTab === 'race' && (
        <RaceView
          race={race}
          viewerMode={viewerMode}
          userBreakdown={userBreakdown}
          scoring={scoring}
          {...(leaderboard !== undefined && { leaderboard })}
          {...(currentUserId !== undefined && { currentUserId })}
        />
      )}
      {subTab === 'by-group' && (
        <MatchMatrix entries={race.matchMatrix} matches={race.matrixMatches} />
      )}
      {subTab === 'by-knockout' && (
        <KnockoutMatrix entries={race.knockoutMatrix} matches={race.knockoutMatrixMatches} />
      )}
      {subTab === 'by-specials' && (
        <SpecialsMatrix entries={race.specialsMatrix} bets={race.specialsMatrixBets} />
      )}
    </div>
  );
}
