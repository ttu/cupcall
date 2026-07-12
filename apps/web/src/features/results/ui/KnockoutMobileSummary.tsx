import type { ReactElement } from 'react';
import type { UserPointsSummary } from '../domain/types';
import { cn } from '@/shared/ui';

type Props = {
  summary: UserPointsSummary;
  tiesCalled: { correct: number; decided: number };
};

function Stat({
  label,
  value,
  colorClassName,
}: {
  label: string;
  value: number;
  colorClassName: string;
}): ReactElement {
  return (
    <div className="text-center">
      <div className={cn('display text-[20px] leading-none tnum', colorClassName)}>{value}</div>
      <div className="text-[10px] text-ink-muted font-semibold mt-1">{label}</div>
    </div>
  );
}

export function KnockoutMobileSummary({ summary, tiesCalled }: Props): ReactElement {
  return (
    <div className="card flex flex-col gap-2.5 p-[12px_14px]" data-testid="knockout-mobile-summary">
      <div className="flex items-center justify-between gap-3">
        <div className="eyebrow text-ink-muted">Knockout points</div>
        <div className="text-[12px] font-semibold text-ink-muted tnum">
          {tiesCalled.correct}/{tiesCalled.decided} ties called
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Earned" value={summary.earned} colorClassName="text-green-600" />
        <Stat label="Missed" value={summary.missed} colorClassName="text-danger" />
        <Stat label="Available" value={summary.canStillGet} colorClassName="text-ink" />
      </div>
    </div>
  );
}
