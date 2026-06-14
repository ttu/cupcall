'use client';

import type { ReactElement } from 'react';
import { useFormStatus } from 'react-dom';
import { emailSignInAction } from '../login-actions';

function SubmitButton(): ReactElement {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full px-4 py-2.5 rounded-lg bg-ink-900 text-on-dark text-sm font-semibold hover:bg-ink-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? 'Sending…' : 'Send magic link'}
    </button>
  );
}

export function EmailLoginForm(): ReactElement {
  return (
    <form action={emailSignInAction} aria-labelledby="signin-heading" className="space-y-3">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
        />
      </div>
      <SubmitButton />
    </form>
  );
}
