import type { ReactElement } from 'react';
import Link from 'next/link';
import { getCurrentActor } from '@/features/auth';
import { db } from '@/shared/db';
import {
  getPoolByInviteTokenHash,
  getTournamentById,
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
import { Button, Icon } from '@/shared/ui';
import { JoinSubmitButton } from './JoinSubmitButton';

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function JoinPage({ params, searchParams }: Props): Promise<ReactElement> {
  const { token } = await params;
  const { error } = await searchParams;

  const now = new Date();
  const [pool, actor] = await Promise.all([getPoolByInviteTokenHash(db, token), getCurrentActor()]);
  const tournament = pool ? await getTournamentById(db, pool.tournamentId) : null;
  const isLateJoin = tournament ? now >= tournament.firstKickoff : false;

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
          <div className="w-full max-w-115 my-auto flex flex-col gap-4">
            <div className="card overflow-hidden">
              <div className="bg-ink-900 p-[22px_24px_18px] text-on-dark">
                <h2 className="display text-[30px] mb-2">Invalid Invite</h2>
                <p className="text-[13px] text-on-dark-soft leading-[1.5]">
                  This invite link is invalid or has been removed.
                </p>
              </div>
              <div className="p-[20px_24px]">
                <Button asChild variant="dark" block>
                  <Link href="/pools">Go to My Pools</Link>
                </Button>
              </div>
            </div>

            {pools.length > 0 && (
              <div className="flex flex-col gap-2.5">
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
        <div className="card w-full max-w-115 overflow-hidden">
          <div className="bg-ink-900 p-[22px_24px_18px] text-on-dark">
            <h2 className="display text-[30px] mb-2">Invalid Invite</h2>
            <p className="text-[13px] text-on-dark-soft leading-[1.5]">
              This invite link is invalid or has been removed.
            </p>
          </div>
          <div className="p-[20px_24px] flex flex-col gap-4">
            <Button asChild variant="dark" block>
              <Link href="/">Go home</Link>
            </Button>
            <div className="rounded-[10px] bg-surface-2 border border-line p-[12px_14px] flex flex-col gap-2">
              <p className="text-[13px] text-ink-soft leading-[1.6]">
                <strong className="text-ink">Already joined on another device?</strong> Your
                personal login link is on your My Pools page. Ask the pool creator to send it to you
                if you don&apos;t have it saved.
              </p>
              <p className="text-[13px] text-ink-soft leading-[1.6]">
                <strong className="text-ink">Haven&apos;t joined yet?</strong> The invite link may
                have been reset or removed. Ask the pool creator to share a new one.
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
        <main className="turf min-h-screen grid place-items-center p-[24px_16px]">
          <div className="card w-[min(460px,100%)] overflow-hidden">
            <div className="bg-green-500 p-[26px_30px_22px] text-[oklch(0.2_0.02_160)]">
              <div className="eyebrow mb-2 flex gap-2">
                <Icon name="users" size={13} />
                Already a member
              </div>
              <h2 className="display text-[38px]">{pool.name}</h2>
            </div>
            <div className="p-7.5">
              <p className="text-[13px] text-ink-soft mb-5">
                You&apos;re already a member of this pool.
              </p>
              <Button asChild variant="primary" size="lg" block>
                <Link href={`/pools/${pool.id}`}>Go to pool</Link>
              </Button>
            </div>
          </div>
        </main>
      );
    }

    const kicked = await isKicked(db, pool.id, actor.userId);
    if (kicked) {
      return (
        <main className="turf min-h-screen grid place-items-center p-[24px_16px]">
          <div className="card w-[min(460px,100%)] overflow-hidden">
            <div className="bg-ink-900 p-[26px_30px_22px] text-on-dark">
              <h2 className="display text-[34px] mb-2">{pool.name}</h2>
            </div>
            <div className="p-7.5">
              <p className="text-[13px] text-ink-soft mb-5">
                You have been removed from this pool and cannot rejoin with this link.
              </p>
              <Button asChild variant="dark" size="lg" block>
                <Link href="/pools">Go to My Pools</Link>
              </Button>
            </div>
          </div>
        </main>
      );
    }

    // Signed-in, not yet a member — show join button.
    return (
      <main className="turf min-h-screen grid place-items-center p-[24px_16px]">
        <div className="card w-[min(460px,100%)] overflow-hidden">
          <div className="bg-green-500 p-[26px_30px_22px] text-[oklch(0.2_0.02_160)]">
            <div className="eyebrow mb-2.5 flex items-center gap-2">
              <Icon name="users" size={13} />
              You&apos;re invited to a pool
            </div>
            <h2 className="display text-[38px]">{pool.name}</h2>
          </div>
          <div className="p-7.5 flex flex-col gap-4">
            <JoinWarning isLateJoin={isLateJoin} />
            <SignedInJoinForm token={token} error={error} />
          </div>
        </div>
      </main>
    );
  }

  // ── Guest path — no account required ────────────────────────────────────
  return (
    <main className="turf min-h-screen grid place-items-center p-[24px_16px]">
      <div className="card w-[min(460px,100%)] overflow-hidden">
        <div className="bg-green-500 p-[26px_30px_22px] text-[oklch(0.2_0.02_160)]">
          <div className="eyebrow mb-2.5 flex items-center gap-2">
            <Icon name="users" size={13} />
            You&apos;re invited to a pool
          </div>
          <h2 className="display text-[38px]">{pool.name}</h2>
        </div>
        <div className="p-7.5">
          <GuestJoinForm token={token} poolName={pool.name} error={error} isLateJoin={isLateJoin} />
        </div>
      </div>
    </main>
  );
}

// ── Join warning banner ────────────────────────────────────────────────────

function JoinWarning({ isLateJoin }: { isLateJoin: boolean }) {
  if (isLateJoin) {
    return (
      <div className="bg-orange-050 rounded-xl p-[12px_14px] flex items-start gap-2.5 text-[13px] text-orange-600 font-bold">
        <Icon name="clock" size={14} color="var(--orange-500)" />
        <span>
          The tournament has already started.{' '}
          <span className="font-normal">
            You&apos;ll have <strong>4 hours</strong> from joining to fill in your predictions.
            Items with known results will be locked.
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className="bg-orange-050 rounded-xl p-[12px_14px] flex items-center gap-2.5 text-[13px] text-orange-600 font-bold">
      <Icon name="lock" size={14} color="var(--orange-500)" />
      Predictions lock before the tournament starts — join now to get your picks in.
    </div>
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
    <form action={handleJoin} className="flex flex-col gap-3">
      {error && (
        <div
          role="alert"
          className="rounded-[10px] border border-[oklch(0.85_0.08_25)] bg-[oklch(0.98_0.015_25)] p-[10px_14px] text-[13px] text-danger"
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
  isLateJoin,
}: {
  token: string;
  poolName: string;
  error?: string | undefined;
  isLateJoin: boolean;
}) {
  async function handleGuestJoin(formData: FormData) {
    'use server';
    const displayName = (formData.get('displayName') as string | null)?.trim() ?? '';
    // joinAsGuest only returns when there's an error; success redirects internally.
    const result = await joinAsGuest({ displayName, token });
    redirect(`/join/${token}?error=${encodeURIComponent(result.error)}`);
  }

  return (
    <div className="flex flex-col gap-5">
      <JoinWarning isLateJoin={isLateJoin} />

      <form action={handleGuestJoin} className="flex flex-col gap-3.5">
        {error && (
          <div
            role="alert"
            className="rounded-[10px] border border-[oklch(0.85_0.08_25)] bg-[oklch(0.98_0.015_25)] p-[10px_14px] text-[13px] text-danger"
          >
            {error}
          </div>
        )}
        <div>
          <label className="eyebrow text-ink-muted block mb-2" htmlFor="displayName">
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
            className="w-full h-12 rounded-cup-btn border-input border-line bg-surface px-[15px] text-[15px] text-ink font-cup-ui box-border"
          />
          <p className="text-xs text-ink-muted mt-1.5">
            Shown on the leaderboard in <strong className="text-ink">{poolName}</strong>.
          </p>
        </div>

        <JoinSubmitButton />
      </form>

      <div className="rounded-[10px] bg-surface-2 border border-line p-[12px_14px]">
        <p className="text-xs font-bold text-ink mb-1">How sign-in works</p>
        <p className="text-xs text-ink-soft leading-[1.5]">
          This browser will remember you automatically. If you ever want to continue from a
          different device, you&apos;ll find a personal login link on your{' '}
          <strong className="text-ink">My Pools</strong> page — save it somewhere safe.
        </p>
      </div>

      <p className="text-center text-xs text-ink-muted">
        Already have an account?{' '}
        <Link
          href={`/?callbackUrl=${encodeURIComponent(`/join/${token}`)}`}
          className="text-green-700 underline"
        >
          Sign in with email
        </Link>
      </p>
    </div>
  );
}
