import type { ReactElement } from 'react';

type Props = { percent: number };

export function CompletionBar({ percent }: Props): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        className="bar"
        style={{ flex: 1 }}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <span
        className="display"
        style={{ fontSize: 17, color: 'var(--green-600)', minWidth: '3ch', textAlign: 'right' }}
      >
        {percent}%
      </span>
    </div>
  );
}
