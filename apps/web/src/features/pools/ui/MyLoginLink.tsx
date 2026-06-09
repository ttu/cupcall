'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';

type Props = { url: string };

export function MyLoginLink({ url }: Props): ReactElement {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
          <span className="flex-1 text-xs text-[var(--ink-soft)] truncate font-mono bg-[var(--surface-2)] rounded px-2 py-1.5">
            {url}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 text-xs px-3 py-1.5 rounded-md text-[var(--ink-muted)] border border-[var(--line)] hover:bg-[var(--surface-2)] transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
