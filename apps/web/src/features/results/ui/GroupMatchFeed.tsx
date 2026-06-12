import type { ReactElement } from 'react';
import type { GroupResultView, GroupUpcomingMatchRow, MatchPredictionStats } from '../domain/types';
import { HitChip } from './HitChip';
import { TeamBadge } from '@/shared/ui';

type Props = { group: GroupResultView };

function PredictionStatsBar({ stats }: { stats: MatchPredictionStats }): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          display: 'flex',
          borderRadius: 3,
          overflow: 'hidden',
          height: 8,
          gap: 1,
        }}
      >
        {stats.homeWinPct > 0 && (
          <div
            style={{ flex: stats.homeWinPct, background: 'oklch(0.55 0.13 250)', borderRadius: 3 }}
          />
        )}
        {stats.drawPct > 0 && (
          <div
            style={{
              flex: stats.drawPct,
              background: 'var(--line)',
              borderRadius: 3,
            }}
          />
        )}
        {stats.awayWinPct > 0 && (
          <div
            style={{
              flex: stats.awayWinPct,
              background: 'oklch(0.64 0.12 30)',
              borderRadius: 3,
            }}
          />
        )}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: 'var(--ink-muted)',
        }}
      >
        <span style={{ color: 'oklch(0.55 0.13 250)', fontWeight: 600 }}>{stats.homeWinPct}%</span>
        <span>
          {stats.drawPct}% draw &middot; avg {stats.avgHomeGoals}–{stats.avgAwayGoals}
        </span>
        <span style={{ color: 'oklch(0.64 0.12 30)', fontWeight: 600 }}>{stats.awayWinPct}%</span>
      </div>
    </div>
  );
}

function UpcomingMatchRow({ match }: { match: GroupUpcomingMatchRow }): ReactElement {
  const kickoffTime =
    match.kickoff !== null
      ? new Date(match.kickoff).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

  const stats = match.poolPredictionStats;

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr 80px',
          alignItems: 'center',
          gap: 8,
          padding: stats ? '10px 14px 6px' : '10px 14px',
        }}
      >
        {/* Home */}
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
              color: 'var(--ink)',
            }}
          >
            {match.homeTeamName}
          </span>
          <TeamBadge teamId={match.homeTeamId} size="sm" />
        </div>

        {/* Kickoff time */}
        <span
          style={{
            fontSize: 12,
            color: 'var(--ink-muted)',
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          {kickoffTime ?? '–'}
        </span>

        {/* Away */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <TeamBadge teamId={match.awayTeamId} size="sm" />
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--ink)',
            }}
          >
            {match.awayTeamName}
          </span>
        </div>

        {/* User prediction (if any) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          {match.predictedHome !== null && (
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-muted)' }}>
              you {match.predictedHome}–{match.predictedAway}
            </span>
          )}
        </div>
      </div>

      {stats && (
        <div style={{ padding: '0 14px 10px' }}>
          <PredictionStatsBar stats={stats} />
        </div>
      )}
    </div>
  );
}

export function GroupMatchFeed({ group }: Props): ReactElement {
  const hasCompleted = group.completedMatches.length > 0;
  const hasToday = group.todayMatches.length > 0;

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="turf" style={{ padding: '10px 16px' }}>
        <span className="display" style={{ fontSize: 20, color: 'var(--on-dark)' }}>
          Group {group.groupId}
        </span>
      </div>

      {!hasCompleted && !hasToday && (
        <p
          style={{
            fontSize: 13,
            padding: '16px 0',
            textAlign: 'center',
            color: 'var(--ink-muted)',
          }}
        >
          No results yet
        </p>
      )}

      {hasToday && (
        <>
          <div style={{ padding: '8px 14px 4px' }}>
            <span className="eyebrow" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>
              Today
            </span>
          </div>
          <div className="divide">
            {group.todayMatches.map((m) => (
              <UpcomingMatchRow key={m.matchId} match={m} />
            ))}
          </div>
        </>
      )}

      {hasCompleted && (
        <>
          {hasToday && (
            <div
              style={{
                padding: '8px 14px 4px',
                borderTop: '1px solid var(--line-soft)',
              }}
            >
              <span className="eyebrow" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>
                Results
              </span>
            </div>
          )}
          <div className="divide">
            {group.completedMatches.map((m) => (
              <div
                key={m.matchId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr 116px',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                }}
              >
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
                  <span style={{ color: 'var(--ink-muted)', margin: '0 2px', fontSize: 14 }}>
                    –
                  </span>
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
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 3,
                  }}
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
        </>
      )}
    </div>
  );
}
