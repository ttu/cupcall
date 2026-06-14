'use client';

import type { ReactElement } from 'react';
import { useFormStatus } from 'react-dom';
import { guestSignInAction } from '../login-actions';

function SubmitButton(): ReactElement {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? 'Creating account…' : 'Get started'}
    </button>
  );
}

export function GuestLoginForm(): ReactElement {
  return (
    <form action={guestSignInAction} aria-labelledby="guest-heading" className="space-y-3">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-ink mb-1">
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
          className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
        />
      </div>
      <SubmitButton />
    </form>
  );
}
