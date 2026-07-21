'use client';

import { Fragment } from 'react';
import type { ReactElement } from 'react';
import type { GroupMatchDetail, GroupMatchDetailPrediction, MatrixMatch } from '../domain/types';
import { resolveGroupPredictionHitDisplay } from './group-match-summary-utils';
import { HitOrFallbackChip } from './HitOrFallbackChip';
import { PredictionStatsBar } from './TodayMatchesFeed';
import { useDialogSheet } from './use-dialog-sheet';
import { MatchScoreBadges } from './MatchScoreBadges';
import { PredictionIdentityCell } from './PredictionIdentityCell';
import { Icon, cn } from '@/shared/ui';

type Props = {
  match: MatrixMatch;
  detail: GroupMatchDetail;
  onClose: () => void;
};

function formatDate(kickoff: string): string {
  return new Date(kickoff).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function SheetHeader({
  match,
  onClose,
}: {
  match: MatrixMatch;
  onClose: () => void;
}): ReactElement {
  const hasScore = match.actualHome !== null && match.actualAway !== null;

  return (
    <div className="flex flex-col gap-2 p-[16px_18px_10px]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-extrabold tracking-[0.1em] text-green-600 uppercase">
          Group {match.groupId}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          data-testid="group-match-summary-close"
          className="shrink-0 grid place-items-center w-8 h-8 rounded-full bg-surface-2 border-0 cursor-pointer"
        >
          <Icon name="close" size={15} color="var(--ink-muted)" />
        </button>
      </div>
      <div className="flex flex-col gap-2 min-w-0 w-fit mx-auto">
        <div className="flex items-center gap-2.5 flex-wrap justify-center">
          <span className="text-[14px] font-bold text-ink truncate">{match.homeTeamName}</span>
          <MatchScoreBadges
            homeTeamId={match.homeTeamId}
            awayTeamId={match.awayTeamId}
            hasScore={hasScore}
            actualHome={match.actualHome}
            actualAway={match.actualAway}
          />
          <span className="text-[14px] font-bold text-ink truncate">{match.awayTeamName}</span>
        </div>
        {!hasScore && match.kickoff && (
          <span className="text-xs font-semibold text-ink-muted text-center">
            {formatDate(match.kickoff)}
          </span>
        )}
      </div>
    </div>
  );
}

function YourPickSection({ yourPick }: { yourPick: GroupMatchDetailPrediction }): ReactElement {
  const display = resolveGroupPredictionHitDisplay(yourPick);

  return (
    <div
      data-testid="group-match-summary-your-pick"
      className="mx-[18px] p-[12px_14px] rounded-[10px] bg-green-050 border border-green-300 flex items-center justify-between gap-2"
    >
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[10.5px] font-extrabold tracking-[0.1em] text-green-700 uppercase">
          Your pick
        </span>
        <span className="text-[13px] font-bold text-ink tnum">
          {yourPick.predictedHome}–{yourPick.predictedAway}
        </span>
      </div>
      <HitOrFallbackChip display={display} points={yourPick.points} />
    </div>
  );
}

function PoolPredictionSection({ detail }: { detail: GroupMatchDetail }): ReactElement {
  return (
    <div data-testid="group-match-summary-pool-bar" className="mx-[18px] flex flex-col gap-1.5">
      <span className="text-[10.5px] font-extrabold tracking-[0.1em] text-ink-muted uppercase">
        How the pool predicted it &middot; {detail.totalPredictions} picks
      </span>
      {detail.poolStats === null ? (
        <p className="text-[12.5px] text-ink-muted m-0">No picks yet.</p>
      ) : (
        <PredictionStatsBar stats={detail.poolStats} />
      )}
    </div>
  );
}

function PredictionRow({
  prediction,
  index,
}: {
  prediction: GroupMatchDetailPrediction;
  index: number;
}): ReactElement {
  const display = resolveGroupPredictionHitDisplay(prediction);
  const rowCellClass = cn(
    'flex items-center py-[10px]',
    index > 0 && 'border-t border-line-soft',
    prediction.isCurrentUser && 'bg-green-050',
  );

  return (
    <Fragment>
      <PredictionIdentityCell
        testId={`group-match-summary-prediction-${prediction.userId}`}
        displayName={prediction.displayName}
        index={index}
        isCurrentUser={prediction.isCurrentUser}
        className={cn('gap-2.5 min-w-0 pl-[18px] pr-2', rowCellClass)}
      />
      <div
        className={cn(
          'gap-1.5 px-2 text-[12px] font-semibold text-ink-soft whitespace-nowrap tnum',
          rowCellClass,
        )}
      >
        {prediction.predictedHome !== null
          ? `${prediction.predictedHome}–${prediction.predictedAway}`
          : '—'}
      </div>
      <div className={cn('gap-2 justify-end pl-2 pr-[18px]', rowCellClass)}>
        <HitOrFallbackChip display={display} points={prediction.points} />
      </div>
    </Fragment>
  );
}

export function GroupMatchSummarySheet({ match, detail, onClose }: Props): ReactElement {
  const yourPick = detail.predictions.find((p) => p.isCurrentUser) ?? null;
  const { dialogRef, handleBackdropClick } = useDialogSheet(onClose);

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      data-testid="group-match-summary-sheet"
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

        <SheetHeader match={match} onClose={() => dialogRef.current?.close()} />

        {yourPick !== null && yourPick.predictedHome !== null && (
          <YourPickSection yourPick={yourPick} />
        )}

        <PoolPredictionSection detail={detail} />

        {detail.insight !== null && (
          <p
            data-testid="group-match-summary-insight"
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
            data-testid="group-match-summary-predictions"
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] border-t border-line-soft"
          >
            {detail.predictions.map((prediction, index) => (
              <PredictionRow key={prediction.userId} prediction={prediction} index={index} />
            ))}
          </div>
        </div>
      </div>
    </dialog>
  );
}
