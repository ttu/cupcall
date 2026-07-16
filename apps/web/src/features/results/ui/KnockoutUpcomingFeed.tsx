import type { ReactElement } from 'react';
import type { BracketRoundResultView, KnockoutMatchView } from '../domain/types';
import { TeamBadge, cn } from '@/shared/ui';

type Props = {
  rounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
};

function formatKickoff(kickoff: string): string {
  const d = new Date(kickoff);
  const date = d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

function KnockoutPickBar({ homePct, awayPct }: { homePct: number; awayPct: number }): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex rounded-[3px] overflow-hidden h-2 gap-px">
        {homePct > 0 && (
          <div className="rounded-[3px] bg-[oklch(0.55_0.13_250)]" style={{ flex: homePct }} />
        )}
        {awayPct > 0 && (
          <div className="rounded-[3px] bg-[oklch(0.64_0.12_30)]" style={{ flex: awayPct }} />
        )}
      </div>
      <div className="flex justify-between text-[10px] text-ink-muted">
        <span className="text-[oklch(0.55_0.13_250)] font-semibold">{homePct}%</span>
        <span className="text-[oklch(0.64_0.12_30)] font-semibold">{awayPct}%</span>
      </div>
    </div>
  );
}

function KnockoutUpcomingRow({ match }: { match: KnockoutMatchView }): ReactElement {
  const homeId = match.homeTeamId ?? match.predictedHomeTeamId;
  const homeName = match.homeTeamName ?? match.predictedHomeTeamName ?? 'TBD';
  const awayId = match.awayTeamId ?? match.predictedAwayTeamId;
  const awayName = match.awayTeamName ?? match.predictedAwayTeamName ?? 'TBD';

  const hasPool = match.poolPickHomePct !== null && match.poolPickAwayPct !== null;

  // For Final/Bronze, predictedHome/Away are set — show score alongside pick. Resolve by team
  // identity when a snapshot is available so "you → WINNER · X–Y" always pairs X with the
  // winner's own goals, regardless of home/away orientation.
  const goalsByTeam =
    match.predictedGoalsByTeam !== null
      ? new Map(match.predictedGoalsByTeam.map((s) => [s.teamId, s.goals]))
      : null;
  const winnerGoals =
    goalsByTeam !== null && match.pickedWinnerId !== null
      ? (goalsByTeam.get(match.pickedWinnerId) ?? null)
      : match.predictedHome;
  const opponentGoals =
    goalsByTeam !== null && match.pickedOpponentId !== null
      ? (goalsByTeam.get(match.pickedOpponentId) ?? null)
      : match.predictedAway;
  const pickLabel =
    match.pickedWinnerName !== null
      ? winnerGoals !== null
        ? `you → ${match.pickedWinnerName} · ${winnerGoals}–${opponentGoals}`
        : `you → ${match.pickedWinnerName}`
      : null;

  return (
    <div>
      <div
        className={cn(
          'grid grid-cols-[1fr_auto_1fr] items-center gap-2',
          hasPool ? 'p-[10px_14px_6px]' : 'p-[10px_14px]',
        )}
      >
        <div className="flex items-center justify-end gap-1.5 min-w-0">
          <span className="text-[13px] font-bold truncate text-ink">{homeName}</span>
          <TeamBadge teamId={homeId} size="sm" />
        </div>

        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <span className="text-xs text-ink-muted text-center whitespace-nowrap">
            {match.kickoff ? formatKickoff(match.kickoff) : '–'}
          </span>
          {pickLabel !== null && (
            <span className="text-[10px] font-semibold text-ink-soft whitespace-nowrap">
              {pickLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 min-w-0">
          <TeamBadge teamId={awayId} size="sm" />
          <span className="text-[13px] font-bold truncate text-ink">{awayName}</span>
        </div>
      </div>

      {hasPool && (
        <div className="px-3.5 pb-2.5">
          <KnockoutPickBar homePct={match.poolPickHomePct!} awayPct={match.poolPickAwayPct!} />
        </div>
      )}
    </div>
  );
}

export function KnockoutUpcomingFeed({ rounds, bronzeMatch }: Props): ReactElement | null {
  const allScheduled = [
    ...rounds.flatMap((r) => r.matches),
    ...(bronzeMatch !== null ? [bronzeMatch] : []),
  ]
    .filter((m) => m.status === 'scheduled')
    .sort((a, b) => {
      if (!a.kickoff) return 1;
      if (!b.kickoff) return -1;
      return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
    });

  if (allScheduled.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <div className="turf p-[10px_16px]">
        <span className="display text-xl text-on-dark">Next Matches</span>
      </div>
      <div className="divide">
        {allScheduled.map((m) => (
          <KnockoutUpcomingRow key={m.bracketMatchKey} match={m} />
        ))}
      </div>
    </div>
  );
}
