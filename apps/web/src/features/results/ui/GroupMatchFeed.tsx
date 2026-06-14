import type { ReactElement } from 'react';
import type { GroupResultView, MatchResultPoolStats } from '../domain/types';
import { HitChip } from './HitChip';
import { TeamBadge, cn } from '@/shared/ui';

type Props = { group: GroupResultView };

function PoolMatchStatsRow({ stats }: { stats: MatchResultPoolStats }): ReactElement {
  const correctPct = stats.exactPct + stats.outcomePct;
  return (
    <div className="px-3.5 pb-2.5 flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-bold text-ink-muted uppercase tracking-[0.05em] shrink-0">
        Pool
      </span>
      <span className="text-[11px] text-ink-soft">
        <span className="font-bold text-ink">{correctPct}%</span> correct
      </span>
      {stats.exactPct > 0 && (
        <span className="text-[11px] text-ink-muted">({stats.exactPct}% exact)</span>
      )}
    </div>
  );
}

export function GroupMatchFeed({ group }: Props): ReactElement {
  const hasCompleted = group.completedMatches.length > 0;

  return (
    <div className="card overflow-hidden">
      <div className="turf p-[10px_16px]">
        <span className="display text-xl text-on-dark">Group {group.groupId}</span>
      </div>

      {!hasCompleted && (
        <p className="text-[13px] py-4 text-center text-ink-muted">No results yet</p>
      )}

      {hasCompleted && (
        <div className="divide">
          {group.completedMatches.map((m) => (
            <div key={m.matchId}>
              <div className="grid grid-cols-[1fr_auto_1fr_116px] items-center gap-2 p-[10px_14px_8px]">
                {/* Home team */}
                <div className="flex items-center justify-end gap-1.5 min-w-0">
                  <span
                    className={cn(
                      'text-[13px] font-bold truncate',
                      m.actualHome > m.actualAway ? 'text-ink' : 'text-ink-muted',
                    )}
                  >
                    {m.homeTeamName}
                  </span>
                  <TeamBadge teamId={m.homeTeamId} size="sm" />
                </div>

                {/* Score */}
                <span className="display tnum text-[19px] text-ink text-center">
                  {m.actualHome}
                  <span className="text-ink-muted mx-0.5 text-sm">–</span>
                  {m.actualAway}
                </span>

                {/* Away team */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <TeamBadge teamId={m.awayTeamId} size="sm" />
                  <span
                    className={cn(
                      'text-[13px] font-bold truncate',
                      m.actualAway > m.actualHome ? 'text-ink' : 'text-ink-muted',
                    )}
                  >
                    {m.awayTeamName}
                  </span>
                </div>

                {/* Prediction + hit chip */}
                <div className="flex flex-col items-end gap-[3px]">
                  {m.predictedHome !== null && (
                    <span className="text-[10.5px] font-semibold text-ink-muted">
                      you {m.predictedHome}–{m.predictedAway}
                    </span>
                  )}
                  <HitChip hit={m.hit} points={m.pointsAwarded} />
                </div>
              </div>
              {m.poolMatchStats && <PoolMatchStatsRow stats={m.poolMatchStats} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
