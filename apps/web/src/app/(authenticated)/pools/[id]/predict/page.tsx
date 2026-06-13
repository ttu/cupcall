import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import {
  getPoolById,
  getTournamentById,
  getPrediction,
  listEditsForPrediction,
  isMember,
} from '@cup/db';
import { db } from '@/shared/db';
import { getCurrentActor } from '@/features/auth';
import {
  getCardView,
  PredictStepper,
  CreatorPredictEdit,
  ExportImportControls,
  AuditLog,
  CompletionBar,
} from '@/features/predictions';
import type { AuditEntry } from '@/features/predictions';
import { Chip, Icon, BackLink } from '@/shared/ui';

type Props = { params: Promise<{ id: string }> };

export default async function PredictPage({ params }: Props): Promise<ReactElement> {
  const { id: poolId } = await params;

  const actor = await getCurrentActor();
  if (!actor) redirect('/');

  const [pool, member] = await Promise.all([
    getPoolById(db, poolId),
    isMember(db, poolId, actor.userId),
  ]);
  if (!pool) notFound();
  if (!member) notFound();

  const tournament = await getTournamentById(db, pool.tournamentId);
  if (!tournament?.definition) notFound();

  const tournamentDef = tournament.definition;
  const now = new Date();

  const card = await getCardView({
    db,
    poolId,
    userId: actor.userId,
    tournamentId: pool.tournamentId,
    tournament: tournamentDef,
    firstKickoff: tournament.firstKickoff,
    now,
    createIfMissing: true,
  });

  if (!card) notFound();

  // Audit log — only shown to owner (editing own card still creates no edits, but owner may have edited this card)
  let auditEntries: AuditEntry[] = [];
  if (actor.userId === pool.ownerId) {
    const prediction = await getPrediction(db, poolId, actor.userId);
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
  }

  const isOwner = actor.userId === pool.ownerId;
  const creatorLockedEdit = isOwner && card.status === 'locked';

  const teams = tournamentDef.teams.map((t) => ({ id: t.id, name: t.name }));
  const players = tournamentDef.players.map((p) => ({ id: p.id, name: p.name, team: p.team }));

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div
          className="eyebrow"
          style={{
            color: 'var(--ink-muted)',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <BackLink href={`/pools/${poolId}`}>{pool.name}</BackLink>
          <span>· Your card</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <h1 className="display" style={{ fontSize: 34, margin: 0 }}>
            Make your call
          </h1>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minWidth: 160,
              flex: '0 1 260px',
            }}
          >
            {card.completionPercent === 100 && (
              <Chip variant="green" dot>
                Saved
              </Chip>
            )}
            {/* Locked pill only shown for non-owners; owners get it inside CreatorPredictEdit */}
            {card.status === 'locked' && !creatorLockedEdit && (
              <span className="pill-lock">
                <Icon name="lock" size={14} />
                Locked
              </span>
            )}
            <CompletionBar percent={card.completionPercent} />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          {/* Pass targetUserId so import also uses the owner-bypass path after lock */}
          <ExportImportControls
            poolId={poolId}
            {...(creatorLockedEdit ? { targetUserId: actor.userId } : {})}
          />
        </div>
      </div>

      {creatorLockedEdit ? (
        <CreatorPredictEdit
          card={card}
          poolId={poolId}
          targetUserId={actor.userId}
          teams={teams}
          players={players}
          isDev={process.env.NODE_ENV === 'development'}
        />
      ) : (
        <PredictStepper
          card={card}
          teams={teams}
          players={players}
          isDev={process.env.NODE_ENV === 'development'}
        />
      )}

      {auditEntries.length > 0 && <AuditLog entries={auditEntries} />}
    </div>
  );
}
