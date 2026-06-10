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
        {standing.map((row) => (
          <div
            key={row.teamId}
            style={{
              display: 'grid',
              gridTemplateColumns: '20px 1fr 26px 26px 36px',
              alignItems: 'center',
              padding: '8px 12px',
              background: row.qualifies !== false ? 'var(--green-050)' : 'var(--surface)',
            }}
          >
            <span
              className="display"
              style={{
                fontSize: 14,
                color: row.qualifies !== false ? 'var(--green-600)' : 'var(--ink-muted)',
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
        ))}
      </div>

      {standing.some((r) => r.qualifies !== false) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 12px',
            background: 'var(--surface)',
            borderTop: '1px solid var(--line-soft)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ink-muted)',
          }}
        >
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
        </div>
      )}
    </div>
  );
}
