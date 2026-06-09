'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { rotateMyLoginToken } from '../api/actions';
import { buildLoginUrl } from '../domain/invite';

type Props = { token: string; baseUrl: string };

export function MyLoginLink({ token: initialToken, baseUrl }: Props): ReactElement {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const url = `${baseUrl}${buildLoginUrl(token)}`;

  function handleCopy() {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const result = await rotateMyLoginToken();
      if (result.ok) {
        setToken(result.token);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-white shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--line)]">
        <span
          className="text-xs font-bold tracking-widest uppercase text-[var(--ink-muted)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Your Login Link
        </span>
      </div>
      <div className="px-4 py-3 space-y-2">
        <p className="text-xs text-[var(--ink-soft)]">
          Your browser remembers you automatically, but this link lets you sign in from any other
          device. Store it somewhere safe — anyone with it can access your account.
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url}
            aria-label="Login link"
            className="flex-1 rounded-lg border border-[var(--line)] px-3 py-2 text-xs bg-[var(--surface-2)] text-[var(--ink)] font-mono select-all"
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 text-xs px-3 py-1.5 rounded-md text-[var(--ink-muted)] border border-[var(--line)] hover:bg-[var(--surface-2)] transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={isPending}
          className="text-xs text-[var(--ink-muted)] hover:text-[var(--danger)] transition-colors disabled:opacity-50"
        >
          {isPending ? 'Working…' : 'Reset link'}
        </button>
        {error && (
          <p role="alert" className="text-xs text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
