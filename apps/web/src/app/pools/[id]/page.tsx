import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentActor } from '@/features/auth';
import { db } from '@/shared/db';
import {
  getPoolDetail,
  Leaderboard,
  InviteSection,
  ViewSection,
  OwnerControls,
  PoolBackupControls,
} from '@/features/pools';

type Props = { params: Promise<{ id: string }> };

export default async function PoolPage({ params }: Props): Promise<ReactElement> {
  const { id: poolId } = await params;

  const actor = await getCurrentActor();
  if (!actor) redirect('/');

  const detail = await getPoolDetail(db, poolId);
  if (!detail) notFound();

  const isOwner = actor.userId === detail.ownerId;
  const now = new Date();
  const locked = now >= detail.lockTime;

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/pools"
          className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors mb-2 inline-block"
        >
          ← Pools
        </Link>
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

      {/* Predict shortcut */}
      <Link
        href={`/pools/${poolId}/predict`}
        className="flex items-center justify-between px-4 py-3 rounded-[var(--radius)] border border-[var(--green-300)] bg-[var(--green-050)] text-[var(--green-700)] hover:bg-[var(--green-050)]/80 transition-colors"
      >
        <span className="text-sm font-semibold">
          {locked ? 'View my predictions' : 'Fill in my predictions'}
        </span>
        <span aria-hidden="true">→</span>
      </Link>

      {/* Scoring guide link */}
      <Link
        href={`/pools/${poolId}/scoring`}
        className="flex items-center justify-between px-4 py-2.5 rounded-[var(--radius)] border border-[var(--line)] bg-white text-[var(--ink-soft)] hover:text-[var(--ink)] hover:border-[var(--line-soft)] transition-colors shadow-[var(--shadow-sm)]"
      >
        <span className="text-sm">How are points calculated?</span>
        <span aria-hidden="true" className="text-[var(--ink-muted)]">
          →
        </span>
      </Link>

      {/* Leaderboard */}
      <Leaderboard
        entries={detail.leaderboard}
        currentUserId={actor.userId}
        poolId={poolId}
        isOwner={isOwner}
        locked={locked}
      />

      {/* Invite section */}
      <InviteSection poolId={poolId} token={detail.inviteToken} isOwner={isOwner} />

      {/* View link */}
      <ViewSection poolId={poolId} token={detail.viewToken} isOwner={isOwner} />

      {/* Owner controls */}
      {isOwner && (
        <>
          <OwnerControls
            poolId={poolId}
            members={detail.leaderboard}
            currentUserId={actor.userId}
          />
          <PoolBackupControls poolId={poolId} />
        </>
      )}
    </main>
  );
}
