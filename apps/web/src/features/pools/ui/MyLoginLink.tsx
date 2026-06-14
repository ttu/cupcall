'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { rotateMyLoginToken } from '../api/actions';
import { buildLoginUrl } from '../domain/invite';
import { SectionLabel, Icon, cn } from '@/shared/ui';

type Props = { token: string; baseUrl: string };

export function MyLoginLink({ token: initialToken, baseUrl }: Props): ReactElement {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmReset, setConfirmReset] = useState(false);

  const url = `${baseUrl}${buildLoginUrl(token)}`;

  function handleCopy() {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleResetClick() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setError(null);
    setConfirmReset(false);
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
    <div className="card p-4.5 mb-6">
      <SectionLabel icon={<Icon name="link" size={13} color="var(--ink-muted)" />}>
        Your login link
      </SectionLabel>

      <p className="text-xs text-ink-soft mt-2.5 mb-3 leading-[1.5]">
        Your browser remembers you automatically, but this link lets you sign in from any other
        device. Store it somewhere safe — anyone with it can access your account.
      </p>

      {/* URL pill + copy button */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-9 rounded-cup-sm bg-surface-2 shadow-[inset_0_0_0_1px_var(--line)] flex items-center px-3 overflow-hidden">
          <span className="text-[11px] font-mono text-ink-soft truncate">{url}</span>
        </div>
        <button type="button" onClick={handleCopy} className="btn btn-soft sm">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Reset / confirm row */}
      <div className="mt-2.5 flex items-center gap-2.5">
        {confirmReset ? (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={handleResetClick}
              className={cn(
                'btn btn-ghost sm text-danger shadow-[inset_0_0_0_1.5px_oklch(0.78_0.12_25)]',
                isPending && 'opacity-50',
              )}
            >
              Confirm reset
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="bg-transparent border-0 cursor-pointer text-xs font-bold text-ink-muted p-0"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleResetClick}
            disabled={isPending}
            className={cn('btn btn-ghost sm', isPending && 'opacity-50')}
          >
            {isPending ? 'Working…' : 'Reset link'}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-danger mt-2">
          {error}
        </p>
      )}
    </div>
  );
}
