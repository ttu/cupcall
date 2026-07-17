'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { rotateViewToken, clearViewLink } from '../api/actions';
import { buildViewUrl } from '../domain/invite';
import { Button, CopyField, TurfCard } from '@/shared/ui';

type Props = {
  poolId: string;
  token: string | null;
  isOwner: boolean;
  baseUrl: string;
};

export function ViewSection({
  poolId,
  token: initialToken,
  isOwner,
  baseUrl,
}: Props): ReactElement | null {
  const [token, setToken] = useState(initialToken);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const viewUrl = token ? `${baseUrl}${buildViewUrl(token)}` : null;

  function handleGenerateOrRotate() {
    setError(null);
    startTransition(async () => {
      const result = await rotateViewToken({ poolId });
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
      const result = await clearViewLink({ poolId });
      if (result.ok) {
        setToken(null);
      } else {
        setError(result.error);
      }
    });
  }

  if (!isOwner && !token) return null;

  return (
    <TurfCard title="View Link">
      {viewUrl ? (
        <div className="px-4 py-4 space-y-3">
          <p className="text-xs text-ink-soft">
            Share this link — anyone with it can view results without an account.
          </p>
          <CopyField value={viewUrl} label="View link" />
          {isOwner && (
            <div className="flex gap-4">
              <button
                type="button"
                onClick={handleGenerateOrRotate}
                disabled={isPending}
                className="text-xs text-ink-muted hover:text-ink transition-colors disabled:opacity-50"
              >
                {isPending ? 'Working…' : 'Reset link'}
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={isPending}
                className="text-xs text-ink-muted hover:text-danger transition-colors disabled:opacity-50"
              >
                Remove link
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-4 space-y-3">
          <p className="text-xs text-ink-soft">
            View link is disabled. Generate one to let anyone view results without an account.
          </p>
          <Button variant="primary" size="sm" onClick={handleGenerateOrRotate} disabled={isPending}>
            {isPending ? 'Generating…' : 'Generate view link'}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="px-4 pb-3 text-xs text-danger">
          {error}
        </p>
      )}
    </TurfCard>
  );
}
