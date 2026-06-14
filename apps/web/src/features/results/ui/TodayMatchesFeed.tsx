import type { ReactElement } from 'react';
import type { GroupResultView, GroupUpcomingMatchRow, MatchPredictionStats } from '../domain/types';
import { TeamBadge, cn } from '@/shared/ui';

type Props = { groups: GroupResultView[] };

function PredictionStatsBar({ stats }: { stats: MatchPredictionStats }): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex rounded-[3px] overflow-hidden h-2 gap-px">
        {stats.homeWinPct > 0 && (
          <div
            className="rounded-[3px] bg-[oklch(0.55_0.13_250)]"
            style={{ flex: stats.homeWinPct }}
          />
        )}
        {stats.drawPct > 0 && (
          <div className="rounded-[3px] bg-line" style={{ flex: stats.drawPct }} />
        )}
        {stats.awayWinPct > 0 && (
          <div
            className="rounded-[3px] bg-[oklch(0.64_0.12_30)]"
            style={{ flex: stats.awayWinPct }}
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] text-ink-muted">
        <span className="text-[oklch(0.55_0.13_250)] font-semibold">{stats.homeWinPct}%</span>
        <span>
          {stats.drawPct}% draw &middot; avg {stats.avgHomeGoals}–{stats.avgAwayGoals}
        </span>
        <span className="text-[oklch(0.64_0.12_30)] font-semibold">{stats.awayWinPct}%</span>
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
        className={cn(
          'grid [grid-template-columns:auto_1fr_auto_1fr_auto] items-center gap-2',
          stats ? 'p-[10px_14px_6px]' : 'p-[10px_14px]',
        )}
      >
        {/* Group badge */}
        <div className="w-6 h-6 rounded-[6px] bg-surface-2 shadow-[inset_0_0_0_1px_var(--line)] flex items-center justify-center font-cup-display text-xs text-ink-muted shrink-0">
          {match.groupId}
        </div>

        {/* Home */}
        <div className="flex items-center justify-end gap-[6px] min-w-0">
          <span className="text-[13px] font-bold truncate text-ink">{match.homeTeamName}</span>
          <TeamBadge teamId={match.homeTeamId} size="sm" />
        </div>

        {/* Kickoff + user prediction */}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <span className="text-xs text-ink-muted text-center whitespace-nowrap">
            {kickoffTime ?? '–'}
          </span>
          {match.predictedHome !== null && (
            <span className="text-[10px] font-semibold text-ink-soft whitespace-nowrap">
              you {match.predictedHome}–{match.predictedAway}
            </span>
          )}
        </div>

        {/* Away */}
        <div className="flex items-center gap-[6px] min-w-0">
          <TeamBadge teamId={match.awayTeamId} size="sm" />
          <span className="text-[13px] font-bold truncate text-ink">{match.awayTeamName}</span>
        </div>

        {/* Spacer to balance the group badge */}
        <div className="w-6 shrink-0" />
      </div>

      {stats && (
        <div className="px-[14px] pb-[10px]">
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
    <div className="card overflow-hidden">
      <div className="turf p-[10px_16px]">
        <span className="display text-xl text-on-dark">Today</span>
      </div>
      <div className="divide">
        {allToday.map((m) => (
          <TodayMatchRow key={m.matchId} match={m} />
        ))}
      </div>
    </div>
  );
}
