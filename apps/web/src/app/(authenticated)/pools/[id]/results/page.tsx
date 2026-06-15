import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import { isMember } from '@cup/db';
import { getCurrentActor } from '@/features/auth';
import { db } from '@/shared/db';
import { getResultsView, StageBar, ResultsPageClient } from '@/features/results';
import { BackLink } from '@/shared/ui';
import { poolId as asPoolId } from '@cup/engine';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> };

export default async function ResultsPage({ params, searchParams }: Props): Promise<ReactElement> {
  const { id } = await params;
  const poolId = asPoolId(id);
  const { tab } = await searchParams;

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
    <div className="max-w-350 mx-auto p-[28px_20px]">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <div className="eyebrow text-ink-muted mb-2 flex items-center gap-1.5">
            <BackLink href={`/pools/${poolId}`}>{view.poolName}</BackLink>
            <span>· Results &amp; standings</span>
          </div>
          <h1 className="display text-[34px] m-0">The Cup, as it unfolds</h1>
        </div>

        {view.userRank && (
          <div className="flex items-center gap-4.5">
            <div className="text-right">
              <div className="eyebrow text-ink-muted">Your points</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="display text-[26px]">{view.userRank.points}</span>
              </div>
            </div>
            <span className="w-px h-9.5 bg-line" />
            <div className="text-right">
              <div className="eyebrow text-ink-muted">Rank</div>
              <span className="display text-[26px] text-green-600">#{view.userRank.rank}</span>
            </div>
          </div>
        )}
      </div>

      {/* Stage progress bar */}
      <StageBar stages={view.stageProgress} />

      {/* Main content: tabs + panels */}
      <ResultsPageClient
        view={view}
        initialTab={tab === 'race' || tab === 'knockout' ? tab : 'group'}
      />
    </div>
  );
}
