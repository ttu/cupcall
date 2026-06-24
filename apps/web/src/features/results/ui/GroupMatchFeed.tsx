import type { ReactElement } from 'react';
import type {
  GroupResultView,
  GroupUpcomingMatchRow,
  MatchHit,
  MatchResultPoolStats,
} from '../domain/types';
import { HitChip } from './HitChip';
import { PredictionStatsBar } from './TodayMatchesFeed';
import { TeamBadge, cn } from '@/shared/ui';

type Props = { group: GroupResultView };

type ScoreRowProps = {
  homeTeamId: string;
  homeTeamName: string;
  actualHome: number;
  actualAway: number;
  awayTeamId: string;
  awayTeamName: string;
};

type FooterProps = {
  predictedHome: number | null;
  predictedAway: number | null;
  hit: MatchHit;
  pointsAwarded: number;
  poolMatchStats: MatchResultPoolStats | null;
};

function MatchScoreRow({
  homeTeamId,
  homeTeamName,
  actualHome,
  actualAway,
  awayTeamId,
  awayTeamName,
}: ScoreRowProps): ReactElement {
  return (
    <div className="flex items-center justify-center gap-2 p-[10px_14px_6px]">
      <div className="flex items-center justify-end gap-1.5 flex-1 min-w-0">
        <span
          className={cn(
            'text-[13px] font-bold truncate',
            actualHome > actualAway ? 'text-ink' : 'text-ink-muted',
          )}
        >
          {homeTeamName}
        </span>
        <TeamBadge teamId={homeTeamId} size="sm" />
      </div>

      <span className="display tnum text-[19px] text-ink shrink-0">
        {actualHome}
        <span className="text-ink-muted mx-0.5 text-sm">–</span>
        {actualAway}
      </span>

      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <TeamBadge teamId={awayTeamId} size="sm" />
        <span
          className={cn(
            'text-[13px] font-bold truncate',
            actualAway > actualHome ? 'text-ink' : 'text-ink-muted',
          )}
        >
          {awayTeamName}
        </span>
      </div>
    </div>
  );
}

function PoolMatchStats({ stats }: { stats: MatchResultPoolStats }): ReactElement {
  const correctPct = stats.exactPct + stats.outcomePct;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider shrink-0">
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

function MatchFooter({
  predictedHome,
  predictedAway,
  hit,
  pointsAwarded,
  poolMatchStats,
}: FooterProps): ReactElement | null {
  const hasPrediction = predictedHome !== null;
  const hasPool = poolMatchStats !== null;
  if (!hasPrediction && !hasPool) return null;

  return (
    <div className="flex items-center justify-between px-3.5 pb-2.5 gap-2">
      {hasPool && <PoolMatchStats stats={poolMatchStats} />}

      <div className="flex items-center gap-1.5 ml-auto">
        {hasPrediction && (
          <span className="text-[10.5px] font-semibold text-ink-muted">
            you {predictedHome}–{predictedAway}
          </span>
        )}
        <HitChip hit={hit} points={pointsAwarded} />
      </div>
    </div>
  );
}

function formatKickoff(kickoff: string | null): string {
  if (!kickoff) return '–';
  const d = new Date(kickoff);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${date} · ${time}`;
}

function UpcomingMatchRow({ match }: { match: GroupUpcomingMatchRow }): ReactElement {
  const stats = match.poolPredictionStats;

  return (
    <div>
      <div
        className={cn(
          'grid grid-cols-[1fr_auto_1fr] items-center gap-2',
          stats ? 'p-[10px_14px_6px]' : 'p-[10px_14px]',
        )}
      >
        <div className="flex items-center justify-end gap-1.5 min-w-0">
          <span className="text-[13px] font-bold truncate text-ink">{match.homeTeamName}</span>
          <TeamBadge teamId={match.homeTeamId} size="sm" />
        </div>

        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <span className="text-xs text-ink-muted text-center whitespace-nowrap">
            {formatKickoff(match.kickoff)}
          </span>
          {match.predictedHome !== null && (
            <span className="text-[10px] font-semibold text-ink-soft whitespace-nowrap">
              you {match.predictedHome}–{match.predictedAway}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 min-w-0">
          <TeamBadge teamId={match.awayTeamId} size="sm" />
          <span className="text-[13px] font-bold truncate text-ink">{match.awayTeamName}</span>
        </div>
      </div>

      {stats && (
        <div className="px-3.5 pb-2.5">
          <PredictionStatsBar stats={stats} />
        </div>
      )}
    </div>
  );
}

export function GroupMatchFeed({ group }: Props): ReactElement {
  const hasCompleted = group.completedMatches.length > 0;
  const allUpcoming = [...group.todayMatches, ...group.upcomingMatches].toSorted((a, b) => {
    if (!a.kickoff) return 1;
    if (!b.kickoff) return -1;
    return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
  });
  const hasUpcoming = allUpcoming.length > 0;

  return (
    <div className="card overflow-hidden">
      <div className="turf p-[10px_16px]">
        <span className="display text-xl text-on-dark">Group {group.groupId}</span>
      </div>

      {!hasCompleted && !hasUpcoming && (
        <p className="text-[13px] py-4 text-center text-ink-muted">No matches yet</p>
      )}

      {hasCompleted && (
        <div className="divide">
          {group.completedMatches.map((m) => (
            <div key={m.matchId}>
              <MatchScoreRow
                homeTeamId={m.homeTeamId}
                homeTeamName={m.homeTeamName}
                actualHome={m.actualHome}
                actualAway={m.actualAway}
                awayTeamId={m.awayTeamId}
                awayTeamName={m.awayTeamName}
              />
              <MatchFooter
                predictedHome={m.predictedHome}
                predictedAway={m.predictedAway}
                hit={m.hit}
                pointsAwarded={m.pointsAwarded}
                poolMatchStats={m.poolMatchStats}
              />
            </div>
          ))}
        </div>
      )}

      {hasUpcoming && (
        <div className={cn('divide', hasCompleted && 'border-t border-line-soft')}>
          {allUpcoming.map((m) => (
            <UpcomingMatchRow key={m.matchId} match={m} />
          ))}
        </div>
      )}
    </div>
  );
}
