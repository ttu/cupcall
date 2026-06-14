import type { ReactElement } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentActor, ConnectEmailForm } from '@/features/auth';
import { db } from '@/shared/db';
import { getUserById, getLoginTokenByUserId, upsertLoginToken, listTournaments } from '@cup/db';
import {
  getUserPools,
  PoolListItem,
  CreatePoolForm,
  MyLoginLink,
  generateLoginToken,
} from '@/features/pools';
import { Button, SectionLabel, Icon } from '@/shared/ui';

export default async function PoolsPage(): Promise<ReactElement> {
  const actor = await getCurrentActor();
  if (!actor) redirect('/');

  const [pools, user, allTournaments] = await Promise.all([
    getUserPools(db, actor.userId),
    getUserById(db, actor.userId),
    listTournaments(db),
  ]);

  let myLoginToken: string | null = null;
  if (user && !user.email) {
    const existing = await getLoginTokenByUserId(db, actor.userId);
    const token = existing?.token ?? generateLoginToken();
    if (!existing) await upsertLoginToken(db, actor.userId, token);
    myLoginToken = token;
  }
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '';

  return (
    <div className="max-w-190 mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex justify-between items-center mb-7 gap-4 flex-wrap">
        <h1 className="display text-[36px] m-0">Your Pools</h1>
        <Button asChild variant="primary" size="sm">
          <a href="#create-pool">+ New pool</a>
        </Button>
      </div>

      {/* Pool list */}
      {pools.length > 0 ? (
        <div className="flex flex-col gap-2.5 mb-9">
          {pools.map((pool) => (
            <PoolListItem key={pool.id} pool={pool} isOwner={pool.ownerId === actor.userId} />
          ))}
        </div>
      ) : (
        <div className="card px-6 py-8 text-center mb-9">
          <p className="text-ink-soft text-sm m-0">
            You haven&apos;t joined any pools yet. Create one below or use an invite link to join.
          </p>
        </div>
      )}

      {/* Guest-only: connect email + personal login link */}
      {!user?.email && <ConnectEmailForm />}
      {myLoginToken && <MyLoginLink token={myLoginToken} baseUrl={baseUrl} />}

      {/* Create a new pool */}
      <div id="create-pool" className="mb-3.5">
        <SectionLabel icon={<Icon name="plus" size={13} color="var(--ink-muted)" />}>
          Create a pool
        </SectionLabel>
      </div>
      <div className="card p-6">
        <CreatePoolForm tournaments={allTournaments.map((t) => ({ id: t.id, name: t.name }))} />
      </div>
    </div>
  );
}
