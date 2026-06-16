import type { ReactElement } from 'react';
import type { KnockoutMatchView } from '../domain/types';
import { HitChip } from './HitChip';
import { TeamBadge, Icon, cn } from '@/shared/ui';

type Props = {
  match: KnockoutMatchView;
  matchKey: 'final' | 'bronze';
};

function teamLabel(name: string | null, id: string | null): string {
  return name ?? id ?? '—';
}

type ChampionPillProps = { championId: string; championName: string; isFinal: boolean };

function ChampionPill({ championId, championName, isFinal }: ChampionPillProps): ReactElement {
  const pillBgClass = isFinal ? 'bg-gold' : 'bg-[oklch(0.80_0.06_55)]';
  const pillTextClass = isFinal ? 'text-[oklch(0.28_0.06_80)]' : 'text-[oklch(0.32_0.06_55)]';
  return (
    <div className="flex justify-center px-2 pb-2.5">
      <div
        className={cn(
          'inline-flex items-center gap-1.5 py-1 pr-2.5 pl-1.5 rounded-full',
          pillBgClass,
        )}
      >
        <TeamBadge teamId={championId} size="sm" />
        <span className={cn('display text-[11px] tracking-[0.04em]', pillTextClass)}>
          {championName}
        </span>
      </div>
    </div>
  );
}

export function FinalResultCard({ match, matchKey }: Props): ReactElement {
  const isFinal = matchKey === 'final';
  const hasActualScore = match.actualHome !== null && match.actualAway !== null;
  const hasPredictedScore = match.predictedHome !== null && match.predictedAway !== null;

  const championId = match.actualWinnerId ?? match.pickedWinnerId;
  const championName =
    (match.actualWinnerId
      ? (match.actualWinnerName ?? match.actualWinnerId)
      : match.pickedWinnerId
        ? (match.pickedWinnerName ?? match.pickedWinnerId)
        : null) ?? null;

  return (
    <div
      data-testid={`${matchKey}-result-card`}
      className={cn(
        'rounded-cup overflow-hidden shadow-cup-sm',
        isFinal ? 'bg-ink-900 border-0' : 'bg-surface border border-line-soft',
      )}
    >
      <div className="flex items-center justify-between gap-1.5 p-[8px_10px_6px]">
        {hasActualScore ? (
          <span
            className={cn('tnum text-base font-extrabold', isFinal ? 'text-on-dark' : 'text-ink')}
          >
            {match.actualHome}–{match.actualAway}
          </span>
        ) : match.kickoff ? (
          <span
            className={cn(
              'text-[11px] font-bold',
              isFinal ? 'text-on-dark-soft' : 'text-ink-muted',
            )}
          >
            {new Date(match.kickoff).toLocaleDateString('en-GB', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        ) : (
          <span
            className={cn(
              'text-[11px] font-bold',
              isFinal ? 'text-on-dark-soft' : 'text-ink-muted',
            )}
          >
            {isFinal ? 'Final' : '3rd Place'}
          </span>
        )}
        <HitChip hit={match.hit} />
      </div>

      {hasPredictedScore && (
        <div
          className={cn(
            'px-2.5 pb-1.5 text-[11px] font-bold tracking-[0.02em]',
            isFinal ? 'text-on-dark-soft' : 'text-ink-muted',
          )}
        >
          Your pick: {match.predictedHome}–{match.predictedAway}
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 p-[6px_10px_10px]">
        <div className="flex items-center justify-end gap-[5px] min-w-0">
          <span
            data-testid="home-team-name"
            className={cn(
              'text-[11px] font-bold truncate text-right',
              isFinal ? 'text-on-dark-soft' : 'text-ink-muted',
            )}
          >
            {teamLabel(match.homeTeamName, match.homeTeamId)}
          </span>
          <TeamBadge teamId={match.homeTeamId} size="sm" />
          {match.pickedWinnerId !== null && match.pickedWinnerId === match.homeTeamId && (
            <Icon name="check" size={11} color="var(--green-600)" />
          )}
        </div>

        <span
          className={cn(
            'text-[10px] font-bold tracking-[0.04em]',
            isFinal ? 'text-on-dark-soft' : 'text-ink-muted',
          )}
        >
          vs
        </span>

        <div className="flex items-center gap-[5px] min-w-0">
          <TeamBadge teamId={match.awayTeamId} size="sm" />
          <span
            data-testid="away-team-name"
            className={cn(
              'text-[11px] font-bold truncate',
              isFinal ? 'text-on-dark-soft' : 'text-ink-muted',
            )}
          >
            {teamLabel(match.awayTeamName, match.awayTeamId)}
          </span>
          {match.pickedWinnerId !== null && match.pickedWinnerId === match.awayTeamId && (
            <Icon name="check" size={11} color="var(--green-600)" />
          )}
        </div>
      </div>

      {championId !== null && championName !== null && (
        <ChampionPill championId={championId} championName={championName} isFinal={isFinal} />
      )}
    </div>
  );
}
