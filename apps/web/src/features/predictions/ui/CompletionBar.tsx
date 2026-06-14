import type { ReactElement } from 'react';

type Props = { percent: number };

export function CompletionBar({ percent }: Props): ReactElement {
  return (
    <div className="flex items-center gap-[10px]">
      <div
        className="bar flex-1"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <span className="display text-[17px] text-green-600 min-w-[3ch] text-right">{percent}%</span>
    </div>
  );
}
