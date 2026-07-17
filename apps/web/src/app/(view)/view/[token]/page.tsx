import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { getPoolByViewToken } from '@cup/db';
import { db } from '@/shared/db';
import { getPoolDetail, Leaderboard, PoolHeader, RaceChartPreview } from '@/features/pools';
import { StageBar } from '@/features/results';
import { QuickActionLink } from '@/shared/ui';

type Props = { params: Promise<{ token: string }> };

export default async function ViewPage({ params }: Props): Promise<ReactElement> {
  const { token } = await params;

  const pool = await getPoolByViewToken(db, token);
  if (!pool) notFound();

  const detail = await getPoolDetail(db, pool.id);
  if (!detail) notFound();

  const now = new Date();
  const locked = now >= detail.lockTime;
  const raceChart = locked ? detail.raceChart : null;

  return (
    <div className="max-w-275 mx-auto p-[28px_20px]">
      {/* Page header */}
      <PoolHeader
        eyebrow="Leaderboard"
        name={detail.name}
        tournamentName={detail.tournamentName}
        locked={locked}
      />

      {/* Two-column layout */}
      <div className="grid gap-6 items-start md:grid-cols-[1fr_300px]">
        {/* Left: Leaderboard + Points Race chart */}
        <div className="flex flex-col gap-4">
          <Leaderboard
            entries={detail.leaderboard}
            currentUserId={null}
            poolId={pool.id}
            isOwner={false}
            locked={locked}
            viewToken={token}
            lastDayPoints={detail.lastDayPoints}
          />
          {raceChart && (
            <RaceChartPreview
              href={`/view/${token}/results?tab=race`}
              testId="view-race-preview"
              raceChart={raceChart}
            />
          )}
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-4">
          {/* Results shortcut */}
          <QuickActionLink
            href={`/view/${token}/results`}
            testId="view-results-link"
            variant="orange"
            iconName="trophy"
            title="Results & standings"
            subtitle="Scores, groups & knockout"
          />

          {/* Tournament timeline */}
          {detail.stageProgress.length > 0 && (
            <div className="card p-[14px_16px_0]">
              <StageBar stages={detail.stageProgress} vertical />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
