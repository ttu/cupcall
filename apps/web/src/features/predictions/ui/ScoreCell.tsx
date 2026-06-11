'use client';

import type { ReactElement } from 'react';
import { useState, useRef, useTransition } from 'react';

type Props = {
  matchId: string;
  poolId: string;
  home: number | null;
  away: number | null;
  locked: boolean;
  onSave: (matchId: string, home: number, away: number) => Promise<void>;
};

const LOCKED_STYLE: React.CSSProperties = {
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

const FILLED_STYLE: React.CSSProperties = {
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

const DEFAULT_STYLE: React.CSSProperties = {
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

export function ScoreCell({
  matchId,
  poolId: _poolId,
  home,
  away,
  locked,
  onSave,
}: Props): ReactElement {
  const [pending, startTransition] = useTransition();
  const [focusedField, setFocusedField] = useState<'home' | 'away' | null>(null);
  const homeRef = useRef<HTMLInputElement>(null);
  const awayRef = useRef<HTMLInputElement>(null);

  function handleBlur() {
    setFocusedField(null);
    const h = homeRef.current?.value;
    const a = awayRef.current?.value;
    if (h === '' || h === undefined || a === '' || a === undefined) return;
    const hn = parseInt(h, 10);
    const an = parseInt(a, 10);
    if (isNaN(hn) || isNaN(an)) return;
    startTransition(() => void onSave(matchId, hn, an));
  }

  const filled = home !== null && away !== null;

  function inputStyle(field: 'home' | 'away'): React.CSSProperties {
    const base = locked ? LOCKED_STYLE : filled ? FILLED_STYLE : DEFAULT_STYLE;
    if (focusedField === field && !locked && !filled) {
      return { ...base, borderColor: 'var(--green-500)', boxShadow: '0 0 0 3px var(--green-050)' };
    }
    return base;
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
        onFocus={() => setFocusedField('home')}
        style={inputStyle('home')}
        aria-label="Home goals"
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
        onFocus={() => setFocusedField('away')}
        style={inputStyle('away')}
        aria-label="Away goals"
      />
    </span>
  );
}
