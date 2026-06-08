import type { ReactElement } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentActor } from '@/features/auth';
import { db } from '@/shared/db';
import { getPoolByInviteTokenHash, isMember, isKicked } from '@cup/db';
import { joinPool } from '@/features/pools';

type Props = { params: Promise<{ token: string }> };

export default async function JoinPage({ params }: Props): Promise<ReactElement> {
  const { token } = await params;

  const actor = await getCurrentActor();
  if (!actor) {
    // Redirect to sign-in with a return URL after auth.
    redirect(`/?callbackUrl=${encodeURIComponent(`/join/${token}`)}`);
  }

  // Look up the pool by the raw token.
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
          This invite link is invalid or has expired.
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

  // Check if already a member.
  const alreadyMember = await isMember(db, pool.id, actor.userId);
  const kicked = await isKicked(db, pool.id, actor.userId);

  if (alreadyMember) {
    return (
      <main className="max-w-md mx-auto px-4 py-12 text-center space-y-4">
        <h1
          className="text-2xl font-bold text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {pool.name}
        </h1>
        <p className="text-sm text-[var(--ink-soft)]">You&apos;re already a member of this pool.</p>
        <Link
          href={`/pools/${pool.id}`}
          className="inline-block px-4 py-2 rounded-lg bg-[var(--green-600)] text-white text-sm font-semibold hover:bg-[var(--green-700)] transition-colors"
        >
          Go to pool →
        </Link>
      </main>
    );
  }

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

  // Show join confirmation form.
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

      <JoinForm token={token} />
    </main>
  );
}

function JoinForm({ token }: { token: string }) {
  async function handleJoin() {
    'use server';
    const { getCurrentActor: getActor } = await import('@/features/auth');
    const actor = await getActor();
    if (!actor) redirect('/');

    const result = await joinPool({ token });
    if (result.ok) {
      redirect(`/pools/${result.poolId}`);
    }
    // On error, we'd ideally show feedback — for now redirect with a generic fallback.
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
