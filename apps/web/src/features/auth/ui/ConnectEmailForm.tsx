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
    <div className="card" style={{ padding: 18, marginBottom: 24 }}>
      <SectionLabel icon={<Icon name="mail" size={13} color="var(--ink-muted)" />}>
        Connect your email
      </SectionLabel>

      {sent ? (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '10px 0 0', lineHeight: 1.5 }}>
          Check your inbox — we sent a link to connect your email to this account.
        </p>
      ) : (
        <>
          <p
            style={{
              fontSize: 12,
              color: 'var(--ink-soft)',
              margin: '10px 0 12px',
              lineHeight: 1.5,
            }}
          >
            Add an email address so you can sign in without needing your login link.
          </p>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              required
              disabled={isPending}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 9,
                background: 'var(--surface-2)',
                boxShadow: 'inset 0 0 0 1px var(--line)',
                border: 'none',
                padding: '0 12px',
                fontSize: 13,
                color: 'var(--ink)',
                outline: 'none',
              }}
            />
            <button type="submit" disabled={isPending} className="btn btn-primary sm">
              {isPending ? 'Sending…' : 'Send link'}
            </button>
          </form>
          {error && (
            <p role="alert" style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
