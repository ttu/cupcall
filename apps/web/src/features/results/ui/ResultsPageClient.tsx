'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import type { ResultsView } from '../domain/types';
import { GroupMatchFeed } from './GroupMatchFeed';
import { GroupTable } from './GroupTable';
import { TodayMatchesFeed } from './TodayMatchesFeed';
import { KnockoutBracket } from './KnockoutBracket';
import { BracketHealthPanel } from './BracketHealthPanel';
import { KnockoutPointsPanel } from './KnockoutPointsPanel';
import { PointsRaceTab } from './PointsRaceTab';
import { SpecialBetsPanel } from './SpecialBetsPanel';

type Tab = 'group' | 'knockout' | 'race' | 'specials';

type Props = { view: ResultsView; initialTab?: Tab; viewerMode?: boolean };

export function ResultsPageClient({
  view,
  initialTab = 'group',
  viewerMode = false,
}: Props): ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const finalRound = view.bracketRounds.find((r) => r.label === 'Final');
  const finalMatch = finalRound?.matches[0] ?? null;

  function jumpToGroup(groupId: string) {
    document
      .getElementById(`results-group-${groupId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div>
      {/* Tabs */}
      <nav
        aria-label="Results sections"
        style={{ display: 'flex', borderBottom: '1px solid var(--line-soft)', marginBottom: 24 }}
      >
        {(['group', 'knockout', 'specials', 'race'] as Tab[]).map((tab) => {
          const active = activeTab === tab;
          const label =
            tab === 'group'
              ? 'Group Stage'
              : tab === 'knockout'
                ? 'Knockout'
                : tab === 'specials'
                  ? 'Specials'
                  : 'Points Race';
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              data-testid={`results-tab-${tab}`}
              style={{
                flex: 1,
                padding: '11px 12px 14px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                boxShadow: active ? 'inset 0 -3px 0 var(--green-500)' : 'none',
                fontFamily: 'var(--font-ui)',
                fontSize: 13,
                fontWeight: 700,
                color: active ? 'var(--ink)' : 'var(--ink-muted)',
                transition: 'color .15s',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {activeTab === 'group' && (
        <section
          aria-label="Group stage results"
          style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
        >
          <TodayMatchesFeed groups={view.groupResults} />

          {/* Group jump nav */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {view.groupResults.map((g) => (
              <button
                key={g.groupId}
                type="button"
                onClick={() => jumpToGroup(g.groupId)}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 9,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-display)',
                  fontSize: 16,
                  fontWeight: 400,
                  background: 'var(--surface-2)',
                  color: 'var(--ink-soft)',
                  boxShadow: 'inset 0 0 0 1px var(--line)',
                  transition: 'background .15s',
                }}
              >
                {g.groupId}
              </button>
            ))}
          </div>

          {/* All groups stacked */}
          {view.groupResults.map((group) => (
            <div
              key={group.groupId}
              id={`results-group-${group.groupId}`}
              style={{ display: 'grid', gap: 12, alignItems: 'start' }}
              className="md:grid-cols-[minmax(0,1fr)_326px]"
            >
              <GroupMatchFeed group={group} />
              <GroupTable standing={group.standing} />
            </div>
          ))}
        </section>
      )}

      {activeTab === 'knockout' && (
        <div style={{ display: 'grid', gap: 24 }} className="md:grid-cols-[minmax(0,1fr)_240px]">
          <KnockoutBracket rounds={view.bracketRounds} bronzeMatch={view.bronzeMatch} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <BracketHealthPanel health={view.bracketHealth} championPick={finalMatch} />
            <KnockoutPointsPanel breakdown={view.userBreakdown} />
          </div>
        </div>
      )}

      {activeTab === 'specials' && <SpecialBetsPanel specialBets={view.specialBets} />}

      {activeTab === 'race' && <PointsRaceTab race={view.pointsRaceView} viewerMode={viewerMode} />}
    </div>
  );
}
