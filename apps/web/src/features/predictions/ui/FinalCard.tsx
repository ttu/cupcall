import type { ReactElement } from 'react';
import type { FinishMatchView } from '../domain/types';
import { ScoreCell } from './ScoreCell';
import { TeamBadge } from '@/shared/ui';
import { cn } from '@/shared/ui';

function TieButton({
  isPick,
  isFinal,
  onClick,
  disabled,
  testId,
  label,
  pressed,
}: {
  isPick: boolean;
  isFinal: boolean;
  onClick: () => void;
  disabled: boolean;
  testId: string;
  label: string;
  pressed: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex-1 py-[6px] px-2 rounded-[7px] text-xs font-bold cursor-pointer',
        isPick
          ? 'border border-[var(--green-300)] bg-green-050 text-green-700'
          : isFinal
            ? 'border border-white/[.12] bg-white/[.04] text-on-dark'
            : 'border border-line bg-transparent text-ink',
      )}
    >
      {label}
    </button>
  );
}

type Props = {
  match: FinishMatchView;
  matchKey: 'final' | 'bronze';
  poolId: string;
  locked: boolean;
  onSave: (match: 'final' | 'bronze', home: number, away: number) => void | Promise<void>;
  onPickWinner: (matchKey: 'final' | 'bronze', winner: string) => void;
};

export function FinalCard({
  match,
  matchKey,
  poolId,
  locked,
  onSave,
  onPickWinner,
}: Props): ReactElement {
  const isFinal = matchKey === 'final';

  const champion = (() => {
    if (match.pickedWinnerId === null) return null;
    if (match.pickedWinnerId === match.homeTeamId) {
      return { teamId: match.homeTeamId, teamName: match.homeTeamName };
    }
    if (match.pickedWinnerId === match.awayTeamId) {
      return { teamId: match.awayTeamId, teamName: match.awayTeamName };
    }
    return null;
  })();

  const scoreIsTied =
    match.predictedHome !== null &&
    match.predictedAway !== null &&
    match.predictedHome === match.predictedAway;
  const bothTeamsResolved = match.homeTeamId !== null && match.awayTeamId !== null;
  const needsTiebreak = scoreIsTied && bothTeamsResolved;

  return (
    <div
      data-testid={`${matchKey}-section`}
      className={cn(
        'rounded-[var(--radius)] overflow-hidden shadow-cup-sm',
        isFinal ? 'bg-ink-900 border-0' : 'bg-surface border border-line-soft',
      )}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[6px] p-[10px]">
        <div className="flex items-center justify-end gap-[5px] min-w-0">
          <span
            data-testid="home-team-name"
            className={cn(
              'text-[11px] font-bold truncate text-right',
              isFinal ? 'text-on-dark-soft' : 'text-ink-muted',
            )}
          >
            {match.homeTeamName ?? '—'}
          </span>
          <TeamBadge teamId={match.homeTeamId} size="sm" />
        </div>

        <ScoreCell
          matchId={matchKey}
          poolId={poolId}
          home={match.predictedHome}
          away={match.predictedAway}
          locked={locked}
          onSave={(_, home, away) => Promise.resolve(onSave(matchKey, home, away))}
        />

        <div className="flex items-center gap-[5px] min-w-0">
          <TeamBadge teamId={match.awayTeamId} size="sm" />
          <span
            className={cn(
              'text-[11px] font-bold truncate',
              isFinal ? 'text-on-dark-soft' : 'text-ink-muted',
            )}
          >
            {match.awayTeamName ?? '—'}
          </span>
        </div>
      </div>

      {needsTiebreak && !locked && (
        <div
          data-testid={`${matchKey}-winner-picker`}
          className="flex flex-col gap-[6px] px-[10px] pt-[6px] pb-[10px]"
        >
          <span
            className={cn(
              'text-[11px] font-bold text-center tracking-[0.04em] uppercase',
              isFinal ? 'text-on-dark-soft' : 'text-ink-muted',
            )}
          >
            Pick the shootout winner
          </span>
          <div className="flex gap-[6px]">
            <TieButton
              testId={`${matchKey}-pick-home`}
              isPick={match.pickedWinnerId === match.homeTeamId}
              isFinal={isFinal}
              pressed={match.pickedWinnerId === match.homeTeamId}
              onClick={() => match.homeTeamId && onPickWinner(matchKey, match.homeTeamId)}
              disabled={!match.homeTeamId}
              label={match.homeTeamName ?? '—'}
            />
            <TieButton
              testId={`${matchKey}-pick-away`}
              isPick={match.pickedWinnerId === match.awayTeamId}
              isFinal={isFinal}
              pressed={match.pickedWinnerId === match.awayTeamId}
              onClick={() => match.awayTeamId && onPickWinner(matchKey, match.awayTeamId)}
              disabled={!match.awayTeamId}
              label={match.awayTeamName ?? '—'}
            />
          </div>
        </div>
      )}

      {champion?.teamId && (
        <div className="flex justify-center px-2 pt-0.5 pb-[10px]">
          <div
            className={cn(
              'inline-flex items-center gap-[6px] py-1 pr-[10px] pl-[6px] rounded-full',
              isFinal ? 'bg-[var(--gold)]' : 'bg-[oklch(0.80_0.06_55)]',
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
