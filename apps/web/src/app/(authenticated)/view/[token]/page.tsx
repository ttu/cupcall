import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPoolByViewToken } from '@cup/db';
import { db } from '@/shared/db';
import { getPoolDetail, Leaderboard } from '@/features/pools';
import { StageBar, buildRaceChartData, RaceChart } from '@/features/results';
import { Icon } from '@/shared/ui';

type Props = { params: Promise<{ token: string }> };

export default async function ViewPage({ params }: Props): Promise<ReactElement> {
  const { token } = await params;

  const pool = await getPoolByViewToken(db, token);
  if (!pool) notFound();

  const detail = await getPoolDetail(db, pool.id);
  if (!detail) notFound();

  const now = new Date();
  const locked = now >= detail.lockTime;
  const raceChart = locked ? buildRaceChartData(detail.leaderboard, null) : null;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow" style={{ color: 'var(--ink-muted)', marginBottom: 10 }}>
          Leaderboard
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 className="display" style={{ fontSize: 34, margin: 0 }}>
              {detail.name}
            </h1>
            <div className="eyebrow" style={{ color: 'var(--ink-muted)', marginTop: 4 }}>
              {detail.tournamentName}
            </div>
          </div>
          {locked && (
            <span className="pill-lock">
              <Icon name="lock" size={14} />
              Locked
            </span>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div
        style={{ display: 'grid', gap: 24, alignItems: 'start' }}
        className="md:grid-cols-[1fr_300px]"
      >
        {/* Left: Leaderboard + Points Race chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Leaderboard
            entries={detail.leaderboard}
            currentUserId={null}
            poolId={pool.id}
            isOwner={false}
            locked={locked}
            viewToken={token}
          />
          {raceChart && (
            <Link
              href={`/view/${token}/results?tab=race`}
              data-testid="view-race-preview"
              style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
            >
              <div className="card" style={{ padding: '14px 18px 12px', cursor: 'pointer' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                  }}
                >
                  <span className="section-label">Points Race</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-muted)' }}>
                    View full →
                  </span>
                </div>
                <RaceChart
                  stages={raceChart.chartStages}
                  nowIndex={raceChart.chartNowIndex}
                  players={raceChart.chartPlayers}
                />
              </div>
            </Link>
          )}
        </div>

        {/* Right rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Results shortcut */}
          <Link
            href={`/view/${token}/results`}
            data-testid="view-results-link"
            style={{
              padding: '18px 18px',
              borderRadius: 14,
              background: 'var(--orange-500)',
              color: 'oklch(0.22 0.03 50)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              textDecoration: 'none',
              boxShadow: '0 10px 30px -16px var(--orange-500)',
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: 999,
                background: 'rgba(0, 0, 0, 0.12)',
                flexShrink: 0,
              }}
            >
              <Icon name="trophy" size={22} color="currentColor" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.005em' }}>
                Results &amp; standings
              </div>
              <div style={{ fontSize: 12, opacity: 0.78, marginTop: 2, fontWeight: 600 }}>
                Live match feed
              </div>
            </div>
            <Icon name="arrow" size={18} color="currentColor" />
          </Link>

          {/* Tournament timeline */}
          {detail.stageProgress.length > 0 && (
            <div className="card" style={{ padding: '14px 16px 0', overflowX: 'auto' }}>
              <StageBar stages={detail.stageProgress} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
