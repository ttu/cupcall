'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import type { ResultsView } from '../domain/types';
import { GroupMatchFeed } from './GroupMatchFeed';
import { GroupTable } from './GroupTable';
import { KnockoutBracket } from './KnockoutBracket';
import { BracketHealthPanel } from './BracketHealthPanel';
import { SectionLabel, Icon } from '@/shared/ui';

type Tab = 'group' | 'knockout';

type Props = { view: ResultsView };

export function ResultsPageClient({ view }: Props): ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('group');
  const [activeGroupId, setActiveGroupId] = useState<string>(view.groupResults[0]?.groupId ?? 'A');

  const activeGroup = view.groupResults.find((g) => g.groupId === activeGroupId);

  const finalRound = view.bracketRounds.find((r) => r.label === 'Final');
  const finalMatch = finalRound?.matches[0] ?? null;

  return (
    <div>
      {/* Tabs */}
      <nav
        aria-label="Results sections"
        style={{ display: 'flex', borderBottom: '1px solid var(--line-soft)', marginBottom: 24 }}
      >
        {(['group', 'knockout'] as Tab[]).map((tab) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
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
              }}
            >
              {tab === 'group' ? 'Group Stage' : 'Knockout'}
            </button>
          );
        })}
      </nav>

      {activeTab === 'group' && (
        <div style={{ display: 'grid', gap: 24 }} className="md:grid-cols-[minmax(0,1fr)_326px]">
          {/* Left: match feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SectionLabel icon={<Icon name="ball" size={13} />}>Completed matches</SectionLabel>
            {activeGroup ? (
              <GroupMatchFeed group={activeGroup} />
            ) : (
              <p style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Select a group</p>
            )}
          </div>

          {/* Right rail: group selector + standings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SectionLabel icon={<Icon name="users" size={13} />}>Live tables</SectionLabel>
            {/* Group selector */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {view.groupResults.map((g) => (
                <button
                  key={g.groupId}
                  type="button"
                  onClick={() => setActiveGroupId(g.groupId)}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 9,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-display)',
                    fontSize: 16,
                    fontWeight: 400,
                    background: g.groupId === activeGroupId ? 'var(--ink-900)' : 'var(--surface-2)',
                    color: g.groupId === activeGroupId ? 'var(--on-dark)' : 'var(--ink-soft)',
                    boxShadow: g.groupId === activeGroupId ? 'none' : 'inset 0 0 0 1px var(--line)',
                    transition: 'background .15s',
                  }}
                  aria-pressed={g.groupId === activeGroupId}
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
        <div style={{ display: 'grid', gap: 24 }} className="md:grid-cols-[minmax(0,1fr)_240px]">
          <KnockoutBracket rounds={view.bracketRounds} bronzeMatch={view.bronzeMatch} />
          <BracketHealthPanel health={view.bracketHealth} championPick={finalMatch} />
        </div>
      )}
    </div>
  );
}
