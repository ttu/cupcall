import type { ReactElement } from 'react';
import type { KnockoutMatchView, MatchHit } from '../domain/types';
import { TeamBadge, Icon, cn } from '@/shared/ui';

type Props = {
  match: KnockoutMatchView;
  matchKey: 'final' | 'bronze';
  onSelect?: (() => void) | undefined;
};

function teamLabel(name: string | null, id: string | null): string {
  return name ?? id ?? '—';
}

function formatDate(kickoff: string): string {
  return new Date(kickoff).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function CardHeader({
  matchKey,
  match,
}: {
  matchKey: 'final' | 'bronze';
  match: KnockoutMatchView;
}): ReactElement {
  const hasActualScore = match.actualHome !== null && match.actualAway !== null;
  const title = matchKey === 'final' ? 'THE FINAL' : '3RD-PLACE PLAYOFF';
  const subtitle = hasActualScore
    ? match.kickoff !== null
      ? `FT · ${formatDate(match.kickoff)}`
      : 'FT'
    : match.kickoff !== null
      ? formatDate(match.kickoff)
      : null;

  return (
    <div className="flex flex-col items-center gap-0.5 pb-2 text-center">
      <span
        data-testid="final-card-title"
        className="text-[12px] font-extrabold tracking-[0.12em] text-green-600 uppercase"
      >
        {title}
      </span>
      {subtitle !== null && (
        <span className="text-[11px] font-semibold text-ink-muted">{subtitle}</span>
      )}
    </div>
  );
}

function TeamRow({
  teamId,
  teamName,
  isWinner,
  nameTestId,
}: {
  teamId: string | null;
  teamName: string | null;
  isWinner: boolean;
  nameTestId: string;
}): ReactElement {
  return (
    <div
      className={cn(
        'flex items-center gap-2 p-[8px_10px] rounded-[8px]',
        isWinner && 'bg-green-600/15',
      )}
    >
      <TeamBadge teamId={teamId} size="sm" />
      <span
        data-testid={nameTestId}
        className={cn(
          'flex-1 text-[13px] font-bold truncate',
          isWinner ? 'text-on-dark' : 'text-on-dark-soft',
        )}
      >
        {teamLabel(teamName, teamId)}
      </span>
      {isWinner && <Icon name="check" size={13} color="var(--green-500)" />}
    </div>
  );
}

function ScoreLine({ match }: { match: KnockoutMatchView }): ReactElement | null {
  if (match.actualHome === null || match.actualAway === null) return null;
  return (
    <div className="text-center pt-2">
      <span className="tnum text-[15px] font-extrabold text-on-dark">
        {match.actualHome}–{match.actualAway}
      </span>
      {match.decidedBy === 'penalties' && (
        <span className="text-[11px] font-semibold text-on-dark-soft">
          {' '}
          &middot; Decided on penalties
        </span>
      )}
    </div>
  );
}

function borderClassForPickHit(hit: MatchHit): string {
  if (hit === 'exact' || hit === 'outcome') return 'border-green-300';
  if (hit === 'missed') return 'border-red-300';
  return 'border-line-soft';
}

function PickBadge({ hit }: { hit: MatchHit }): ReactElement | null {
  if (hit === 'exact' || hit === 'outcome') {
    return (
      <span className="absolute -right-1.5 -top-1.5 grid place-items-center w-5 h-5 rounded-full bg-green-500">
        <Icon name="check" size={11} color="var(--on-dark)" />
      </span>
    );
  }
  if (hit === 'missed') {
    return (
      <span className="absolute -right-1.5 -top-1.5 grid place-items-center w-5 h-5 rounded-full bg-red-600">
        <Icon name="close" size={11} color="var(--on-dark)" />
      </span>
    );
  }
  return null;
}

function PickPill({
  leftId,
  rightId,
  leftGoals,
  rightGoals,
  hit,
}: {
  leftId: string | null;
  rightId: string | null;
  leftGoals: number | null;
  rightGoals: number | null;
  hit: MatchHit;
}): ReactElement {
  return (
    <div
      data-testid="final-card-pick-pill"
      className={cn(
        'relative flex items-center gap-1.5 mt-2.5 p-[8px_14px] rounded-full border bg-surface w-fit mx-auto',
        borderClassForPickHit(hit),
      )}
    >
      <span className="text-[11px] font-bold text-ink-muted">Your pick:</span>
      {leftId !== null && <TeamBadge teamId={leftId} size="sm" />}
      <span className="tnum text-[12px] font-extrabold text-ink">
        {leftGoals}–{rightGoals}
      </span>
      {rightId !== null && <TeamBadge teamId={rightId} size="sm" />}
      <PickBadge hit={hit} />
    </div>
  );
}

export function FinalResultCard({ match, matchKey, onSelect }: Props): ReactElement {
  // pickedHomeTeamId/pickedAwayTeamId reflect the user's own SF/QF bracket picks, never
  // substituted with actual results, so "Your pick" keeps showing what the user predicted even
  // after the real bracket resolves to different teams. That chain can come up empty for one
  // side even though the user did pick a team there — e.g. an entry-round pick that collides
  // with a different real bracket slot breaks the validated home/away walk. pickedWinnerId/
  // pickedOpponentId are derived directly from the raw picks without that validation, so try
  // them next. Only fall back to the actual/derived participants (and finally the generic
  // predicted-slot fields) when no user-prediction signal exists for this match at all —
  // falling back to them any earlier would silently replace "Your pick" with the real bracket.
  const pickLeftId = match.pickedHomeTeamId;
  const pickRightId = match.pickedAwayTeamId;
  // When the predicted participant chain is broken (e.g. the team was eliminated before
  // reaching this match), pickedWinnerId or pickedOpponentId carry the user's original picks.
  // Try pickedWinnerId first: when the implicit winner (derived from the finish score) is the
  // home-side SF loser, pickedOpponentId equals predictedAwayTeamId, so the standard
  // pickedOpponentId fallback silently drops the left-side team. Prefer pickedWinnerId here.
  const pickRowLeftId =
    pickLeftId ??
    (match.pickedWinnerId !== null && match.pickedWinnerId !== pickRightId
      ? match.pickedWinnerId
      : null) ??
    (match.pickedOpponentId !== null && match.pickedOpponentId !== pickRightId
      ? match.pickedOpponentId
      : null) ??
    match.homeTeamId ??
    match.predictedHomeTeamId;
  const pickRowRightId =
    pickRightId ??
    (match.pickedOpponentId !== null && match.pickedOpponentId !== pickRowLeftId
      ? match.pickedOpponentId
      : null) ??
    match.awayTeamId ??
    match.predictedAwayTeamId;

  // Resolve each side's predicted goals by team identity when a snapshot is available — this
  // is correct regardless of which fallback branch produced pickRowLeftId/pickRowRightId above.
  // Falls back to the legacy positional fields (predictedHome/predictedAway), which assume
  // leftId===home-slot-team, when no snapshot exists (pre-migration/unbackfilled rows).
  const goalsByTeam =
    match.predictedGoalsByTeam !== null
      ? new Map(match.predictedGoalsByTeam.map((s) => [s.teamId, s.goals]))
      : null;
  const pickLeftGoals =
    goalsByTeam !== null && pickRowLeftId !== null
      ? (goalsByTeam.get(pickRowLeftId) ?? null)
      : match.predictedHome;
  const pickRightGoals =
    goalsByTeam !== null && pickRowRightId !== null
      ? (goalsByTeam.get(pickRowRightId) ?? null)
      : match.predictedAway;

  // A tie is only worth opening once at least one side is a confirmed (non-TBD) team.
  const isTappable =
    onSelect !== undefined && (match.homeTeamId !== null || match.awayTeamId !== null);
  const Root = isTappable ? 'button' : 'div';

  return (
    <div className="flex flex-col items-center w-full">
      <CardHeader matchKey={matchKey} match={match} />
      <Root
        type={isTappable ? 'button' : undefined}
        onClick={isTappable ? onSelect : undefined}
        data-testid={`${matchKey}-result-card`}
        className={cn(
          'rounded-cup overflow-hidden shadow-cup-sm w-full text-left bg-ink-900 border-0 p-2.5',
          isTappable && 'cursor-pointer',
        )}
      >
        <div className="flex flex-col gap-1">
          <TeamRow
            teamId={match.homeTeamId}
            teamName={match.homeTeamName}
            isWinner={match.actualWinnerId !== null && match.actualWinnerId === match.homeTeamId}
            nameTestId="home-team-name"
          />
          <TeamRow
            teamId={match.awayTeamId}
            teamName={match.awayTeamName}
            isWinner={match.actualWinnerId !== null && match.actualWinnerId === match.awayTeamId}
            nameTestId="away-team-name"
          />
        </div>
        <ScoreLine match={match} />
      </Root>
      {pickLeftGoals !== null && pickRightGoals !== null && (
        <PickPill
          leftId={pickRowLeftId}
          rightId={pickRowRightId}
          leftGoals={pickLeftGoals}
          rightGoals={pickRightGoals}
          hit={match.hit}
        />
      )}
    </div>
  );
}
