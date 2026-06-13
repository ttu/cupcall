import type { ReactElement } from 'react';
import type { TieView } from '../domain/types';
import { TeamBadge, Icon } from '@/shared/ui';

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
      className="card"
      style={{
        padding: 4,
        boxShadow: 'none',
        border: hasPick ? '1px solid var(--green-300)' : '1px dashed var(--line)',
        position: 'relative',
      }}
      aria-busy={isPending}
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
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'var(--radius)',
            background: 'rgba(255,255,255,0.6)',
            display: 'grid',
            placeItems: 'center',
          }}
          aria-hidden="true"
        >
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: '2px solid var(--green-300)',
              borderTopColor: 'var(--green-600)',
              animation: 'spin 0.75s linear infinite',
              display: 'block',
            }}
          />
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
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 7px',
        borderRadius: 7,
        border: 'none',
        background: isPick ? 'var(--green-050)' : 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background .12s',
        textAlign: 'left',
      }}
    >
      <TeamBadge teamId={teamId} size="sm" />
      <span
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: 700,
          color: isPick ? 'var(--green-700)' : teamId ? 'var(--ink)' : 'var(--ink-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {teamName}
      </span>
      {isPick && <Icon name="check" size={11} color="var(--green-700)" />}
    </button>
  );
}
