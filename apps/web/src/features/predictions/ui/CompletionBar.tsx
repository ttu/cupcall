import type { ReactElement } from 'react';

type Props = { percent: number };

export function CompletionBar({ percent }: Props): ReactElement {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex-1 h-2 rounded-full bg-[var(--line)] overflow-hidden"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${percent === 100 ? 'bg-[var(--green-500)]' : 'bg-amber-400'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-[var(--ink-soft)] tabular-nums min-w-[3ch] text-right">
        {percent}%
      </span>
    </div>
  );
}
