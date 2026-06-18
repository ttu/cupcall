import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { isMember, hasEditsForPool } from '@cup/db';
import { getCurrentActor } from '@/features/auth';
import { db } from '@/shared/db';
import {
  getPoolDetail,
  Leaderboard,
  InviteSection,
  ViewSection,
  OwnerControls,
  MemberControls,
  PoolBackupControls,
} from '@/features/pools';
import { StageBar, RaceChart } from '@/features/results';
import { Chip, Icon } from '@/shared/ui';
import { poolId as asPoolId } from '@cup/engine';

type Props = { params: Promise<{ id: string }> };

export default async function PoolPage({ params }: Props): Promise<ReactElement> {
  const { id } = await params;
  const poolId = asPoolId(id);

  const actor = await getCurrentActor();
  if (!actor) redirect('/');

  const [detail, memberResult] = await Promise.all([
    getPoolDetail(db, poolId),
    isMember(db, poolId, actor.userId),
  ]);
  if (!detail) notFound();
  if (!memberResult) notFound();

  const isOwner = actor.userId === detail.ownerId;
  const hasEdits = isOwner ? await hasEditsForPool(db, poolId) : false;
  const now = new Date();
  const locked = now >= detail.lockTime;
  const myIndex = detail.leaderboard.findIndex((e) => e.userId === actor.userId);
  const myEntry = myIndex >= 0 ? detail.leaderboard[myIndex] : undefined;
  const myRank = myIndex >= 0 ? myIndex + 1 : null;
  const raceChart = locked ? detail.raceChart : null;

  return (
    <div className="max-w-275 mx-auto p-[28px_20px]">
      {/* Page header */}
      <div className="mb-6">
        <div className="eyebrow text-ink-muted mb-2.5">
          <Link href="/pools" className="text-inherit no-underline">
            Pools
          </Link>{' '}
          · Leaderboard
        </div>
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
        <div className="flex flex-col gap-4 min-w-0">
          <Leaderboard
            entries={detail.leaderboard}
            currentUserId={actor.userId}
            poolId={poolId}
            isOwner={isOwner}
            locked={locked}
          />
          {raceChart && (
            <Link
              href={`/pools/${poolId}/results?tab=race`}
              data-testid="pool-race-preview"
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
        <div className="flex flex-col gap-4 min-w-0">
          {/* Your standing */}
          {myEntry && myRank && (
            <div className="card bg-green-050 border border-green-300 p-4.5">
              <div className="eyebrow text-green-700 mb-2.5">Your standing</div>
              <div className="flex items-baseline gap-2.5">
                <span className="display text-[44px] text-green-700">#{myRank}</span>
                <span className="display text-[24px] text-ink">{myEntry.pointsTotal}</span>
                <span className="text-xs font-bold text-green-700">pts</span>
              </div>
              {myEntry.completionPercent !== null && myEntry.completionPercent < 100 && (
                <div className="mt-2.5">
                  <div className="bar mb-1">
                    <i style={{ width: `${myEntry.completionPercent}%` }} />
                  </div>
                  <div className="text-[11px] text-green-700 font-bold">
                    {myEntry.completionPercent}% filled
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results shortcut — bold accent (top action during tournament) */}
          <Link
            href={`/pools/${poolId}/results`}
            data-testid="pool-results-link"
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

          {/* My card / predictions — bold primary (top action pre-lock) */}
          <Link
            href={`/pools/${poolId}/predict`}
            data-testid="pool-predict-link"
            className="p-4.5 rounded-cup bg-green-500 text-[oklch(0.18_0.02_160)] flex items-center gap-3.5 no-underline shadow-[0_10px_30px_-16px_var(--green-500)]"
          >
            <span
              aria-hidden
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[rgba(0,0,0,0.12)] shrink-0"
            >
              <Icon name="card" size={22} color="currentColor" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-base tracking-[-0.005em]">
                {locked ? 'View my card' : 'My predictions'}
              </div>
              <div className="text-xs opacity-[0.78] mt-0.5 font-semibold">
                {locked ? 'See your locked picks' : 'Fill in your picks'}
              </div>
            </div>
            <Icon name="arrow" size={18} color="currentColor" />
          </Link>

          {/* Tournament timeline */}
          {detail.stageProgress.length > 0 && (
            <div className="card p-[14px_16px_0]">
              <StageBar stages={detail.stageProgress} vertical />
            </div>
          )}

          {/* Invite section */}
          <InviteSection
            poolId={poolId}
            token={detail.inviteToken}
            isOwner={isOwner}
            baseUrl={process.env.AUTH_URL ?? ''}
          />

          {/* View link */}
          <ViewSection
            poolId={poolId}
            token={detail.viewToken}
            isOwner={isOwner}
            baseUrl={process.env.AUTH_URL ?? ''}
          />

          {/* Leave pool (non-owners only) */}
          {!isOwner && <MemberControls poolId={poolId} />}
        </div>
      </div>

      {/* Owner controls + backup — full width below */}
      <div className="mt-8 flex flex-col gap-4">
        {isOwner && (
          <OwnerControls
            poolId={poolId}
            members={detail.leaderboard}
            currentUserId={actor.userId}
          />
        )}
        <PoolBackupControls poolId={poolId} isOwner={isOwner} />
        {hasEdits && (
          <div className="rounded-cup border border-line bg-white shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="px-4 py-2.5 turf">
              <span className="text-sm font-bold tracking-widest uppercase text-on-dark font-cup-display">
                Edit History
              </span>
            </div>
            <div className="px-4 py-4 space-y-3">
              <p className="text-xs text-ink-muted">
                Owner edits to member predictions are logged. View the full audit trail.
              </p>
              <Link
                href={`/pools/${poolId}/audit`}
                className="inline-block text-xs font-medium px-3 py-1.5 rounded-lg border border-line bg-white text-ink-soft hover:text-ink hover:border-ink-muted transition-colors no-underline"
              >
                View full edit history
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
