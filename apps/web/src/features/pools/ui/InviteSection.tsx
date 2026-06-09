'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { rotateToken, clearInviteLink } from '../api/actions';
import { buildInviteUrl } from '../domain/invite';

type Props = {
  poolId: string;
  token: string | null;
  isOwner: boolean;
  baseUrl: string;
};

export function InviteSection({
  poolId,
  token: initialToken,
  isOwner,
  baseUrl,
}: Props): ReactElement {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const inviteUrl = token ? `${baseUrl}${buildInviteUrl(token)}` : null;

  function handleCopy() {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleGenerate() {
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

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await clearInviteLink({ poolId });
      if (result.ok) {
        setToken(null);
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

      {token ? (
        <div className="px-4 py-4 space-y-3">
          <p className="text-xs text-[var(--ink-soft)]">
            Share this link — anyone with it can join without an email address.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={inviteUrl ?? ''}
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
            <div className="flex gap-4">
              <button
                type="button"
                onClick={handleRotate}
                disabled={isPending}
                className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors disabled:opacity-50"
              >
                {isPending ? 'Working…' : 'Reset link'}
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={isPending}
                className="text-xs text-[var(--ink-muted)] hover:text-[var(--danger)] transition-colors disabled:opacity-50"
              >
                Remove link
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-4 space-y-3">
          <p className="text-xs text-[var(--ink-soft)]">
            {isOwner
              ? 'Invite link is disabled. Generate one to let people join.'
              : 'Invite link is disabled. Ask the pool owner to generate one.'}
          </p>
          {isOwner && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isPending}
              className="px-3 py-2 rounded-lg bg-[var(--green-600)] text-white text-xs font-semibold hover:bg-[var(--green-700)] transition-colors disabled:opacity-50"
            >
              {isPending ? 'Generating…' : 'Generate invite link'}
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="px-4 pb-3 text-xs text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
