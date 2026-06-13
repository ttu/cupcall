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

  const view = await getResultsView({
    db,
    poolId: pool.id,
    now: new Date(),
  });
  if (!view) notFound();

  const leader = view.leaderboard[0] ?? null;

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
            <BackLink href={`/view/${token}`}>{view.poolName}</BackLink>
            <span>· Results &amp; standings</span>
          </div>
          <h1 className="display" style={{ fontSize: 34, margin: 0 }}>
            The Cup, as it unfolds
          </h1>
        </div>

        {leader && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ textAlign: 'right' }}>
              <div className="eyebrow" style={{ color: 'var(--ink-muted)' }}>
                Leader
              </div>
              <div
                className="display"
                style={{
                  fontSize: 22,
                  marginTop: 4,
                  maxWidth: 180,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {leader.displayName}
              </div>
            </div>
            <span style={{ width: 1, height: 38, background: 'var(--line)' }} />
            <div style={{ textAlign: 'right' }}>
              <div className="eyebrow" style={{ color: 'var(--ink-muted)' }}>
                Points
              </div>
              <span className="display" style={{ fontSize: 26, color: 'var(--green-600)' }}>
                {leader.pointsTotal}
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
        viewerMode
      />
    </div>
  );
}
