'use client';

import { useActionState } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/shared/ui';
import { guestSignInAction, type GuestSignInState } from '../login-actions';

const initial: GuestSignInState = { error: null };

const inputCls =
  'w-full rounded-lg border border-line px-3 py-2 text-sm bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20';

export function GuestLoginForm(): ReactElement {
  const [state, action, pending] = useActionState(guestSignInAction, initial);

  return (
    <form action={action} aria-labelledby="guest-heading" className="space-y-3">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-on-dark-soft mb-1">
          Your name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="nickname"
          required
          minLength={2}
          maxLength={50}
          placeholder="e.g. Alex"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="betaCode" className="block text-sm font-medium text-on-dark-soft mb-1">
          Beta code
        </label>
        <input
          id="betaCode"
          name="betaCode"
          type="text"
          autoComplete="off"
          placeholder="Enter your beta code"
          className={inputCls}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger font-semibold">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" block disabled={pending}>
        {pending ? 'Creating account…' : 'Get started'}
      </Button>
    </form>
  );
}
