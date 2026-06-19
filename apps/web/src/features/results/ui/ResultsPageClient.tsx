'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import type { ResultsView } from '../domain/types';
import { cn } from '@/shared/ui';
import { GroupMatchFeed } from './GroupMatchFeed';
import { GroupTable } from './GroupTable';
import { Best3rdTable } from './Best3rdTable';
import { TodayMatchesFeed } from './TodayMatchesFeed';
import { KnockoutBracket } from './KnockoutBracket';
import { BracketHealthPanel } from './BracketHealthPanel';
import { KnockoutPointsPanel } from './KnockoutPointsPanel';
import { PointsRaceTab } from './PointsRaceTab';
import { SpecialBetsPanel } from './SpecialBetsPanel';
import { PointsSummaryPanel } from './PointsSummaryPanel';

type Tab = 'group' | 'knockout' | 'race' | 'specials';

const TABS: { id: Tab; label: string }[] = [
  { id: 'group', label: 'Group Stage' },
  { id: 'knockout', label: 'Knockout' },
  { id: 'specials', label: 'Specials' },
  { id: 'race', label: 'Points Race' },
];

function ResultsTabNav({
  active,
  onSelect,
}: {
  active: Tab;
  onSelect: (t: Tab) => void;
}): ReactElement {
  return (
    <nav aria-label="Results sections" className="flex border-b border-line-soft mb-6">
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          data-testid={`results-tab-${id}`}
          className={cn(
            'flex-1 p-[11px_12px_14px] bg-none border-0 cursor-pointer font-cup-ui text-[13px] font-bold transition-colors whitespace-nowrap',
            active === id
              ? 'shadow-[inset_0_-3px_0_var(--green-500)] text-ink'
              : 'shadow-none text-ink-muted',
          )}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

function GroupJumpNav({
  groupIds,
  onJump,
}: {
  groupIds: string[];
  onJump: (id: string) => void;
}): ReactElement {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {groupIds.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onJump(id)}
          className="w-9.5 h-9.5 rounded-cup-sm border-0 cursor-pointer font-cup-display text-base font-normal bg-surface-2 text-ink-soft shadow-[inset_0_0_0_1px_var(--line)] transition-[background]"
        >
          {id}
        </button>
      ))}
    </div>
  );
}

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
      <ResultsTabNav active={activeTab} onSelect={setActiveTab} />

      {activeTab === 'group' && (
        <section aria-label="Group stage results" className="flex flex-col gap-6">
          {view.userGroupSummary && <PointsSummaryPanel summary={view.userGroupSummary} />}
          <TodayMatchesFeed groups={view.groupResults} />

          <GroupJumpNav groupIds={view.groupResults.map((g) => g.groupId)} onJump={jumpToGroup} />

          {view.groupResults.map((group) => (
            <div
              key={group.groupId}
              id={`results-group-${group.groupId}`}
              className="grid gap-3 items-start md:grid-cols-[minmax(0,1fr)_326px]"
            >
              <GroupMatchFeed group={group} />
              <GroupTable standing={group.standing} />
            </div>
          ))}

          {view.best3rdStanding && (
            <div className="grid gap-3 items-start md:grid-cols-[minmax(0,1fr)_326px]">
              <div />
              <div>
                <h2 className="eyebrow text-[11px] tracking-[0.12em] text-ink-muted mb-2">
                  Best Third Place
                </h2>
                <Best3rdTable rows={view.best3rdStanding} />
              </div>
            </div>
          )}
        </section>
      )}

      {activeTab === 'knockout' && (
        <div className="flex flex-col gap-6">
          {view.userKnockoutSummary && <PointsSummaryPanel summary={view.userKnockoutSummary} />}
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_240px]">
            <KnockoutBracket
              rounds={view.bracketRounds}
              bronzeMatch={view.bronzeMatch}
              userPredictedKnockoutTeamIds={view.userPredictedKnockoutTeamIds}
            />
            <div className="flex flex-col gap-4">
              <BracketHealthPanel health={view.bracketHealth} championPick={finalMatch} />
              <KnockoutPointsPanel breakdown={view.userBreakdown} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'specials' && (
        <div className="flex flex-col gap-6">
          {view.userSpecialsSummary && <PointsSummaryPanel summary={view.userSpecialsSummary} />}
          <SpecialBetsPanel specialBets={view.specialBets} viewerMode={viewerMode} />
        </div>
      )}

      {activeTab === 'race' && <PointsRaceTab race={view.pointsRaceView} viewerMode={viewerMode} />}
    </div>
  );
}
