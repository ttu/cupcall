'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import type { PointsRaceView } from '../domain/types';
import { RaceView } from './RaceView';
import { MatchMatrix } from './MatchMatrix';

type RaceSubTab = 'race' | 'by-match';

type Props = { race: PointsRaceView; viewerMode?: boolean };

export function PointsRaceTab({ race, viewerMode = false }: Props): ReactElement {
  const [subTab, setSubTab] = useState<RaceSubTab>('race');

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['race', 'by-match'] as RaceSubTab[]).map((t) => {
          const active = subTab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setSubTab(t)}
              data-testid={`points-race-subtab-${t}`}
              style={{
                padding: '7px 16px',
                borderRadius: 9,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
                fontSize: 13,
                fontWeight: 800,
                background: active ? 'var(--ink-900)' : 'var(--surface)',
                color: active ? '#fff' : 'var(--ink-muted)',
                boxShadow: active ? 'none' : 'inset 0 0 0 1px var(--line)',
                transition: 'background .15s',
              }}
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
