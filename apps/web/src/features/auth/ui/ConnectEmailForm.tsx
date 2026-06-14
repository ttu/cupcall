'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { requestEmailLinkAction } from '../link-email-actions';
import { SectionLabel, Icon } from '@/shared/ui';

export function ConnectEmailForm(): ReactElement {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await requestEmailLinkAction(formData);
      if (result.ok) {
        setSent(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="card p-[18px] mb-6">
      <SectionLabel icon={<Icon name="mail" size={13} color="var(--ink-muted)" />}>
        Connect your email
      </SectionLabel>

      {sent ? (
        <p className="text-[13px] text-ink-soft mt-[10px] mb-0 leading-[1.5]">
          Check your inbox — we sent a link to connect your email to this account.
        </p>
      ) : (
        <>
          <p className="text-xs text-ink-soft mt-[10px] mb-3 leading-[1.5]">
            Add an email address so you can sign in without needing your login link.
          </p>
          <form onSubmit={handleSubmit} className="flex gap-2 items-center">
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              required
              disabled={isPending}
              className="flex-1 h-9 rounded-[9px] bg-surface-2 shadow-[inset_0_0_0_1px_var(--line)] border-0 px-3 text-[13px] text-ink outline-none"
            />
            <button type="submit" disabled={isPending} className="btn btn-primary sm">
              {isPending ? 'Sending…' : 'Send link'}
            </button>
          </form>
          {error && (
            <p role="alert" className="text-xs text-danger mt-2">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
