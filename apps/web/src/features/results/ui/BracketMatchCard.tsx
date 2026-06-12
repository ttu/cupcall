import type { ReactElement } from 'react';
import type { KnockoutMatchView, MatchHit } from '../domain/types';
import { HitChip } from './HitChip';
import { TeamBadge, Icon } from '@/shared/ui';

type Props = { match: KnockoutMatchView };

function borderColorForHit(hit: MatchHit): string {
  if (hit === 'outcome' || hit === 'exact') return 'var(--green-300)';
  if (hit === 'missed') return 'oklch(0.85 0.08 25)';
  return 'var(--line-soft)';
}

function TeamRow({
  teamId,
  teamName,
  isPick,
  isActualWinner,
}: {
  teamId: string | null;
  teamName: string | null;
  isPick: boolean;
  isActualWinner: boolean;
}): ReactElement {
  return (
    <div
      data-testid="bracket-tie-team-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 7px',
        borderRadius: 7,
        background: isPick ? 'var(--green-050)' : 'transparent',
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
        {teamName ?? teamId ?? '?'}
      </span>
      {isPick && <Icon name="check" size={11} color="var(--green-700)" />}
      {isActualWinner && (
        <span
          style={{ fontSize: 11, fontWeight: 700, color: 'var(--green-600)', marginLeft: 2 }}
          aria-label="winner"
        >
          ✓
        </span>
      )}
    </div>
  );
}

export function BracketMatchCard({ match }: Props): ReactElement {
  const noTeams = !match.homeTeamId && !match.awayTeamId;
  const hasScore = match.actualHome !== null && match.actualAway !== null;
  const isFinal = match.status === 'final';

  return (
    <div
      data-testid="bracket-tie-row"
      className="card"
      style={{
        border: `1px solid ${borderColorForHit(match.hit)}`,
        overflow: 'hidden',
        minWidth: 150,
        padding: 4,
      }}
    >
      {/* Header strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: '2px 4px 4px',
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
        <HitChip hit={match.hit} />
      </div>

      {/* Team rows */}
      {!noTeams ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TeamRow
            teamId={match.homeTeamId}
            teamName={match.homeTeamName}
            isPick={match.pickedWinnerId === match.homeTeamId && match.pickedWinnerId !== null}
            isActualWinner={isFinal && match.actualWinnerId === match.homeTeamId}
          />
          <TeamRow
            teamId={match.awayTeamId}
            teamName={match.awayTeamName}
            isPick={match.pickedWinnerId === match.awayTeamId && match.pickedWinnerId !== null}
            isActualWinner={isFinal && match.actualWinnerId === match.awayTeamId}
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
