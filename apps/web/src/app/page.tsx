import type { ReactElement } from 'react';
import { redirect } from 'next/navigation';
import { auth, signIn } from '../features/auth/auth';
import { signInAsGuest } from '@/features/auth';

export default async function HomePage(): Promise<ReactElement> {
  const session = await auth();

  if (session?.user) {
    redirect('/pools');
  }

  async function handleEmailSignIn(formData: FormData) {
    'use server';
    const email = formData.get('email');
    if (typeof email !== 'string' || email.trim() === '') return;
    await signIn('resend', { email, redirectTo: '/pools' });
  }

  async function handleGuestSignIn(formData: FormData) {
    'use server';
    const name = (formData.get('name') as string | null)?.trim() ?? '';
    if (name.length < 2) return;
    await signInAsGuest(name, '/pools');
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1
            className="text-4xl font-bold text-[var(--ink)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Cup Prediction
          </h1>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Predict the tournament, compete with friends.
          </p>
        </div>

        {/* Quick join — name only, no email needed */}
        <div className="rounded-[var(--radius)] border border-[var(--line)] bg-white shadow-[var(--shadow-md)] p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--ink)]" id="guest-heading">
              Join without email
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Pick a display name and start playing right away.
            </p>
          </div>
          <form action={handleGuestSignIn} aria-labelledby="guest-heading" className="space-y-3">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-[var(--ink)] mb-1">
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
                className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm bg-white text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--green-500)] focus:ring-2 focus:ring-[var(--green-500)]/20"
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--green-600)] text-white text-sm font-semibold hover:bg-[var(--green-700)] transition-colors"
            >
              Get started
            </button>
          </form>
        </div>

        {/* Email sign-in */}
        <div className="rounded-[var(--radius)] border border-[var(--line)] bg-white shadow-[var(--shadow-md)] p-6 space-y-4">
          <h2 className="text-base font-semibold text-[var(--ink)]" id="signin-heading">
            Sign in with email
          </h2>
          <p className="text-sm text-[var(--ink-soft)]">
            We&apos;ll send a magic link — no password needed.
          </p>
          <form action={handleEmailSignIn} aria-labelledby="signin-heading" className="space-y-3">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[var(--ink)] mb-1">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm bg-white text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--green-500)] focus:ring-2 focus:ring-[var(--green-500)]/20"
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--ink-900)] text-[var(--on-dark)] text-sm font-semibold hover:bg-[var(--ink-800)] transition-colors"
            >
              Send magic link
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
