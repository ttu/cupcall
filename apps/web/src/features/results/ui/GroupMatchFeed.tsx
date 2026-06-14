import type { ReactElement } from 'react';
import type { GroupResultView } from '../domain/types';
import { HitChip } from './HitChip';
import { TeamBadge, cn } from '@/shared/ui';

type Props = { group: GroupResultView };

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
            <div
              key={m.matchId}
              className="grid [grid-template-columns:1fr_auto_1fr_116px] items-center gap-2 p-[10px_14px]"
            >
              {/* Home team */}
              <div className="flex items-center justify-end gap-[6px] min-w-0">
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
              <div className="flex items-center gap-[6px] min-w-0">
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
          ))}
        </div>
      )}
    </div>
  );
}
