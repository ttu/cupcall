'use client';

import type { ReactElement } from 'react';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { PoolId } from '@cup/engine';

type Props<TId extends string> = {
  matchId: TId;
  poolId: PoolId;
  home: number | null;
  away: number | null;
  locked: boolean;
  onSave: (matchId: TId, home: number, away: number) => Promise<void>;
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

/** Result of parsing one goals input. */
type ParsedGoals = { kind: 'empty' } | { kind: 'invalid' } | { kind: 'value'; value: number };

function parseGoals(raw: string): ParsedGoals {
  if (raw.trim() === '') return { kind: 'empty' };
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 99
    ? { kind: 'value', value: n }
    : { kind: 'invalid' };
}

export function ScoreCell<TId extends string>({
  matchId,
  poolId: _poolId,
  home,
  away,
  locked,
  onSave,
}: Props<TId>): ReactElement {
  const [pending, startTransition] = useTransition();
  const [focusedField, setFocusedField] = useState<'home' | 'away' | null>(null);
  const [homeDraft, setHomeDraft] = useState(home !== null ? String(home) : '');
  const [awayDraft, setAwayDraft] = useState(away !== null ? String(away) : '');
  const [error, setError] = useState<string | null>(null);
  // Chains saves so a later edit (e.g. a final "2:2") is never clobbered by an
  // earlier, slower in-flight request (e.g. an intermediate "2:1") completing out of order.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    setHomeDraft(home !== null ? String(home) : '');
  }, [home]);
  useEffect(() => {
    setAwayDraft(away !== null ? String(away) : '');
  }, [away]);

  function handleBlur() {
    setFocusedField(null);
    const h = parseGoals(homeDraft);
    const a = parseGoals(awayDraft);

    if (h.kind === 'empty' || a.kind === 'empty') {
      setError(null);
      return;
    }
    if (h.kind === 'invalid' || a.kind === 'invalid') {
      setError('Enter a whole number between 0 and 99.');
      return;
    }
    setError(null);

    const chained = saveChainRef.current.then(() => onSave(matchId, h.value, a.value));
    // Keep the chain alive for future saves even if this one fails.
    saveChainRef.current = chained.catch(() => {});
    startTransition(async () => {
      try {
        await chained;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save the score.');
      }
    });
  }

  const filled = home !== null && away !== null;

  function inputStyle(field: 'home' | 'away'): React.CSSProperties {
    const base = locked ? LOCKED_STYLE : filled ? FILLED_STYLE : DEFAULT_STYLE;
    if (focusedField === field && !locked) {
      return { ...base, borderColor: 'var(--green-500)', boxShadow: '0 0 0 3px var(--green-050)' };
    }
    return base;
  }

  return (
    <span
      data-testid={`score-${matchId}`}
      className="inline-flex items-center gap-1 relative"
      aria-label="Score"
      aria-busy={pending}
    >
      <input
        type="number"
        min="0"
        max="99"
        value={homeDraft}
        disabled={locked || pending}
        onChange={(e) => setHomeDraft(e.target.value)}
        onBlur={handleBlur}
        onFocus={() => setFocusedField('home')}
        style={inputStyle('home')}
        aria-label="Home goals"
        aria-invalid={error !== null}
      />
      <span className="score-sep">:</span>
      <input
        type="number"
        min="0"
        max="99"
        value={awayDraft}
        disabled={locked || pending}
        onChange={(e) => setAwayDraft(e.target.value)}
        onBlur={handleBlur}
        onFocus={() => setFocusedField('away')}
        style={inputStyle('away')}
        aria-label="Away goals"
        aria-invalid={error !== null}
      />
      {pending && (
        <span
          className="absolute inset-0 rounded-[10px] bg-white/60 grid place-items-center"
          aria-hidden="true"
        >
          <span className="page-spinner" style={{ width: 16, height: 16 }} />
        </span>
      )}
      {error && (
        <span
          role="alert"
          className="absolute -bottom-4 left-0 right-0 text-[10px] leading-tight text-danger text-center whitespace-nowrap"
        >
          {error}
        </span>
      )}
    </span>
  );
}
