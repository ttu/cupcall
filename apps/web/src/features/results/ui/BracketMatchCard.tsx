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

type SlotFill = {
  effectiveHomeId: string | null;
  effectiveHomeName: string | null;
  effectiveAwayId: string | null;
  effectiveAwayName: string | null;
  isBustedPick: boolean;
  homeIsEmpty: boolean;
  awayIsEmpty: boolean;
  homeFeederMissed: boolean;
  awayFeederMissed: boolean;
};

/**
 * Merge actual teams with user-predicted teams for TBD slots.
 * When a busted pick is not visible in any slot (e.g. team was eliminated two rounds earlier
 * so neither the actual participants nor the predicted chain includes them), surface the pick
 * in the first empty slot so the user can see what they missed.
 */
function deriveSlotFill(match: KnockoutMatchView): SlotFill {
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
  const effectiveAwayId =
    match.awayTeamId ??
    match.predictedAwayTeamId ??
    (fillAway ? match.pickedWinnerId : null) ??
    match.awaySlotFeederPickedId;

  return {
    effectiveHomeId,
    effectiveHomeName: match.homeTeamName ?? match.predictedHomeTeamName ?? null,
    effectiveAwayId,
    effectiveAwayName: match.awayTeamName ?? match.predictedAwayTeamName ?? null,
    isBustedPick: showBustedPickAsFill,
    homeIsEmpty,
    awayIsEmpty,
    homeFeederMissed,
    awayFeederMissed,
  };
}

type Softness = { homeIsSoft: boolean; awayIsSoft: boolean; softCard: boolean };

/**
 * Per-team softness: a team slot is "soft" when it's projected from live group standings
 * (not yet confirmed in DB) or filled from the user's pick (TBD actual winner).
 * Card uses soft styling (dashed border, no HitChip) whenever any slot is unconfirmed.
 */
function deriveSoftness(match: KnockoutMatchView): Softness {
  const homeIsSoft = (match.projected && !match.homeTeamConfirmed) || match.homeTeamId === null;
  const awayIsSoft = (match.projected && !match.awayTeamConfirmed) || match.awayTeamId === null;
  return { homeIsSoft, awayIsSoft, softCard: homeIsSoft || awayIsSoft };
}

function isPickedTeam(
  teamId: string | null,
  match: KnockoutMatchView,
  predictedQualifierIds: Set<string>,
  userPredictedParticipant: boolean,
): boolean {
  return (
    teamId !== null &&
    (match.pickedWinnerId === teamId ||
      predictedQualifierIds.has(teamId) ||
      userPredictedParticipant)
  );
}

function isQualifierPick(teamId: string | null, predictedQualifierIds: Set<string>): boolean {
  return teamId !== null && predictedQualifierIds.has(teamId);
}

function isMissedFill(isBustedPick: boolean, isSlotEmpty: boolean, feederMissed: boolean): boolean {
  return (isBustedPick && isSlotEmpty) || feederMissed;
}

function wonMatchOnPenalties(match: KnockoutMatchView, teamId: string | null): boolean {
  return match.decidedBy === 'penalties' && match.actualWinnerId === teamId;
}

function showsConfirmedBadge(
  match: KnockoutMatchView,
  teamIsSoft: boolean,
  teamId: string | null,
  otherSideIsSoft: boolean,
): boolean {
  return match.isEntryRound && !teamIsSoft && teamId !== null && otherSideIsSoft;
}

function MatchHeaderStrip({
  match,
  hasScore,
  softCard,
}: {
  match: KnockoutMatchView;
  hasScore: boolean;
  softCard: boolean;
}): ReactElement {
  return (
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
  );
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
  const slotFill = deriveSlotFill(match);
  const softness = deriveSoftness(match);
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
        borderClassForHit(match.hit, softness.softCard),
      )}
    >
      <MatchHeaderStrip match={match} hasScore={hasScore} softCard={softness.softCard} />

      {/* Team rows */}
      <div className="flex flex-col gap-0.5">
        <TeamRow
          teamId={slotFill.effectiveHomeId}
          teamName={slotFill.effectiveHomeName}
          isPick={isPickedTeam(
            slotFill.effectiveHomeId,
            match,
            predictedQualifierIds,
            match.homeTeamUserPredictedParticipant,
          )}
          isQualifierPick={isQualifierPick(slotFill.effectiveHomeId, predictedQualifierIds)}
          score={hasScore ? match.actualHome : null}
          wonOnPenalties={wonMatchOnPenalties(match, match.homeTeamId)}
          isSoft={softness.homeIsSoft}
          isPredictedFill={match.homeTeamId === null}
          isMissedFill={isMissedFill(
            slotFill.isBustedPick,
            slotFill.homeIsEmpty,
            slotFill.homeFeederMissed,
          )}
          showProjectedBadge={softness.homeIsSoft && match.homeTeamId !== null}
          showConfirmedBadge={showsConfirmedBadge(
            match,
            softness.homeIsSoft,
            match.homeTeamId,
            softness.awayIsSoft,
          )}
        />
        <TeamRow
          teamId={slotFill.effectiveAwayId}
          teamName={slotFill.effectiveAwayName}
          isPick={isPickedTeam(
            slotFill.effectiveAwayId,
            match,
            predictedQualifierIds,
            match.awayTeamUserPredictedParticipant,
          )}
          isQualifierPick={isQualifierPick(slotFill.effectiveAwayId, predictedQualifierIds)}
          score={hasScore ? match.actualAway : null}
          wonOnPenalties={wonMatchOnPenalties(match, match.awayTeamId)}
          isSoft={softness.awayIsSoft}
          isPredictedFill={match.awayTeamId === null}
          isMissedFill={isMissedFill(
            slotFill.isBustedPick,
            slotFill.awayIsEmpty,
            slotFill.awayFeederMissed,
          )}
          showProjectedBadge={softness.awayIsSoft && match.awayTeamId !== null}
          showConfirmedBadge={showsConfirmedBadge(
            match,
            softness.awayIsSoft,
            match.awayTeamId,
            softness.homeIsSoft,
          )}
        />
      </div>
    </Root>
  );
}
