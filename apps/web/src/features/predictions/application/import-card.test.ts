/**
 * Integration tests for applyCardImport (pglite, real DB) — in particular the
 * owner-edit audit trail, which must be written for every imported item type,
 * not just group scores.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import {
  upsertTournamentDef,
  createUser,
  createPool,
  getOrCreatePrediction,
  listEditsForPrediction,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId } from '@cup/engine';
import type { UserId, PoolId, PredictionId } from '@cup/engine';
import { applyCardImport } from './import-card';

const firstKickoff = new Date('2099-06-11T18:00:00Z');
const emptyKickoffs = new Map<string, Date | null>();
const miniTournamentId = asTournamentId(miniTournament.id);

type TestDb = Awaited<ReturnType<typeof makeTestDb>>;

describe('applyCardImport — owner-edit audit trail', () => {
  let db: TestDb;
  let poolId: PoolId;
  let editorUserId: UserId;
  let predictionId: PredictionId;

  beforeEach(async () => {
    db = await makeTestDb();
    await upsertTournamentDef(db, miniTournament, firstKickoff, emptyKickoffs);

    const owner = await createUser(db, {
      email: `owner-${crypto.randomUUID()}@test.com`,
      displayName: 'Owner',
    });
    editorUserId = owner.id;

    const pool = await createPool(db, {
      tournamentId: miniTournamentId,
      ownerId: owner.id,
      name: 'Test Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    poolId = pool.id;

    const member = await createUser(db, {
      email: `member-${crypto.randomUUID()}@test.com`,
      displayName: 'Alice',
    });
    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: member.id,
      tournamentId: miniTournamentId,
    });
    predictionId = prediction.id;
  });

  it('writes an audit entry for an imported knockout pick when isOwnerEdit is true', async () => {
    await applyCardImport({
      db,
      predictionId,
      tournamentDef: miniTournament,
      exportData: {
        tournamentId: miniTournament.id,
        knockoutPicks: [{ bracketMatchKey: 'qf1', winner: 'A1' }],
      },
      isOwnerEdit: true,
      editorUserId,
    });

    const edits = await listEditsForPrediction(db, predictionId);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({
      fieldPath: 'knockoutPicks.qf1',
      oldValue: null,
      newValue: 'A1',
      source: 'import',
    });
  });

  it('writes an audit entry for an imported final/bronze score when isOwnerEdit is true', async () => {
    await applyCardImport({
      db,
      predictionId,
      tournamentDef: miniTournament,
      exportData: {
        tournamentId: miniTournament.id,
        finishScores: { final: { home: 2, away: 1 }, bronze: { home: 1, away: 0 } },
      },
      isOwnerEdit: true,
      editorUserId,
    });

    const edits = await listEditsForPrediction(db, predictionId);
    const fieldPaths = edits.map((e) => e.fieldPath).sort((a, b) => a.localeCompare(b));
    expect(fieldPaths).toEqual(['finishScores.bronze', 'finishScores.final']);
    expect(edits.every((e) => e.source === 'import')).toBe(true);
  });

  it('writes an audit entry for an imported special bet when isOwnerEdit is true', async () => {
    await applyCardImport({
      db,
      predictionId,
      tournamentDef: miniTournament,
      exportData: {
        tournamentId: miniTournament.id,
        specials: { penaltyShootoutCount: 3 },
      },
      isOwnerEdit: true,
      editorUserId,
    });

    const edits = await listEditsForPrediction(db, predictionId);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({
      fieldPath: 'specials.penaltyShootoutCount',
      oldValue: null,
      newValue: 3,
      source: 'import',
    });
  });

  it('does not write audit entries when isOwnerEdit is false (self-import)', async () => {
    await applyCardImport({
      db,
      predictionId,
      tournamentDef: miniTournament,
      exportData: {
        tournamentId: miniTournament.id,
        knockoutPicks: [{ bracketMatchKey: 'qf1', winner: 'A1' }],
        finishScores: { final: { home: 2, away: 1 } },
        specials: { penaltyShootoutCount: 3 },
      },
      isOwnerEdit: false,
      editorUserId,
    });

    const edits = await listEditsForPrediction(db, predictionId);
    expect(edits).toHaveLength(0);
  });
});
