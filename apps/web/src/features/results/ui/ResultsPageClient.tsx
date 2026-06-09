'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import type { ResultsView } from '../domain/types';
import { GroupMatchFeed } from './GroupMatchFeed';
import { GroupTable } from './GroupTable';
import { KnockoutBracket } from './KnockoutBracket';
import { BracketHealthPanel } from './BracketHealthPanel';

type Tab = 'group' | 'knockout';

type Props = { view: ResultsView };

export function ResultsPageClient({ view }: Props): ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('group');
  const [activeGroupId, setActiveGroupId] = useState<string>(view.groupResults[0]?.groupId ?? 'A');

  const activeGroup = view.groupResults.find((g) => g.groupId === activeGroupId);

  // The final match is the last bracket round — use it for champion pick lookup
  const finalRound = view.bracketRounds.find((r) => r.label === 'Final');
  const finalMatch = finalRound?.matches[0] ?? null;

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-6" style={{ borderBottom: '1px solid var(--line)' }}>
        {(['group', 'knockout'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-3 text-sm font-bold cursor-pointer border-none bg-transparent"
            style={{
              color: activeTab === tab ? 'var(--ink)' : 'var(--ink-muted)',
              boxShadow: activeTab === tab ? 'inset 0 -3px 0 var(--green-500)' : 'none',
            }}
          >
            {tab === 'group' ? 'Group Stage' : 'Knockout'}
          </button>
        ))}
      </div>

      {activeTab === 'group' && (
        <div className="grid gap-6" style={{ gridTemplateColumns: 'minmax(0,1fr) 280px' }}>
          {/* Left: match feed */}
          <div className="space-y-4">
            <p
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: 'var(--ink-muted)' }}
            >
              Completed group matches
            </p>
            {activeGroup ? (
              <GroupMatchFeed group={activeGroup} />
            ) : (
              <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
                Select a group
              </p>
            )}
          </div>

          {/* Right rail: group selector + standings */}
          <div className="space-y-3">
            <p
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: 'var(--ink-muted)' }}
            >
              Live tables
            </p>
            {/* Group selector */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {view.groupResults.map((g) => (
                <button
                  key={g.groupId}
                  onClick={() => setActiveGroupId(g.groupId)}
                  className="font-black cursor-pointer border-none"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: g.groupId === activeGroupId ? 'var(--ink-900)' : 'var(--surface)',
                    color: g.groupId === activeGroupId ? '#fff' : 'var(--ink-muted)',
                    boxShadow: g.groupId === activeGroupId ? 'none' : 'inset 0 0 0 1px var(--line)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 14,
                  }}
                >
                  {g.groupId}
                </button>
              ))}
            </div>
            {activeGroup && <GroupTable standing={activeGroup.standing} />}
          </div>
        </div>
      )}

      {activeTab === 'knockout' && (
        <div className="grid gap-6" style={{ gridTemplateColumns: 'minmax(0,1fr) 240px' }}>
          <KnockoutBracket rounds={view.bracketRounds} bronzeMatch={view.bronzeMatch} />
          <BracketHealthPanel health={view.bracketHealth} championPick={finalMatch} />
        </div>
      )}
    </div>
  );
}
