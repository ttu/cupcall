import type { ReactElement } from 'react';
import type { ScoreBreakdown } from '../domain/types';

type Props = { breakdown: ScoreBreakdown | null };

type Row = { label: string; points: number };

export function KnockoutPointsPanel({ breakdown }: Props): ReactElement | null {
  if (!breakdown) return null;

  const rows: Row[] = [
    { label: 'Round of 8', points: breakdown.roundOf8 },
    { label: 'Top 4', points: breakdown.topFour },
    { label: 'Final', points: breakdown.final },
    { label: 'Bronze', points: breakdown.bronze },
  ];

  const total = rows.reduce((sum, r) => sum + r.points, 0);

  return (
    <div data-testid="knockout-points-panel" className="card" style={{ padding: '14px 16px' }}>
      <div className="eyebrow" style={{ color: 'var(--ink-muted)', marginBottom: 10 }}>
        Knockout points
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          marginBottom: 12,
        }}
      >
        <span className="display tnum" style={{ fontSize: 36, color: 'var(--ink)', lineHeight: 1 }}>
          {total}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-muted)' }}>pts</span>
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {rows.map((row) => (
          <li
            key={row.label}
            data-testid={`knockout-points-row-${row.label}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
              fontWeight: 700,
              color: row.points > 0 ? 'var(--ink)' : 'var(--ink-muted)',
            }}
          >
            <span>{row.label}</span>
            <span className="tnum">+{row.points}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
