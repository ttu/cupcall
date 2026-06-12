import type { ReactElement } from 'react';
import Link from 'next/link';
import { getCurrentActor } from '@/features/auth';
import { db } from '@/shared/db';
import {
  getPoolByInviteTokenHash,
  isMember,
  isKicked,
  getUserById,
  getLoginTokenByUserId,
  upsertLoginToken,
} from '@cup/db';
import {
  joinPool,
  joinAsGuest,
  getUserPools,
  PoolListItem,
  MyLoginLink,
  generateLoginToken,
} from '@/features/pools';
import { redirect } from 'next/navigation';
import { Icon } from '@/shared/ui';
import { JoinSubmitButton } from './JoinSubmitButton';

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function JoinPage({ params, searchParams }: Props): Promise<ReactElement> {
  const { token } = await params;
  const { error } = await searchParams;

  const [pool, actor] = await Promise.all([getPoolByInviteTokenHash(db, token), getCurrentActor()]);

  if (!pool) {
    if (actor) {
      let pools: Awaited<ReturnType<typeof getUserPools>> = [];
      try {
        pools = await getUserPools(db, actor.userId);
      } catch {
        // Non-critical; error card remains useful without the list.
      }

      let myLoginToken: string | null = null;
      const user = await getUserById(db, actor.userId);
      if (user && !user.email) {
        const existing = await getLoginTokenByUserId(db, actor.userId);
        const loginToken = existing?.token ?? generateLoginToken();
        if (!existing) await upsertLoginToken(db, actor.userId, loginToken);
        myLoginToken = loginToken;
      }

      const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '';

      return (
        <main className="turf min-h-screen flex flex-col items-center px-4 py-6">
          <div className="w-full max-w-[460px] my-auto flex flex-col gap-4">
            <div className="card" style={{ overflow: 'hidden' }}>
              <div
                style={{
                  background: 'var(--ink-900)',
                  padding: '22px 24px 18px',
                  color: 'var(--on-dark)',
                }}
              >
                <h2 className="display" style={{ fontSize: 30, marginBottom: 8 }}>
                  Invalid Invite
                </h2>
                <p style={{ fontSize: 13, color: 'var(--on-dark-soft)', lineHeight: 1.5 }}>
                  This invite link is invalid or has been removed.
                </p>
              </div>
              <div style={{ padding: '20px 24px' }}>
                <Link
                  href="/pools"
                  className="btn btn-dark block"
                  style={{ textDecoration: 'none' }}
                >
                  Go to My Pools
                </Link>
              </div>
            </div>

            {pools.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pools.map((p) => (
                  <PoolListItem key={p.id} pool={p} isOwner={p.ownerId === actor.userId} />
                ))}
              </div>
            )}

            {myLoginToken && <MyLoginLink token={myLoginToken} baseUrl={baseUrl} />}
          </div>
        </main>
      );
    }

    return (
      <main className="turf min-h-screen flex flex-col items-center justify-center px-4 py-6">
        <div className="card w-full max-w-[460px]" style={{ overflow: 'hidden' }}>
          <div
            style={{
              background: 'var(--ink-900)',
              padding: '22px 24px 18px',
              color: 'var(--on-dark)',
            }}
          >
            <h2 className="display" style={{ fontSize: 30, marginBottom: 8 }}>
              Invalid Invite
            </h2>
            <p style={{ fontSize: 13, color: 'var(--on-dark-soft)', lineHeight: 1.5 }}>
              This invite link is invalid or has been removed.
            </p>
          </div>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Link href="/" className="btn btn-dark block" style={{ textDecoration: 'none' }}>
              Go home
            </Link>
            <div
              style={{
                borderRadius: 10,
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--ink)' }}>Already joined on another device?</strong>{' '}
                Your personal login link is on your My Pools page. Ask the pool creator to send it
                to you if you don&apos;t have it saved.
              </p>
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--ink)' }}>Haven&apos;t joined yet?</strong> The invite
                link may have been reset or removed. Ask the pool creator to share a new one.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── Signed-in path ───────────────────────────────────────────────────────
  if (actor) {
    const alreadyMember = await isMember(db, pool.id, actor.userId);
    if (alreadyMember) {
      return (
        <main
          className="turf min-h-screen"
          style={{ display: 'grid', placeItems: 'center', padding: '24px 16px' }}
        >
          <div className="card" style={{ width: 'min(460px, 100%)', overflow: 'hidden' }}>
            <div
              style={{
                background: 'var(--green-500)',
                padding: '26px 30px 22px',
                color: 'oklch(0.2 0.02 160)',
              }}
            >
              <div className="eyebrow" style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
                <Icon name="users" size={13} />
                Already a member
              </div>
              <h2 className="display" style={{ fontSize: 38 }}>
                {pool.name}
              </h2>
            </div>
            <div style={{ padding: 30 }}>
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 20 }}>
                You&apos;re already a member of this pool.
              </p>
              <Link
                href={`/pools/${pool.id}`}
                className="btn btn-primary lg block"
                style={{ textDecoration: 'none' }}
              >
                Go to pool
              </Link>
            </div>
          </div>
        </main>
      );
    }

    const kicked = await isKicked(db, pool.id, actor.userId);
    if (kicked) {
      return (
        <main
          className="turf min-h-screen"
          style={{ display: 'grid', placeItems: 'center', padding: '24px 16px' }}
        >
          <div className="card" style={{ width: 'min(460px, 100%)', overflow: 'hidden' }}>
            <div
              style={{
                background: 'var(--ink-900)',
                padding: '26px 30px 22px',
                color: 'var(--on-dark)',
              }}
            >
              <h2 className="display" style={{ fontSize: 34, marginBottom: 8 }}>
                {pool.name}
              </h2>
            </div>
            <div style={{ padding: 30 }}>
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 20 }}>
                You have been removed from this pool and cannot rejoin with this link.
              </p>
              <Link
                href="/pools"
                className="btn btn-dark lg block"
                style={{ textDecoration: 'none' }}
              >
                Go to My Pools
              </Link>
            </div>
          </div>
        </main>
      );
    }

    // Signed-in, not yet a member — show join button.
    return (
      <main
        className="turf min-h-screen"
        style={{ display: 'grid', placeItems: 'center', padding: '24px 16px' }}
      >
        <div className="card" style={{ width: 'min(460px, 100%)', overflow: 'hidden' }}>
          <div
            style={{
              background: 'var(--green-500)',
              padding: '26px 30px 22px',
              color: 'oklch(0.2 0.02 160)',
            }}
          >
            <div
              className="eyebrow"
              style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Icon name="users" size={13} />
              You&apos;re invited to a pool
            </div>
            <h2 className="display" style={{ fontSize: 38 }}>
              {pool.name}
            </h2>
          </div>
          <div style={{ padding: 30, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                background: 'var(--orange-050)',
                borderRadius: 12,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 13,
                color: 'var(--orange-600)',
                fontWeight: 700,
              }}
            >
              <Icon name="lock" size={14} color="var(--orange-500)" />
              Predictions lock before the tournament starts — join now to get your picks in.
            </div>
            <SignedInJoinForm token={token} error={error} />
          </div>
        </div>
      </main>
    );
  }

  // ── Guest path — no account required ────────────────────────────────────
  return (
    <main
      className="turf min-h-screen"
      style={{ display: 'grid', placeItems: 'center', padding: '24px 16px' }}
    >
      <div className="card" style={{ width: 'min(460px, 100%)', overflow: 'hidden' }}>
        <div
          style={{
            background: 'var(--green-500)',
            padding: '26px 30px 22px',
            color: 'oklch(0.2 0.02 160)',
          }}
        >
          <div
            className="eyebrow"
            style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Icon name="users" size={13} />
            You&apos;re invited to a pool
          </div>
          <h2 className="display" style={{ fontSize: 38 }}>
            {pool.name}
          </h2>
        </div>
        <div style={{ padding: 30 }}>
          <GuestJoinForm token={token} poolName={pool.name} error={error} />
        </div>
      </div>
    </main>
  );
}

// ── Signed-in join form ────────────────────────────────────────────────────

function SignedInJoinForm({ token, error }: { token: string; error?: string | undefined }) {
  async function handleJoin() {
    'use server';
    const { getCurrentActor: getActor } = await import('@/features/auth');
    const actor = await getActor();
    if (!actor) redirect('/');

    const result = await joinPool({ token });
    if (result.ok) {
      redirect(`/pools/${result.poolId}`);
    }
    redirect(`/join/${token}?error=${encodeURIComponent(result.error)}`);
  }

  return (
    <form action={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && (
        <div
          role="alert"
          style={{
            borderRadius: 10,
            border: '1px solid oklch(0.85 0.08 25)',
            background: 'oklch(0.98 0.015 25)',
            padding: '10px 14px',
            fontSize: 13,
            color: 'var(--danger)',
          }}
        >
          {error}
        </div>
      )}
      <JoinSubmitButton />
    </form>
  );
}

// ── Guest join form (name only) ────────────────────────────────────────────

function GuestJoinForm({
  token,
  poolName,
  error,
}: {
  token: string;
  poolName: string;
  error?: string | undefined;
}) {
  async function handleGuestJoin(formData: FormData) {
    'use server';
    const displayName = (formData.get('displayName') as string | null)?.trim() ?? '';
    // joinAsGuest only returns when there's an error; success redirects internally.
    const result = await joinAsGuest({ displayName, token });
    redirect(`/join/${token}?error=${encodeURIComponent(result.error)}`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div
        style={{
          background: 'var(--orange-050)',
          borderRadius: 12,
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 13,
          color: 'var(--orange-600)',
          fontWeight: 700,
        }}
      >
        <Icon name="lock" size={14} color="var(--orange-500)" />
        Predictions lock before the tournament starts — join now to get your picks in.
      </div>

      <form action={handleGuestJoin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && (
          <div
            role="alert"
            style={{
              borderRadius: 10,
              border: '1px solid oklch(0.85 0.08 25)',
              background: 'oklch(0.98 0.015 25)',
              padding: '10px 14px',
              fontSize: 13,
              color: 'var(--danger)',
            }}
          >
            {error}
          </div>
        )}
        <div>
          <label
            className="eyebrow"
            htmlFor="displayName"
            style={{ color: 'var(--ink-muted)', display: 'block', marginBottom: 8 }}
          >
            Your display name
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
            style={{
              width: '100%',
              height: 48,
              borderRadius: 11,
              border: '1.5px solid var(--line)',
              background: 'var(--surface)',
              padding: '0 15px',
              fontSize: 15,
              color: 'var(--ink)',
              fontFamily: 'var(--font-ui)',
              boxSizing: 'border-box',
            }}
          />
          <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 6 }}>
            Shown on the leaderboard in <strong style={{ color: 'var(--ink)' }}>{poolName}</strong>.
          </p>
        </div>

        <JoinSubmitButton />
      </form>

      <div
        style={{
          borderRadius: 10,
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
          padding: '12px 14px',
        }}
      >
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
          How sign-in works
        </p>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
          This browser will remember you automatically. If you ever want to continue from a
          different device, you&apos;ll find a personal login link on your{' '}
          <strong style={{ color: 'var(--ink)' }}>My Pools</strong> page — save it somewhere safe.
        </p>
      </div>

      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-muted)' }}>
        Already have an account?{' '}
        <Link
          href={`/?callbackUrl=${encodeURIComponent(`/join/${token}`)}`}
          style={{ color: 'var(--green-700)', textDecoration: 'underline' }}
        >
          Sign in with email
        </Link>
      </p>
    </div>
  );
}
