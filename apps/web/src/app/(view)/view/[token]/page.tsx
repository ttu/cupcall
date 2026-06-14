import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPoolByViewToken } from '@cup/db';
import { db } from '@/shared/db';
import { getPoolDetail, Leaderboard } from '@/features/pools';
import { StageBar, RaceChart } from '@/features/results';
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
  const raceChart = locked ? detail.raceChart : null;

  return (
    <div className="max-w-275 mx-auto p-[28px_20px]">
      {/* Page header */}
      <div className="mb-6">
        <div className="eyebrow text-ink-muted mb-2.5">Leaderboard</div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="display text-[34px] m-0">{detail.name}</h1>
            <div className="eyebrow text-ink-muted mt-1">{detail.tournamentName}</div>
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
          />
          {raceChart && (
            <Link
              href={`/view/${token}/results?tab=race`}
              data-testid="view-race-preview"
              className="block no-underline text-inherit"
            >
              <div className="card p-[14px_18px_12px] cursor-pointer">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="section-label">Points Race</span>
                  <span className="text-xs font-bold text-ink-muted">View full →</span>
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
        <div className="flex flex-col gap-4">
          {/* Results shortcut */}
          <Link
            href={`/view/${token}/results`}
            data-testid="view-results-link"
            className="p-4.5 rounded-cup bg-orange-500 text-[oklch(0.22_0.03_50)] flex items-center gap-3.5 no-underline shadow-[0_10px_30px_-16px_var(--orange-500)]"
          >
            <span
              aria-hidden
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[rgba(0,0,0,0.12)] shrink-0"
            >
              <Icon name="trophy" size={22} color="currentColor" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-base tracking-[-0.005em]">
                Results &amp; standings
              </div>
              <div className="text-xs opacity-[0.78] mt-0.5 font-semibold">
                Scores, groups &amp; knockout
              </div>
            </div>
            <Icon name="arrow" size={18} color="currentColor" />
          </Link>

          {/* Tournament timeline */}
          {detail.stageProgress.length > 0 && (
            <div className="card p-[14px_16px_0] overflow-x-auto">
              <StageBar stages={detail.stageProgress} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
