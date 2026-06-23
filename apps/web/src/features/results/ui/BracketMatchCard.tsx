import type { ReactElement } from 'react';
import type { KnockoutMatchView, MatchHit } from '../domain/types';
import { HitChip } from './HitChip';
import { TeamBadge, cn } from '@/shared/ui';

type Props = {
  match: KnockoutMatchView;
  predictedQualifierIds: Set<string>;
};

function borderClassForHit(hit: MatchHit, softCard: boolean): string {
  if (softCard) return 'border-line-soft border-dashed';
  if (hit === 'outcome' || hit === 'exact') return 'border-green-300';
  if (hit === 'missed') return 'border-[oklch(0.85_0.08_25)]';
  return 'border-line-soft';
}

function TeamRow({
  teamId,
  teamName,
  isPick,
  isQualifierPick,
  isActualWinner,
  r32Pct,
  isSoft,
  isPredictedFill,
}: {
  teamId: string | null;
  teamName: string | null;
  isPick: boolean;
  isQualifierPick: boolean;
  isActualWinner: boolean;
  r32Pct: number | null;
  isSoft: boolean;
  isPredictedFill: boolean;
}): ReactElement {
  return (
    <div
      data-testid="bracket-tie-team-row"
      className={cn(
        'flex items-center gap-1.5 p-[6px_7px] rounded-[7px]',
        isPick && (!isSoft || isQualifierPick) ? 'bg-green-050' : 'bg-transparent',
        isPredictedFill && 'opacity-60',
      )}
    >
      <TeamBadge teamId={teamId} size="sm" />
      <span
        className={cn(
          'flex-1 text-xs font-bold truncate',
          isSoft
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
      {isActualWinner && (
        <span className="text-[11px] font-bold text-green-600 ml-0.5" aria-label="winner">
          ✓
        </span>
      )}
    </div>
  );
}

export function BracketMatchCard({ match, predictedQualifierIds }: Props): ReactElement {
  // Merge actual teams with user-predicted teams for TBD slots
  const effectiveHomeId = match.homeTeamId ?? match.predictedHomeTeamId;
  const effectiveHomeName = match.homeTeamName ?? match.predictedHomeTeamName;
  const effectiveAwayId = match.awayTeamId ?? match.predictedAwayTeamId;
  const effectiveAwayName = match.awayTeamName ?? match.predictedAwayTeamName;

  const hasPredictedParticipants = !!(match.predictedHomeTeamId || match.predictedAwayTeamId);
  // Card shows soft styling (dashed border, muted text, "Predicted" label) when teams are not
  // yet confirmed — either projected from live group standings or filled from user's picks.
  const softCard = match.projected || hasPredictedParticipants;

  const hasScore = match.actualHome !== null && match.actualAway !== null;
  const isFinal = match.status === 'final';

  return (
    <div
      data-testid="bracket-tie-row"
      className={cn(
        'card overflow-hidden min-w-37.5 min-h-[114px] p-1 border',
        borderClassForHit(match.hit, softCard),
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
        ) : hasPredictedParticipants ? (
          <span className="text-[11px] font-semibold text-ink-muted italic">Predicted</span>
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
        {!softCard && <HitChip hit={match.hit} />}
      </div>

      {/* Team rows */}
      <div className="flex flex-col gap-0.5">
        <TeamRow
          teamId={effectiveHomeId}
          teamName={effectiveHomeName}
          isPick={
            effectiveHomeId !== null &&
            (match.pickedWinnerId === effectiveHomeId || predictedQualifierIds.has(effectiveHomeId))
          }
          isQualifierPick={effectiveHomeId !== null && predictedQualifierIds.has(effectiveHomeId)}
          isActualWinner={isFinal && match.actualWinnerId === match.homeTeamId}
          r32Pct={match.homeTeamR32Pct}
          isSoft={softCard}
          isPredictedFill={match.homeTeamId === null}
        />
        <TeamRow
          teamId={effectiveAwayId}
          teamName={effectiveAwayName}
          isPick={
            effectiveAwayId !== null &&
            (match.pickedWinnerId === effectiveAwayId || predictedQualifierIds.has(effectiveAwayId))
          }
          isQualifierPick={effectiveAwayId !== null && predictedQualifierIds.has(effectiveAwayId)}
          isActualWinner={isFinal && match.actualWinnerId === match.awayTeamId}
          r32Pct={match.awayTeamR32Pct}
          isSoft={softCard}
          isPredictedFill={match.awayTeamId === null}
        />
      </div>
    </div>
  );
}
