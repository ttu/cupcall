import type { ReactElement } from 'react';
import type { KnockoutMatchView } from '../domain/types';
import { HitChip } from './HitChip';
import { TeamBadge, Icon } from '@/shared/ui';

type Props = {
  match: KnockoutMatchView;
  matchKey: 'final' | 'bronze';
};

function teamLabel(name: string | null, id: string | null): string {
  return name ?? id ?? '—';
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

  const pillBackground = isFinal ? 'var(--gold)' : 'oklch(0.80 0.06 55)';
  const pillTextColor = isFinal ? 'oklch(0.28 0.06 80)' : 'oklch(0.32 0.06 55)';

  return (
    <div
      data-testid={`${matchKey}-result-card`}
      style={{
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        background: isFinal ? 'var(--ink-900)' : 'var(--surface)',
        border: isFinal ? 'none' : '1px solid var(--line-soft)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Header strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: '8px 10px 6px',
        }}
      >
        {hasActualScore ? (
          <span
            className="tnum"
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: isFinal ? 'var(--on-dark)' : 'var(--ink)',
            }}
          >
            {match.actualHome}–{match.actualAway}
          </span>
        ) : match.kickoff ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
            }}
          >
            {new Date(match.kickoff).toLocaleDateString('en-GB', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        ) : (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
            }}
          >
            {isFinal ? 'Final' : '3rd Place'}
          </span>
        )}
        <HitChip hit={match.hit} />
      </div>

      {/* Predicted-score line (only when the user predicted) */}
      {hasPredictedScore && (
        <div
          style={{
            padding: '0 10px 6px',
            fontSize: 11,
            fontWeight: 700,
            color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
            letterSpacing: '0.02em',
          }}
        >
          Your pick: {match.predictedHome}–{match.predictedAway}
        </div>
      )}

      {/* Teams */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px 10px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 5,
            minWidth: 0,
          }}
        >
          <span
            data-testid="home-team-name"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'right',
            }}
          >
            {teamLabel(match.homeTeamName, match.homeTeamId)}
          </span>
          <TeamBadge teamId={match.homeTeamId} size="sm" />
          {match.pickedWinnerId !== null && match.pickedWinnerId === match.homeTeamId && (
            <Icon name="check" size={11} color="var(--green-600)" />
          )}
        </div>

        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
            letterSpacing: '0.04em',
          }}
        >
          vs
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <TeamBadge teamId={match.awayTeamId} size="sm" />
          <span
            data-testid="away-team-name"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {teamLabel(match.awayTeamName, match.awayTeamId)}
          </span>
          {match.pickedWinnerId !== null && match.pickedWinnerId === match.awayTeamId && (
            <Icon name="check" size={11} color="var(--green-600)" />
          )}
        </div>
      </div>

      {/* Champion pill */}
      {championId !== null && championName !== null && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 8px 10px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px 4px 6px',
              borderRadius: 999,
              background: pillBackground,
            }}
          >
            <TeamBadge teamId={championId} size="sm" />
            <span
              className="display"
              style={{ fontSize: 11, color: pillTextColor, letterSpacing: '0.04em' }}
            >
              {championName}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
