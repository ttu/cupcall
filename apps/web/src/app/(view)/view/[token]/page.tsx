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

  // Demo pools simulate a "you" so visitors feel like a participant, not an observer.
  const demoUserId = token.startsWith('demo-') ? detail.ownerId : null;
  const myIndex = demoUserId ? detail.leaderboard.findIndex((e) => e.userId === demoUserId) : -1;
  const myEntry = myIndex >= 0 ? detail.leaderboard[myIndex] : undefined;
  const myRank = myIndex >= 0 ? myIndex + 1 : null;

  return (
    <div className="max-w-275 mx-auto p-[28px_20px]">
      {/* Page header */}
      <PoolHeader
        eyebrow="Leaderboard"
        name={detail.name}
        tournamentName={detail.tournamentName}
        locked={locked}
      />

      {/* Your standing — mobile only (above grid) */}
      {myEntry && myRank && (
        <div className="card bg-green-050 border border-green-300 p-4.5 mb-6 md:hidden">
          <div className="eyebrow text-green-700 mb-2.5">Your standing</div>
          <div className="flex items-baseline gap-2.5">
            <span className="display text-[44px] text-green-700">#{myRank}</span>
            <span className="display text-[24px] text-ink">{myEntry.pointsTotal}</span>
            <span className="text-xs font-bold text-green-700">pts</span>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid gap-6 items-start md:grid-cols-[1fr_300px]">
        {/* Left: Leaderboard + Points Race chart */}
        <div className="flex flex-col gap-4">
          <Leaderboard
            entries={detail.leaderboard}
            currentUserId={demoUserId}
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
          {/* Your standing — desktop only */}
          {myEntry && myRank && (
            <div className="card bg-green-050 border border-green-300 p-4.5 hidden md:block">
              <div className="eyebrow text-green-700 mb-2.5">Your standing</div>
              <div className="flex items-baseline gap-2.5">
                <span className="display text-[44px] text-green-700">#{myRank}</span>
                <span className="display text-[24px] text-ink">{myEntry.pointsTotal}</span>
                <span className="text-xs font-bold text-green-700">pts</span>
              </div>
            </div>
          )}

          {/* Results shortcut */}
          <QuickActionLink
            href={`/view/${token}/results`}
            testId="view-results-link"
            variant="orange"
            iconName="trophy"
            title="Results & standings"
            subtitle="Scores, groups & knockout"
          />

          {/* View my card — demo only */}
          {demoUserId && (
            <QuickActionLink
              href={`/view/${token}/members/${demoUserId}`}
              testId="view-my-card-link"
              variant="green"
              iconName="card"
              title="View my card"
              subtitle="See your locked picks"
            />
          )}

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
