/**
 * Integration tests for the one-time backfill script that fills in the
 * home/away team-id snapshot on final/bronze finish-score rows saved before
 * that column existed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import type { Db } from '@cup/db';
import * as schema from '@cup/db/schema';
import {
  createUser,
  createPool,
  getOrCreatePrediction,
  upsertKnockoutPick,
  upsertFinishScore,
  upsertTournamentDef,
} from '@cup/db';
import { tournamentId as asTournamentId, bracketMatchKey } from '@cup/engine';
import { miniTournament } from '@cup/engine/testing';
import { backfillFinishScoreTeamIds } from './backfill-finish-score-team-ids';

const firstKickoff = new Date('2026-06-01T00:00:00Z');
const emptyKickoffs = new Map<string, Date | null>();

describe('backfillFinishScoreTeamIds', () => {
  let db: Db<typeof schema>;
  const tid = asTournamentId('mini-2026');

  beforeEach(async () => {
    db = await makeTestDb();
    await upsertTournamentDef(db, miniTournament, firstKickoff, emptyKickoffs);
  });

  it('fills in the team-id snapshot for a final finish-score row missing it', async () => {
    const user = await createUser(db, { email: 'u1@x.com', displayName: 'Alice' });
    const pool = await createPool(db, {
      ownerId: user.id,
      tournamentId: tid,
      name: 'Pool',
      inviteTokenHash: 'h1',
    });
    const prediction = await getOrCreatePrediction(db, {
      poolId: pool.id,
      userId: user.id,
      tournamentId: tid,
    });
    // Full bracket picks so derived.finalists resolves to a concrete pair — mirrors the
    // fixture pattern used by build-bracket-rounds.test.ts's fullBracketPicks:
    //   qf1: 1A vs 2B, qf2: 1C vs 2D, qf3: 1B vs 2A, qf4: 1D vs 2C
    //   sf1 from [qf1, qf2], sf2 from [qf3, qf4] -> finalists = [sf1 winner, sf2 winner]
    await upsertKnockoutPick(db, prediction.id, bracketMatchKey('qf1'), 'A1');
    await upsertKnockoutPick(db, prediction.id, bracketMatchKey('qf2'), 'C1');
    await upsertKnockoutPick(db, prediction.id, bracketMatchKey('qf3'), 'B1');
    await upsertKnockoutPick(db, prediction.id, bracketMatchKey('qf4'), 'D1');
    await upsertKnockoutPick(db, prediction.id, bracketMatchKey('sf1'), 'A1');
    await upsertKnockoutPick(db, prediction.id, bracketMatchKey('sf2'), 'B1');
    await upsertFinishScore(db, prediction.id, 'final', 2, 1); // no snapshot yet

    const result = await backfillFinishScoreTeamIds(db, tid);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(0);

    const allRows = await db.select().from(schema.predictionFinishScores);
    const row = allRows.find((r) => r.predictionId === prediction.id);
    expect(row?.homeTeamId).toBe('A1');
    expect(row?.awayTeamId).toBe('B1');
  });

  it('is idempotent — does not touch rows that already have a snapshot', async () => {
    const user = await createUser(db, { email: 'u2@x.com', displayName: 'Bob' });
    const pool = await createPool(db, {
      ownerId: user.id,
      tournamentId: tid,
      name: 'Pool',
      inviteTokenHash: 'h2',
    });
    const prediction = await getOrCreatePrediction(db, {
      poolId: pool.id,
      userId: user.id,
      tournamentId: tid,
    });
    await upsertFinishScore(db, prediction.id, 'final', 2, 1, 'X1', 'X2');

    const result = await backfillFinishScoreTeamIds(db, tid);
    expect(result.updated).toBe(0);

    const allRows = await db.select().from(schema.predictionFinishScores);
    const row = allRows.find((r) => r.predictionId === prediction.id);
    expect(row?.homeTeamId).toBe('X1'); // unchanged
  });

  it('skips rows where the finalist pair cannot be derived (incomplete picks)', async () => {
    const user = await createUser(db, { email: 'u3@x.com', displayName: 'Cara' });
    const pool = await createPool(db, {
      ownerId: user.id,
      tournamentId: tid,
      name: 'Pool',
      inviteTokenHash: 'h3',
    });
    const prediction = await getOrCreatePrediction(db, {
      poolId: pool.id,
      userId: user.id,
      tournamentId: tid,
    });
    await upsertFinishScore(db, prediction.id, 'final', 2, 1); // no SF picks at all

    const result = await backfillFinishScoreTeamIds(db, tid);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
