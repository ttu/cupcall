'use client';

import type { ReactElement } from 'react';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clearAllPredictions } from '../api/actions';
import { devFillRandomGroupScores } from '../api/dev-actions';

type Props = {
  poolId: string;
  isDev: boolean;
  locked: boolean;
};

export function DevControls({ poolId, isDev, locked }: Props): ReactElement {
  const router = useRouter();
  const [isClearPending, startClearTransition] = useTransition();
  const [isFillPending, startFillTransition] = useTransition();

  function handleClear() {
    startClearTransition(async () => {
      const result = await clearAllPredictions({ poolId });
      if (!result.ok) console.error('clearAllPredictions failed:', result.error);
      else router.refresh();
    });
  }

  function handleFill() {
    startFillTransition(async () => {
      const result = await devFillRandomGroupScores({ poolId });
      if (!result.ok) console.error('devFillRandomGroupScores failed:', result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {isDev && (
        <span className="text-[10px] font-bold tracking-widest uppercase text-ink-muted border border-line rounded px-1.5 py-0.5 select-none">
          dev
        </span>
      )}
      {isDev && (
        <button
          type="button"
          onClick={handleFill}
          disabled={isFillPending}
          className="text-xs px-2.5 py-1 rounded border border-line text-ink-muted hover:text-ink hover:border-[var(--line-strong)] transition-colors disabled:opacity-40"
        >
          {isFillPending ? 'Filling…' : 'Fill random scores'}
        </button>
      )}
      {!locked && (
        <button
          type="button"
          onClick={handleClear}
          disabled={isClearPending}
          className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 transition-colors disabled:opacity-40"
        >
          {isClearPending ? 'Clearing…' : 'Clear all'}
        </button>
      )}
    </div>
  );
}
