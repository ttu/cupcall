'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import type { PointsRaceView } from '../domain/types';
import { cn } from '@/shared/ui';
import { RaceView } from './RaceView';
import { MatchMatrix } from './MatchMatrix';

type RaceSubTab = 'race' | 'by-match';

type Props = { race: PointsRaceView; viewerMode?: boolean };

export function PointsRaceTab({ race, viewerMode = false }: Props): ReactElement {
  const [subTab, setSubTab] = useState<RaceSubTab>('race');

  return (
    <div>
      <div className="flex gap-2 mb-5">
        {(['race', 'by-match'] as RaceSubTab[]).map((t) => {
          const active = subTab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setSubTab(t)}
              data-testid={`points-race-subtab-${t}`}
              className={cn(
                'py-[7px] px-4 rounded-[9px] border-0 cursor-pointer font-cup-ui text-[13px] font-extrabold transition-[background]',
                active
                  ? 'bg-ink-900 text-white shadow-none'
                  : 'bg-surface text-ink-muted shadow-[inset_0_0_0_1px_var(--line)]',
              )}
            >
              {t === 'race' ? 'Race' : 'By match'}
            </button>
          );
        })}
      </div>

      {subTab === 'race' && <RaceView race={race} viewerMode={viewerMode} />}
      {subTab === 'by-match' && (
        <MatchMatrix entries={race.matchMatrix} matches={race.matrixMatches} />
      )}
    </div>
  );
}
