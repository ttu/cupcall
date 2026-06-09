import type { ReactElement } from 'react';
import Link from 'next/link';
import { getCurrentActor } from '@/features/auth';
import { db } from '@/shared/db';
import { getPoolByInviteTokenHash, isMember, isKicked } from '@cup/db';
import { joinPool, joinAsGuest } from '@/features/pools';
import { redirect } from 'next/navigation';

type Props = { params: Promise<{ token: string }> };

export default async function JoinPage({ params }: Props): Promise<ReactElement> {
  const { token } = await params;

  const pool = await getPoolByInviteTokenHash(db, token);

  if (!pool) {
    return (
      <main className="max-w-md mx-auto px-4 py-12 text-center space-y-4">
        <h1
          className="text-2xl font-bold text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Invalid Invite
        </h1>
        <p className="text-sm text-[var(--ink-soft)]">
          This invite link is invalid or has been removed.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 rounded-lg bg-[var(--ink-900)] text-[var(--on-dark)] text-sm font-medium hover:bg-[var(--ink-800)] transition-colors"
        >
          Go home
        </Link>
      </main>
    );
  }

  const actor = await getCurrentActor();

  // ── Signed-in path ───────────────────────────────────────────────────────
  if (actor) {
    const alreadyMember = await isMember(db, pool.id, actor.userId);
    if (alreadyMember) {
      return (
        <main className="max-w-md mx-auto px-4 py-12 text-center space-y-4">
          <h1
            className="text-2xl font-bold text-[var(--ink)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {pool.name}
          </h1>
          <p className="text-sm text-[var(--ink-soft)]">
            You&apos;re already a member of this pool.
          </p>
          <Link
            href={`/pools/${pool.id}`}
            className="inline-block px-4 py-2 rounded-lg bg-[var(--green-600)] text-white text-sm font-semibold hover:bg-[var(--green-700)] transition-colors"
          >
            Go to pool →
          </Link>
        </main>
      );
    }

    const kicked = await isKicked(db, pool.id, actor.userId);
    if (kicked) {
      return (
        <main className="max-w-md mx-auto px-4 py-12 text-center space-y-4">
          <h1
            className="text-2xl font-bold text-[var(--ink)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {pool.name}
          </h1>
          <p className="text-sm text-[var(--ink-soft)]">
            You have been removed from this pool and cannot rejoin with this link.
          </p>
          <Link
            href="/pools"
            className="inline-block px-4 py-2 rounded-lg bg-[var(--ink-900)] text-[var(--on-dark)] text-sm font-medium hover:bg-[var(--ink-800)] transition-colors"
          >
            Go to My Pools
          </Link>
        </main>
      );
    }

    // Signed-in, not yet a member — show join button.
    return (
      <main className="max-w-md mx-auto px-4 py-12 text-center space-y-6">
        <div className="space-y-2">
          <p className="text-sm text-[var(--ink-muted)] uppercase tracking-widest font-bold">
            You&apos;ve been invited to
          </p>
          <h1
            className="text-3xl font-bold text-[var(--ink)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {pool.name}
          </h1>
        </div>
        <SignedInJoinForm token={token} />
      </main>
    );
  }

  // ── Guest path — no account required ────────────────────────────────────
  return (
    <main className="max-w-md mx-auto px-4 py-12 space-y-6">
      <div className="text-center space-y-2">
        <p className="text-sm text-[var(--ink-muted)] uppercase tracking-widest font-bold">
          You&apos;ve been invited to
        </p>
        <h1
          className="text-3xl font-bold text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {pool.name}
        </h1>
      </div>

      <GuestJoinForm token={token} poolName={pool.name} />
    </main>
  );
}

// ── Signed-in join form ────────────────────────────────────────────────────

function SignedInJoinForm({ token }: { token: string }) {
  async function handleJoin() {
    'use server';
    const { getCurrentActor: getActor } = await import('@/features/auth');
    const actor = await getActor();
    if (!actor) redirect('/');

    const result = await joinPool({ token });
    if (result.ok) {
      redirect(`/pools/${result.poolId}`);
    }
    redirect('/pools');
  }

  return (
    <form action={handleJoin}>
      <button
        type="submit"
        className="w-full px-6 py-3 rounded-[var(--radius)] bg-[var(--green-600)] text-white text-base font-bold hover:bg-[var(--green-700)] transition-colors shadow-[var(--shadow-md)]"
      >
        Join pool
      </button>
    </form>
  );
}

// ── Guest join form (name only) ────────────────────────────────────────────

function GuestJoinForm({ token, poolName }: { token: string; poolName: string }) {
  async function handleGuestJoin(formData: FormData) {
    'use server';
    const displayName = (formData.get('displayName') as string | null)?.trim() ?? '';
    // joinAsGuest validates the name and redirects on success.
    await joinAsGuest({ displayName, token });
    // If validation fails it returns an error — but since this is a plain form
    // action we redirect back with a fallback rather than surfacing it inline.
    redirect(`/join/${token}?error=1`);
  }

  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-white shadow-[var(--shadow-md)] p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-[var(--ink)]">Choose your display name</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          This is how you&apos;ll appear on the leaderboard in{' '}
          <span className="font-medium text-[var(--ink)]">{poolName}</span>.
        </p>
      </div>

      <form action={handleGuestJoin} className="space-y-4">
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-[var(--ink)] mb-1">
            Your name
          </label>
          <input
            id="displayName"
            name="displayName"
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
          className="w-full px-6 py-3 rounded-[var(--radius)] bg-[var(--green-600)] text-white text-base font-bold hover:bg-[var(--green-700)] transition-colors shadow-[var(--shadow-md)]"
        >
          Join pool
        </button>
      </form>

      <div className="rounded-lg bg-[var(--surface-2)] border border-[var(--line)] px-4 py-3 space-y-1">
        <p className="text-xs font-medium text-[var(--ink)]">How sign-in works</p>
        <p className="text-xs text-[var(--ink-soft)]">
          This browser will remember you automatically. If you ever want to continue from a
          different device, you&apos;ll find a personal login link on your{' '}
          <span className="font-medium text-[var(--ink)]">My Pools</span> page — save it somewhere
          safe.
        </p>
      </div>

      <p className="text-center text-xs text-[var(--ink-muted)]">
        Already have an account?{' '}
        <Link
          href={`/?callbackUrl=${encodeURIComponent(`/join/${token}`)}`}
          className="underline hover:text-[var(--ink)] transition-colors"
        >
          Sign in with email
        </Link>
      </p>
    </div>
  );
}
