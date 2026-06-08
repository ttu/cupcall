import { redirect, notFound } from 'next/navigation';
import { getPoolById, getTournamentById, getPrediction, listEditsForPrediction } from '@cup/db';
import { db } from '@/shared/db';
import { getCurrentActor } from '@/features/auth';
import {
  getCardView,
  PredictStepper,
  ExportImportControls,
  AuditLog,
} from '@/features/predictions';
import type { AuditEntry } from '@/features/predictions';

type Props = { params: Promise<{ id: string }> };

export default async function PredictPage({ params }: Props) {
  const { id: poolId } = await params;

  const actor = await getCurrentActor();
  if (!actor) redirect('/');

  const pool = await getPoolById(db, poolId);
  if (!pool) notFound();

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

  const teams = tournamentDef.teams.map((t) => ({ id: t.id, name: t.name }));
  const players = tournamentDef.players.map((p) => ({ id: p.id, name: p.name }));

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-2xl font-bold text-[var(--ink)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            My Predictions
          </h1>
          <p className="text-sm text-[var(--ink-soft)] mt-0.5">{pool.name}</p>
        </div>
        <ExportImportControls poolId={poolId} />
      </div>

      <PredictStepper card={card} teams={teams} players={players} />

      {auditEntries.length > 0 && <AuditLog entries={auditEntries} />}
    </main>
  );
}
