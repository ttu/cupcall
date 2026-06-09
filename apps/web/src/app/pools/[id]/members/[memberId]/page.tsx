import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getPoolById,
  getTournamentById,
  getPrediction,
  listEditsForPrediction,
  getUserById,
} from '@cup/db';
import { db } from '@/shared/db';
import { getCurrentActor } from '@/features/auth';
import { canViewCard } from '@/shared/authz';
import {
  getCardView,
  ReadOnlyCard,
  OwnerCardEditor,
  OwnerEditBanner,
  AuditLog,
  ExportImportControls,
} from '@/features/predictions';
import type { AuditEntry } from '@/features/predictions';
import { userId } from '@cup/engine';

type Props = { params: Promise<{ id: string; memberId: string }> };

export default async function MemberCardPage({ params }: Props): Promise<ReactElement> {
  const { id: poolId, memberId } = await params;

  const actor = await getCurrentActor();
  if (!actor) redirect('/');

  const pool = await getPoolById(db, poolId);
  if (!pool) notFound();

  const tournament = await getTournamentById(db, pool.tournamentId);
  if (!tournament?.definition) notFound();

  const tournamentDef = tournament.definition;
  const now = new Date();
  const memberUid = userId(memberId);

  const visible = await canViewCard(db, {
    actor,
    pool: { id: pool.id, ownerId: pool.ownerId },
    targetUserId: memberUid,
    lockTime: tournament.firstKickoff,
    now,
  });
  if (!visible) notFound();

  const card = await getCardView({
    db,
    poolId,
    userId: memberUid,
    tournamentId: pool.tournamentId,
    tournament: tournamentDef,
    firstKickoff: tournament.firstKickoff,
    now,
    createIfMissing: false,
  });

  if (!card) notFound();

  const isOwner = actor.userId === pool.ownerId;
  const isSelf = actor.userId === memberUid;

  // Fetch member display name for the banner
  const memberUser = await getUserById(db, memberUid);
  const memberName = memberUser?.displayName ?? memberUser?.email ?? memberId;

  // Audit log for all pool members
  let auditEntries: AuditEntry[] = [];
  const prediction = await getPrediction(db, poolId, memberUid);
  if (prediction) {
    const edits = await listEditsForPrediction(db, prediction.id);
    auditEntries = edits.map((e) => ({
      id: e.id,
      editorName: e.editorUserId,
      fieldPath: e.fieldPath,
      oldValue: e.oldValue,
      newValue: e.newValue,
      ...(e.reason !== null ? { reason: e.reason } : {}),
      source: e.source,
      editedAt: e.editedAt,
    }));
  }

  const teams = tournamentDef.teams.map((t) => ({ id: t.id, name: t.name }));
  const players = tournamentDef.players.map((p) => ({ id: p.id, name: p.name, team: p.team }));

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href={`/pools/${poolId}`}
            className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors mb-1 inline-block"
          >
            ← {pool.name}
          </Link>
          <h1
            className="text-2xl font-bold text-[var(--ink)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {isSelf ? 'My Predictions' : `${memberName}'s Predictions`}
          </h1>
        </div>
        {isOwner && <ExportImportControls poolId={poolId} targetUserId={memberId} />}
      </div>

      {isOwner && !isSelf && <OwnerEditBanner memberName={memberName} />}

      {isOwner ? (
        <OwnerCardEditor
          card={card}
          poolId={poolId}
          targetUserId={memberId}
          teams={teams}
          players={players}
        />
      ) : (
        <ReadOnlyCard card={card} />
      )}

      {auditEntries.length > 0 && <AuditLog entries={auditEntries} />}
    </main>
  );
}
