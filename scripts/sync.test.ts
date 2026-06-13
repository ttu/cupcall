/**
 * Integration tests for the sync pipeline.
 *
 * Uses an in-memory pglite database (same approach as other integration tests)
 * and the mini-2026 sample data files to exercise the full sync flow.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { makeTestDb } from '@cup/db/testing';
import type { Db } from '@cup/db';
import * as schema from '@cup/db/schema';
import { createUser, createPool } from '@cup/db';
import { bracketMatchKey } from '@cup/engine';
import { syncTournament } from './sync';

// Minimal runtime shapes for the on-disk fixture files. Validating here keeps
// the mutate-then-write helpers in the new tests free of unsafe `as` casts —
// if the mini-2026 fixture shape ever changes, the test fails with a clear
// Zod error instead of a confusing undefined-access at the mutation site.
const fixtureResultsSchema = z.object({ answers: z.record(z.string(), z.unknown()) }).passthrough();
const fixtureTournamentSchema = z
  .object({
    teams: z.array(z.object({ id: z.string() }).passthrough()).min(1),
    players: z.array(
      z.object({ id: z.string(), name: z.string(), team: z.string() }).passthrough(),
    ),
  })
  .passthrough();
const persistedDefinitionSchema = z
  .object({ players: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()) })
  .passthrough();

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

  it('does not write actual group orders when no games have been played', async () => {
    await syncTournament(db, 'mini-2026', mini2026Dir);

    const orders = await db.select().from(schema.actualGroupOrder);
    expect(orders).toHaveLength(0);
  });

  it('scores 0 for every prediction category when no games have been played', async () => {
    await syncTournament(db, 'mini-2026', mini2026Dir);

    const owner = await createUser(db, {
      email: `o-${crypto.randomUUID()}@x.com`,
      displayName: 'Owner',
    });
    const user = await createUser(db, {
      email: `u-${crypto.randomUUID()}@x.com`,
      displayName: 'User',
    });
    const pool = await createPool(db, {
      tournamentId: 'mini-2026',
      ownerId: owner.id,
      name: 'Zero Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });

    const [predRow] = await db
      .insert(schema.predictions)
      .values({ poolId: pool.id, userId: user.id, tournamentId: 'mini-2026' })
      .returning();
    if (!predRow) throw new Error('No prediction row returned');

    // All 8 knockout picks
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

    // All 24 group match scores predicted as 0-0 — this is the regression case:
    // the old bug would write seed-order group orders to the DB, and a 0-0 prediction
    // derives the same seed order, so group order scoring would award false points.
    const groupMatchIds = [
      'mA1',
      'mA2',
      'mA3',
      'mA4',
      'mA5',
      'mA6',
      'mB1',
      'mB2',
      'mB3',
      'mB4',
      'mB5',
      'mB6',
      'mC1',
      'mC2',
      'mC3',
      'mC4',
      'mC5',
      'mC6',
      'mD1',
      'mD2',
      'mD3',
      'mD4',
      'mD5',
      'mD6',
    ];
    await db.insert(schema.predictionGroupScores).values(
      groupMatchIds.map((matchId) => ({
        predictionId: predRow.id,
        matchId,
        homeGoals: 0,
        awayGoals: 0,
      })),
    );

    // Finish scores and specials — all filled in so every category is exercised
    await db.insert(schema.predictionFinishScores).values([
      { predictionId: predRow.id, match: 'final' as const, homeGoals: 2, awayGoals: 1 },
      { predictionId: predRow.id, match: 'bronze' as const, homeGoals: 1, awayGoals: 0 },
    ]);
    await db.insert(schema.predictionSpecials).values([
      { predictionId: predRow.id, betKey: 'topScorerPlayer', value: 'A1-P' },
      { predictionId: predRow.id, betKey: 'penaltyShootoutCount', value: 2 },
      { predictionId: predRow.id, betKey: 'highestMatchGoals', value: 5 },
      { predictionId: predRow.id, betKey: 'finalDecidedByPenalties', value: false },
    ]);

    const result = await syncTournament(db, 'mini-2026', mini2026Dir);
    expect(result.scored).toBe(1);

    const allScores = await db.select().from(schema.scores);
    const score = allScores.find((s) => s.poolId === pool.id);
    expect(score?.pointsTotal).toBe(0);
    // Breakdown should be all zeros too
    expect(score?.breakdown?.groupOrder).toBe(0);
    expect(score?.breakdown?.groupMatches).toBe(0);
    expect(score?.breakdown?.specials).toBe(0);
    expect(score?.breakdown?.roundOf8).toBe(0);
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

  it('rejects results.json that references a player ID not present in tournament.json players', async () => {
    // Build a scratch data dir that copies mini-2026 then rewrites results.json
    // with a player ID that does NOT exist in tournament.json's players[].
    const scratch = mkdtempSync(join(tmpdir(), 'sync-guardrail-'));
    try {
      cpSync(mini2026Dir, scratch, { recursive: true });

      const resultsPath = join(scratch, 'results.json');
      const results = fixtureResultsSchema.parse(JSON.parse(readFileSync(resultsPath, 'utf-8')));
      results.answers.firstRedCardPlayer = 'unknown-xyz';
      writeFileSync(resultsPath, JSON.stringify(results, null, 2));

      await expect(syncTournament(db, 'mini-2026', scratch)).rejects.toThrow(
        /unknown-xyz.*firstRedCardPlayer/,
      );

      // Nothing should have been persisted on rejection.
      const tournaments = await db.select().from(schema.tournaments);
      expect(tournaments).toHaveLength(0);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('records and renders a non-roster player added to tournament.json mid-tournament', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'sync-happy-'));
    try {
      cpSync(mini2026Dir, scratch, { recursive: true });

      // 0. Initial sync of the un-modified fixture so the tournament row exists
      //    and downstream FKs (pool → tournament) resolve. The roster grows
      //    "mid-tournament" between this sync and the second sync below.
      await syncTournament(db, 'mini-2026', scratch);

      // 1. Add a brand-new player to tournament.json that no card has predicted.
      const tournamentPath = join(scratch, 'tournament.json');
      const tournament = fixtureTournamentSchema.parse(
        JSON.parse(readFileSync(tournamentPath, 'utf-8')),
      );
      const existingTeamId = tournament.teams[0]!.id;
      const newPlayerId = 'test-nonroster';
      tournament.players.push({
        id: newPlayerId,
        name: 'Test Nonroster',
        team: existingTeamId,
      });
      writeFileSync(tournamentPath, JSON.stringify(tournament, null, 2));

      // 2. Set firstRedCardPlayer in results.json to that brand-new player.
      const resultsPath = join(scratch, 'results.json');
      const results = fixtureResultsSchema.parse(JSON.parse(readFileSync(resultsPath, 'utf-8')));
      results.answers.firstRedCardPlayer = newPlayerId;
      writeFileSync(resultsPath, JSON.stringify(results, null, 2));

      // 3. Seed a pool + one card that predicts an EXISTING roster player for that bet.
      const existingPlayerId = tournament.players.find((p) => p.id !== newPlayerId)?.id;
      if (!existingPlayerId)
        throw new Error('mini-2026 has no other players — fixture invariant broken');

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
        name: 'Non-roster Pool',
        inviteTokenHash: `h-${crypto.randomUUID()}`,
      });

      const [predRow] = await db
        .insert(schema.predictions)
        .values({ poolId: pool.id, userId: user.id, tournamentId: 'mini-2026' })
        .returning();
      if (!predRow) throw new Error('No prediction row returned');

      await db
        .insert(schema.predictionSpecials)
        .values([
          { predictionId: predRow.id, betKey: 'firstRedCardPlayer', value: existingPlayerId },
        ]);

      // 4. Sync — must succeed without throwing. Scoring outcome of the
      //    sparse card is not the focus here; we assert persistence below.
      await syncTournament(db, 'mini-2026', scratch);

      // 5. The persisted tournament definition includes the new player.
      const [tRow] = await db.select().from(schema.tournaments);
      const def = persistedDefinitionSchema.parse(tRow?.definition);
      expect(def.players.find((p) => p.id === newPlayerId)?.name).toBe('Test Nonroster');

      // 6. The persisted actual answer is the new player ID.
      const answers = await db.select().from(schema.actualAnswers);
      const redCardAnswer = answers.find((a) => a.betKey === 'firstRedCardPlayer');
      expect(redCardAnswer?.value).toBe(newPlayerId);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
