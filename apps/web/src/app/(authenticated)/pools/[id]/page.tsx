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
  PoolBackupControls,
} from '@/features/pools';
import { StageBar } from '@/features/results';
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
          <h1 className="display" style={{ fontSize: 34, margin: 0 }}>
            {detail.name}
          </h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {locked && (
              <span className="pill-lock">
                <Icon name="lock" size={11} />
                Locked
              </span>
            )}
            <Link
              href={`/pools/${poolId}/predict`}
              className="btn btn-primary sm"
              style={{ textDecoration: 'none' }}
            >
              {locked ? 'View my card' : 'My predictions'}
            </Link>
          </div>
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
        {/* Left: Leaderboard */}
        <Leaderboard
          entries={detail.leaderboard}
          currentUserId={actor.userId}
          poolId={poolId}
          isOwner={isOwner}
          locked={locked}
        />

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

          {/* Results shortcut */}
          <Link
            href={`/pools/${poolId}/results`}
            className="card"
            style={{
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              textDecoration: 'none',
              color: 'var(--ink)',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Results &amp; standings</div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>
                Live match feed
              </div>
            </div>
            <Icon name="arrow" size={18} color="var(--ink-muted)" />
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
        </div>
      </div>

      {/* Owner controls — full width below */}
      {isOwner && (
        <div style={{ marginTop: 32 }}>
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
