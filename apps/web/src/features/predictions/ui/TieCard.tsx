import type { ReactElement } from 'react';
import type { TieView } from '../domain/types';
import { TeamBadge, Icon, cn } from '@/shared/ui';

export function TieCard({
  tie,
  locked,
  onPick,
  isPending,
}: {
  tie: TieView;
  locked: boolean;
  onPick: (key: string, winner: string) => void;
  isPending: boolean;
}): ReactElement {
  const hasPick = tie.pickedWinnerId !== null;

  return (
    <div
      data-testid="bracket-tie-row"
      aria-busy={isPending}
      className={cn(
        'card p-1 shadow-none relative',
        hasPick ? 'border border-green-300' : 'border border-dashed border-line',
      )}
    >
      <PickRow
        testId="pick-home"
        teamId={tie.homeTeamId}
        teamName={tie.homeTeamName ?? '?'}
        isPick={tie.pickedWinnerId === tie.homeTeamId && hasPick}
        disabled={locked || !tie.homeTeamId || isPending}
        onClick={() => tie.homeTeamId && onPick(tie.bracketMatchKey, tie.homeTeamId)}
      />
      <PickRow
        testId="pick-away"
        teamId={tie.awayTeamId}
        teamName={tie.awayTeamName ?? '?'}
        isPick={tie.pickedWinnerId === tie.awayTeamId && hasPick}
        disabled={locked || !tie.awayTeamId || isPending}
        onClick={() => tie.awayTeamId && onPick(tie.bracketMatchKey, tie.awayTeamId)}
      />
      {isPending && (
        <div
          className="absolute inset-0 rounded-cup bg-white/60 grid place-items-center"
          aria-hidden="true"
        >
          <span className="page-spinner" style={{ width: 16, height: 16 }} />
        </div>
      )}
    </div>
  );
}

function PickRow({
  testId,
  teamId,
  teamName,
  isPick,
  disabled,
  onClick,
}: {
  testId: string;
  teamId: string | null;
  teamName: string;
  isPick: boolean;
  disabled: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={isPick}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-[6px] py-[6px] px-[7px] rounded-[7px] border-0 text-left transition-[background] duration-[120ms]',
        isPick ? 'bg-green-050' : 'bg-transparent',
        disabled ? 'cursor-default' : 'cursor-pointer',
      )}
    >
      <TeamBadge teamId={teamId} size="sm" />
      <span
        className={cn(
          'flex-1 text-xs font-bold truncate',
          isPick ? 'text-green-700' : teamId ? 'text-ink' : 'text-ink-muted',
        )}
      >
        {teamName}
      </span>
      {isPick && <Icon name="check" size={11} color="var(--green-700)" />}
    </button>
  );
}
