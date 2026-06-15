import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import {
  getPoolById,
  getTournamentById,
  getPrediction,
  listEditsForPrediction,
  getUserById,
  getMember,
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
import type { AuditEntry, MatchScore } from '@/features/predictions';
import { getResultsView } from '@/features/results';
import { userId } from '@cup/engine';
import { BackLink } from '@/shared/ui';

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

  const memberRecord = await getMember(db, poolId, memberUid);

  const card = await getCardView({
    db,
    poolId,
    userId: memberUid,
    tournamentId: pool.tournamentId,
    tournament: tournamentDef,
    firstKickoff: tournament.firstKickoff,
    ...(memberRecord ? { joinedAt: memberRecord.joinedAt } : {}),
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
      editorName: e.editorName,
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

  // Build per-match scoring data from actual results (only available after tournament starts)
  const resultsView = await getResultsView({ db, poolId, userId: memberUid, now });
  const matchScores = new Map<string, MatchScore>(
    resultsView?.groupResults.flatMap((g) =>
      g.completedMatches.map((m) => [m.matchId, { hit: m.hit, points: m.pointsAwarded }]),
    ) ?? [],
  );

  return (
    <main className="max-w-215 mx-auto p-[28px_20px] flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow text-ink-muted mb-2 flex items-center gap-1.5">
            <BackLink href={`/pools/${poolId}`}>{pool.name}</BackLink>
            <span>· {isSelf ? 'Your card' : `${memberName}'s card`}</span>
          </div>
          <h1 className="display text-[34px] m-0">
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
        <ReadOnlyCard card={card} matchScores={matchScores} />
      )}

      {auditEntries.length > 0 && <AuditLog entries={auditEntries} />}
    </main>
  );
}
