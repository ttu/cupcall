import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { makeTestDb } from '../testing/make-test-db';
import { testScoring } from '../testing/fixtures';
import type { Db } from '../client';
import * as schema from './index';
import { userId, type Points } from '@cup/engine';
import type { ScoreBreakdown } from '@cup/engine';

// Unique id helpers
const uid = () => crypto.randomUUID();
const uid_user = () => userId(crypto.randomUUID()); // branded UserId
const now = () => new Date();

// Minimal valid ScoreBreakdown
const testBreakdown: ScoreBreakdown = {
  groupMatches: 0 as Points,
  groupOrder: 0 as Points,
  bronze: 0 as Points,
  final: 0 as Points,
  roundOf16: 0 as Points,
  roundOf8: 0 as Points,
  topFour: 0 as Points,
  specials: 0 as Points,
  total: 0 as Points,
};

describe('migrations apply cleanly', () => {
  it('every table is queryable and returns empty result set', async () => {
    const db = await makeTestDb();
    const results = await Promise.all([
      db.select().from(schema.users),
      db.select().from(schema.accounts),
      db.select().from(schema.sessions),
      db.select().from(schema.verificationTokens),
      db.select().from(schema.tournaments),
      db.select().from(schema.teams),
      db.select().from(schema.players),
      db.select().from(schema.stageGroups),
      db.select().from(schema.stageGroupTeams),
      db.select().from(schema.matches),
      db.select().from(schema.actualGroupOrder),
      db.select().from(schema.actualAnswers),
      db.select().from(schema.pools),
      db.select().from(schema.poolMembers),
      db.select().from(schema.poolKicks),
      db.select().from(schema.predictions),
      db.select().from(schema.predictionGroupScores),
      db.select().from(schema.predictionKnockoutPicks),
      db.select().from(schema.predictionFinishScores),
      db.select().from(schema.predictionSpecials),
      db.select().from(schema.predictionEdits),
      db.select().from(schema.scores),
      db.select().from(schema.rateLimits),
      db.select().from(schema.userLoginTokens),
    ]);
    for (const result of results) {
      expect(result).toEqual([]);
    }
  });
});

describe('users', () => {
  let db: Db<typeof schema>;
  beforeEach(async () => {
    db = await makeTestDb();
  });

  it('inserts and retrieves a user', async () => {
    const id = uid_user();
    await db.insert(schema.users).values({
      id,
      email: 'alice@example.com',
      displayName: 'Alice',
    });
    const [user] = await db.select().from(schema.users);
    expect(user?.email).toBe('alice@example.com');
    expect(user?.displayName).toBe('Alice');
  });

  it('rejects duplicate email', async () => {
    await db.insert(schema.users).values({ id: uid_user(), email: 'dup@x.com', displayName: 'A' });
    await expect(
      db.insert(schema.users).values({ id: uid_user(), email: 'dup@x.com', displayName: 'B' }),
    ).rejects.toThrow();
  });
});

describe('tournament → team → group → match FK graph', () => {
  let db: Db<typeof schema>;
  beforeEach(async () => {
    db = await makeTestDb();
  });

  it('inserts a full tournament/team/group/match graph', async () => {
    const tId = 'wc-test';
    await db.insert(schema.tournaments).values({
      id: tId,
      name: 'Test WC',
      firstKickoff: now(),
      scoringConfig: testScoring,
      status: 'upcoming',
    });
    await db.insert(schema.teams).values({ tournamentId: tId, id: 'ARG', name: 'Argentina' });
    await db.insert(schema.teams).values({ tournamentId: tId, id: 'BRA', name: 'Brazil' });
    await db.insert(schema.stageGroups).values({ tournamentId: tId, id: 'A' });
    await db.insert(schema.matches).values({
      id: 'm1',
      tournamentId: tId,
      stage: 'group',
      groupId: 'A',
      homeTeamId: 'ARG',
      awayTeamId: 'BRA',
      kickoff: now(),
      status: 'scheduled',
    });
    const matchRows = await db.select().from(schema.matches);
    expect(matchRows).toHaveLength(1);
    expect(matchRows[0]?.homeTeamId).toBe('ARG');
  });

  it('rejects a team referencing a non-existent tournament (FK violation)', async () => {
    await expect(
      db.insert(schema.teams).values({
        tournamentId: 'no-such-tournament',
        id: 'ARG',
        name: 'Argentina',
      }),
    ).rejects.toThrow();
  });
});

describe('pool unique constraints', () => {
  let db: Db<typeof schema>;
  let user1Id: ReturnType<typeof uid_user>;
  let tournamentId: string;
  let poolId: string;

  beforeEach(async () => {
    db = await makeTestDb();
    user1Id = uid_user();
    tournamentId = `wc-test-${uid()}`;
    poolId = uid();

    await db
      .insert(schema.users)
      .values({ id: user1Id, email: `u1-${uid()}@x.com`, displayName: 'U1' });
    await db.insert(schema.tournaments).values({
      id: tournamentId,
      name: 'T',
      firstKickoff: now(),
      scoringConfig: testScoring,
    });
    await db.insert(schema.pools).values({
      id: poolId,
      tournamentId,
      ownerId: user1Id,
      name: 'P',
      inviteTokenHash: `hash-${uid()}`,
    });
  });

  it('rejects duplicate (poolId, userId) in poolMembers', async () => {
    await db.insert(schema.poolMembers).values({ poolId, userId: user1Id });
    await expect(
      db.insert(schema.poolMembers).values({ poolId, userId: user1Id }),
    ).rejects.toThrow();
  });

  it('rejects duplicate (poolId, userId) in predictions', async () => {
    await db.insert(schema.predictions).values({
      id: uid(),
      poolId,
      userId: user1Id,
      tournamentId,
    });
    await expect(
      db.insert(schema.predictions).values({
        id: uid(),
        poolId,
        userId: user1Id,
        tournamentId,
      }),
    ).rejects.toThrow();
  });

  it('rejects duplicate (poolId, userId) in scores', async () => {
    await db.insert(schema.scores).values({ poolId, userId: user1Id, breakdown: testBreakdown });
    await expect(
      db.insert(schema.scores).values({ poolId, userId: user1Id, breakdown: testBreakdown }),
    ).rejects.toThrow();
  });

  it('rejects duplicate (poolId, userId) in poolKicks', async () => {
    await db.insert(schema.poolKicks).values({ poolId, userId: user1Id });
    await expect(db.insert(schema.poolKicks).values({ poolId, userId: user1Id })).rejects.toThrow();
  });
});

describe('enum constraints', () => {
  let db: Db<typeof schema>;
  // Shared minimal valid graph for enum-violation tests
  let tId: string;
  let uId: ReturnType<typeof uid_user>;
  let pId: string;
  let predId: string;

  beforeEach(async () => {
    db = await makeTestDb();
    tId = `wc-enum-${uid()}`;
    uId = uid_user();
    pId = uid();
    predId = uid();

    await db.insert(schema.users).values({ id: uId, email: `u-${uid()}@x.com`, displayName: 'U' });
    await db.insert(schema.tournaments).values({
      id: tId,
      name: 'T',
      firstKickoff: now(),
      scoringConfig: testScoring,
    });
    await db.insert(schema.pools).values({
      id: pId,
      tournamentId: tId,
      ownerId: uId,
      name: 'P',
      inviteTokenHash: `hash-${uid()}`,
    });
    await db.insert(schema.predictions).values({
      id: predId,
      poolId: pId,
      userId: uId,
      tournamentId: tId,
    });
  });

  it('rejects invalid stage enum value in matches via raw SQL', async () => {
    await expect(
      db.execute(
        sql`INSERT INTO matches (id, tournament_id, stage, kickoff, status)
          VALUES ('m1', ${tId}, 'InvalidStage', NOW(), 'scheduled')`,
      ),
    ).rejects.toThrow();
  });

  it('rejects invalid finishMatch enum in predictionFinishScores via raw SQL', async () => {
    // Valid predId exists — failure must be on the bad 'quarterfinal' enum value only
    await expect(
      db.execute(
        sql`INSERT INTO prediction_finish_scores (prediction_id, match, home_goals, away_goals)
          VALUES (${predId}, 'quarterfinal', 1, 0)`,
      ),
    ).rejects.toThrow();
  });

  it('rejects invalid source enum in predictionEdits via raw SQL', async () => {
    // Valid predId and uId exist — failure must be on the bad 'webhook' enum value only
    await expect(
      db.execute(
        sql`INSERT INTO prediction_edits (id, prediction_id, editor_user_id, field_path, source, edited_at)
          VALUES (${uid()}, ${predId}, ${uId}, 'x', 'webhook', NOW())`,
      ),
    ).rejects.toThrow();
  });
});
