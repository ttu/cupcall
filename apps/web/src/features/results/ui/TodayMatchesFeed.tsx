import type { ReactElement } from 'react';
import type { GroupResultView, GroupUpcomingMatchRow, MatchPredictionStats } from '../domain/types';
import { TeamBadge } from '@/shared/ui';

type Props = { groups: GroupResultView[] };

function PredictionStatsBar({ stats }: { stats: MatchPredictionStats }): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', height: 8, gap: 1 }}>
        {stats.homeWinPct > 0 && (
          <div
            style={{ flex: stats.homeWinPct, background: 'oklch(0.55 0.13 250)', borderRadius: 3 }}
          />
        )}
        {stats.drawPct > 0 && (
          <div style={{ flex: stats.drawPct, background: 'var(--line)', borderRadius: 3 }} />
        )}
        {stats.awayWinPct > 0 && (
          <div
            style={{ flex: stats.awayWinPct, background: 'oklch(0.64 0.12 30)', borderRadius: 3 }}
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

function TodayMatchRow({ match }: { match: GroupUpcomingMatchRow }): ReactElement {
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
          gridTemplateColumns: 'auto 1fr auto 1fr auto',
          alignItems: 'center',
          gap: 8,
          padding: stats ? '10px 14px 6px' : '10px 14px',
        }}
      >
        {/* Group badge */}
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: 'var(--surface-2)',
            boxShadow: 'inset 0 0 0 1px var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-display)',
            fontSize: 12,
            color: 'var(--ink-muted)',
            flexShrink: 0,
          }}
        >
          {match.groupId}
        </div>

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

        {/* Kickoff + user prediction */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            flexShrink: 0,
          }}
        >
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
          {match.predictedHome !== null && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--ink-soft)',
                whiteSpace: 'nowrap',
              }}
            >
              you {match.predictedHome}–{match.predictedAway}
            </span>
          )}
        </div>

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

        {/* Spacer to balance the group badge */}
        <div style={{ width: 24, flexShrink: 0 }} />
      </div>

      {stats && (
        <div style={{ padding: '0 14px 10px' }}>
          <PredictionStatsBar stats={stats} />
        </div>
      )}
    </div>
  );
}

export function TodayMatchesFeed({ groups }: Props): ReactElement | null {
  const allToday = groups
    .flatMap((g) => g.todayMatches)
    .sort((a, b) => {
      if (!a.kickoff) return 1;
      if (!b.kickoff) return -1;
      return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
    });

  if (allToday.length === 0) return null;

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="turf" style={{ padding: '10px 16px' }}>
        <span className="display" style={{ fontSize: 20, color: 'var(--on-dark)' }}>
          Today
        </span>
      </div>
      <div className="divide">
        {allToday.map((m) => (
          <TodayMatchRow key={m.matchId} match={m} />
        ))}
      </div>
    </div>
  );
}
