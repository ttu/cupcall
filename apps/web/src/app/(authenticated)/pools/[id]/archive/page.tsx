import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import { isMember, getPoolById, getTournamentById } from '@cup/db';
import { getCurrentActor } from '@/features/auth';
import { db } from '@/shared/db';
import { getPoolArchiveView, ArchivePoolCard, ArchiveMemberRow } from '@/features/pool-archive';
import { BackLink } from '@/shared/ui';
import { poolId as asPoolId } from '@cup/engine';

type Props = { params: Promise<{ id: string }> };

export default async function PoolArchivePage({ params }: Props): Promise<ReactElement> {
  const { id } = await params;
  const poolId = asPoolId(id);

  const actor = await getCurrentActor();
  if (!actor) redirect('/');
  if (!(await isMember(db, poolId, actor.userId))) notFound();

  const pool = await getPoolById(db, poolId);
  if (!pool) notFound();

  const [archive, tournament] = await Promise.all([
    getPoolArchiveView(db, poolId),
    getTournamentById(db, pool.tournamentId),
  ]);

  const isOwner = actor.userId === pool.ownerId;
  const scoring = tournament?.scoringConfig ?? null;

  return (
    <div className="max-w-275 mx-auto p-[28px_20px]">
      <div className="eyebrow text-ink-muted mb-2 flex items-center gap-1.5">
        <BackLink href={`/pools/${poolId}`}>{pool.name}</BackLink>
        <span>· Archive</span>
      </div>
      <h1 className="display text-[34px] mb-5">Final standings</h1>

      <div className="mb-5">
        <ArchivePoolCard
          poolId={poolId}
          isOwner={isOwner}
          archivedAt={archive?.archivedAt ?? null}
        />
      </div>

      {!archive ? (
        <p className="text-sm text-ink-muted">This pool hasn&apos;t been archived yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-ink-muted">
            Archived on {archive.archivedAt.toLocaleDateString()} — {archive.tournamentName}
          </p>
          {archive.entries.map((entry) => (
            <ArchiveMemberRow
              key={entry.userId ?? entry.displayName}
              entry={entry}
              scoring={scoring}
            />
          ))}
        </div>
      )}
    </div>
  );
}
