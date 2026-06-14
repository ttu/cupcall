import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import {
  getPoolById,
  getTournamentById,
  getPrediction,
  listEditsForPrediction,
  isMember,
  getMember,
  getKnownResultMatchIds,
  getAnsweredBetKeys,
  getActualGroupMatchScores,
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

  const [pool, memberRecord] = await Promise.all([
    getPoolById(db, poolId),
    getMember(db, poolId, actor.userId),
  ]);
  if (!pool) notFound();
  if (!memberRecord) notFound();

  const tournament = await getTournamentById(db, pool.tournamentId);
  if (!tournament?.definition) notFound();

  const tournamentDef = tournament.definition;
  const now = new Date();
  const isAfterLock = now >= tournament.firstKickoff;

  const [knownResultMatchIds, answeredBetKeys, actualGroupMatchScores] = isAfterLock
    ? await Promise.all([
        getKnownResultMatchIds(db, pool.tournamentId),
        getAnsweredBetKeys(db, pool.tournamentId),
        getActualGroupMatchScores(db, pool.tournamentId),
      ])
    : [new Set<string>(), new Set<string>(), new Map<string, { home: number; away: number }>()];

  const card = await getCardView({
    db,
    poolId,
    userId: actor.userId,
    tournamentId: pool.tournamentId,
    tournament: tournamentDef,
    firstKickoff: tournament.firstKickoff,
    joinedAt: memberRecord.joinedAt,
    knownResultMatchIds,
    answeredBetKeys,
    actualGroupMatchScores,
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
    <div className="max-w-[1200px] mx-auto p-[28px_20px]">
      {/* Page header */}
      <div className="mb-5">
        <div className="eyebrow text-ink-muted mb-2 flex items-center gap-[6px]">
          <BackLink href={`/pools/${poolId}`}>{pool.name}</BackLink>
          <span>· Your card</span>
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="display text-[34px] m-0">Make your call</h1>
          <div className="flex items-center gap-[10px] min-w-[160px] flex-[0_1_260px]">
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
        <div className="mt-[10px]">
          {/* Pass targetUserId so import also uses the owner-bypass path after lock */}
          <ExportImportControls
            poolId={poolId}
            {...(creatorLockedEdit ? { targetUserId: actor.userId } : {})}
          />
        </div>
      </div>

      {card.status === 'partial' && card.lateJoinerDeadline && (
        <div className="flex items-start gap-[10px] p-[12px_16px] mb-5 rounded-[10px] bg-surface-2 border border-line text-[13px] text-ink-soft">
          <span className="font-extrabold text-base">⏱</span>
          <span>
            You joined after the tournament started — you have until{' '}
            <strong className="text-ink">{formatDeadline(card.lateJoinerDeadline)}</strong> to fill
            in your predictions. Items with known results are already locked.
          </span>
        </div>
      )}

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

function formatDeadline(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()} at ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
