import type { CSSProperties, ReactElement } from 'react';
import type { FinishMatchView } from '../domain/types';
import { ScoreCell } from './ScoreCell';
import { TeamBadge } from '@/shared/ui';

function tieButtonStyle(isPick: boolean, isFinal: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '6px 8px',
    borderRadius: 7,
    border: isPick
      ? '1px solid var(--green-300)'
      : `1px solid ${isFinal ? 'rgba(255,255,255,.12)' : 'var(--line)'}`,
    background: isPick ? 'var(--green-050)' : isFinal ? 'rgba(255,255,255,.04)' : 'transparent',
    color: isPick ? 'var(--green-700)' : isFinal ? 'var(--on-dark)' : 'var(--ink)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  };
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
      style={{
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        background: isFinal ? 'var(--ink-900)' : 'var(--surface)',
        border: isFinal ? 'none' : '1px solid var(--line-soft)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 6,
          padding: '10px 10px',
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <TeamBadge teamId={match.awayTeamId} size="sm" />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {match.awayTeamName ?? '—'}
          </span>
        </div>
      </div>

      {needsTiebreak && !locked && (
        <div
          data-testid={`${matchKey}-winner-picker`}
          style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 10px 10px' }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
              textAlign: 'center',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Pick the shootout winner
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              data-testid={`${matchKey}-pick-home`}
              aria-pressed={match.pickedWinnerId === match.homeTeamId}
              onClick={() => match.homeTeamId && onPickWinner(matchKey, match.homeTeamId)}
              disabled={!match.homeTeamId}
              style={tieButtonStyle(match.pickedWinnerId === match.homeTeamId, isFinal)}
            >
              {match.homeTeamName ?? '—'}
            </button>
            <button
              type="button"
              data-testid={`${matchKey}-pick-away`}
              aria-pressed={match.pickedWinnerId === match.awayTeamId}
              onClick={() => match.awayTeamId && onPickWinner(matchKey, match.awayTeamId)}
              disabled={!match.awayTeamId}
              style={tieButtonStyle(match.pickedWinnerId === match.awayTeamId, isFinal)}
            >
              {match.awayTeamName ?? '—'}
            </button>
          </div>
        </div>
      )}

      {champion?.teamId && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 8px 10px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px 4px 6px',
              borderRadius: 999,
              background: isFinal ? 'var(--gold)' : 'oklch(0.80 0.06 55)',
            }}
          >
            <TeamBadge teamId={champion.teamId} size="sm" />
            <span
              className="display"
              style={{
                fontSize: 11,
                color: isFinal ? 'oklch(0.28 0.06 80)' : 'oklch(0.32 0.06 55)',
                letterSpacing: '0.04em',
              }}
            >
              {champion.teamName}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
