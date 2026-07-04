'use client';

import { useActionState } from 'react';
import type { ReactElement } from 'react';
import { SectionLabel, Icon, Button } from '@/shared/ui';
import { connectEmailFormAction } from '../link-email-actions';

const inputCls =
  'w-full rounded-lg border border-line px-3 py-2 text-sm bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20';

export function ConnectEmailForm(): ReactElement {
  const [state, action, pending] = useActionState(connectEmailFormAction, null);

  return (
    <div className="card p-4.5 mb-6">
      <SectionLabel icon={<Icon name="mail" size={13} color="var(--ink-muted)" />}>
        Connect your email to CupCall
      </SectionLabel>
      <p className="text-xs text-ink-soft mt-2.5 mb-3 leading-[1.5]">
        Add an email address so you can sign in without needing your login link.
      </p>
      {state?.ok ? (
        <div className="space-y-1">
          <p className="text-sm text-green-700 font-medium">
            Check your inbox — we&apos;ve sent you a confirmation link.
          </p>
          <p className="text-xs text-ink-muted leading-[1.5]">
            Open the link in this browser to connect your email to this account.
          </p>
        </div>
      ) : (
        <form action={action} className="space-y-2.5">
          <div>
            <label htmlFor="connect-email" className="block text-sm font-medium text-ink mb-1">
              Email address
            </label>
            <input
              id="connect-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              className={inputCls}
            />
          </div>
          {state && !state.ok && (
            <p role="alert" className="text-sm text-danger font-semibold">
              {state.error}
            </p>
          )}
          <Button type="submit" variant="primary" size="sm" disabled={pending}>
            {pending ? 'Sending…' : 'Send magic link'}
          </Button>
        </form>
      )}
    </div>
  );
}
