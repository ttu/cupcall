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
import { SectionLabel, Icon } from '@/shared/ui';

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
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 28,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <h1 className="display" style={{ fontSize: 36, margin: 0 }}>
          Your Pools
        </h1>
        <a href="#create-pool" className="btn btn-primary sm" style={{ textDecoration: 'none' }}>
          + New pool
        </a>
      </div>

      {/* Pool list */}
      {pools.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 36 }}>
          {pools.map((pool) => (
            <PoolListItem key={pool.id} pool={pool} isOwner={pool.ownerId === actor.userId} />
          ))}
        </div>
      ) : (
        <div
          className="card"
          style={{ padding: '32px 24px', textAlign: 'center', marginBottom: 36 }}
        >
          <p style={{ color: 'var(--ink-soft)', fontSize: 14, margin: 0 }}>
            You haven&apos;t joined any pools yet. Create one below or use an invite link to join.
          </p>
        </div>
      )}

      {/* Guest-only: connect email + personal login link */}
      {!user?.email && <ConnectEmailForm />}
      {myLoginToken && <MyLoginLink token={myLoginToken} baseUrl={baseUrl} />}

      {/* Create a new pool */}
      <div id="create-pool" style={{ marginBottom: 14 }}>
        <SectionLabel icon={<Icon name="plus" size={13} color="var(--ink-muted)" />}>
          Create a pool
        </SectionLabel>
      </div>
      <div className="card" style={{ padding: 24 }}>
        <CreatePoolForm tournaments={allTournaments.map((t) => ({ id: t.id, name: t.name }))} />
      </div>
    </div>
  );
}
