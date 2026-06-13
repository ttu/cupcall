import type { ReactElement } from 'react';
import type { GroupView } from '../domain/types';
import { ScoreCell } from './ScoreCell';
import { TeamBadge, Chip } from '@/shared/ui';
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
      style={{ display: 'grid', gap: 12, alignItems: 'start' }}
      className="md:grid-cols-[1fr_196px]"
    >
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="turf" style={{ padding: '10px 16px' }}>
          <span className="display" style={{ fontSize: 20, color: 'var(--on-dark)' }}>
            Group {group.groupId}
          </span>
        </div>
        <div className="divide">
          {group.matches.map((match) => {
            const cellLocked = locked || match.locked;
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
                  background: incomplete && !cellLocked ? 'var(--orange-050)' : undefined,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  {incomplete && !cellLocked && (
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

                <ScoreCell
                  matchId={match.matchId}
                  poolId={poolId}
                  home={match.predictedHome}
                  away={match.predictedAway}
                  locked={cellLocked}
                  onSave={onSave}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
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

      {group.derivedOrder.length > 0 && <DerivedStandingsPanel derivedOrder={group.derivedOrder} />}
    </div>
  );
}
