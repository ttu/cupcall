import type { ReactElement } from 'react';
import type { ScoreBreakdown } from '../domain/types';
import { cn } from '@/shared/ui';

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
    <div data-testid="knockout-points-panel" className="card p-[14px_16px]">
      <div className="eyebrow text-ink-muted mb-2.5">Knockout points</div>
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="display tnum text-[36px] text-ink leading-none">{total}</span>
        <span className="text-[13px] font-bold text-ink-muted">pts</span>
      </div>
      <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
        {rows.map((row) => (
          <li
            key={row.label}
            data-testid={`knockout-points-row-${row.label}`}
            className={cn(
              'flex justify-between items-center text-xs font-bold',
              row.points > 0 ? 'text-ink' : 'text-ink-muted',
            )}
          >
            <span>{row.label}</span>
            <span className="tnum">+{row.points}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
