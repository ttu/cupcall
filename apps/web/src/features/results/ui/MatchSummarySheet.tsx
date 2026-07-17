'use client';

import { Fragment, useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import type {
  KnockoutMatchDetail,
  KnockoutMatchDetailPrediction,
  KnockoutMatchView,
} from '../domain/types';
import { resolvePredictionHitDisplay, isPenaltyWinnerPick } from './match-summary-utils';
import { HitChip } from './HitChip';
import { Avatar, Icon, TeamBadge, cn } from '@/shared/ui';

type MatchKey = 'final' | 'bronze' | null;

type Props = {
  match: KnockoutMatchView;
  matchKey: MatchKey;
  detail: KnockoutMatchDetail;
  onClose: () => void;
};

function roundLabel(match: KnockoutMatchView, matchKey: MatchKey): string {
  if (matchKey === 'final') return 'Final';
  if (matchKey === 'bronze') return '3rd Place';
  return match.round;
}

function formatDate(kickoff: string): string {
  return new Date(kickoff).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function SheetHeader({
  match,
  matchKey,
  onClose,
}: {
  match: KnockoutMatchView;
  matchKey: MatchKey;
  onClose: () => void;
}): ReactElement {
  const hasScore = match.actualHome !== null && match.actualAway !== null;

  return (
    <div className="flex flex-col gap-2 p-[16px_18px_10px]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-extrabold tracking-[0.1em] text-green-600 uppercase">
          {roundLabel(match, matchKey)}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          data-testid="match-summary-close"
          className="shrink-0 grid place-items-center w-8 h-8 rounded-full bg-surface-2 border-0 cursor-pointer"
        >
          <Icon name="close" size={15} color="var(--ink-muted)" />
        </button>
      </div>
      <div className="flex flex-col gap-2 min-w-0 w-fit mx-auto">
        <div className="flex items-center gap-2.5 flex-wrap justify-center">
          <span className="text-[14px] font-bold text-ink truncate">
            {match.homeTeamName ?? match.homeTeamId ?? 'TBD'}
          </span>
          <TeamBadge teamId={match.homeTeamId} size="md" />
          {hasScore ? (
            <span className="display tnum text-[32px] leading-none text-ink shrink-0">
              {match.actualHome}–{match.actualAway}
            </span>
          ) : (
            <span className="text-xs font-bold text-ink-muted shrink-0">vs</span>
          )}
          <TeamBadge teamId={match.awayTeamId} size="md" />
          <span className="text-[14px] font-bold text-ink truncate">
            {match.awayTeamName ?? match.awayTeamId ?? 'TBD'}
          </span>
        </div>
        {match.decidedBy === 'penalties' && (
          <span
            data-testid="match-summary-penalty-winner"
            className="text-xs font-semibold text-ink-muted text-center"
          >
            {`${match.actualWinnerName ?? match.actualWinnerId} won on penalties`}
          </span>
        )}
        {match.decidedBy === 'extraTime' && (
          <span
            data-testid="match-summary-extra-time"
            className="text-xs font-semibold text-ink-muted text-center"
          >
            Decided in extra time
          </span>
        )}
        {(match.homeTeamPredictedPct !== null || match.awayTeamPredictedPct !== null) && (
          <div className="flex items-center justify-between gap-2">
            <span
              data-testid="home-team-predicted-pct"
              className="text-[11px] font-bold text-ink-muted tabular-nums"
            >
              {match.homeTeamPredictedPct !== null ? `${match.homeTeamPredictedPct}%` : ''}
            </span>
            <span
              data-testid="away-team-predicted-pct"
              className="text-[11px] font-bold text-ink-muted tabular-nums"
            >
              {match.awayTeamPredictedPct !== null ? `${match.awayTeamPredictedPct}%` : ''}
            </span>
          </div>
        )}
        {!hasScore && match.kickoff && (
          <span className="text-xs font-semibold text-ink-muted text-center">
            {formatDate(match.kickoff)}
          </span>
        )}
      </div>
    </div>
  );
}

function PenaltyWinnerBadge({ teamId, size }: { teamId: string | null; size: 'sm' }): ReactElement {
  return (
    <span className="relative inline-flex shrink-0" data-testid="penalty-winner-badge">
      <TeamBadge teamId={teamId} size={size} />
      <span className="absolute -top-1.5 -right-1.5 rounded-full bg-surface leading-none">
        <Icon name="trophy" size={11} color="var(--gold)" />
      </span>
    </span>
  );
}

function YourPickSection({
  yourPick,
  isFinaleTie,
}: {
  yourPick: KnockoutMatchDetailPrediction;
  isFinaleTie: boolean;
}): ReactElement {
  const display = resolvePredictionHitDisplay(yourPick, isFinaleTie);
  const isPenaltyPick = isFinaleTie && isPenaltyWinnerPick(yourPick);

  return (
    <div
      data-testid="match-summary-your-pick"
      className="mx-[18px] p-[12px_14px] rounded-[10px] bg-green-050 border border-green-300 flex items-center justify-between gap-2"
    >
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[10.5px] font-extrabold tracking-[0.1em] text-green-700 uppercase">
          Your pick
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {isPenaltyPick ? (
            <PenaltyWinnerBadge teamId={yourPick.pickedTeamId} size="sm" />
          ) : (
            <TeamBadge teamId={yourPick.pickedTeamId} size="sm" />
          )}
          <span className="text-[13px] font-bold text-ink truncate">
            {yourPick.pickedTeamName ?? yourPick.pickedTeamId}
          </span>
          {isFinaleTie && yourPick.predictedHome !== null && yourPick.predictedAway !== null && (
            <>
              <span className="text-ink-muted font-semibold tnum text-[13px]">
                {yourPick.predictedHome}–{yourPick.predictedAway}
              </span>
              {yourPick.pickedOpponentId !== null && (
                <span data-testid="your-pick-opponent" className="inline-flex items-center gap-1.5">
                  <TeamBadge teamId={yourPick.pickedOpponentId} size="sm" />
                  <span className="text-[13px] font-bold text-ink truncate">
                    {yourPick.pickedOpponentName ?? yourPick.pickedOpponentId}
                  </span>
                </span>
              )}
            </>
          )}
        </div>
      </div>
      {display.kind === 'matchHit' ? (
        <HitChip hit={display.hit} points={yourPick.points} />
      ) : (
        <span className={cn('chip text-[11px] h-6', display.tone === 'red' && 'red')}>
          {display.label}
        </span>
      )}
    </div>
  );
}

function PoolCallBar({
  match,
  detail,
}: {
  match: KnockoutMatchView;
  detail: KnockoutMatchDetail;
}): ReactElement {
  return (
    <div data-testid="match-summary-pool-bar" className="mx-[18px] flex flex-col gap-1.5">
      <span className="text-[10.5px] font-extrabold tracking-[0.1em] text-ink-muted uppercase">
        How the pool called it &middot; {detail.totalPredictions} picks
      </span>
      {detail.totalPredictions === 0 ? (
        <p className="text-[12.5px] text-ink-muted m-0">No picks yet.</p>
      ) : (
        <>
          <div className="flex rounded-[4px] overflow-hidden h-3 gap-px">
            {detail.homePickPct !== null && detail.homePickPct > 0 && (
              <div className="bg-green-500" style={{ flex: detail.homePickPct }} />
            )}
            {detail.awayPickPct !== null && detail.awayPickPct > 0 && (
              <div className="bg-surface-2" style={{ flex: detail.awayPickPct }} />
            )}
          </div>
          <div className="flex justify-between text-[11px] text-ink-muted">
            <span className="flex items-center gap-1 font-semibold">
              <TeamBadge teamId={match.homeTeamId} size="sm" />
              {detail.homePickPct}% &middot; {detail.homePickCount} picked{' '}
              {match.homeTeamName ?? match.homeTeamId}
            </span>
            <span className="flex items-center gap-1 font-semibold">
              {detail.awayPickCount} picked {match.awayTeamName ?? match.awayTeamId} &middot;{' '}
              {detail.awayPickPct}%
              <TeamBadge teamId={match.awayTeamId} size="sm" />
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function PredictionRow({
  prediction,
  index,
  isFinaleTie,
}: {
  prediction: KnockoutMatchDetailPrediction;
  index: number;
  isFinaleTie: boolean;
}): ReactElement {
  const display = resolvePredictionHitDisplay(prediction, isFinaleTie);
  const isPenaltyPick = isFinaleTie && isPenaltyWinnerPick(prediction);
  const rowCellClass = cn(
    'flex items-center py-[10px]',
    index > 0 && 'border-t border-line-soft',
    prediction.isCurrentUser && 'bg-green-050',
  );

  return (
    <Fragment>
      <div
        data-testid={`match-summary-prediction-${prediction.userId}`}
        className={cn('gap-2.5 min-w-0 pl-[18px] pr-2', rowCellClass)}
      >
        <Avatar name={prediction.displayName} index={index} size={28} />
        <span className="text-[13px] font-bold text-ink truncate">
          {prediction.displayName}
          {prediction.isCurrentUser && (
            <span className="chip green h-4.5 ml-[7px] text-[9.5px] align-middle">YOU</span>
          )}
        </span>
      </div>
      <div
        className={cn(
          'gap-1.5 px-2 text-[12px] font-semibold text-ink-soft whitespace-nowrap',
          rowCellClass,
        )}
      >
        {prediction.pickedTeamId !== null && (
          <>
            {isPenaltyPick ? (
              <PenaltyWinnerBadge teamId={prediction.pickedTeamId} size="sm" />
            ) : (
              <TeamBadge teamId={prediction.pickedTeamId} size="sm" />
            )}
            {isFinaleTie &&
            prediction.predictedHome !== null &&
            prediction.predictedAway !== null ? (
              <>
                <span className="tnum">
                  {prediction.predictedHome}–{prediction.predictedAway}
                </span>
                {prediction.pickedOpponentId !== null && (
                  <span data-testid="prediction-opponent">
                    <TeamBadge teamId={prediction.pickedOpponentId} size="sm" />
                  </span>
                )}
              </>
            ) : (
              (prediction.pickedTeamName ?? prediction.pickedTeamId)
            )}
          </>
        )}
      </div>
      <div className={cn('gap-2 justify-end pl-2 pr-[18px]', rowCellClass)}>
        {display.kind === 'matchHit' ? (
          <HitChip hit={display.hit} points={prediction.points} />
        ) : (
          <span className={cn('chip text-[11px] h-6', display.tone === 'red' && 'red')}>
            {display.label}
          </span>
        )}
      </div>
    </Fragment>
  );
}

export function MatchSummarySheet({ match, matchKey, detail, onClose }: Props): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isFinaleTie = matchKey === 'final' || matchKey === 'bronze';
  const yourPick = detail.predictions.find((p) => p.isCurrentUser) ?? null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>): void {
    // event.target is the native click target; sonarjs can't see it narrows to the
    // dialog element itself when the click lands on the backdrop (outside <dialog>'s content).
    // eslint-disable-next-line sonarjs/different-types-comparison
    if (event.target === dialogRef.current) dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      data-testid="match-summary-sheet"
      className={cn(
        'm-0 w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-black/50',
        'fixed inset-x-0 top-auto bottom-0 max-h-[85vh]',
        'sm:inset-0 sm:top-1/2 sm:bottom-auto sm:m-auto sm:h-fit sm:max-w-[420px] sm:-translate-y-1/2',
      )}
    >
      <div className="rounded-t-cup-lg sm:rounded-cup-lg bg-surface overflow-y-auto max-h-[85vh] shadow-cup-sm flex flex-col gap-3.5 pb-4">
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true">
          <span className="w-9 h-1 rounded-full bg-line-strong" />
        </div>

        <SheetHeader match={match} matchKey={matchKey} onClose={() => dialogRef.current?.close()} />

        {yourPick !== null && yourPick.pickedTeamId !== null && (
          <YourPickSection yourPick={yourPick} isFinaleTie={isFinaleTie} />
        )}

        <PoolCallBar match={match} detail={detail} />

        {detail.insight !== null && (
          <p
            data-testid="match-summary-insight"
            className="mx-[18px] text-[12.5px] text-ink-soft m-0"
          >
            {detail.insight}
          </p>
        )}

        <div>
          <span className="block px-[18px] pb-1.5 text-[10.5px] font-extrabold tracking-[0.1em] text-ink-muted uppercase">
            All predictions
          </span>
          <div
            data-testid="match-summary-predictions"
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] border-t border-line-soft"
          >
            {detail.predictions.map((prediction, index) => (
              <PredictionRow
                key={prediction.userId}
                prediction={prediction}
                index={index}
                isFinaleTie={isFinaleTie}
              />
            ))}
          </div>
        </div>

        {(match.homeTeamPredictedPct !== null || match.awayTeamPredictedPct !== null) && (
          <span className="px-[18px] text-[10px] text-ink-muted text-center">
            % of pool predicting each team reaches this round
          </span>
        )}
      </div>
    </dialog>
  );
}
