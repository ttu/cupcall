import type { ReactElement } from 'react';
import type { UserPointsSummary } from '../domain/types';

type Props = { summary: UserPointsSummary };

export function PointsSummaryPanel({ summary }: Props): ReactElement {
  return (
    <div className="grid grid-cols-3 gap-3" data-testid="points-summary-panel">
      <div className="card p-[14px_16px]">
        <div className="eyebrow text-ink-muted">Earned</div>
        <div className="display text-[30px] mt-[6px] text-green-600 tnum">{summary.earned}</div>
        <div className="text-[11.5px] text-ink-muted font-semibold mt-0.5">pts so far</div>
      </div>
      <div className="card p-[14px_16px]">
        <div className="eyebrow text-ink-muted">Missed</div>
        <div className="display text-[30px] mt-[6px] text-[var(--danger)] tnum">
          {summary.missed}
        </div>
        <div className="text-[11.5px] text-ink-muted font-semibold mt-0.5">pts lost</div>
      </div>
      <div className="card p-[14px_16px]">
        <div className="eyebrow text-ink-muted">Still available</div>
        <div className="display text-[30px] mt-[6px] text-ink tnum">{summary.canStillGet}</div>
        <div className="text-[11.5px] text-ink-muted font-semibold mt-0.5">pts max</div>
      </div>
    </div>
  );
}
