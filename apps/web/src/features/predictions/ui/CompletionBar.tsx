import type { ReactElement } from 'react';

type Props = { percent: number };

export function CompletionBar({ percent }: Props): ReactElement {
  const normalizedPercent = Number.isFinite(percent) ? Math.min(Math.max(percent, 0), 100) : 0;

  return (
    <div className="flex items-center gap-2.5">
      <div
        className="bar flex-1"
        role="progressbar"
        aria-valuenow={normalizedPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: `${normalizedPercent}%` }} />
      </div>
      <span className="display text-[17px] text-green-600 min-w-[3ch] text-right">
        {normalizedPercent}%
      </span>
    </div>
  );
}
