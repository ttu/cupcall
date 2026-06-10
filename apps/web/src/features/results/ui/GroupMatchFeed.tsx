import type { ReactElement } from 'react';
import type { GroupResultView } from '../domain/types';
import { HitChip } from './HitChip';
import { TeamBadge } from '@/shared/ui';

type Props = { group: GroupResultView };

export function GroupMatchFeed({ group }: Props): ReactElement {
  if (group.completedMatches.length === 0) {
    return (
      <p
        style={{ fontSize: 13, padding: '16px 0', textAlign: 'center', color: 'var(--ink-muted)' }}
      >
        No results yet for Group {group.groupId}
      </p>
    );
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="divide">
        {group.completedMatches.map((m) => (
          <div
            key={m.matchId}
            style={{
              display: 'grid',
              gridTemplateColumns: '30px 1fr auto 1fr 116px',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
            }}
          >
            {/* Group chip */}
            <span
              className="chip"
              style={{
                width: 28,
                height: 24,
                padding: 0,
                justifyContent: 'center',
                fontSize: 10,
              }}
            >
              {m.groupId}
            </span>

            {/* Home team */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 6,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: m.actualHome > m.actualAway ? 'var(--ink)' : 'var(--ink-muted)',
                }}
              >
                {m.homeTeamName}
              </span>
              <TeamBadge teamId={m.homeTeamId} size="sm" />
            </div>

            {/* Score */}
            <span
              className="display tnum"
              style={{ fontSize: 19, color: 'var(--ink)', textAlign: 'center' }}
            >
              {m.actualHome}
              <span style={{ color: 'var(--ink-muted)', margin: '0 2px', fontSize: 14 }}>–</span>
              {m.actualAway}
            </span>

            {/* Away team */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minWidth: 0,
              }}
            >
              <TeamBadge teamId={m.awayTeamId} size="sm" />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: m.actualAway > m.actualHome ? 'var(--ink)' : 'var(--ink-muted)',
                }}
              >
                {m.awayTeamName}
              </span>
            </div>

            {/* Prediction + hit chip */}
            <div
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}
            >
              {m.predictedHome !== null && (
                <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-muted)' }}>
                  you {m.predictedHome}–{m.predictedAway}
                </span>
              )}
              <HitChip hit={m.hit} points={m.pointsAwarded} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
