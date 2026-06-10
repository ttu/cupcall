import type { ReactElement } from 'react';
import type { KnockoutMatchView } from '../domain/types';
import { PickStatusChip } from './PickStatusChip';

type Props = { match: KnockoutMatchView };

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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 8px',
        borderRadius: 7,
        background: isWinner ? 'var(--green-050)' : 'transparent',
      }}
    >
      <span className="badge sm">{teamId ?? '?'}</span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: isWinner ? 'var(--green-700)' : 'var(--ink-soft)',
        }}
      >
        {label}
      </span>
      {isPick && (
        <span className="eyebrow" style={{ fontSize: 8, flexShrink: 0, color: 'var(--ink-muted)' }}>
          PICK
        </span>
      )}
      {isWinner && (
        <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: 'var(--green-600)' }}>
          ✓
        </span>
      )}
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
      className="card"
      style={{
        border: `1px solid ${borderColor}`,
        overflow: 'hidden',
        minWidth: 150,
        padding: 0,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
          borderBottom: noTeams ? undefined : '1px solid var(--line-soft)',
        }}
      >
        {hasScore ? (
          <span
            className="tnum"
            style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)' }}
          >
            {match.actualHome}–{match.actualAway}
          </span>
        ) : match.kickoff ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)' }}>
            {new Date(match.kickoff).toLocaleDateString('en-GB', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)' }}>
            {match.round}
          </span>
        )}
        <PickStatusChip status={match.pickStatus} />
      </div>

      {/* Teams */}
      {!noTeams ? (
        <div style={{ padding: '2px 0' }}>
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
        </div>
      ) : (
        <div
          style={{
            padding: '10px 8px',
            textAlign: 'center',
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--ink-muted)',
          }}
        >
          To be determined
        </div>
      )}
    </div>
  );
}
