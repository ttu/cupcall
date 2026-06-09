'use client';

import type { ReactElement } from 'react';
import { useTransition } from 'react';
import { saveGroupScore } from '../api/actions';
import type { GroupView } from '../domain/types';
import { ScoreCell } from './ScoreCell';
import { teamFlag } from './teamFlag';

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

  return (
    <section aria-label="Group stage predictions" className="space-y-6">
      {groups.map((group) => (
        <div
          key={group.groupId}
          className="rounded-[var(--radius)] border border-[var(--line)] overflow-hidden bg-white shadow-[var(--shadow-sm)]"
        >
          <div className="px-4 py-2.5 turf flex items-center gap-2">
            <span
              className="text-xs font-bold tracking-widest uppercase text-[var(--on-dark-muted)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Group
            </span>
            <span
              className="text-lg font-bold text-[var(--on-dark)] leading-none"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {group.groupId}
            </span>
          </div>

          <div className="divide">
            {group.matches.map((match) => (
              <div key={match.matchId} className="flex items-center gap-3 px-4 py-3">
                <span className="flex-1 text-right text-sm font-medium text-[var(--ink)] truncate">
                  {match.homeTeamName} {teamFlag(match.homeTeamId)}
                </span>
                <ScoreCell
                  matchId={match.matchId}
                  poolId={poolId}
                  home={match.predictedHome}
                  away={match.predictedAway}
                  locked={locked}
                  onSave={handleSave}
                />
                <span className="flex-1 text-left text-sm font-medium text-[var(--ink)] truncate">
                  {teamFlag(match.awayTeamId)} {match.awayTeamName}
                </span>
              </div>
            ))}
          </div>

          {group.derivedOrder.length > 0 && (
            <div className="px-4 py-2 bg-[var(--surface-2)] border-t border-[var(--line-soft)] flex flex-wrap gap-1.5">
              {group.derivedOrder.map((entry, i) => (
                <span
                  key={entry.teamId}
                  className={
                    'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ' +
                    (entry.qualifies === 'auto'
                      ? 'bg-[var(--green-050)] text-[var(--green-700)] ring-1 ring-[var(--green-300)]'
                      : entry.qualifies === 'best-third'
                        ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-300'
                        : 'bg-[var(--surface-2)] text-[var(--ink-muted)] ring-1 ring-[var(--line)]')
                  }
                >
                  <span className="opacity-60">{i + 1}.</span>
                  {teamFlag(entry.teamId)} {entry.teamName}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
