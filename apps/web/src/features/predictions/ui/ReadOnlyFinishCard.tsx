import type { ReactElement } from 'react';
import { TeamBadge } from '@/shared/ui';

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
          padding: '8px 12px',
          borderBottom: isFinal ? '1px solid rgba(255,255,255,.06)' : '1px solid var(--line-soft)',
        }}
      >
        <span
          className="display"
          style={{ fontSize: 15, color: isFinal ? 'var(--on-dark)' : 'var(--ink)' }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 6,
          padding: '10px 12px',
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
            {homeTeamName ?? '—'}
          </span>
          <TeamBadge teamId={homeTeamId} size="sm" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {predictedHome !== null ? (
            <>
              <span className="score-cell filled" style={{ pointerEvents: 'none' }}>
                {predictedHome}
              </span>
              <span className="score-sep">:</span>
              <span className="score-cell filled" style={{ pointerEvents: 'none' }}>
                {predictedAway}
              </span>
            </>
          ) : (
            <span
              className="display tnum"
              style={{
                fontSize: 22,
                color: isFinal ? 'var(--on-dark)' : 'var(--ink)',
                minWidth: 56,
                textAlign: 'center',
              }}
            >
              –
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <TeamBadge teamId={awayTeamId} size="sm" />
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
            {awayTeamName ?? '—'}
          </span>
        </div>
      </div>

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
