import type { ReactElement } from 'react';
import type { UserPointsSummary } from '../domain/types';
import { Chip } from '@/shared/ui';

type Props = {
  summary: UserPointsSummary;
  tiesCalled: { correct: number; decided: number };
};

export function KnockoutMobileSummary({ summary, tiesCalled }: Props): ReactElement {
  return (
    <div
      className="card flex items-center justify-between gap-3 p-[12px_14px]"
      data-testid="knockout-mobile-summary"
    >
      <div>
        <div className="eyebrow text-ink-muted">Knockout points</div>
        <div className="text-[12px] font-semibold text-ink-muted mt-0.5 tnum">
          {tiesCalled.correct}/{tiesCalled.decided} ties called
        </div>
      </div>
      <Chip variant="green">+{summary.earned}</Chip>
    </div>
  );
}
