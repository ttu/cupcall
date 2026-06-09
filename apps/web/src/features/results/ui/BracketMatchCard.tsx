import type { ReactElement } from 'react';
import type { KnockoutMatchView } from '../domain/types';
import { PickStatusChip } from './PickStatusChip';

type Props = { match: KnockoutMatchView; compact?: boolean };

function TeamRow({
  teamId,
  teamName,
  isPick,
  isWinner,
}: {
  teamId: string | null;
  teamName: string | null;
  isPick: boolean;
  isWinner: boolean;
}): ReactElement {
  const label = teamName ?? teamId ?? '?';
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
      style={{ background: isWinner ? 'var(--green-050)' : 'transparent' }}
    >
      <span
        className="inline-flex items-center justify-center rounded text-[9px] font-black flex-none"
        style={{
          width: 22,
          height: 16,
          background: 'var(--surface-2)',
          color: 'var(--ink-soft)',
          boxShadow: 'inset 0 0 0 1px var(--line)',
          fontFamily: 'var(--font-display)',
        }}
      >
        {teamId ?? '?'}
      </span>
      <span
        className="text-sm font-bold flex-1 truncate"
        style={{ color: isWinner ? 'var(--green-700)' : 'var(--ink-soft)' }}
      >
        {label}
      </span>
      {isPick && (
        <span
          className="text-[8.5px] font-black uppercase tracking-wider flex-none"
          style={{ color: 'var(--ink-muted)' }}
        >
          PICK
        </span>
      )}
      {isWinner && <span className="flex-none text-[var(--green-600)] text-sm font-bold">✓</span>}
    </div>
  );
}

export function BracketMatchCard({ match }: Props): ReactElement {
  const borderColor =
    match.pickStatus === 'alive'
      ? 'var(--green-300)'
      : match.pickStatus === 'busted'
        ? 'oklch(0.85 0.08 25)'
        : 'var(--line-soft)';

  const hasScore = match.actualHome !== null && match.actualAway !== null;
  const noTeams = !match.homeTeamId && !match.awayTeamId;

  return (
    <div
      className="rounded-[var(--radius-sm)] overflow-hidden"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${borderColor}`,
        boxShadow: 'var(--shadow-sm)',
        minWidth: 148,
      }}
    >
      {/* Header row */}
      <div
        className="flex items-center justify-between px-2.5 pt-2 pb-1.5"
        style={{ borderBottom: noTeams ? undefined : '1px solid var(--line-soft)' }}
      >
        {hasScore ? (
          <span
            className="text-[11px] font-bold tabular-nums"
            style={{ color: 'var(--ink-muted)' }}
          >
            {match.actualHome}–{match.actualAway}
          </span>
        ) : match.kickoff ? (
          <span className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
            {new Date(match.kickoff).toLocaleDateString('en-GB', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        ) : (
          <span className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
            {match.round}
          </span>
        )}
        <PickStatusChip status={match.pickStatus} />
      </div>

      {/* Teams */}
      {!noTeams ? (
        <>
          <TeamRow
            teamId={match.homeTeamId}
            teamName={match.homeTeamName}
            isPick={match.pickedWinnerId === match.homeTeamId}
            isWinner={match.actualWinnerId === match.homeTeamId}
          />
          <TeamRow
            teamId={match.awayTeamId}
            teamName={match.awayTeamName}
            isPick={match.pickedWinnerId === match.awayTeamId}
            isWinner={match.actualWinnerId === match.awayTeamId}
          />
        </>
      ) : (
        <div
          className="px-2.5 py-3 text-center text-[12px] font-bold"
          style={{ color: 'var(--ink-muted)' }}
        >
          To be determined
        </div>
      )}
    </div>
  );
}
