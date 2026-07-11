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
import { bracketMatchKey, tournamentId as asTournamentId } from '@cup/engine';
import { syncTournament } from './sync';

const mini2026Id = asTournamentId('mini-2026');

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
// Path to the test-wc-2026 sample data (R32 bracket, full group results)
const testWc2026Dir = join(__dirname, '..', 'data', 'tournaments', 'test-wc-2026');

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
      tournamentId: mini2026Id,
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
      tournamentId: mini2026Id,
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
      tournamentId: mini2026Id,
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

  it('scores a late joiner whose QF picks are based on actual group results, not seed order', async () => {
    // Regression: sync was calling deriveCard without augmenting group scores with
    // actual results. A late joiner only predicts non-locked matches, so their
    // groupScores are incomplete. buildBracket would resolve slots from the wrong
    // (seed-order) group standings and throw "invalid pick", skipping the prediction
    // and leaving their score at 0 even though they had correct group match hits.
    const scratch = mkdtempSync(join(tmpdir(), 'sync-latejoin-'));
    try {
      cpSync(mini2026Dir, scratch, { recursive: true });

      // Write results.json where A2 wins group A (overturning seed order: A1 is 1st by seed).
      // This means 1A=A2, so qf1 = A2 vs B2. Without augmentation the sync would
      // resolve 1A=A1 (seed) and treat the QF pick of A2 as invalid.
      const resultsPath = join(scratch, 'results.json');
      const allGroupAMatches = [
        { matchId: 'mA1', home: 0, away: 1 }, // A1 vs A2: A2 wins
        { matchId: 'mA2', home: 0, away: 1 }, // A1 vs A3: A3 wins
        { matchId: 'mA3', home: 0, away: 0 }, // A1 vs A4: draw
        { matchId: 'mA4', home: 1, away: 0 }, // A2 vs A3: A2 wins
        { matchId: 'mA5', home: 1, away: 0 }, // A2 vs A4: A2 wins
        { matchId: 'mA6', home: 1, away: 0 }, // A3 vs A4: A3 wins
      ];
      // Group B: B1 wins (seed order preserved; B1 beats everyone)
      const allGroupBMatches = [
        { matchId: 'mB1', home: 1, away: 0 }, // B1 vs B2: B1 wins → 3pts B1
        { matchId: 'mB2', home: 1, away: 0 }, // B1 vs B3: B1 wins
        { matchId: 'mB3', home: 1, away: 0 }, // B1 vs B4: B1 wins
        { matchId: 'mB4', home: 1, away: 0 }, // B2 vs B3: B2 wins
        { matchId: 'mB5', home: 1, away: 0 }, // B2 vs B4: B2 wins
        { matchId: 'mB6', home: 0, away: 0 }, // B3 vs B4: draw
      ];
      // Groups C and D: C1, D1 win (seed order preserved)
      const allGroupCMatches = [
        { matchId: 'mC1', home: 1, away: 0 },
        { matchId: 'mC2', home: 1, away: 0 },
        { matchId: 'mC3', home: 1, away: 0 },
        { matchId: 'mC4', home: 1, away: 0 },
        { matchId: 'mC5', home: 1, away: 0 },
        { matchId: 'mC6', home: 0, away: 0 },
      ];
      const allGroupDMatches = [
        { matchId: 'mD1', home: 1, away: 0 },
        { matchId: 'mD2', home: 1, away: 0 },
        { matchId: 'mD3', home: 1, away: 0 },
        { matchId: 'mD4', home: 1, away: 0 },
        { matchId: 'mD5', home: 1, away: 0 },
        { matchId: 'mD6', home: 0, away: 0 },
      ];
      writeFileSync(
        resultsPath,
        JSON.stringify({
          matchResults: [
            ...allGroupAMatches,
            ...allGroupBMatches,
            ...allGroupCMatches,
            ...allGroupDMatches,
          ],
          groupOrder: {},
          answers: {},
        }),
      );

      await syncTournament(db, 'mini-2026', scratch);

      const owner = await createUser(db, {
        email: `owner-${crypto.randomUUID()}@x.com`,
        displayName: 'Owner',
      });
      const user = await createUser(db, {
        email: `latejoin-${crypto.randomUUID()}@x.com`,
        displayName: 'LateJoiner',
      });
      const pool = await createPool(db, {
        tournamentId: mini2026Id,
        ownerId: owner.id,
        name: 'Late Join Pool',
        inviteTokenHash: `h-lj-${crypto.randomUUID()}`,
      });

      const [predRow] = await db
        .insert(schema.predictions)
        .values({ poolId: pool.id, userId: user.id, tournamentId: 'mini-2026' })
        .returning();
      if (!predRow) throw new Error('No prediction row returned');

      // Late joiner never predicted group A (all those matches were locked when they joined).
      // They did predict mB1 correctly (B1 1-0 B2 → exact hit).
      await db
        .insert(schema.predictionGroupScores)
        .values([{ predictionId: predRow.id, matchId: 'mB1', homeGoals: 1, awayGoals: 0 }]);

      // Their QF picks are based on the ACTUAL bracket:
      //   1A=A2, 2A=A1, 1B=B1, 2B=B2, 1C=C1, 2C=C2, 1D=D1, 2D=D2
      //   qf1=A2 vs B2, qf2=C1 vs D2, qf3=B1 vs A1, qf4=D1 vs C2
      await db.insert(schema.predictionKnockoutPicks).values([
        { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('qf1'), winnerTeamId: 'A2' },
        { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('qf2'), winnerTeamId: 'C1' },
        { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('qf3'), winnerTeamId: 'B1' },
        { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('qf4'), winnerTeamId: 'D1' },
        { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('sf1'), winnerTeamId: 'A2' },
        { predictionId: predRow.id, bracketMatchKey: bracketMatchKey('sf2'), winnerTeamId: 'B1' },
        {
          predictionId: predRow.id,
          bracketMatchKey: bracketMatchKey('final'),
          winnerTeamId: 'A2',
        },
        {
          predictionId: predRow.id,
          bracketMatchKey: bracketMatchKey('bronze'),
          winnerTeamId: 'C1',
        },
      ]);

      // Sync should score this prediction, not skip it.
      const result = await syncTournament(db, 'mini-2026', scratch);
      expect(result.scored).toBe(1);

      const allScores = await db.select().from(schema.scores);
      const score = allScores.find((s) => s.poolId === pool.id);
      expect(score).toBeDefined();
      // Should have at least the exact-score hit on mB1 (6 pts by default scoring).
      expect(score?.breakdown?.groupMatches).toBeGreaterThan(0);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
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
        tournamentId: mini2026Id,
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

  it('derives roundOf16 from R32 winners and immediately scores predictions', async () => {
    // Regression: adding a knockout R32 result to results.json should immediately award
    // roundOf16 points to users who predicted that team to reach R16.
    // Previously, sync stored the match result in the matches table (visible in the points
    // race bracket view) but never set answers.roundOf16 in actualAnswers, so scoreRoundOf16
    // returned 0 and the leaderboard showed no knockout points.

    const scratch = mkdtempSync(join(tmpdir(), 'sync-r32-'));
    try {
      // test-wc-2026 has an R32 bracket and complete group results.
      // groupOrder.A = [MEX, KOR, CZE, RSA] → 2A = KOR
      // groupOrder.B = [SUI, CAN, QAT, BIH] → 2B = CAN
      // r32m73 slot = '2A vs 2B' = KOR vs CAN
      // r32m75 slot = '1F vs 2C' = NED vs MAR
      cpSync(testWc2026Dir, scratch, { recursive: true });

      // Add a single R32 knockout result: CAN beats KOR in r32m73
      const resultsPath = join(scratch, 'results.json');
      const results = fixtureResultsSchema.parse(JSON.parse(readFileSync(resultsPath, 'utf-8')));
      (results as Record<string, unknown>).knockout = [
        {
          round: 'R32',
          matchId: 'r32m73',
          home: 'KOR',
          away: 'CAN',
          homeGoals: 0,
          awayGoals: 1,
          winner: 'CAN',
          decidedBy: 'regulation',
          kickoff: '2026-06-28T19:00:00Z',
        },
      ];
      writeFileSync(resultsPath, JSON.stringify(results, null, 2));

      await syncTournament(db, 'test-wc-2026', scratch);

      const owner = await createUser(db, {
        email: `owner-${crypto.randomUUID()}@x.com`,
        displayName: 'Owner',
      });
      const user = await createUser(db, {
        email: `user-${crypto.randomUUID()}@x.com`,
        displayName: 'Alice',
      });
      const pool = await createPool(db, {
        tournamentId: asTournamentId('test-wc-2026'),
        ownerId: owner.id,
        name: 'R32 Pool',
        inviteTokenHash: `h-r32-${crypto.randomUUID()}`,
      });

      const [predRow] = await db
        .insert(schema.predictions)
        .values({ poolId: pool.id, userId: user.id, tournamentId: 'test-wc-2026' })
        .returning();
      if (!predRow) throw new Error('No prediction row returned');

      // CAN for r32m73 (the match with a result) + NED for r32m75 (partner in r16m90).
      // This resolves r16m90 participants as [CAN, NED], putting CAN in derived.roundOf16.
      // actual.answers.roundOf16 will be [CAN] (derived from the knockout result).
      // scoreRoundOf16 should award roundOf16PerTeam (=2) for CAN.
      await db.insert(schema.predictionKnockoutPicks).values([
        {
          predictionId: predRow.id,
          bracketMatchKey: bracketMatchKey('r32m73'),
          winnerTeamId: 'CAN',
        },
        {
          predictionId: predRow.id,
          bracketMatchKey: bracketMatchKey('r32m75'),
          winnerTeamId: 'NED',
        },
      ]);

      const result = await syncTournament(db, 'test-wc-2026', scratch);
      expect(result.scored).toBe(1);

      // roundOf16 answer must be stored in actualAnswers
      const answers = await db.select().from(schema.actualAnswers);
      const r16Answer = answers.find((a) => a.betKey === 'roundOf16');
      expect(r16Answer).toBeDefined();
      expect(r16Answer?.value).toEqual(['CAN']);

      // The score breakdown must reflect non-zero roundOf16 points
      const allScores = await db.select().from(schema.scores);
      const score = allScores.find((s) => s.poolId === pool.id);
      expect(score).toBeDefined();
      expect(score?.breakdown?.roundOf16).toBeGreaterThan(0);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('derives roundOf4 from QF winners', async () => {
    // Regression: adding a QF result to results.json should immediately populate
    // answers.roundOf4 (the confirmed semifinalists), mirroring how roundOf16/roundOf8
    // are already derived from R32/R16 winners. Without this, the SF scoring category
    // never gets a live signal and stays at 0 until the entire tournament finishes.

    const scratch = mkdtempSync(join(tmpdir(), 'sync-qf-'));
    try {
      cpSync(testWc2026Dir, scratch, { recursive: true });

      const resultsPath = join(scratch, 'results.json');
      const results = fixtureResultsSchema.parse(JSON.parse(readFileSync(resultsPath, 'utf-8')));
      // test-wc-2026's fixture ships a static answers.roundOf4 (a "finals resolved" snapshot
      // used elsewhere, e.g. dev-tools checkpoints). Explicit results.json answers take
      // precedence over derived ones (by design — see sync.ts), so this test must clear it to
      // isolate what it's actually verifying: that a single QF result alone drives derivation.
      delete (results.answers as Record<string, unknown>)['roundOf4'];
      (results as Record<string, unknown>).knockout = [
        {
          round: 'QF',
          matchId: 'qf97',
          home: 'FRA',
          away: 'MAR',
          homeGoals: 2,
          awayGoals: 0,
          winner: 'FRA',
          decidedBy: 'regulation',
          kickoff: '2026-07-09T20:00:00Z',
        },
      ];
      writeFileSync(resultsPath, JSON.stringify(results, null, 2));

      await syncTournament(db, 'test-wc-2026', scratch);

      const answers = await db.select().from(schema.actualAnswers);
      const roundOf4Answer = answers.find((a) => a.betKey === 'roundOf4');
      expect(roundOf4Answer).toBeDefined();
      expect(roundOf4Answer?.value).toEqual(['FRA']);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
