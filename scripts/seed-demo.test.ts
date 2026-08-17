import { beforeEach, describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTestDb } from '@cup/db/testing';
import type { Db } from '@cup/db';
import * as schema from '@cup/db/schema';
import { getPoolByViewToken, listMembers } from '@cup/db';
import { tournamentId as asTournamentId } from '@cup/engine';
import { seedDemoCheckpoint } from './seed-demo';
import type { DemoBackup } from './demo-backup-schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mini2026Dir = join(__dirname, '..', 'data', 'tournaments', 'mini-2026');
const mini2026Id = asTournamentId('mini-2026');

const testBackup: DemoBackup = {
  version: 1,
  exportedAt: '2026-08-01T00:00:00Z',
  tournamentId: 'mini-2026',
  poolName: 'Test Demo Source',
  members: [
    {
      userId: 'demo-user-1',
      displayName: 'El Nino',
      prediction: {
        groupScores: [{ matchId: 'mA1', home: 2, away: 0 }],
        knockoutPicks: [
          { bracketMatchKey: 'qf1', winner: 'A1' },
          { bracketMatchKey: 'qf2', winner: 'C1' },
          { bracketMatchKey: 'qf3', winner: 'B1' },
          { bracketMatchKey: 'qf4', winner: 'D1' },
          { bracketMatchKey: 'sf1', winner: 'A1' },
          { bracketMatchKey: 'sf2', winner: 'B1' },
          { bracketMatchKey: 'final', winner: 'A1' },
          { bracketMatchKey: 'bronze', winner: 'C1' },
        ],
        finishScores: { final: { home: 2, away: 1 }, bronze: { home: 1, away: 0 } },
        specials: {},
      },
    },
    {
      userId: 'demo-user-2',
      displayName: 'Falcon9',
      prediction: {
        groupScores: [{ matchId: 'mA1', home: 0, away: 1 }],
        knockoutPicks: [
          { bracketMatchKey: 'qf1', winner: 'B2' },
          { bracketMatchKey: 'qf2', winner: 'C1' },
          { bracketMatchKey: 'qf3', winner: 'B1' },
          { bracketMatchKey: 'qf4', winner: 'D1' },
          { bracketMatchKey: 'sf1', winner: 'B2' },
          { bracketMatchKey: 'sf2', winner: 'B1' },
          { bracketMatchKey: 'final', winner: 'B1' },
          { bracketMatchKey: 'bronze', winner: 'B2' },
        ],
        finishScores: {},
        specials: {},
      },
    },
  ],
};

describe('seedDemoCheckpoint integration', () => {
  let db: Db<typeof schema>;

  beforeEach(async () => {
    db = await makeTestDb();
  });

  it('seeds a demo pool reachable by its fixed view token, with anonymized members and scored predictions', async () => {
    const { poolId } = await seedDemoCheckpoint(
      db,
      {
        tournamentId: mini2026Id,
        dataDir: mini2026Dir,
        viewToken: 'test-demo-token',
        poolName: 'Test Demo Pool',
      },
      testBackup,
    );

    const pool = await getPoolByViewToken(db, 'test-demo-token');
    expect(pool?.id).toBe(poolId);

    // First backup member is the pool owner; both members in testBackup are present.
    const members = await listMembers(db, poolId);
    expect(members).toHaveLength(2);

    const scores = await db.select().from(schema.scores);
    const poolScores = scores.filter((s) => s.poolId === poolId);
    expect(poolScores.length).toBeGreaterThan(0);
  });

  it('is idempotent — reseeding replaces the previous demo pool rather than duplicating it', async () => {
    const first = await seedDemoCheckpoint(
      db,
      {
        tournamentId: mini2026Id,
        dataDir: mini2026Dir,
        viewToken: 'test-demo-token',
        poolName: 'Test Demo Pool',
      },
      testBackup,
    );
    const second = await seedDemoCheckpoint(
      db,
      {
        tournamentId: mini2026Id,
        dataDir: mini2026Dir,
        viewToken: 'test-demo-token',
        poolName: 'Test Demo Pool',
      },
      testBackup,
    );

    expect(second.poolId).not.toBe(first.poolId);

    const allPools = await db.select().from(schema.pools);
    const oldPoolRows = allPools.filter((p) => p.id === first.poolId);
    expect(oldPoolRows).toHaveLength(0);

    const newPool = await getPoolByViewToken(db, 'test-demo-token');
    expect(newPool?.id).toBe(second.poolId);
    const membersOfNew = await listMembers(db, second.poolId);
    expect(membersOfNew).toHaveLength(2);
  });
});
