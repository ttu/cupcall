'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { rotateToken } from '../api/actions';
import { buildInviteUrl } from '../domain/invite';

type Props = {
  poolId: string;
  token: string;
  isOwner: boolean;
};

export function InviteSection({ poolId, token: initialToken, isOwner }: Props): ReactElement {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${buildInviteUrl(token)}`
      : buildInviteUrl(token);

  function handleCopy() {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}${buildInviteUrl(token)}`
        : buildInviteUrl(token);
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleRotate() {
    setError(null);
    startTransition(async () => {
      const result = await rotateToken({ poolId });
      if (result.ok) {
        setToken(result.newToken);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-white shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="px-4 py-2.5 turf">
        <span
          className="text-sm font-bold tracking-widest uppercase text-[var(--on-dark)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Invite Link
        </span>
      </div>
      <div className="px-4 py-4 space-y-3">
        <p className="text-xs text-[var(--ink-soft)]">
          Share this link to invite friends to the pool.
        </p>
        <div className="flex gap-2">
          <input
            readOnly
            value={inviteUrl}
            aria-label="Invite link"
            className="flex-1 rounded-lg border border-[var(--line)] px-3 py-2 text-xs bg-[var(--surface-2)] text-[var(--ink)] font-mono select-all"
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-2 rounded-lg bg-[var(--ink-900)] text-[var(--on-dark)] text-xs font-medium hover:bg-[var(--ink-800)] transition-colors shrink-0"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={handleRotate}
            disabled={isPending}
            className="text-xs text-[var(--ink-muted)] hover:text-[var(--danger)] transition-colors disabled:opacity-50"
          >
            {isPending ? 'Rotating…' : 'Rotate link (invalidates old link)'}
          </button>
        )}
        {error && (
          <p role="alert" className="text-xs text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
