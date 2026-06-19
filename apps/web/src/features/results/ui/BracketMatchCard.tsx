import type { ReactElement } from 'react';
import type { KnockoutMatchView, MatchHit } from '../domain/types';
import { HitChip } from './HitChip';
import { TeamBadge, Icon, cn } from '@/shared/ui';

type Props = { match: KnockoutMatchView; pickedTeamIds: Set<string> };

function borderClassForHit(hit: MatchHit, projected: boolean): string {
  if (projected) return 'border-line-soft border-dashed';
  if (hit === 'outcome' || hit === 'exact') return 'border-green-300';
  if (hit === 'missed') return 'border-[oklch(0.85_0.08_25)]';
  return 'border-line-soft';
}

function TeamRow({
  teamId,
  teamName,
  isPick,
  showCheckmark,
  isActualWinner,
  r32Pct,
  projected,
}: {
  teamId: string | null;
  teamName: string | null;
  isPick: boolean;
  showCheckmark: boolean;
  isActualWinner: boolean;
  r32Pct: number | null;
  projected: boolean;
}): ReactElement {
  return (
    <div
      data-testid="bracket-tie-team-row"
      className={cn(
        'flex items-center gap-1.5 p-[6px_7px] rounded-[7px]',
        isPick ? 'bg-green-050' : 'bg-transparent',
      )}
    >
      <TeamBadge teamId={teamId} size="sm" />
      <span
        className={cn(
          'flex-1 text-xs font-bold truncate',
          projected
            ? 'text-ink-soft'
            : isPick
              ? 'text-green-700'
              : teamId
                ? 'text-ink'
                : 'text-ink-muted',
        )}
      >
        {teamName ?? teamId ?? '?'}
      </span>
      {r32Pct !== null && (
        <span className="text-[10px] font-bold text-ink-muted tabular-nums shrink-0">
          {r32Pct}%
        </span>
      )}
      {showCheckmark && !projected && <Icon name="check" size={11} color="var(--green-700)" />}
      {isActualWinner && (
        <span className="text-[11px] font-bold text-green-600 ml-0.5" aria-label="winner">
          ✓
        </span>
      )}
    </div>
  );
}

export function BracketMatchCard({ match, pickedTeamIds }: Props): ReactElement {
  const noTeams = !match.homeTeamId && !match.awayTeamId;
  const hasScore = match.actualHome !== null && match.actualAway !== null;
  const isFinal = match.status === 'final';

  return (
    <div
      data-testid="bracket-tie-row"
      className={cn(
        'card overflow-hidden min-w-37.5 min-h-[114px] p-1 border',
        borderClassForHit(match.hit, match.projected),
      )}
    >
      {/* Header strip */}
      <div className="flex items-center justify-between gap-1.5 p-[2px_4px_4px]">
        {hasScore ? (
          <span className="tnum text-[11px] font-bold text-ink-muted">
            {match.actualHome}–{match.actualAway}
          </span>
        ) : match.projected ? (
          <span className="text-[11px] font-semibold text-ink-muted italic">Projected</span>
        ) : match.kickoff ? (
          <span className="text-[11px] font-bold text-ink-muted">
            {new Date(match.kickoff).toLocaleDateString('en-GB', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        ) : (
          <span className="text-[11px] font-bold text-ink-muted">{match.round}</span>
        )}
        {!match.projected && <HitChip hit={match.hit} />}
      </div>

      {/* Team rows */}
      {!noTeams ? (
        <div className="flex flex-col gap-0.5">
          <TeamRow
            teamId={match.homeTeamId}
            teamName={match.homeTeamName}
            isPick={match.homeTeamId !== null && pickedTeamIds.has(match.homeTeamId)}
            showCheckmark={
              match.pickedWinnerId === match.homeTeamId && match.pickedWinnerId !== null
            }
            isActualWinner={isFinal && match.actualWinnerId === match.homeTeamId}
            r32Pct={match.homeTeamR32Pct}
            projected={match.projected}
          />
          <TeamRow
            teamId={match.awayTeamId}
            teamName={match.awayTeamName}
            isPick={match.awayTeamId !== null && pickedTeamIds.has(match.awayTeamId)}
            showCheckmark={
              match.pickedWinnerId === match.awayTeamId && match.pickedWinnerId !== null
            }
            isActualWinner={isFinal && match.actualWinnerId === match.awayTeamId}
            r32Pct={match.awayTeamR32Pct}
            projected={match.projected}
          />
        </div>
      ) : (
        <div className="p-[10px_8px] text-center text-xs font-bold text-ink-muted">
          To be determined
        </div>
      )}
    </div>
  );
}
