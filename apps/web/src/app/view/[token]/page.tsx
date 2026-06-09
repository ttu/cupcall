import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { getPoolByViewToken } from '@cup/db';
import { db } from '@/shared/db';
import { getPoolDetail, Leaderboard } from '@/features/pools';

type Props = { params: Promise<{ token: string }> };

export default async function ViewPage({ params }: Props): Promise<ReactElement> {
  const { token } = await params;

  const pool = await getPoolByViewToken(db, token);
  if (!pool) notFound();

  const detail = await getPoolDetail(db, pool.id);
  if (!detail) notFound();

  const now = new Date();
  const locked = now >= detail.lockTime;

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1
          className="text-2xl font-bold text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {detail.name}
        </h1>
        <p className="text-sm text-[var(--ink-soft)] mt-0.5">
          {detail.tournamentName}
          {locked && (
            <span className="ml-2 text-xs font-medium text-[var(--ink-muted)]">· 🔒 Locked</span>
          )}
        </p>
      </div>

      <Leaderboard
        entries={detail.leaderboard}
        currentUserId={null}
        poolId={pool.id}
        isOwner={false}
        locked={true}
        viewToken={token}
      />
    </main>
  );
}
