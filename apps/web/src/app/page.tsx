import type { ReactElement } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '../features/auth/auth';
import { GuestLoginForm, EmailLoginForm } from '@/features/auth';

export default async function HomePage(): Promise<ReactElement> {
  const session = await auth();

  if (session?.user) {
    redirect('/pools');
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1
            className="text-4xl font-bold text-(--ink)"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Cup Prediction
          </h1>
          <p className="mt-2 text-sm text-(--ink-soft)">
            Predict the tournament, compete with friends.
          </p>
        </div>

        {/* Quick join — name only, no email needed */}
        <div className="rounded-(--radius) border border-(--line) bg-white shadow-(--shadow-md) p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-(--ink)" id="guest-heading">
              Join without email
            </h2>
            <p className="mt-1 text-sm text-(--ink-soft)">
              Pick a display name and start playing right away.
            </p>
          </div>
          <GuestLoginForm />
        </div>

        {/* Email sign-in */}
        <div className="rounded-(--radius) border border-(--line) bg-white shadow-(--shadow-md) p-6 space-y-4">
          <h2 className="text-base font-semibold text-(--ink)" id="signin-heading">
            Sign in with email
          </h2>
          <p className="text-sm text-(--ink-soft)">
            We&apos;ll send a magic link — no password needed.
          </p>
          <EmailLoginForm />
        </div>
      </div>
    </main>
  );
}
