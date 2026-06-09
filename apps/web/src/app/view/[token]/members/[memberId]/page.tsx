import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPoolByViewToken, getTournamentById, getUserById } from '@cup/db';
import { db } from '@/shared/db';
import { userId } from '@cup/engine';
import { getCardView, ReadOnlyCard } from '@/features/predictions';

type Props = { params: Promise<{ token: string; memberId: string }> };

export default async function ViewMemberCardPage({ params }: Props): Promise<ReactElement> {
  const { token, memberId } = await params;

  const pool = await getPoolByViewToken(db, token);
  if (!pool) notFound();

  const tournament = await getTournamentById(db, pool.tournamentId);
  if (!tournament?.definition) notFound();

  const memberUid = userId(memberId);
  const now = new Date();

  const card = await getCardView({
    db,
    poolId: pool.id,
    userId: memberUid,
    tournamentId: pool.tournamentId,
    tournament: tournament.definition,
    firstKickoff: tournament.firstKickoff,
    now,
    createIfMissing: false,
  });
  if (!card) notFound();

  const memberUser = await getUserById(db, memberUid);
  const memberName = memberUser?.displayName ?? memberUser?.email ?? memberId;

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <Link
          href={`/view/${token}`}
          className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors mb-1 inline-block"
        >
          ← {pool.name}
        </Link>
        <h1
          className="text-2xl font-bold text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {memberName}&apos;s Predictions
        </h1>
      </div>

      <ReadOnlyCard card={card} />
    </main>
  );
}
