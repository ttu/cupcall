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

  const filled = home !== null && away !== null;

  function inputStyle(focused?: boolean): React.CSSProperties {
    if (locked) {
      return {
        width: 46,
        height: 52,
        borderRadius: 10,
        background: 'var(--surface-2)',
        border: '1.5px solid var(--line)',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'var(--font-display)',
        fontSize: 26,
        color: 'var(--ink-muted)',
        textAlign: 'center',
        outline: 'none',
        cursor: 'not-allowed',
        MozAppearance: 'textfield',
      } as React.CSSProperties;
    }
    if (filled) {
      return {
        width: 46,
        height: 52,
        borderRadius: 10,
        background: 'var(--green-050)',
        border: '1.5px solid var(--green-400)',
        fontFamily: 'var(--font-display)',
        fontSize: 26,
        color: 'var(--green-700)',
        textAlign: 'center',
        outline: 'none',
        MozAppearance: 'textfield',
      } as React.CSSProperties;
    }
    return {
      width: 46,
      height: 52,
      borderRadius: 10,
      background: 'var(--surface)',
      border: '1.5px solid var(--line)',
      fontFamily: 'var(--font-display)',
      fontSize: 26,
      color: 'var(--ink)',
      textAlign: 'center',
      outline: 'none',
      MozAppearance: 'textfield',
    } as React.CSSProperties;
  }

  return (
    <span
      data-testid={`score-${matchId}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
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
        style={inputStyle()}
        aria-label="Home goals"
        onFocus={(e) => {
          if (!locked && !filled) {
            e.currentTarget.style.borderColor = 'var(--green-500)';
            e.currentTarget.style.boxShadow = '0 0 0 3px var(--green-050)';
          }
        }}
      />
      <span className="score-sep">:</span>
      <input
        ref={awayRef}
        type="number"
        min="0"
        max="99"
        defaultValue={away ?? ''}
        disabled={locked || pending}
        onBlur={handleBlur}
        style={inputStyle()}
        aria-label="Away goals"
        onFocus={(e) => {
          if (!locked && !filled) {
            e.currentTarget.style.borderColor = 'var(--green-500)';
            e.currentTarget.style.boxShadow = '0 0 0 3px var(--green-050)';
          }
        }}
      />
    </span>
  );
}
