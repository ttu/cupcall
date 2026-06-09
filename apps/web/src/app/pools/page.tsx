import type { ReactElement } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentActor } from '@/features/auth';
import { db } from '@/shared/db';
import { getUserById, getLoginTokenByUserId, upsertLoginToken } from '@cup/db';
import {
  getUserPools,
  PoolListItem,
  CreatePoolForm,
  MyLoginLink,
  buildLoginUrl,
  generateLoginToken,
} from '@/features/pools';

export default async function PoolsPage(): Promise<ReactElement> {
  const actor = await getCurrentActor();
  if (!actor) redirect('/');

  const [pools, user] = await Promise.all([
    getUserPools(db, actor.userId),
    getUserById(db, actor.userId),
  ]);

  let myLoginUrl: string | null = null;
  if (user && !user.email) {
    const existing = await getLoginTokenByUserId(db, actor.userId);
    const token = existing?.token ?? generateLoginToken();
    if (!existing) await upsertLoginToken(db, actor.userId, token);
    myLoginUrl = `${process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? ''}${buildLoginUrl(token)}`;
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1
          className="text-2xl font-bold text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          My Pools
        </h1>
        <p className="text-sm text-[var(--ink-soft)] mt-0.5">
          Create or join pools and compete with friends.
        </p>
      </div>

      {/* Pool list */}
      {pools.length > 0 ? (
        <div className="space-y-3">
          {pools.map((pool) => (
            <PoolListItem key={pool.id} pool={pool} isOwner={pool.ownerId === actor.userId} />
          ))}
        </div>
      ) : (
        <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-6 py-8 text-center">
          <p className="text-sm text-[var(--ink-soft)]">
            You haven&apos;t joined any pools yet. Create one below or use an invite link to join.
          </p>
        </div>
      )}

      {/* Personal login link (guests only) */}
      {myLoginUrl && <MyLoginLink url={myLoginUrl} />}

      {/* Create a new pool */}
      <section aria-labelledby="create-pool-heading">
        <h2
          id="create-pool-heading"
          className="text-xs font-bold tracking-widest uppercase text-[var(--ink-muted)] mb-3"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Create a Pool
        </h2>
        <CreatePoolForm />
      </section>
    </main>
  );
}
