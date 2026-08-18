import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { getPoolByViewToken } from '@cup/db';
import { db } from '@/shared/db';
import { getResultsView, StageBar, ResultsPageClient } from '@/features/results';
import { BackLink } from '@/shared/ui';

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string>> };

export default async function ViewResultsPage({
  params,
  searchParams,
}: Props): Promise<ReactElement> {
  const { token } = await params;
  const { tab } = await searchParams;

  const pool = await getPoolByViewToken(db, token);
  if (!pool) notFound();

  // Demo checkpoints personalize the view as the pool owner, so the owner-facing bracket
  // health / points breakdown panels should render too — real shared view links have no
  // associated user and stay in read-only viewer mode.
  const isDemo = token.startsWith('demo-');

  const view = await getResultsView({
    db,
    poolId: pool.id,
    ...(isDemo && { userId: pool.ownerId }),
    now: new Date(),
  });
  if (!view) notFound();

  const defaultTab = view.currentStage !== 'group' ? 'knockout' : 'group';
  const resolvedTab =
    tab === 'group' || tab === 'knockout' || tab === 'specials' || tab === 'race'
      ? tab
      : defaultTab;

  const leader = view.leaderboard[0] ?? null;

  return (
    <div className="max-w-350 mx-auto p-[28px_20px]">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <div className="eyebrow text-ink-muted mb-2 flex items-center gap-1.5">
            <BackLink href={`/view/${token}`}>{view.poolName}</BackLink>
            <span>· Results &amp; standings</span>
          </div>
          <h1 className="display text-[34px] m-0">The Cup, as it unfolds</h1>
        </div>

        {leader && (
          <div className="flex items-center gap-4.5">
            <div className="text-right">
              <div className="eyebrow text-ink-muted">Leader</div>
              <div className="display text-[22px] mt-1 max-w-45 truncate">{leader.displayName}</div>
            </div>
            <span className="w-px h-9.5 bg-line" />
            <div className="text-right">
              <div className="eyebrow text-ink-muted">Points</div>
              <span className="display text-[26px] text-green-600">{leader.pointsTotal}</span>
            </div>
          </div>
        )}
      </div>

      {/* Stage progress bar */}
      <StageBar stages={view.stageProgress} />

      {/* Main content: tabs + panels */}
      <ResultsPageClient view={view} initialTab={resolvedTab} viewerMode={!isDemo} />
    </div>
  );
}
