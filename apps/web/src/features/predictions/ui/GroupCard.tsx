import type { ReactElement } from 'react';
import type { GroupView } from '../domain/types';
import { ScoreCell } from './ScoreCell';
import { TeamBadge, Chip } from '@/shared/ui';
import { cn } from '@/shared/ui';
import { DerivedStandingsPanel } from './DerivedStandingsPanel';

type Props = {
  group: GroupView;
  poolId: string;
  locked: boolean;
  onSave: (matchId: string, home: number, away: number) => Promise<void>;
};

export function GroupCard({ group, poolId, locked, onSave }: Props): ReactElement {
  return (
    <div
      id={`predict-group-${group.groupId}`}
      className="grid gap-3 items-start md:grid-cols-[1fr_196px]"
    >
      <div className="card overflow-hidden">
        <div className="turf px-4 py-2.5">
          <span className="display text-xl text-on-dark">Group {group.groupId}</span>
        </div>
        <div className="divide">
          {group.matches.map((match) => {
            const cellLocked = locked || match.locked;
            const incomplete = match.predictedHome === null;
            return (
              <div
                key={match.matchId}
                className={cn(
                  'grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 px-4 py-2.5',
                  incomplete && !cellLocked && 'bg-orange-050',
                )}
              >
                <div className="flex items-center justify-end gap-2 min-w-0">
                  {incomplete && !cellLocked && (
                    <Chip variant="orange" style={{ height: 22, fontSize: 10 }}>
                      Needs a score
                    </Chip>
                  )}
                  <span className="text-[13px] font-bold text-ink truncate">
                    {match.homeTeamName}
                  </span>
                  <TeamBadge teamId={match.homeTeamId} size="lg" />
                </div>

                <ScoreCell
                  matchId={match.matchId}
                  poolId={poolId}
                  home={match.predictedHome}
                  away={match.predictedAway}
                  locked={cellLocked}
                  onSave={onSave}
                />

                <div className="flex items-center gap-2 min-w-0">
                  <TeamBadge teamId={match.awayTeamId} size="lg" />
                  <span className="text-[13px] font-bold text-ink truncate">
                    {match.awayTeamName}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {group.derivedOrder.length > 0 && <DerivedStandingsPanel derivedOrder={group.derivedOrder} />}
    </div>
  );
}
