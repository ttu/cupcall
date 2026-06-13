import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import { isMember } from '@cup/db';
import { getCurrentActor } from '@/features/auth';
import { db } from '@/shared/db';
import { getResultsView, StageBar, ResultsPageClient } from '@/features/results';
import { BackLink } from '@/shared/ui';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> };

export default async function ResultsPage({ params, searchParams }: Props): Promise<ReactElement> {
  const { id: poolId } = await params;
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
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 20px' }}>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        <div>
          <div
            className="eyebrow"
            style={{
              color: 'var(--ink-muted)',
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <BackLink href={`/pools/${poolId}`}>{view.poolName}</BackLink>
            <span>· Results &amp; standings</span>
          </div>
          <h1 className="display" style={{ fontSize: 34, margin: 0 }}>
            The Cup, as it unfolds
          </h1>
        </div>

        {view.userRank && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ textAlign: 'right' }}>
              <div className="eyebrow" style={{ color: 'var(--ink-muted)' }}>
                Your points
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span className="display" style={{ fontSize: 26 }}>
                  {view.userRank.points}
                </span>
              </div>
            </div>
            <span style={{ width: 1, height: 38, background: 'var(--line)' }} />
            <div style={{ textAlign: 'right' }}>
              <div className="eyebrow" style={{ color: 'var(--ink-muted)' }}>
                Rank
              </div>
              <span className="display" style={{ fontSize: 26, color: 'var(--green-600)' }}>
                #{view.userRank.rank}
              </span>
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
