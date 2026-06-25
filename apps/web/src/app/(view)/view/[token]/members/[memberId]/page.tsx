import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { getPoolByViewToken, getTournamentById, getUserById } from '@cup/db';
import { db } from '@/shared/db';
import { userId } from '@cup/engine';
import { getCardView, ReadOnlyCard } from '@/features/predictions';
import type { MatchScore } from '@/features/predictions';
import { getResultsView } from '@/features/results';
import { BackLink } from '@/shared/ui';

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

  const [memberUser, resultsView] = await Promise.all([
    getUserById(db, memberUid),
    getResultsView({ db, poolId: pool.id, userId: memberUid, now }),
  ]);
  const memberName = memberUser?.displayName ?? memberUser?.email ?? memberId;
  const matchScores = new Map<string, MatchScore>(
    resultsView?.groupResults.flatMap((g) =>
      g.completedMatches.map((m) => [m.matchId, { hit: m.hit, points: m.pointsAwarded }]),
    ) ?? [],
  );

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <div className="eyebrow mb-1.5">
          <BackLink href={`/view/${token}`}>{pool.name}</BackLink>
        </div>
        <h1 className="text-2xl font-bold text-ink font-cup-display">
          {memberName}&apos;s Predictions
        </h1>
      </div>

      <ReadOnlyCard card={card} matchScores={matchScores} />
    </main>
  );
}
