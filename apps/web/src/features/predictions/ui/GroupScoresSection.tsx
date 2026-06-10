'use client';

import type { ReactElement } from 'react';
import { useTransition } from 'react';
import { saveGroupScore } from '../api/actions';
import type { GroupView } from '../domain/types';
import { ScoreCell } from './ScoreCell';
import { TeamBadge } from '@/shared/ui';
import { Chip } from '@/shared/ui';

type Props = {
  groups: GroupView[];
  poolId: string;
  locked: boolean;
  onSave?: (matchId: string, home: number, away: number) => void;
};

export function GroupScoresSection({ groups, poolId, locked, onSave }: Props): ReactElement {
  const [, startTransition] = useTransition();

  async function handleSave(matchId: string, home: number, away: number) {
    if (onSave) {
      onSave(matchId, home, away);
      return;
    }
    startTransition(() => {
      void saveGroupScore({ poolId, matchId, home, away });
    });
  }

  function jumpToGroup(groupId: string) {
    document
      .getElementById(`predict-group-${groupId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section
      aria-label="Group stage predictions"
      style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
    >
      {/* Group jump nav */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {groups.map((g) => {
          const hasIncomplete = g.matches.some((m) => m.predictedHome === null);
          return (
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
                boxShadow: hasIncomplete
                  ? 'inset 0 0 0 2px var(--orange-400)'
                  : 'inset 0 0 0 1px var(--line)',
                transition: 'background .15s',
              }}
            >
              {g.groupId}
            </button>
          );
        })}
      </div>

      {/* All groups stacked */}
      {groups.map((group) => (
        <div
          key={group.groupId}
          id={`predict-group-${group.groupId}`}
          style={{ display: 'grid', gap: 12, alignItems: 'start' }}
          className="md:grid-cols-[1fr_196px]"
        >
          {/* Matches card */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="turf" style={{ padding: '10px 16px' }}>
              <span className="display" style={{ fontSize: 20, color: 'var(--on-dark)' }}>
                Group {group.groupId}
              </span>
            </div>
            <div className="divide">
              {group.matches.map((match) => {
                const incomplete = match.predictedHome === null;
                return (
                  <div
                    key={match.matchId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto 1fr',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 16px',
                      background: incomplete && !locked ? 'var(--orange-050)' : undefined,
                    }}
                  >
                    {/* Home */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      {incomplete && !locked && (
                        <Chip variant="orange" style={{ height: 22, fontSize: 10 }}>
                          Needs a score
                        </Chip>
                      )}
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--ink)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {match.homeTeamName}
                      </span>
                      <TeamBadge teamId={match.homeTeamId} size="lg" />
                    </div>

                    {/* Score cells */}
                    <ScoreCell
                      matchId={match.matchId}
                      poolId={poolId}
                      home={match.predictedHome}
                      away={match.predictedAway}
                      locked={locked}
                      onSave={handleSave}
                    />

                    {/* Away */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      <TeamBadge teamId={match.awayTeamId} size="lg" />
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--ink)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {match.awayTeamName}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Auto-derived standings — right rail */}
          {group.derivedOrder.length > 0 && (
            <div className="card" style={{ padding: '12px 14px' }}>
              <div className="eyebrow" style={{ color: 'var(--ink-muted)', marginBottom: 10 }}>
                Auto-derived order
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {group.derivedOrder.map((entry, i) => (
                  <div
                    key={entry.teamId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      padding: '5px 8px',
                      borderRadius: 8,
                      background:
                        entry.qualifies === 'auto'
                          ? 'var(--green-050)'
                          : entry.qualifies === 'best-third'
                            ? 'var(--orange-050)'
                            : undefined,
                    }}
                  >
                    <span
                      style={{ fontSize: 11, color: 'var(--ink-muted)', width: 14, flexShrink: 0 }}
                    >
                      {i + 1}.
                    </span>
                    <TeamBadge teamId={entry.teamId} size="sm" />
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--ink)',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {entry.teamName}
                    </span>
                    {entry.qualifies === 'auto' && (
                      <Chip variant="green" style={{ height: 18, fontSize: 9, padding: '0 6px' }}>
                        QUALIFIES
                      </Chip>
                    )}
                    {entry.qualifies === 'best-third' && (
                      <Chip variant="orange" style={{ height: 18, fontSize: 9, padding: '0 6px' }}>
                        MAYBE
                      </Chip>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
