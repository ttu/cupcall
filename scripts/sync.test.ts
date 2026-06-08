/**
 * Integration tests for the sync pipeline.
 *
 * Uses an in-memory pglite database (same approach as other integration tests)
 * and the mini-2026 sample data files to exercise the full sync flow.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTestDb } from '@cup/db/testing';
import type { Db } from '@cup/db';
import * as schema from '@cup/db/schema';
import { createUser, createPool } from '@cup/db';
import { bracketMatchKey } from '@cup/engine';
import { syncTournament } from './sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the mini-2026 sample data
const mini2026Dir = join(__dirname, '..', 'data', 'tournaments', 'mini-2026');

describe('syncTournament integration', () => {
  let db: Db<typeof schema>;

  beforeEach(async () => {
    db = await makeTestDb();
  });

  it('upserts tournament definition from mini-2026 data files', async () => {
    await syncTournament(db, 'mini-2026', mini2026Dir);

    const tournaments = await db.select().from(schema.tournaments);
    expect(tournaments).toHaveLength(1);
    expect(tournaments[0]?.id).toBe('mini-2026');
    expect(tournaments[0]?.name).toBe('Mini Tournament 2026');

    const teams = await db.select().from(schema.teams);
    expect(teams).toHaveLength(16);

    const matches = await db.select().from(schema.matches);
    expect(matches).toHaveLength(24);

    // Kickoffs should be stored (not null) since mini-2026 JSON has kickoff per match
    const matchesWithKickoff = matches.filter((m) => m.kickoff !== null);
    expect(matchesWithKickoff).toHaveLength(24);
  });

  it('is idempotent — running sync twice produces the same data', async () => {
    await syncTournament(db, 'mini-2026', mini2026Dir);
    await syncTournament(db, 'mini-2026', mini2026Dir);

    const tournaments = await db.select().from(schema.tournaments);
    expect(tournaments).toHaveLength(1);

    const teams = await db.select().from(schema.teams);
    expect(teams).toHaveLength(16);

    const matches = await db.select().from(schema.matches);
    expect(matches).toHaveLength(24);
  });

  it('returns scored=0 when there are no predictions', async () => {
    const result = await syncTournament(db, 'mini-2026', mini2026Dir);
    expect(result.scored).toBe(0);
  });

  it('rescores all predictions and upserts score rows for complete predictions', async () => {
    // First sync creates the tournament definition
    await syncTournament(db, 'mini-2026', mini2026Dir);

    const owner = await createUser(db, {
      email: `owner-${crypto.randomUUID()}@x.com`,
      displayName: 'Owner',
    });
    const user = await createUser(db, {
      email: `user-${crypto.randomUUID()}@x.com`,
      displayName: 'Alice',
    });
    const pool = await createPool(db, {
      tournamentId: 'mini-2026',
      ownerId: owner.id,
      name: 'Test Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });

    // Seed a prediction with all required knockout picks so deriveCard succeeds
    const [predRow] = await db
      .insert(schema.predictions)
      .values({ poolId: pool.id, userId: user.id, tournamentId: 'mini-2026' })
      .returning();
    if (!predRow) throw new Error('No prediction row returned');

    // All 8 bracket matches need picks: qf1-4, sf1-2, final, bronze
    await db.insert(schema.predictionKnockoutPicks).values([
      { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('qf1'), winnerTeamId: 'A1' },
      { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('qf2'), winnerTeamId: 'C1' },
      { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('qf3'), winnerTeamId: 'B1' },
      { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('qf4'), winnerTeamId: 'D1' },
      { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('sf1'), winnerTeamId: 'A1' },
      { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('sf2'), winnerTeamId: 'B1' },
      { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('final'), winnerTeamId: 'A1' },
      { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('bronze'), winnerTeamId: 'C1' },
    ]);

    // Run sync — should rescore the one prediction
    const result = await syncTournament(db, 'mini-2026', mini2026Dir);
    expect(result.scored).toBe(1);

    // Verify the score row was upserted
    const allScores = await db.select().from(schema.scores);
    const poolScores = allScores.filter((s) => s.poolId === pool.id);
    expect(poolScores).toHaveLength(1);
    expect(poolScores[0]?.userId).toBe(user.id);
  });

  it('rescore idempotency — running sync twice with a complete prediction upserts score once', async () => {
    await syncTournament(db, 'mini-2026', mini2026Dir);

    const owner = await createUser(db, {
      email: `owner-${crypto.randomUUID()}@x.com`,
      displayName: 'Owner',
    });
    const user = await createUser(db, {
      email: `user-${crypto.randomUUID()}@x.com`,
      displayName: 'Bob',
    });
    const pool = await createPool(db, {
      tournamentId: 'mini-2026',
      ownerId: owner.id,
      name: 'Test Pool 2',
      inviteTokenHash: `h2-${crypto.randomUUID()}`,
    });

    const [predRow] = await db
      .insert(schema.predictions)
      .values({ poolId: pool.id, userId: user.id, tournamentId: 'mini-2026' })
      .returning();
    if (!predRow) throw new Error('No prediction row returned');

    await db.insert(schema.predictionKnockoutPicks).values([
      { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('qf1'), winnerTeamId: 'A1' },
      { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('qf2'), winnerTeamId: 'C1' },
      { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('qf3'), winnerTeamId: 'B1' },
      { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('qf4'), winnerTeamId: 'D1' },
      { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('sf1'), winnerTeamId: 'A1' },
      { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('sf2'), winnerTeamId: 'B1' },
      { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('final'), winnerTeamId: 'A1' },
      { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('bronze'), winnerTeamId: 'C1' },
    ]);

    await syncTournament(db, 'mini-2026', mini2026Dir);
    await syncTournament(db, 'mini-2026', mini2026Dir);

    const allScores = await db.select().from(schema.scores);
    const poolScores = allScores.filter((s) => s.poolId === pool.id);
    // Must be exactly 1 score row, not duplicated
    expect(poolScores).toHaveLength(1);
  });
});
