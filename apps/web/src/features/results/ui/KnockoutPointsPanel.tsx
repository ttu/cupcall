import type { ReactElement } from 'react';
import type { KnockoutRoundRow } from '../domain/types';
import { cn } from '@/shared/ui';

type Props = { rows: KnockoutRoundRow[] | null; variant?: 'mobile' | 'desktop' };

export function KnockoutPointsPanel({ rows, variant }: Props): ReactElement | null {
  if (!rows) return null;

  const total = rows.reduce((sum, r) => sum + r.earned, 0);
  const panelTestId = variant ? `knockout-points-panel-${variant}` : 'knockout-points-panel';

  return (
    <div data-testid={panelTestId} className="card p-[14px_16px]">
      <div className="eyebrow text-ink-muted mb-2.5">Knockout points</div>
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="display tnum text-[36px] text-ink leading-none">{total}</span>
        <span className="text-[13px] font-bold text-ink-muted">pts</span>
      </div>
      <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
        {rows.map((row) => (
          <li
            key={row.label}
            data-testid={
              variant
                ? `knockout-points-row-${row.label}-${variant}`
                : `knockout-points-row-${row.label}`
            }
            className="flex justify-between items-baseline text-xs"
          >
            <span className={cn('font-bold', row.earned > 0 ? 'text-ink' : 'text-ink-muted')}>
              {row.label}
            </span>
            <span className="tnum text-right">
              <span className={cn('font-bold', row.earned > 0 ? 'text-ink' : 'text-ink-muted')}>
                +{row.earned}
              </span>
              {row.missed > 0 && (
                <span className="font-semibold text-danger"> · {row.missed} missed</span>
              )}
              {row.canStillGet > 0 && (
                <span className="font-semibold text-ink-muted"> · {row.canStillGet} avail</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
