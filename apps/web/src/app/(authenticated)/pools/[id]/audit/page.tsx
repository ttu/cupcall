import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getPoolById, getTournamentById, listEditsForPool } from '@cup/db';
import { db } from '@/shared/db';
import { getCurrentActor } from '@/features/auth';
import { poolId as asPoolId } from '@cup/engine';
import { AuditLog } from '@/features/predictions';
import type { AuditEntry } from '@/features/predictions';
import { BackLink } from '@/shared/ui';

type Props = { params: Promise<{ id: string }> };

export default async function PoolAuditPage({ params }: Props): Promise<ReactElement> {
  const { id } = await params;
  const poolId = asPoolId(id);

  const actor = await getCurrentActor();
  if (!actor) redirect('/');

  const pool = await getPoolById(db, poolId);
  if (!pool) notFound();

  if (actor.userId !== pool.ownerId) notFound();

  const tournament = await getTournamentById(db, pool.tournamentId);
  if (!tournament?.definition) notFound();

  const edits = await listEditsForPool(db, poolId);

  // Group entries by target user so we can show sections
  const byTarget = new Map<string, { name: string; entries: AuditEntry[] }>();
  for (const e of edits) {
    const uid = e.targetUserId as string;
    if (!byTarget.has(uid)) {
      byTarget.set(uid, { name: e.targetName, entries: [] });
    }
    byTarget.get(uid)!.entries.push({
      id: e.id,
      editorName: e.editorName,
      fieldPath: e.fieldPath,
      oldValue: e.oldValue,
      newValue: e.newValue,
      ...(e.reason !== null ? { reason: e.reason } : {}),
      source: e.source,
      editedAt: e.editedAt,
    });
  }

  return (
    <main className="max-w-215 mx-auto p-[28px_20px] flex flex-col gap-6">
      <div>
        <div className="eyebrow text-ink-muted mb-2 flex items-center gap-1.5">
          <BackLink href={`/pools/${poolId}`}>{pool.name}</BackLink>
          <span>· Audit log</span>
        </div>
        <h1 className="display text-[34px] m-0">Edit History</h1>
      </div>

      {byTarget.size === 0 ? (
        <p className="text-sm text-ink-muted">No owner edits recorded yet.</p>
      ) : (
        [...byTarget.entries()].map(([uid, { name, entries }]) => (
          <section key={uid} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="section-label">{name}</span>
              <Link
                href={`/pools/${poolId}/members/${uid}`}
                className="text-xs text-ink-muted underline"
              >
                View card →
              </Link>
            </div>
            <AuditLog entries={entries} context={{ tournament: tournament.definition! }} />
          </section>
        ))
      )}
    </main>
  );
}
