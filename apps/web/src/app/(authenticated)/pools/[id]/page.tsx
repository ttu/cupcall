import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { isMember } from '@cup/db';
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
import { StageBar, buildRaceChartData, RaceChart } from '@/features/results';
import { Chip, Icon } from '@/shared/ui';

type Props = { params: Promise<{ id: string }> };

export default async function PoolPage({ params }: Props): Promise<ReactElement> {
  const { id: poolId } = await params;

  const actor = await getCurrentActor();
  if (!actor) redirect('/');

  const detail = await getPoolDetail(db, poolId);
  if (!detail) notFound();

  if (!(await isMember(db, poolId, actor.userId))) notFound();

  const isOwner = actor.userId === detail.ownerId;
  const now = new Date();
  const locked = now >= detail.lockTime;
  const myEntry = detail.leaderboard.find((e) => e.userId === actor.userId);
  const myRank = myEntry ? detail.leaderboard.indexOf(myEntry) + 1 : null;
  const raceChart = locked ? buildRaceChartData(detail.leaderboard, actor.userId) : null;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow" style={{ color: 'var(--ink-muted)', marginBottom: 10 }}>
          <Link href="/pools" style={{ color: 'inherit', textDecoration: 'none' }}>
            Pools
          </Link>{' '}
          · Leaderboard
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
        style={{
          display: 'grid',
          gap: 24,
          alignItems: 'start',
        }}
        className="md:grid-cols-[1fr_300px]"
      >
        {/* Left: Leaderboard + Points Race chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
          {/* Your standing */}
          {myEntry && myRank && (
            <div
              className="card"
              style={{
                background: 'var(--green-050)',
                border: '1px solid var(--green-300)',
                padding: 18,
              }}
            >
              <div className="eyebrow" style={{ color: 'var(--green-700)', marginBottom: 10 }}>
                Your standing
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span className="display" style={{ fontSize: 44, color: 'var(--green-700)' }}>
                  #{myRank}
                </span>
                <span className="display" style={{ fontSize: 24, color: 'var(--ink)' }}>
                  {myEntry.pointsTotal}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-700)' }}>
                  pts
                </span>
              </div>
              {myEntry.completionPercent !== null && myEntry.completionPercent < 100 && (
                <div style={{ marginTop: 10 }}>
                  <div className="bar" style={{ marginBottom: 4 }}>
                    <i style={{ width: `${myEntry.completionPercent}%` }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--green-700)', fontWeight: 700 }}>
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

          {/* My card / predictions — bold primary (top action pre-lock) */}
          <Link
            href={`/pools/${poolId}/predict`}
            data-testid="pool-predict-link"
            style={{
              padding: '18px 18px',
              borderRadius: 14,
              background: 'var(--green-500)',
              color: 'oklch(0.18 0.02 160)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              textDecoration: 'none',
              boxShadow: '0 10px 30px -16px var(--green-500)',
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
              <Icon name="card" size={22} color="currentColor" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.005em' }}>
                {locked ? 'View my card' : 'My predictions'}
              </div>
              <div style={{ fontSize: 12, opacity: 0.78, marginTop: 2, fontWeight: 600 }}>
                {locked ? 'See your locked picks' : 'Fill in your picks'}
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

      {/* Owner controls — full width below */}
      {isOwner && (
        <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <OwnerControls
            poolId={poolId}
            members={detail.leaderboard}
            currentUserId={actor.userId}
          />
          <PoolBackupControls poolId={poolId} />
        </div>
      )}
    </div>
  );
}
