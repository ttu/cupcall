import type { ReactElement } from 'react';
import type { GroupStandingRow } from '../domain/types';

type Props = { standing: GroupStandingRow[] };

export function GroupTable({ standing }: Props): ReactElement {
  if (standing.length === 0) {
    return (
      <p
        style={{ fontSize: 13, padding: '12px 0', textAlign: 'center', color: 'var(--ink-muted)' }}
      >
        No matches played yet
      </p>
    );
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '20px 1fr 26px 26px 36px',
          padding: '7px 12px',
          background: 'var(--surface-2)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <span />
        <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.12em' }}>
          Team
        </span>
        <span
          className="eyebrow"
          style={{ fontSize: 10, textAlign: 'center', letterSpacing: '0.12em' }}
        >
          P
        </span>
        <span
          className="eyebrow"
          style={{ fontSize: 10, textAlign: 'center', letterSpacing: '0.12em' }}
        >
          GD
        </span>
        <span
          className="eyebrow"
          style={{ fontSize: 10, textAlign: 'center', letterSpacing: '0.12em' }}
        >
          Pts
        </span>
      </div>

      <div className="divide">
        {standing.map((row) => {
          const bg =
            row.qualifies === 'auto'
              ? 'var(--green-050)'
              : row.qualifies === 'best-third'
                ? 'var(--orange-050)'
                : 'var(--surface)';
          const positionColor =
            row.qualifies === 'auto'
              ? 'var(--green-600)'
              : row.qualifies === 'best-third'
                ? 'var(--orange-600)'
                : 'var(--ink-muted)';
          return (
            <div
              key={row.teamId}
              style={{
                display: 'grid',
                gridTemplateColumns: '20px 1fr 26px 26px 36px',
                alignItems: 'center',
                padding: '8px 12px',
                background: bg,
              }}
            >
              <span
                className="display"
                style={{
                  fontSize: 14,
                  color: positionColor,
                }}
              >
                {row.position}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="badge sm">{row.teamId}</span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--ink)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.teamName}
                </span>
              </span>
              <span
                className="tnum"
                style={{ fontSize: 13, textAlign: 'center', color: 'var(--ink-muted)' }}
              >
                {row.played}
              </span>
              <span
                className="tnum"
                style={{ fontSize: 13, textAlign: 'center', color: 'var(--ink-soft)' }}
              >
                {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
              </span>
              <span
                className="display tnum"
                style={{ fontSize: 16, textAlign: 'center', color: 'var(--ink)' }}
              >
                {row.points}
              </span>
            </div>
          );
        })}
      </div>

      {(standing.some((r) => r.qualifies === 'auto') ||
        standing.some((r) => r.qualifies === 'best-third')) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
            padding: '7px 12px',
            background: 'var(--surface)',
            borderTop: '1px solid var(--line-soft)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ink-muted)',
          }}
        >
          {standing.some((r) => r.qualifies === 'auto') && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: 'var(--green-400)',
                  flexShrink: 0,
                  display: 'inline-block',
                }}
              />
              Through to the knockout round
            </span>
          )}
          {standing.some((r) => r.qualifies === 'best-third') && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: 'var(--orange-400)',
                  flexShrink: 0,
                  display: 'inline-block',
                }}
              />
              Best third advances
            </span>
          )}
        </div>
      )}
    </div>
  );
}
