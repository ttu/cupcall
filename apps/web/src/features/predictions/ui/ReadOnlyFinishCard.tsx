import type { ReactElement } from 'react';
import { TeamBadge, cn } from '@/shared/ui';

type Props = {
  label: string;
  homeTeamId: string | null;
  homeTeamName: string | null;
  awayTeamId: string | null;
  awayTeamName: string | null;
  predictedHome: number | null;
  predictedAway: number | null;
  pickedWinnerId: string | null;
  isFinal: boolean;
};

export function ReadOnlyFinishCard({
  label,
  homeTeamId,
  homeTeamName,
  awayTeamId,
  awayTeamName,
  predictedHome,
  predictedAway,
  pickedWinnerId,
  isFinal,
}: Props): ReactElement {
  const champion = (() => {
    if (pickedWinnerId === null) return null;
    if (pickedWinnerId === homeTeamId) return { teamId: homeTeamId, teamName: homeTeamName };
    if (pickedWinnerId === awayTeamId) return { teamId: awayTeamId, teamName: awayTeamName };
    return null;
  })();

  return (
    <div
      className={cn(
        'rounded-cup overflow-hidden shadow-cup-sm',
        isFinal ? 'bg-ink-900 border-0' : 'bg-surface border border-line-soft',
      )}
    >
      <div
        className={cn(
          'py-2 px-3',
          isFinal ? 'border-b border-b-white/[0.06]' : 'border-b border-b-line-soft',
        )}
      >
        <span className={cn('display text-[15px]', isFinal ? 'text-on-dark' : 'text-ink')}>
          {label}
        </span>
      </div>
      <div className="grid [grid-template-columns:1fr_auto_1fr] items-center gap-[6px] py-[10px] px-3">
        <div className="flex items-center justify-end gap-[5px] min-w-0">
          <span
            className={cn(
              'text-[11px] font-bold text-right truncate',
              isFinal ? 'text-on-dark-soft' : 'text-ink-muted',
            )}
          >
            {homeTeamName ?? '—'}
          </span>
          <TeamBadge teamId={homeTeamId} size="sm" />
        </div>

        <div className="flex items-center gap-[6px]">
          {predictedHome !== null ? (
            <>
              <span className="score-cell filled pointer-events-none">{predictedHome}</span>
              <span className="score-sep">:</span>
              <span className="score-cell filled pointer-events-none">{predictedAway}</span>
            </>
          ) : (
            <span
              className={cn(
                'display tnum text-[22px] min-w-[56px] text-center',
                isFinal ? 'text-on-dark' : 'text-ink',
              )}
            >
              –
            </span>
          )}
        </div>

        <div className="flex items-center gap-[5px] min-w-0">
          <TeamBadge teamId={awayTeamId} size="sm" />
          <span
            className={cn(
              'text-[11px] font-bold truncate',
              isFinal ? 'text-on-dark-soft' : 'text-ink-muted',
            )}
          >
            {awayTeamName ?? '—'}
          </span>
        </div>
      </div>

      {champion?.teamId && (
        <div className="flex justify-center pt-[2px] px-2 pb-[10px]">
          <div
            className={cn(
              'inline-flex items-center gap-[6px] py-1 pr-[10px] pl-[6px] rounded-full',
              isFinal ? 'bg-gold' : 'bg-[oklch(0.80_0.06_55)]',
            )}
          >
            <TeamBadge teamId={champion.teamId} size="sm" />
            <span
              className={cn(
                'display text-[11px] tracking-[0.04em]',
                isFinal ? 'text-[oklch(0.28_0.06_80)]' : 'text-[oklch(0.32_0.06_55)]',
              )}
            >
              {champion.teamName}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
