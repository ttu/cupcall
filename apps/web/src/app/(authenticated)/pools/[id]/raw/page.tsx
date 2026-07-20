import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getPoolById, getTournamentById, getMember } from '@cup/db';
import { db } from '@/shared/db';
import { getCurrentActor } from '@/features/auth';
import { getResultsView } from '@/features/results';
import { getCardView } from '@/features/predictions';
import { RawJsonBlock } from '@/features/admin';
import { BackLink, cn } from '@/shared/ui';
import { poolId as asPoolId, userId as asUserId } from '@cup/engine';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ userId?: string }>;
};

export default async function RawDataPage({ params, searchParams }: Props): Promise<ReactElement> {
  const { id } = await params;
  const { userId: userIdParam } = await searchParams;
  const poolId = asPoolId(id);

  const actor = await getCurrentActor();
  if (!actor) redirect('/');

  const pool = await getPoolById(db, poolId);
  if (!pool) notFound();
  // Owner-only: 404 (not 403) so pool existence/ownership isn't leaked to non-owners.
  if (actor.userId !== pool.ownerId) notFound();

  const tournament = await getTournamentById(db, pool.tournamentId);
  if (!tournament?.definition) notFound();

  const now = new Date();
  const ownResultsView = await getResultsView({ db, poolId, userId: actor.userId, now });
  if (!ownResultsView) notFound();

  // ownResultsView.leaderboard doubles as the member picker's data source — no separate query.
  const validMemberIds = new Set(ownResultsView.leaderboard.map((m) => m.userId as string));
  const selectedUserId = asUserId(
    userIdParam !== undefined && validMemberIds.has(userIdParam) ? userIdParam : actor.userId,
  );

  const [resultsView, memberRecord] = await Promise.all([
    selectedUserId === actor.userId
      ? Promise.resolve(ownResultsView)
      : getResultsView({ db, poolId, userId: selectedUserId, now }),
    getMember(db, poolId, selectedUserId),
  ]);
  if (!resultsView) notFound();

  const cardView = await getCardView({
    db,
    poolId,
    userId: selectedUserId,
    tournamentId: pool.tournamentId,
    tournament: tournament.definition,
    firstKickoff: tournament.firstKickoff,
    now,
    createIfMissing: false,
    ...(memberRecord ? { joinedAt: memberRecord.joinedAt } : {}),
  });

  return (
    <main className="max-w-215 mx-auto p-[28px_20px] flex flex-col gap-5">
      <div>
        <div className="eyebrow text-ink-muted mb-2 flex items-center gap-1.5">
          <BackLink href={`/pools/${poolId}`}>{pool.name}</BackLink>
          <span>· Raw data (owner only)</span>
        </div>
        <h1 className="display text-[34px] m-0">Raw data</h1>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="raw-member-picker">
        {ownResultsView.leaderboard.map((member) => (
          <Link
            key={member.userId}
            href={`/pools/${poolId}/raw?userId=${member.userId}`}
            data-testid={`raw-member-link-${member.userId}`}
            aria-current={member.userId === selectedUserId ? 'page' : undefined}
            className={cn(
              'inline-block text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors no-underline',
              member.userId === selectedUserId
                ? 'border-ink bg-ink text-white'
                : 'border-line bg-white text-ink-soft hover:text-ink hover:border-ink-muted',
            )}
          >
            {member.displayName}
          </Link>
        ))}
      </div>

      <RawJsonBlock title="Card view" json={cardView} testId="raw-card-json" />
      <RawJsonBlock title="Results view" json={resultsView} testId="raw-results-json" />
    </main>
  );
}
