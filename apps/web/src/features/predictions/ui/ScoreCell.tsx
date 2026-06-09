'use client';

import type { ReactElement } from 'react';
import { useRef, useTransition } from 'react';

type Props = {
  matchId: string;
  poolId: string;
  home: number | null;
  away: number | null;
  locked: boolean;
  onSave: (matchId: string, home: number, away: number) => Promise<void>;
};

export function ScoreCell({
  matchId,
  poolId: _poolId,
  home,
  away,
  locked,
  onSave,
}: Props): ReactElement {
  const [pending, startTransition] = useTransition();
  const homeRef = useRef<HTMLInputElement>(null);
  const awayRef = useRef<HTMLInputElement>(null);

  function handleBlur() {
    const h = homeRef.current?.value;
    const a = awayRef.current?.value;
    if (h === '' || h === undefined || a === '' || a === undefined) return;
    const hn = parseInt(h, 10);
    const an = parseInt(a, 10);
    if (isNaN(hn) || isNaN(an)) return;
    startTransition(() => void onSave(matchId, hn, an));
  }

  const base =
    'w-10 h-10 text-center text-base font-semibold rounded-lg border transition-colors outline-none' +
    ' focus:border-[var(--green-500)] focus:ring-2 focus:ring-[var(--green-500)]/20' +
    (locked
      ? ' bg-[var(--surface-2)] text-[var(--ink-muted)] cursor-not-allowed border-[var(--line)]'
      : ' bg-white border-[var(--line)] text-[var(--ink)]');

  return (
    <span
      data-testid={`score-${matchId}`}
      className="inline-flex items-center gap-1"
      aria-label="Score"
    >
      <input
        ref={homeRef}
        type="number"
        min="0"
        max="99"
        defaultValue={home ?? ''}
        disabled={locked || pending}
        onBlur={handleBlur}
        className={base}
        aria-label="Home goals"
      />
      <span className="text-[var(--ink-muted)] font-bold text-sm select-none">:</span>
      <input
        ref={awayRef}
        type="number"
        min="0"
        max="99"
        defaultValue={away ?? ''}
        disabled={locked || pending}
        onBlur={handleBlur}
        className={base}
        aria-label="Away goals"
      />
    </span>
  );
}
