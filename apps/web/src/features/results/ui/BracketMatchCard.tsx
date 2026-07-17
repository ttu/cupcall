import type { ReactElement } from 'react';
import type { KnockoutMatchView, MatchHit } from '../domain/types';
import { HitChip } from './HitChip';
import { TeamBadge, cn } from '@/shared/ui';

type Props = {
  match: KnockoutMatchView;
  predictedQualifierIds: Set<string>;
  onSelect?: (() => void) | undefined;
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
  score,
  wonOnPenalties,
  isSoft,
  isPredictedFill,
  isMissedFill,
  showProjectedBadge,
  showConfirmedBadge,
}: {
  teamId: string | null;
  teamName: string | null;
  isPick: boolean;
  isQualifierPick: boolean;
  /** This team's final goal count. Null unless the match is final. */
  score: number | null;
  /** True when the score is level and this team won the resulting penalty shootout. */
  wonOnPenalties: boolean;
  isSoft: boolean;
  isPredictedFill: boolean;
  /** True when this slot is showing a busted pick that is not visible in the actual/predicted chain. */
  isMissedFill: boolean;
  showProjectedBadge: boolean;
  showConfirmedBadge: boolean;
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
      {showProjectedBadge && (
        <span className="text-[10px] font-bold text-yellow-500 shrink-0" aria-label="projected">
          ?
        </span>
      )}
      {showConfirmedBadge && (
        <span className="text-[10px] font-bold text-green-600 shrink-0" aria-label="confirmed">
          ✓
        </span>
      )}
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
        {isMissedFill ? (
          <span className="italic font-normal">missed pick</span>
        ) : (
          (teamName ?? teamId ?? <span className="italic font-normal">TBD</span>)
        )}
      </span>
      {wonOnPenalties && (
        <span
          className="text-[9px] font-bold text-green-600 uppercase tracking-wide shrink-0"
          aria-label="won on penalties"
        >
          pen
        </span>
      )}
      {score !== null && (
        <span
          className={cn(
            'text-sm font-extrabold tabular-nums shrink-0',
            isPick ? 'text-green-700' : 'text-ink-muted',
          )}
        >
          {score}
        </span>
      )}
    </div>
  );
}

export function BracketMatchCard({ match, predictedQualifierIds, onSelect }: Props): ReactElement {
  // Merge actual teams with user-predicted teams for TBD slots.
  // When a busted pick is not visible in any slot (e.g. team was eliminated two rounds earlier
  // so neither the actual participants nor the predicted chain includes them), surface the pick
  // in the first empty slot so the user can see what they missed.
  const pickedIsVisible =
    match.pickedWinnerId !== null &&
    (match.pickedWinnerId === match.homeTeamId ||
      match.pickedWinnerId === match.predictedHomeTeamId ||
      match.pickedWinnerId === match.awayTeamId ||
      match.pickedWinnerId === match.predictedAwayTeamId);
  const showBustedPickAsFill =
    match.pickedWinnerId !== null && match.pickStatus === 'busted' && !pickedIsVisible;

  const homeIsEmpty = match.homeTeamId === null && match.predictedHomeTeamId === null;
  const awayIsEmpty = match.awayTeamId === null && match.predictedAwayTeamId === null;
  // Fill only the first empty slot with the busted pick badge so the flag is visible once.
  const fillHome = showBustedPickAsFill && homeIsEmpty;
  const fillAway = showBustedPickAsFill && !fillHome && awayIsEmpty;
  // An empty slot whose feeder entry-round pick is already definitively wrong also shows "missed pick".
  const homeFeederMissed = homeIsEmpty && match.homeSlotFeederPickedId !== null;
  const awayFeederMissed = awayIsEmpty && match.awaySlotFeederPickedId !== null;

  // For missed fill slots: provide the teamId so the badge (flag) shows, but no name —
  // TeamRow renders "missed pick" label via isMissedFill instead of the team name.
  // Any slot that is genuinely empty while the pick is busted also shows "missed pick" (not TBD).
  const effectiveHomeId =
    match.homeTeamId ??
    match.predictedHomeTeamId ??
    (fillHome ? match.pickedWinnerId : null) ??
    match.homeSlotFeederPickedId;
  const effectiveHomeName = match.homeTeamName ?? match.predictedHomeTeamName ?? null;
  const effectiveAwayId =
    match.awayTeamId ??
    match.predictedAwayTeamId ??
    (fillAway ? match.pickedWinnerId : null) ??
    match.awaySlotFeederPickedId;
  const effectiveAwayName = match.awayTeamName ?? match.predictedAwayTeamName ?? null;
  const isBustedPick = showBustedPickAsFill;

  // Per-team softness: a team slot is "soft" when it's projected from live group standings
  // (not yet confirmed in DB) or filled from the user's pick (TBD actual winner).
  const homeIsSoft = (match.projected && !match.homeTeamConfirmed) || match.homeTeamId === null;
  const awayIsSoft = (match.projected && !match.awayTeamConfirmed) || match.awayTeamId === null;

  // Card uses soft styling (dashed border, no HitChip) whenever any slot is unconfirmed.
  const softCard = homeIsSoft || awayIsSoft;

  const hasScore = match.actualHome !== null && match.actualAway !== null;

  // A tie is only worth opening once at least one side is a confirmed (non-TBD) team.
  const isTappable =
    onSelect !== undefined && (match.homeTeamId !== null || match.awayTeamId !== null);
  const Root = isTappable ? 'button' : 'div';

  return (
    <Root
      type={isTappable ? 'button' : undefined}
      onClick={isTappable ? onSelect : undefined}
      data-testid="bracket-tie-row"
      className={cn(
        'card overflow-hidden min-w-37.5 min-h-[114px] p-1 border text-left',
        isTappable && 'cursor-pointer',
        borderClassForHit(match.hit, softCard),
      )}
    >
      {/* Header strip */}
      <div className="flex items-center justify-between gap-1.5 p-[2px_4px_4px]">
        {hasScore ? (
          <span className="text-[11px] font-bold text-ink-muted">FT</span>
        ) : match.predictedHomeTeamId !== null || match.predictedAwayTeamId !== null ? (
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
        {!softCard && <HitChip hit={match.hit} points={match.points} />}
      </div>

      {/* Team rows */}
      <div className="flex flex-col gap-0.5">
        <TeamRow
          teamId={effectiveHomeId}
          teamName={effectiveHomeName}
          isPick={
            effectiveHomeId !== null &&
            (match.pickedWinnerId === effectiveHomeId ||
              predictedQualifierIds.has(effectiveHomeId) ||
              match.homeTeamUserPredictedParticipant)
          }
          isQualifierPick={effectiveHomeId !== null && predictedQualifierIds.has(effectiveHomeId)}
          score={hasScore ? match.actualHome : null}
          wonOnPenalties={
            match.decidedBy === 'penalties' && match.actualWinnerId === match.homeTeamId
          }
          isSoft={homeIsSoft}
          isPredictedFill={match.homeTeamId === null}
          isMissedFill={(isBustedPick && homeIsEmpty) || homeFeederMissed}
          showProjectedBadge={homeIsSoft && match.homeTeamId !== null}
          showConfirmedBadge={
            match.isEntryRound && !homeIsSoft && match.homeTeamId !== null && awayIsSoft
          }
        />
        <TeamRow
          teamId={effectiveAwayId}
          teamName={effectiveAwayName}
          isPick={
            effectiveAwayId !== null &&
            (match.pickedWinnerId === effectiveAwayId ||
              predictedQualifierIds.has(effectiveAwayId) ||
              match.awayTeamUserPredictedParticipant)
          }
          isQualifierPick={effectiveAwayId !== null && predictedQualifierIds.has(effectiveAwayId)}
          score={hasScore ? match.actualAway : null}
          wonOnPenalties={
            match.decidedBy === 'penalties' && match.actualWinnerId === match.awayTeamId
          }
          isSoft={awayIsSoft}
          isPredictedFill={match.awayTeamId === null}
          isMissedFill={(isBustedPick && awayIsEmpty) || awayFeederMissed}
          showProjectedBadge={awayIsSoft && match.awayTeamId !== null}
          showConfirmedBadge={
            match.isEntryRound && !awayIsSoft && match.awayTeamId !== null && homeIsSoft
          }
        />
      </div>
    </Root>
  );
}
