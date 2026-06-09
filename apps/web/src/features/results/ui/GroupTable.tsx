import type { ReactElement } from 'react';
import type { GroupStandingRow } from '../domain/types';

type Props = { standing: GroupStandingRow[] };

export function GroupTable({ standing }: Props): ReactElement {
  if (standing.length === 0) {
    return (
      <p className="text-sm py-3 text-center" style={{ color: 'var(--ink-muted)' }}>
        No matches played yet
      </p>
    );
  }

  return (
    <div
      className="rounded-[var(--radius)] overflow-hidden"
      style={{ boxShadow: 'var(--shadow-sm)', border: '1px solid var(--line-soft)' }}
    >
      {/* Header */}
      <div
        className="grid text-[10px] font-bold uppercase tracking-wider px-3 py-2"
        style={{
          gridTemplateColumns: '20px 1fr 24px 28px 32px',
          background: 'var(--surface-2)',
          borderBottom: '1px solid var(--line)',
          color: 'var(--ink-muted)',
        }}
      >
        <span />
        <span>Team</span>
        <span className="text-center">P</span>
        <span className="text-center">GD</span>
        <span className="text-center">Pts</span>
      </div>

      <div className="divide">
        {standing.map((row) => (
          <div
            key={row.teamId}
            className="grid items-center px-3 py-2"
            style={{
              gridTemplateColumns: '20px 1fr 24px 28px 32px',
              background: row.qualifies !== false ? 'var(--green-050)' : 'var(--surface)',
            }}
          >
            <span
              className="font-black text-sm"
              style={{
                fontFamily: 'var(--font-display)',
                color: row.qualifies !== false ? 'var(--green-600)' : 'var(--ink-muted)',
              }}
            >
              {row.position}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-flex items-center justify-center rounded text-[9px] font-black"
                style={{
                  width: 22,
                  height: 16,
                  background: 'var(--surface-2)',
                  color: 'var(--ink-soft)',
                  boxShadow: 'inset 0 0 0 1px var(--line)',
                  fontFamily: 'var(--font-display)',
                }}
              >
                {row.teamId}
              </span>
              <span className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>
                {row.teamName}
              </span>
            </span>
            <span
              className="text-center text-sm tabular-nums"
              style={{ color: 'var(--ink-muted)' }}
            >
              {row.played}
            </span>
            <span className="text-center text-sm tabular-nums" style={{ color: 'var(--ink-soft)' }}>
              {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
            </span>
            <span
              className="text-center font-black tabular-nums"
              style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--ink)' }}
            >
              {row.points}
            </span>
          </div>
        ))}
      </div>

      {standing.some((r) => r.qualifies !== false) && (
        <div
          className="flex items-center gap-2 px-3 py-2 text-[11px] font-semibold"
          style={{
            background: 'var(--surface)',
            color: 'var(--ink-muted)',
            borderTop: '1px solid var(--line-soft)',
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: 'var(--green-050)',
              boxShadow: 'inset 0 0 0 1px var(--green-300)',
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
