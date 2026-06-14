'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { rotateMyLoginToken } from '../api/actions';
import { buildLoginUrl } from '../domain/invite';
import { Button, CopyField, SectionLabel, Icon } from '@/shared/ui';

type Props = { token: string; baseUrl: string };

export function MyLoginLink({ token: initialToken, baseUrl }: Props): ReactElement {
  const [token, setToken] = useState(initialToken);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmReset, setConfirmReset] = useState(false);

  const url = `${baseUrl}${buildLoginUrl(token)}`;

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

      <p className="text-xs text-ink-soft mt-2.5 mb-3 leading-normal">
        Your browser remembers you automatically, but this link lets you sign in from any other
        device. Store it somewhere safe — anyone with it can access your account.
      </p>

      <CopyField value={url} label="Login link" />

      <div className="mt-2.5 flex items-center gap-2.5">
        {confirmReset ? (
          <>
            <Button
              variant="ghost-danger"
              size="sm"
              disabled={isPending}
              onClick={handleResetClick}
            >
              Confirm reset
            </Button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="bg-transparent border-0 cursor-pointer text-xs font-bold text-ink-muted p-0"
            >
              Cancel
            </button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={handleResetClick} disabled={isPending}>
            {isPending ? 'Working…' : 'Reset link'}
          </Button>
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
