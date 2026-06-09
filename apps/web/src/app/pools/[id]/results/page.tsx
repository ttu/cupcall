import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { isMember } from '@cup/db';
import { getCurrentActor } from '@/features/auth';
import { db } from '@/shared/db';
import { getResultsView, StageBar, UserScoreChip, ResultsPageClient } from '@/features/results';

type Props = { params: Promise<{ id: string }> };

export default async function ResultsPage({ params }: Props): Promise<ReactElement> {
  const { id: poolId } = await params;

  const actor = await getCurrentActor();
  if (!actor) redirect('/');

  if (!(await isMember(db, poolId, actor.userId))) notFound();

  const view = await getResultsView({
    db,
    poolId,
    userId: actor.userId,
    now: new Date(),
  });
  if (!view) notFound();

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href={`/pools/${poolId}`}
            className="text-xs font-semibold mb-2 inline-block transition-colors hover:text-(--ink)"
            style={{ color: 'var(--ink-muted)' }}
          >
            ← {view.poolName}
          </Link>
          <p
            className="text-xs font-bold uppercase tracking-wider mb-1"
            style={{ color: 'var(--green-600)' }}
          >
            {view.poolName} · Results &amp; standings
          </p>
          <h1
            className="text-3xl font-black"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}
          >
            The Cup, as it unfolds
          </h1>
        </div>
        {view.userRank && <UserScoreChip rank={view.userRank} />}
      </div>

      {/* Stage progress bar */}
      <StageBar stages={view.stageProgress} />

      {/* Main content: tabs + panels */}
      <ResultsPageClient view={view} />
    </main>
  );
}
