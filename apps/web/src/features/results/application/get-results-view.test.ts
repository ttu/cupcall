/**
 * Integration tests for getResultsView.
 * Uses a real in-memory PGlite database — no mocks.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb, setMatchKickoff } from '@cup/db/testing';
import {
  upsertTournamentDef,
  createUser,
  createPool,
  addMember,
  upsertGroupScore,
  upsertKnockoutPick,
  getOrCreatePrediction,
  upsertScore,
  finalizeMatch,
  upsertKnockoutMatch,
  upsertFinishScore,
  upsertSpecialBet,
  upsertTournamentResults,
} from '@cup/db';
import * as schema from '@cup/db/schema';
import { miniTournament } from '@cup/engine/testing';
import { groupId, bracketMatchKey, points, computeRemainingMaxPoints, teamId } from '@cup/engine';
import type { UserId, ScoreBreakdown, Tournament } from '@cup/engine';
import { getResultsView } from './get-results-view';

const firstKickoff = new Date('2030-06-11T18:00:00Z');
const emptyKickoffs = new Map<string, Date | null>();
const NOW = new Date('2030-06-15T12:00:00Z');

type TestDb = Awaited<ReturnType<typeof makeTestDb>>;

async function setupDb(db: TestDb) {
  await upsertTournamentDef(db, miniTournament, firstKickoff, emptyKickoffs);

  const owner = await createUser(db, {
    email: `owner-${crypto.randomUUID()}@test.com`,
    displayName: 'Owner',
  });
  const pool = await createPool(db, {
    tournamentId: miniTournament.id,
    ownerId: owner.id,
    name: 'Test Pool',
    inviteTokenHash: `h-${crypto.randomUUID()}`,
  });
  await addMember(db, pool.id, owner.id);

  const user = await createUser(db, {
    email: `user-${crypto.randomUUID()}@test.com`,
    displayName: 'Alice',
  });
  await addMember(db, pool.id, user.id);

  return { poolId: pool.id, userId: user.id as UserId, ownerId: owner.id as UserId };
}

describe('getResultsView', () => {
  let db: TestDb;
  let poolId: string;
  let userId: UserId;
  let ownerId: UserId;

  beforeEach(async () => {
    db = await makeTestDb();
    ({ poolId, userId, ownerId } = await setupDb(db));
  });

  it('returns null when pool does not exist', async () => {
    const view = await getResultsView({ db, poolId: 'no-such-pool', userId, now: NOW });
    expect(view).toBeNull();
  });

  it('returns null when tournament has no definition', async () => {
    const rawOwner = await createUser(db, {
      email: `o2-${crypto.randomUUID()}@test.com`,
      displayName: 'O2',
    });
    // Insert a tournament without a definition column, then create a pool for it
    await db.insert(schema.tournaments).values({
      id: 'no-def-t',
      name: 'No Definition',
      firstKickoff,
      scoringConfig: miniTournament.scoring,
      definition: null,
      status: 'upcoming',
    });
    const noDefPool = await createPool(db, {
      tournamentId: 'no-def-t',
      ownerId: rawOwner.id,
      name: 'NoDef',
      inviteTokenHash: 'hnd',
    });
    const view = await getResultsView({
      db,
      poolId: noDefPool.id,
      userId: rawOwner.id as UserId,
      now: NOW,
    });
    expect(view).toBeNull();
  });

  it('returns empty completed matches before any match is final', async () => {
    const view = await getResultsView({ db, poolId, userId, now: NOW });
    expect(view).not.toBeNull();
    for (const gr of view!.groupResults) {
      expect(gr.completedMatches).toHaveLength(0);
    }
  });

  it('marks exact hit correctly', async () => {
    const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await finalizeMatch(db, miniTournament.id, matchId, 2, 1);

    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertGroupScore(db, pred.id, matchId, 2, 1);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
    const row = groupA.completedMatches[0]!;
    expect(row.hit).toBe('exact');
    expect(row.pointsAwarded).toBe(miniTournament.scoring.groupMatch.exactScore);
  });

  it('marks outcome hit correctly', async () => {
    const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await finalizeMatch(db, miniTournament.id, matchId, 2, 0);

    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertGroupScore(db, pred.id, matchId, 1, 0);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
    const row = groupA.completedMatches[0]!;
    expect(row.hit).toBe('outcome');
    expect(row.pointsAwarded).toBe(miniTournament.scoring.groupMatch.correctOutcome);
  });

  it('marks missed correctly', async () => {
    const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await finalizeMatch(db, miniTournament.id, matchId, 0, 2);

    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertGroupScore(db, pred.id, matchId, 2, 0);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
    const row = groupA.completedMatches[0]!;
    expect(row.hit).toBe('missed');
    expect(row.pointsAwarded).toBe(0);
  });

  it('marks pending for completed match with no prediction', async () => {
    const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await finalizeMatch(db, miniTournament.id, matchId, 2, 1);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
    const row = groupA.completedMatches[0]!;
    expect(row.hit).toBe('pending');
  });

  it('computes poolMatchStats for a completed match', async () => {
    const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await finalizeMatch(db, miniTournament.id, matchId, 2, 1);

    // owner predicts exact score (2-1)
    const ownerPred = await getOrCreatePrediction(db, {
      poolId,
      userId: ownerId,
      tournamentId: miniTournament.id,
    });
    await upsertGroupScore(db, ownerPred.id, matchId, 2, 1);

    // user predicts correct outcome but wrong score (1-0)
    const userPred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertGroupScore(db, userPred.id, matchId, 1, 0);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
    const row = groupA.completedMatches[0]!;
    expect(row.poolMatchStats).not.toBeNull();
    expect(row.poolMatchStats!.totalPredictions).toBe(2);
    expect(row.poolMatchStats!.exactPct).toBe(50);
    expect(row.poolMatchStats!.outcomePct).toBe(50);
  });

  it('builds group standings from completed matches', async () => {
    const gAMatches = miniTournament.groupMatches.filter((m) => m.group === groupId('A'));
    // A1 gets 7pts (W,D,W), A2 gets 4pts (L,D,W), A4 gets 3pts (L,L,W), A3 gets 2pts (D,D,L)
    const results: [string, number, number][] = [
      [gAMatches[0]!.id, 2, 1], // A1 vs A2
      [gAMatches[1]!.id, 0, 0], // A1 vs A3
      [gAMatches[2]!.id, 3, 0], // A1 vs A4
      [gAMatches[3]!.id, 1, 1], // A2 vs A3
      [gAMatches[4]!.id, 2, 0], // A2 vs A4
      [gAMatches[5]!.id, 0, 1], // A3 vs A4
    ];

    for (const [mid, h, a] of results) {
      await finalizeMatch(db, miniTournament.id, mid, h, a);
    }

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
    expect(groupA.standing).toHaveLength(4);
    for (const row of groupA.standing) {
      expect(row.played).toBe(3);
    }
    expect(groupA.standing[0]!.teamId).toBe('A1');
  });

  it('marks qualifying positions correctly', async () => {
    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
    const autoQ = miniTournament.qualification.autoQualifyPerGroup;
    for (const row of groupA.standing) {
      if (row.position <= autoQ) {
        expect(row.qualifies).toBe('auto');
      } else {
        expect(row.qualifies).toBe(false);
      }
    }
  });

  it('marks best-third qualifier when all groups complete and bestThirdPlaced > 0', async () => {
    const t: Tournament = {
      ...miniTournament,
      qualification: { autoQualifyPerGroup: 2, bestThirdPlaced: 1 },
    };
    await upsertTournamentDef(db, t, firstKickoff, emptyKickoffs);

    // Group A: A3 finishes 3rd with 3pts, GD=+1, GF=3 (beats A4 3-0)
    const aScores: [string, number, number][] = [
      ['mA1', 1, 0], // A1 beats A2
      ['mA2', 1, 0], // A1 beats A3
      ['mA3', 1, 0], // A1 beats A4
      ['mA4', 1, 0], // A2 beats A3
      ['mA5', 1, 0], // A2 beats A4
      ['mA6', 3, 0], // A3 beats A4
    ];
    // Groups B, C, D: all 0-0 draws → every 3rd-placed team has 3pts but GD=0, worse than A3
    const drawScores: [string, number, number][] = (['B', 'C', 'D'] as const).flatMap((g) =>
      [1, 2, 3, 4, 5, 6].map((n) => [`m${g}${n}`, 0, 0] as [string, number, number]),
    );

    for (const [mid, h, a] of [...aScores, ...drawScores]) {
      await finalizeMatch(db, miniTournament.id, mid, h, a);
    }

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
    const groupB = view!.groupResults.find((g) => g.groupId === 'B')!;
    const a3 = groupA.standing.find((r) => r.teamId === 'A3')!;
    const b3 = groupB.standing.find((r) => r.teamId === 'B3')!;
    expect(a3.position).toBe(3);
    expect(a3.qualifies).toBe('best-third');
    expect(b3.qualifies).toBe(false);
  });

  it('marks live best-third in individual group standing while group stage is ongoing', async () => {
    const t: Tournament = {
      ...miniTournament,
      qualification: { autoQualifyPerGroup: 2, bestThirdPlaced: 1 },
    };
    await upsertTournamentDef(db, t, firstKickoff, emptyKickoffs);

    // Finalize only group A — B, C, D remain incomplete
    // A3 ends up 3rd in group A (3pts) and leads the live best-third ranking
    const aScores: [string, number, number][] = [
      ['mA1', 1, 0],
      ['mA2', 1, 0],
      ['mA3', 1, 0],
      ['mA4', 1, 0],
      ['mA5', 1, 0],
      ['mA6', 3, 0],
    ];
    for (const [mid, h, a] of aScores) {
      await finalizeMatch(db, miniTournament.id, mid, h, a);
    }

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
    const a3 = groupA.standing.find((r) => r.teamId === 'A3')!;
    // A3 is currently the best third — marked live even though group stage isn't complete
    expect(a3.qualifies).toBe('best-third');

    // Non-qualifying thirds in other groups remain unmarked
    const groupB = view!.groupResults.find((g) => g.groupId === 'B')!;
    const b3 = groupB.standing.find((r) => r.teamId === 'B3')!;
    expect(b3.qualifies).toBe(false);
  });

  it('sets group stage as active when some matches are final', async () => {
    await finalizeMatch(db, miniTournament.id, miniTournament.groupMatches[0]!.id, 1, 0);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    expect(view!.currentStage).toBe('group');
    const groupStage = view!.stageProgress.find((s) => s.key === 'group');
    expect(groupStage!.state).toBe('active');
  });

  describe('best3rdStanding', () => {
    it('is null when tournament has no best-third advancement', async () => {
      // miniTournament default: bestThirdPlaced = 0
      await finalizeMatch(db, miniTournament.id, 'mA1', 1, 0);

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      expect(view!.best3rdStanding).toBeNull();
    });

    it('is null when no 3rd-place team has played yet', async () => {
      const t: Tournament = {
        ...miniTournament,
        qualification: { autoQualifyPerGroup: 2, bestThirdPlaced: 1 },
      };
      await upsertTournamentDef(db, t, firstKickoff, emptyKickoffs);

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      expect(view!.best3rdStanding).toBeNull();
    });

    it('ranks 3rd-place teams across groups during ongoing group stage', async () => {
      const t: Tournament = {
        ...miniTournament,
        qualification: { autoQualifyPerGroup: 2, bestThirdPlaced: 1 },
      };
      await upsertTournamentDef(db, t, firstKickoff, emptyKickoffs);

      // Group A: all matches — A3 ends up 3rd (3pts, GD=+1, GF=3 from 3-0 win vs A4)
      const aScores: [string, number, number][] = [
        ['mA1', 1, 0], // A1 beats A2
        ['mA2', 1, 0], // A1 beats A3
        ['mA3', 1, 0], // A1 beats A4
        ['mA4', 1, 0], // A2 beats A3
        ['mA5', 1, 0], // A2 beats A4
        ['mA6', 3, 0], // A3 beats A4
      ];
      // Group B: all matches — B3 ends up 3rd (3pts, GD=-1, GF=1, worse than A3)
      const bScores: [string, number, number][] = [
        ['mB1', 1, 0],
        ['mB2', 1, 0],
        ['mB3', 1, 0],
        ['mB4', 1, 0],
        ['mB5', 1, 0],
        ['mB6', 1, 0],
      ];
      for (const [mid, h, a] of [...aScores, ...bScores]) {
        await finalizeMatch(db, t.id, mid, h, a);
      }
      // Groups C and D remain incomplete (no matches played for C/D's 3rd-place teams)

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const rows = view!.best3rdStanding!;

      expect(rows).not.toBeNull();
      // A3 (3pts, GD=+1) ranks above B3 (3pts, GD=-1)
      expect(rows[0]!.teamId).toBe('A3');
      expect(rows[0]!.rank).toBe(1);
      expect(rows[0]!.qualifies).toBe(true);
      expect(rows[1]!.teamId).toBe('B3');
      expect(rows[1]!.rank).toBe(2);
      expect(rows[1]!.qualifies).toBe(false);
      // Groups C and D 3rd-place teams have 0 played — still included in the table
      expect(rows.length).toBe(4);
    });

    it('marks top bestThirdPlaced teams as qualifying', async () => {
      const t: Tournament = {
        ...miniTournament,
        qualification: { autoQualifyPerGroup: 2, bestThirdPlaced: 2 },
      };
      await upsertTournamentDef(db, t, firstKickoff, emptyKickoffs);

      // Group A: A3 ends up 3rd (3pts, GD=+1)
      const aScores: [string, number, number][] = [
        ['mA1', 1, 0],
        ['mA2', 1, 0],
        ['mA3', 1, 0],
        ['mA4', 1, 0],
        ['mA5', 1, 0],
        ['mA6', 3, 0],
      ];
      // Group B: B3 ends up 3rd (3pts, GD=-1)
      const bScores: [string, number, number][] = [
        ['mB1', 1, 0],
        ['mB2', 1, 0],
        ['mB3', 1, 0],
        ['mB4', 1, 0],
        ['mB5', 1, 0],
        ['mB6', 1, 0],
      ];
      for (const [mid, h, a] of [...aScores, ...bScores]) {
        await finalizeMatch(db, t.id, mid, h, a);
      }

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const rows = view!.best3rdStanding!;

      expect(rows[0]!.qualifies).toBe(true);
      expect(rows[1]!.qualifies).toBe(true);
      expect(rows[2]!.qualifies).toBe(false);
      expect(rows[3]!.qualifies).toBe(false);
    });
  });

  it('shows knockout pick as alive when actual winner matches pick', async () => {
    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertKnockoutPick(db, pred.id, bracketMatchKey('qf1'), 'A1');

    await upsertKnockoutMatch(db, {
      id: 'qf1',
      tournamentId: miniTournament.id,
      stage: 'QF',
      homeTeamId: 'A1',
      awayTeamId: 'B2',
      homeGoals: 2,
      awayGoals: 0,
      winnerTeamId: 'A1',
      status: 'final',
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const qfRound = view!.bracketRounds.find((r) => r.label === 'QF');
    const match = qfRound?.matches.find((m) => m.bracketMatchKey === 'qf1');
    expect(match?.pickStatus).toBe('alive');
  });

  it('shows knockout pick as busted when actual winner differs', async () => {
    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertKnockoutPick(db, pred.id, bracketMatchKey('qf1'), 'B2');

    await upsertKnockoutMatch(db, {
      id: 'qf1',
      tournamentId: miniTournament.id,
      stage: 'QF',
      homeTeamId: 'A1',
      awayTeamId: 'B2',
      homeGoals: 2,
      awayGoals: 0,
      winnerTeamId: 'A1',
      status: 'final',
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const qfRound = view!.bracketRounds.find((r) => r.label === 'QF');
    const match = qfRound?.matches.find((m) => m.bracketMatchKey === 'qf1');
    expect(match?.pickStatus).toBe('busted');
  });

  it('shows knockout pick as pending when match not yet played', async () => {
    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertKnockoutPick(db, pred.id, bracketMatchKey('qf1'), 'A1');

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const qfRound = view!.bracketRounds.find((r) => r.label === 'QF');
    const match = qfRound?.matches.find((m) => m.bracketMatchKey === 'qf1');
    expect(match?.pickStatus).toBe('pending');
  });

  it('computes bracketHealth counts correctly', async () => {
    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertKnockoutPick(db, pred.id, bracketMatchKey('qf1'), 'A1');
    await upsertKnockoutPick(db, pred.id, bracketMatchKey('qf2'), 'C1');
    await upsertKnockoutPick(db, pred.id, bracketMatchKey('qf3'), 'B1'); // B1 loses → busted
    await upsertKnockoutPick(db, pred.id, bracketMatchKey('qf4'), 'A2'); // pending (no match row)

    await upsertKnockoutMatch(db, {
      id: 'qf1',
      tournamentId: miniTournament.id,
      stage: 'QF',
      homeTeamId: 'A1',
      awayTeamId: 'B2',
      homeGoals: 2,
      awayGoals: 0,
      winnerTeamId: 'A1',
      status: 'final',
    });
    await upsertKnockoutMatch(db, {
      id: 'qf2',
      tournamentId: miniTournament.id,
      stage: 'QF',
      homeTeamId: 'C1',
      awayTeamId: 'D2',
      homeGoals: 1,
      awayGoals: 0,
      winnerTeamId: 'C1',
      status: 'final',
    });
    await upsertKnockoutMatch(db, {
      id: 'qf3',
      tournamentId: miniTournament.id,
      stage: 'QF',
      homeTeamId: 'B1',
      awayTeamId: 'D2',
      homeGoals: 0,
      awayGoals: 1,
      winnerTeamId: 'D2',
      status: 'final',
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    expect(view!.bracketHealth.alivePicks).toBe(2);
    expect(view!.bracketHealth.bustedPicks).toBe(1);
    expect(view!.bracketHealth.totalPicks).toBe(4);
  });

  describe('live entry-round participants and prediction percentages', () => {
    it('populates entry-round slots from seed order when no group matches played', async () => {
      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const qfRound = view!.bracketRounds.find((r) => r.label === 'QF')!;
      const qf1 = qfRound.matches.find((m) => m.bracketMatchKey === 'qf1')!;
      // Default seed order: A1=1A, B2=2B
      expect(qf1.homeTeamId).toBe('A1');
      expect(qf1.awayTeamId).toBe('B2');
      expect(qf1.projected).toBe(true);
    });

    it('marks entry-round slots as not projected once all group matches are final', async () => {
      // Finalize all group matches
      for (const gm of miniTournament.groupMatches) {
        await finalizeMatch(db, miniTournament.id, gm.id, 1, 0);
      }
      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const qfRound = view!.bracketRounds.find((r) => r.label === 'QF')!;
      for (const match of qfRound.matches) {
        expect(match.projected).toBe(false);
      }
    });

    it('updates entry-round slots when some group matches have been played', async () => {
      // A3 beats A1 → A3 now leads group A, so '1A' resolves to A3
      const mA1 = miniTournament.groupMatches.find(
        (m) => m.group === groupId('A') && m.home === 'A1' && m.away === 'A2',
      )!;
      await finalizeMatch(db, miniTournament.id, mA1.id, 0, 3); // A2 beats A1 3-0

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const qfRound = view!.bracketRounds.find((r) => r.label === 'QF')!;
      const qf1 = qfRound.matches.find((m) => m.bracketMatchKey === 'qf1')!;
      // qf1 slot: home = '1A', away = '2B'
      // A2 now leads group A with 3pts → '1A' = A2
      expect(qf1.homeTeamId).toBe('A2');
      expect(qf1.projected).toBe(true);
    });

    it('computes r32 prediction percentages from pool group scores', async () => {
      // Both users predict: A1 wins all, A2 beats A3 and A4 → A1=1A (100%), A2=2A (100%)
      const aMatches = miniTournament.groupMatches.filter((m) => m.group === groupId('A'));
      // mA1=A1vsA2, mA2=A1vsA3, mA3=A1vsA4, mA4=A2vsA3, mA5=A2vsA4, mA6=A3vsA4
      const scores: Record<string, [number, number]> = {};
      for (const m of aMatches) {
        if (m.home === 'A1')
          scores[m.id] = [3, 0]; // A1 wins home
        else if (m.home === 'A2')
          scores[m.id] = [2, 0]; // A2 wins home
        else scores[m.id] = [0, 0]; // draw for A3 vs A4
      }

      for (const uid of [userId, ownerId]) {
        const pred = await getOrCreatePrediction(db, {
          poolId,
          userId: uid,
          tournamentId: miniTournament.id,
        });
        for (const [mid, [h, a]] of Object.entries(scores)) {
          await upsertGroupScore(db, pred.id, mid, h, a);
        }
      }

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const qfRound = view!.bracketRounds.find((r) => r.label === 'QF')!;
      // qf1 slot: home='1A' = A1 (both predict A1 as #1 in group A → 100%)
      const qf1 = qfRound.matches.find((m) => m.bracketMatchKey === 'qf1')!;
      expect(qf1.homeTeamId).toBe('A1');
      expect(qf1.homeTeamR32Pct).toBe(100);
      // qf3 slot: away='2A' = A2 (both predict A2 as #2 in group A → 100%)
      const qf3 = qfRound.matches.find((m) => m.bracketMatchKey === 'qf3')!;
      expect(qf3.awayTeamId).toBe('A2');
      expect(qf3.awayTeamR32Pct).toBe(100);
    });

    it('returns null r32 pcts for non-entry-round matches', async () => {
      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const sfRound = view!.bracketRounds.find((r) => r.label === 'SF');
      if (sfRound) {
        for (const match of sfRound.matches) {
          expect(match.homeTeamR32Pct).toBeNull();
          expect(match.awayTeamR32Pct).toBeNull();
        }
      }
    });
  });

  it('derives user rank from leaderboard', async () => {
    await upsertScore(db, {
      poolId,
      userId: ownerId,
      pointsTotal: points(300),
      breakdown: {} as ScoreBreakdown,
    });
    await upsertScore(db, {
      poolId,
      userId,
      pointsTotal: points(200),
      breakdown: {} as ScoreBreakdown,
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    expect(view!.userRank).not.toBeNull();
    expect(view!.userRank!.rank).toBe(2);
    expect(view!.userRank!.totalMembers).toBe(2);
    expect(view!.userRank!.points).toBe(200);
  });

  it('includes today match in todayMatches', async () => {
    const todayKickoff = new Date('2030-06-15T18:00:00Z'); // same UTC day as NOW
    const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await setMatchKickoff(db, miniTournament.id, matchId, todayKickoff);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
    expect(groupA.todayMatches).toHaveLength(1);
    expect(groupA.todayMatches[0]!.matchId).toBe(matchId);
    expect(groupA.todayMatches[0]!.kickoff).toBe(todayKickoff.toISOString());
  });

  it('excludes tomorrow match from todayMatches', async () => {
    const tomorrowKickoff = new Date('2030-06-16T18:00:00Z');
    const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await setMatchKickoff(db, miniTournament.id, matchId, tomorrowKickoff);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
    expect(groupA.todayMatches).toHaveLength(0);
  });

  it('excludes matches with null kickoff from todayMatches', async () => {
    // setupDb uses emptyKickoffs → all kickoffs remain null
    const view = await getResultsView({ db, poolId, userId, now: NOW });
    for (const gr of view!.groupResults) {
      expect(gr.todayMatches).toHaveLength(0);
    }
  });

  it('does not include completed match in todayMatches', async () => {
    const todayKickoff = new Date('2030-06-15T18:00:00Z');
    const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await setMatchKickoff(db, miniTournament.id, matchId, todayKickoff);
    await finalizeMatch(db, miniTournament.id, matchId, 2, 1);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
    expect(groupA.completedMatches).toHaveLength(1);
    expect(groupA.todayMatches).toHaveLength(0);
  });

  it('includes match within 24h window in todayMatches', async () => {
    // 23h in the future: within 24h window, different UTC day
    const kickoff = new Date(NOW.getTime() + 23 * 60 * 60 * 1000);
    const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await setMatchKickoff(db, miniTournament.id, matchId, kickoff);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
    expect(groupA.todayMatches).toHaveLength(1);
  });

  it('excludes match beyond 24h window from todayMatches', async () => {
    const kickoff = new Date(NOW.getTime() + 25 * 60 * 60 * 1000);
    const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await setMatchKickoff(db, miniTournament.id, matchId, kickoff);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
    expect(groupA.todayMatches).toHaveLength(0);
  });

  it('computes poolPredictionStats for upcoming match', async () => {
    const kickoff = new Date('2030-06-15T18:00:00Z');
    const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await setMatchKickoff(db, miniTournament.id, matchId, kickoff);

    // userId predicts 2-0 (home win), ownerId predicts 1-1 (draw)
    const userPred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertGroupScore(db, userPred.id, matchId, 2, 0);

    const ownerPred = await getOrCreatePrediction(db, {
      poolId,
      userId: ownerId,
      tournamentId: miniTournament.id,
    });
    await upsertGroupScore(db, ownerPred.id, matchId, 1, 1);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
    const stats = groupA.todayMatches[0]!.poolPredictionStats!;

    expect(stats.totalPredictions).toBe(2);
    expect(stats.homeWinPct).toBe(50);
    expect(stats.drawPct).toBe(50);
    expect(stats.awayWinPct).toBe(0);
    expect(stats.avgHomeGoals).toBe(1.5);
    expect(stats.avgAwayGoals).toBe(0.5);
  });

  it('returns null poolPredictionStats when no predictions exist', async () => {
    const kickoff = new Date('2030-06-15T18:00:00Z');
    const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await setMatchKickoff(db, miniTournament.id, matchId, kickoff);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
    expect(groupA.todayMatches[0]!.poolPredictionStats).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // pointsRaceView
  // ---------------------------------------------------------------------------

  it('includes leaderboard in result', async () => {
    await upsertScore(db, {
      poolId,
      userId,
      pointsTotal: points(150),
      breakdown: {} as ScoreBreakdown,
    });
    const view = await getResultsView({ db, poolId, userId, now: NOW });
    expect(view!.leaderboard).toHaveLength(2); // owner + user
    const myEntry = view!.leaderboard.find((e) => e.userId === userId);
    expect(myEntry?.pointsTotal).toBe(150);
  });

  it('builds match matrix from all pool members group scores', async () => {
    const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await finalizeMatch(db, miniTournament.id, matchId, 2, 0);

    const userPred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertGroupScore(db, userPred.id, matchId, 2, 0); // exact

    const ownerPred = await getOrCreatePrediction(db, {
      poolId,
      userId: ownerId,
      tournamentId: miniTournament.id,
    });
    await upsertGroupScore(db, ownerPred.id, matchId, 1, 0); // outcome

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const { matchMatrix, matrixMatches } = view!.pointsRaceView;

    expect(matrixMatches).toHaveLength(1);
    expect(matrixMatches[0]!.matchId).toBe(matchId);

    const myRow = matchMatrix.find((r) => r.userId === userId);
    expect(myRow?.isCurrentUser).toBe(true);
    expect(myRow?.cells[0]?.hit).toBe('exact');
    expect(myRow?.cells[0]?.points).toBe(miniTournament.scoring.groupMatch.exactScore);

    const ownerRow = matchMatrix.find((r) => r.userId === ownerId);
    expect(ownerRow?.cells[0]?.hit).toBe('outcome');
  });

  it('sorts matchMatrix by totalPoints descending', async () => {
    const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await finalizeMatch(db, miniTournament.id, matchId, 2, 0);

    // owner gets exact, user gets missed → owner should rank 1st
    const userPred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertGroupScore(db, userPred.id, matchId, 0, 2); // missed

    const ownerPred = await getOrCreatePrediction(db, {
      poolId,
      userId: ownerId,
      tournamentId: miniTournament.id,
    });
    await upsertGroupScore(db, ownerPred.id, matchId, 2, 0); // exact

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const { matchMatrix } = view!.pointsRaceView;

    expect(matchMatrix[0]!.userId).toBe(ownerId);
    expect(matchMatrix[1]!.userId).toBe(userId);
  });

  // ---------------------------------------------------------------------------
  // Hit-rate projection
  //
  // Formula: stillLive = round((banked / maxFromResolved) × remainingMax)
  // where maxFromResolved = totalTournamentMax − remainingMax.
  // ---------------------------------------------------------------------------

  it('myStillLive is zero before anything has resolved (no hit-rate signal)', async () => {
    await upsertScore(db, {
      poolId,
      userId,
      pointsTotal: points(100),
      breakdown: {} as ScoreBreakdown,
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const race = view!.pointsRaceView;
    expect(race.myBanked).toBe(100);
    expect(race.myStillLive).toBe(0);
    expect(race.myProjected).toBe(100);
    expect(race.chartStages).not.toContain('Projected');
  });

  it('myStillLive scales with hit rate once some matches have resolved', async () => {
    // Finalise one group match → unlocks `exactScore` of resolved upside.
    const oneMatch = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await finalizeMatch(db, miniTournament.id, oneMatch, 1, 0);

    // User has banked exactly the points that match was worth (hitRate = 1.0).
    await upsertScore(db, {
      poolId,
      userId,
      pointsTotal: points(miniTournament.scoring.groupMatch.exactScore),
      breakdown: {} as ScoreBreakdown,
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const race = view!.pointsRaceView;

    const totalMax = computeRemainingMaxPoints(miniTournament, { finalMatchIds: new Set() }).total;
    const remainingMax = computeRemainingMaxPoints(miniTournament, {
      finalMatchIds: new Set([oneMatch]),
    }).total;
    // hitRate = 1.0 → stillLive equals the entire remaining ceiling.
    expect(race.myStillLive).toBe(remainingMax);
    expect(race.myProjected).toBe(race.myBanked + remainingMax);
    expect(race.myBanked + race.myStillLive).toBe(totalMax);
  });

  it('myStillLive is zero for a user with zero earned points', async () => {
    const oneMatch = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await finalizeMatch(db, miniTournament.id, oneMatch, 1, 0);

    await upsertScore(db, {
      poolId,
      userId,
      pointsTotal: points(0),
      breakdown: {} as ScoreBreakdown,
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    expect(view!.pointsRaceView.myStillLive).toBe(0);
    expect(view!.pointsRaceView.myProjected).toBe(0);
  });

  it('myStillLive scales linearly with banked points', async () => {
    // Finalise two group matches → resolved max = 2 × exactScore = 12.
    const matches = miniTournament.groupMatches.filter((m) => m.group === groupId('A')).slice(0, 2);
    for (const m of matches) await finalizeMatch(db, miniTournament.id, m.id, 1, 0);

    // User has earned 6 of 12 available → hitRate = 0.5.
    const banked = miniTournament.scoring.groupMatch.exactScore; // 6
    await upsertScore(db, {
      poolId,
      userId,
      pointsTotal: points(banked),
      breakdown: {} as ScoreBreakdown,
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const race = view!.pointsRaceView;

    const remainingMax = computeRemainingMaxPoints(miniTournament, {
      finalMatchIds: new Set(matches.map((m) => m.id)),
    }).total;
    expect(race.myStillLive).toBe(Math.round(0.5 * remainingMax));
  });

  it('myStillLive collapses to zero once every match is final', async () => {
    for (const gm of miniTournament.groupMatches) {
      await finalizeMatch(db, miniTournament.id, gm.id, 1, 0);
    }
    for (const key of [
      ...miniTournament.bracket.roundOf8Matches,
      ...miniTournament.bracket.semiFinals,
      miniTournament.bracket.bronzeMatch,
      miniTournament.bracket.finalMatch,
    ]) {
      await upsertKnockoutMatch(db, {
        id: key,
        tournamentId: miniTournament.id,
        stage: 'QF',
        homeTeamId: 'A1',
        awayTeamId: 'B2',
        homeGoals: 1,
        awayGoals: 0,
        winnerTeamId: 'A1',
        status: 'final',
      });
    }

    // Even a user who has earned 100% of resolved points gets 0 upside
    // because there is nothing left to earn.
    await upsertScore(db, {
      poolId,
      userId,
      pointsTotal: points(500),
      breakdown: {} as ScoreBreakdown,
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    expect(view!.pointsRaceView.myStillLive).toBe(0);
    expect(view!.pointsRaceView.chartStages).not.toContain('Projected');
  });

  it('each member projects at their own hit rate (chart slopes differ)', async () => {
    const oneMatch = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await finalizeMatch(db, miniTournament.id, oneMatch, 1, 0);

    // user earned 6 (perfect), owner earned 3 (outcome only)
    await upsertScore(db, {
      poolId,
      userId,
      pointsTotal: points(6),
      breakdown: {} as ScoreBreakdown,
    });
    await upsertScore(db, {
      poolId,
      userId: ownerId,
      pointsTotal: points(3),
      breakdown: {} as ScoreBreakdown,
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const race = view!.pointsRaceView;

    const me = race.projectedEntries.find((e) => e.userId === userId)!;
    const owner = race.projectedEntries.find((e) => e.userId === ownerId)!;

    // user hitRate=1.0, owner hitRate=0.5 → user gets ~2x the still-live.
    expect(me.projectedPoints - me.currentPoints).toBeGreaterThan(
      owner.projectedPoints - owner.currentPoints,
    );
    // Chart slopes must differ.
    const userLine = race.chartPlayers.find((p) => p.userId === userId)!;
    const ownerLine = race.chartPlayers.find((p) => p.userId === ownerId)!;
    const userGrowth =
      userLine.points[userLine.points.length - 1]! - userLine.points[race.chartNowIndex]!;
    const ownerGrowth =
      ownerLine.points[ownerLine.points.length - 1]! - ownerLine.points[race.chartNowIndex]!;
    expect(userGrowth).toBeGreaterThan(ownerGrowth);
  });

  it('a stronger hit rate can overtake a higher current score in projection', async () => {
    // Resolve a couple of matches so hit rates have something to bite into.
    const matches = miniTournament.groupMatches.filter((m) => m.group === groupId('A')).slice(0, 3);
    for (const m of matches) await finalizeMatch(db, miniTournament.id, m.id, 1, 0);

    // owner: lots banked, but low hit rate (5 of 18 = 27.8%)
    await upsertScore(db, {
      poolId,
      userId: ownerId,
      pointsTotal: points(5),
      breakdown: {} as ScoreBreakdown,
    });
    // user: less banked, but perfect hit rate (18 of 18 = 100%)
    await upsertScore(db, {
      poolId,
      userId,
      pointsTotal: points(18),
      breakdown: {} as ScoreBreakdown,
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const me = view!.pointsRaceView.projectedEntries.find((e) => e.userId === userId)!;
    expect(me.currentRank).toBe(1); // ahead in banked too here, but…
    // The key signal: a perfect hit rate keeps you ahead in projection.
    expect(me.projectedRank).toBe(1);
    expect(me.projectedPoints).toBeGreaterThan(
      view!.pointsRaceView.projectedEntries.find((e) => e.userId === ownerId)!.projectedPoints,
    );
  });

  it('chartStages includes Group Stage when group points exist', async () => {
    await upsertScore(db, {
      poolId,
      userId,
      pointsTotal: points(50),
      breakdown: {
        groupMatches: points(30),
        groupOrder: points(20),
        roundOf8: points(0),
        topFour: points(0),
        bronze: points(0),
        final: points(0),
        specials: points(0),
        total: points(50),
      },
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    expect(view!.pointsRaceView.chartStages).toContain('Group Stage');
    expect(view!.pointsRaceView.chartStages[0]).toBe('Start');
  });

  it('chartStages omits Group Stage when no group points exist', async () => {
    const view = await getResultsView({ db, poolId, userId, now: NOW });
    expect(view!.pointsRaceView.chartStages).not.toContain('Group Stage');
    expect(view!.pointsRaceView.chartStages).toContain('Now');
  });

  // ---------------------------------------------------------------------------
  // Day-by-day chart
  // ---------------------------------------------------------------------------

  it('uses date-based stages when completed matches have kickoff dates', async () => {
    const match = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!;
    const kickoff = new Date('2030-06-11T18:00:00Z');
    await setMatchKickoff(db, miniTournament.id, match.id, kickoff);
    await finalizeMatch(db, miniTournament.id, match.id, 2, 1);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const { chartStages, chartNowIndex } = view!.pointsRaceView;

    expect(chartStages[0]).toBe('Start');
    expect(chartStages).toContain('Jun 11');
    expect(chartStages).not.toContain('Group Stage');
    expect(chartNowIndex).toBe(1); // one event date → nowIndex = 1
  });

  it('accumulates group match points per event date', async () => {
    const gAMatches = miniTournament.groupMatches.filter((m) => m.group === groupId('A'));

    // Match 1 on Jun 11: user predicts exact → exact score pts
    const m1 = gAMatches[0]!;
    await setMatchKickoff(db, miniTournament.id, m1.id, new Date('2030-06-11T18:00:00Z'));
    await finalizeMatch(db, miniTournament.id, m1.id, 2, 1);
    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertGroupScore(db, pred.id, m1.id, 2, 1); // exact

    // Match 2 on Jun 12: user predicts outcome only
    const m2 = gAMatches[1]!;
    await setMatchKickoff(db, miniTournament.id, m2.id, new Date('2030-06-12T18:00:00Z'));
    await finalizeMatch(db, miniTournament.id, m2.id, 1, 0);
    await upsertGroupScore(db, pred.id, m2.id, 3, 0); // outcome

    // Score user properly
    const exactPts = miniTournament.scoring.groupMatch.exactScore;
    const outcomePts = miniTournament.scoring.groupMatch.correctOutcome;
    await upsertScore(db, {
      poolId,
      userId,
      pointsTotal: points(exactPts + outcomePts),
      breakdown: {
        groupMatches: points(exactPts + outcomePts),
        groupOrder: points(0),
        roundOf8: points(0),
        topFour: points(0),
        bronze: points(0),
        final: points(0),
        specials: points(0),
        total: points(exactPts + outcomePts),
      },
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const { chartStages, chartPlayers, chartNowIndex } = view!.pointsRaceView;

    expect(chartStages[0]).toBe('Start');
    expect(chartStages[1]).toBe('Jun 11');
    expect(chartStages[2]).toBe('Jun 12');
    expect(chartNowIndex).toBe(2);

    const myLine = chartPlayers.find((p) => p.userId === userId)!;
    expect(myLine.points[0]).toBe(0); // Start
    expect(myLine.points[1]).toBe(exactPts); // Jun 11
    expect(myLine.points[2]).toBe(exactPts + outcomePts); // Jun 12 = Now
  });

  it('assigns group order points to the last match date of the completed group', async () => {
    const gAMatches = miniTournament.groupMatches.filter((m) => m.group === groupId('A'));

    // Finalize all 6 group A matches: home always wins 1-0 (seed order = A1,A2,A3,A4)
    // Last match on Jun 14 → group order revealed on Jun 14
    const dates = [
      '2030-06-11',
      '2030-06-11',
      '2030-06-12',
      '2030-06-12',
      '2030-06-13',
      '2030-06-14',
    ];
    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    for (let i = 0; i < gAMatches.length; i++) {
      const m = gAMatches[i]!;
      await setMatchKickoff(db, miniTournament.id, m.id, new Date(`${dates[i]}T18:00:00Z`));
      await finalizeMatch(db, miniTournament.id, m.id, 1, 0);
      // User predicts home wins 1-0 for all → derives correct order A1,A2,A3,A4
      await upsertGroupScore(db, pred.id, m.id, 1, 0);
    }

    // Score includes groupOrder: all 4 correct
    const groupOrderAllPts = miniTournament.scoring.groupOrder.allCorrect;
    await upsertScore(db, {
      poolId,
      userId,
      pointsTotal: points(groupOrderAllPts),
      breakdown: {
        groupMatches: points(0),
        groupOrder: points(groupOrderAllPts),
        roundOf8: points(0),
        topFour: points(0),
        bronze: points(0),
        final: points(0),
        specials: points(0),
        total: points(groupOrderAllPts),
      },
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const { chartStages, chartPlayers, chartNowIndex } = view!.pointsRaceView;

    expect(chartStages).toContain('Jun 14');
    const myLine = chartPlayers.find((p) => p.userId === userId)!;
    const jun14Idx = chartStages.indexOf('Jun 14');
    // Group order points appear on Jun 14 (last group A match)
    expect(myLine.points[jun14Idx]).toBe(groupOrderAllPts);
    expect(myLine.points[chartNowIndex]).toBe(groupOrderAllPts);
  });

  it('populates prediction fields in todayMatch when user has a prediction', async () => {
    const todayKickoff = new Date('2030-06-15T18:00:00Z');
    const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
    await setMatchKickoff(db, miniTournament.id, matchId, todayKickoff);

    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertGroupScore(db, pred.id, matchId, 3, 1);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
    expect(groupA.todayMatches[0]!.predictedHome).toBe(3);
    expect(groupA.todayMatches[0]!.predictedAway).toBe(1);
  });

  it('sets hit=outcome on non-final knockout tie when picked winner matches actual', async () => {
    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertKnockoutPick(db, pred.id, bracketMatchKey('qf1'), 'A1');
    await upsertKnockoutMatch(db, {
      id: 'qf1',
      tournamentId: miniTournament.id,
      stage: 'QF',
      homeTeamId: 'A1',
      awayTeamId: 'B2',
      homeGoals: 2,
      awayGoals: 0,
      winnerTeamId: 'A1',
      status: 'final',
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const match = view!.bracketRounds
      .find((r) => r.label === 'QF')!
      .matches.find((m) => m.bracketMatchKey === 'qf1')!;
    expect(match.hit).toBe('outcome');
    expect(match.predictedHome).toBeNull();
    expect(match.predictedAway).toBeNull();
  });

  it('sets hit=missed on non-final knockout tie when picked winner lost', async () => {
    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertKnockoutPick(db, pred.id, bracketMatchKey('qf1'), 'B2');
    await upsertKnockoutMatch(db, {
      id: 'qf1',
      tournamentId: miniTournament.id,
      stage: 'QF',
      homeTeamId: 'A1',
      awayTeamId: 'B2',
      homeGoals: 2,
      awayGoals: 0,
      winnerTeamId: 'A1',
      status: 'final',
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const match = view!.bracketRounds
      .find((r) => r.label === 'QF')!
      .matches.find((m) => m.bracketMatchKey === 'qf1')!;
    expect(match.hit).toBe('missed');
  });

  it('sets hit=pending on non-final knockout tie when match has not yet finalized', async () => {
    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertKnockoutPick(db, pred.id, bracketMatchKey('qf1'), 'A1');

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const match = view!.bracketRounds
      .find((r) => r.label === 'QF')!
      .matches.find((m) => m.bracketMatchKey === 'qf1')!;
    expect(match.hit).toBe('pending');
  });

  it('sets hit=exact on Final when predicted score matches actual score', async () => {
    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertKnockoutPick(db, pred.id, bracketMatchKey('final'), 'A1');
    await upsertFinishScore(db, pred.id, 'final', 2, 1);
    await upsertKnockoutMatch(db, {
      id: 'final',
      tournamentId: miniTournament.id,
      stage: 'Final',
      homeTeamId: 'A1',
      awayTeamId: 'B1',
      homeGoals: 2,
      awayGoals: 1,
      winnerTeamId: 'A1',
      status: 'final',
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const finalRound = view!.bracketRounds.find((r) => r.label === 'Final');
    const match = finalRound!.matches[0]!;
    expect(match.hit).toBe('exact');
    expect(match.predictedHome).toBe(2);
    expect(match.predictedAway).toBe(1);
  });

  it('sets hit=outcome on Final when winner matches but score differs', async () => {
    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertKnockoutPick(db, pred.id, bracketMatchKey('final'), 'A1');
    await upsertFinishScore(db, pred.id, 'final', 3, 0);
    await upsertKnockoutMatch(db, {
      id: 'final',
      tournamentId: miniTournament.id,
      stage: 'Final',
      homeTeamId: 'A1',
      awayTeamId: 'B1',
      homeGoals: 2,
      awayGoals: 1,
      winnerTeamId: 'A1',
      status: 'final',
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const match = view!.bracketRounds.find((r) => r.label === 'Final')!.matches[0]!;
    expect(match.hit).toBe('outcome');
    expect(match.predictedHome).toBe(3);
    expect(match.predictedAway).toBe(0);
  });

  it('sets hit=missed on Final when winner pick lost', async () => {
    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertKnockoutPick(db, pred.id, bracketMatchKey('final'), 'B1');
    await upsertFinishScore(db, pred.id, 'final', 1, 2);
    await upsertKnockoutMatch(db, {
      id: 'final',
      tournamentId: miniTournament.id,
      stage: 'Final',
      homeTeamId: 'A1',
      awayTeamId: 'B1',
      homeGoals: 2,
      awayGoals: 1,
      winnerTeamId: 'A1',
      status: 'final',
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const match = view!.bracketRounds.find((r) => r.label === 'Final')!.matches[0]!;
    expect(match.hit).toBe('missed');
  });

  it('sets hit=pending on Final before match finalizes, while still exposing predicted score', async () => {
    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertKnockoutPick(db, pred.id, bracketMatchKey('final'), 'A1');
    await upsertFinishScore(db, pred.id, 'final', 2, 1);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const match = view!.bracketRounds.find((r) => r.label === 'Final')!.matches[0]!;
    expect(match.hit).toBe('pending');
    expect(match.predictedHome).toBe(2);
    expect(match.predictedAway).toBe(1);
  });

  it('populates Bronze predictedHome/predictedAway from finish score', async () => {
    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await upsertFinishScore(db, pred.id, 'bronze', 1, 0);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    expect(view!.bronzeMatch?.predictedHome).toBe(1);
    expect(view!.bronzeMatch?.predictedAway).toBe(0);
    expect(view!.bronzeMatch?.hit).toBe('pending');
  });

  // ---------------------------------------------------------------------------
  // Derived participants
  // ---------------------------------------------------------------------------

  it('fills QF (entry-round) participants from group orders once all group matches are final', async () => {
    // Finalize all 24 group matches (home always wins 1-0).
    // With round-robin results where home always wins: rank by win count within group.
    // Team X1 beats X2,X3,X4 → 9pts (1st), X2 beats X3,X4 → 6pts (2nd), etc.
    for (const gm of miniTournament.groupMatches) {
      await finalizeMatch(db, miniTournament.id, gm.id, 1, 0);
    }

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const qfRound = view!.bracketRounds.find((r) => r.label === 'QF');
    expect(qfRound).toBeTruthy();

    // slot: { match: qf1, home: '1A', away: '2B' } → home='A1', away='B2'
    const qf1Match = qfRound!.matches.find((m) => m.bracketMatchKey === 'qf1');
    expect(qf1Match?.homeTeamId).toBe('A1');
    expect(qf1Match?.awayTeamId).toBe('B2');

    // All QF slots should have both participants resolved
    const allHaveTeams = qfRound!.matches.every((m) => m.homeTeamId && m.awayTeamId);
    expect(allHaveTeams).toBe(true);
  });

  it('fills SF participants from QF winners when QFs are final', async () => {
    // sf1.from = [qf1, qf2]: finalize both QFs with known winners
    await upsertKnockoutMatch(db, {
      id: 'qf1',
      tournamentId: miniTournament.id,
      stage: 'QF',
      homeTeamId: 'A1',
      awayTeamId: 'B2',
      homeGoals: 2,
      awayGoals: 0,
      winnerTeamId: 'A1',
      status: 'final',
    });
    await upsertKnockoutMatch(db, {
      id: 'qf2',
      tournamentId: miniTournament.id,
      stage: 'QF',
      homeTeamId: 'C1',
      awayTeamId: 'D2',
      homeGoals: 1,
      awayGoals: 0,
      winnerTeamId: 'C1',
      status: 'final',
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const sfRound = view!.bracketRounds.find((r) => r.label === 'SF');
    expect(sfRound).toBeTruthy();

    const sf1Match = sfRound!.matches.find((m) => m.bracketMatchKey === 'sf1');
    // sf1 participants come from qf1 winner (A1) and qf2 winner (C1)
    expect(sf1Match?.homeTeamId).toBe('A1');
    expect(sf1Match?.awayTeamId).toBe('C1');
  });

  it('exposes the current user breakdown via userBreakdown', async () => {
    await upsertScore(db, {
      poolId,
      userId,
      pointsTotal: points(6),
      breakdown: {
        groupMatches: points(6),
        groupOrder: points(0),
        bronze: points(0),
        final: points(0),
        roundOf8: points(0),
        topFour: points(0),
        specials: points(0),
        total: points(6),
      } as ScoreBreakdown,
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    expect(view!.userBreakdown).not.toBeNull();
    expect(view!.userBreakdown!.groupMatches).toBe(6);
    expect(view!.userBreakdown!.total).toBe(6);
  });

  it('fills bronze participants from SF losers when SFs are final', async () => {
    // bronze.from = [sf1, sf2]: finalize both SFs with known winners
    // SF1: A1 vs A2 → A1 wins → A2 is loser
    await upsertKnockoutMatch(db, {
      id: 'sf1',
      tournamentId: miniTournament.id,
      stage: 'SF',
      homeTeamId: 'A1',
      awayTeamId: 'A2',
      homeGoals: 2,
      awayGoals: 1,
      winnerTeamId: 'A1',
      status: 'final',
    });
    // SF2: B1 vs B2 → B2 wins → B1 is loser
    await upsertKnockoutMatch(db, {
      id: 'sf2',
      tournamentId: miniTournament.id,
      stage: 'SF',
      homeTeamId: 'B1',
      awayTeamId: 'B2',
      homeGoals: 0,
      awayGoals: 3,
      winnerTeamId: 'B2',
      status: 'final',
    });

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    // SF1 loser = A2 (home=A1 won, so away=A2 lost)
    // SF2 loser = B1 (away=B2 won, so home=B1 lost)
    expect(view!.bronzeMatch?.homeTeamId).toBe('A2');
    expect(view!.bronzeMatch?.awayTeamId).toBe('B1');
  });

  // ---------------------------------------------------------------------------
  // Special bets
  // ---------------------------------------------------------------------------

  describe('specialBets', () => {
    it('returns all 11 bet definitions with pending hit when no actual answers exist', async () => {
      const view = await getResultsView({ db, poolId, userId, now: NOW });
      expect(view!.specialBets).toHaveLength(11);
      expect(view!.specialBets.every((b) => b.hit === 'pending')).toBe(true);
      expect(view!.specialBets.every((b) => b.pointsAwarded === 0)).toBe(true);
    });

    it('marks hit when user pick matches actual team answer', async () => {
      const pred = await getOrCreatePrediction(db, {
        poolId,
        userId,
        tournamentId: miniTournament.id,
      });
      await upsertSpecialBet(db, pred.id, 'groupTopScoringTeam', 'A1');

      await upsertTournamentResults(db, miniTournament.id, {
        matchResults: [],
        groupOrder: {},
        answers: { groupTopScoringTeam: 'A1' as import('@cup/engine').TeamId },
      });

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const bet = view!.specialBets.find((b) => b.key === 'groupTopScoringTeam')!;
      expect(bet.hit).toBe('hit');
      expect(bet.pointsAwarded).toBe(miniTournament.scoring.groupTopScoringTeam);
      expect(bet.userPickDisplay).toBe('Team A1');
      expect(bet.actualAnswerDisplay).toBe('Team A1');
    });

    it('marks missed when user pick differs from actual answer', async () => {
      const pred = await getOrCreatePrediction(db, {
        poolId,
        userId,
        tournamentId: miniTournament.id,
      });
      await upsertSpecialBet(db, pred.id, 'groupTopScoringTeam', 'B1');

      await upsertTournamentResults(db, miniTournament.id, {
        matchResults: [],
        groupOrder: {},
        answers: { groupTopScoringTeam: 'A1' as import('@cup/engine').TeamId },
      });

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const bet = view!.specialBets.find((b) => b.key === 'groupTopScoringTeam')!;
      expect(bet.hit).toBe('missed');
      expect(bet.pointsAwarded).toBe(0);
      expect(bet.userPickDisplay).toBe('Team B1');
      expect(bet.actualAnswerDisplay).toBe('Team A1');
    });

    it('marks missed when no user pick but actual answer exists', async () => {
      await upsertTournamentResults(db, miniTournament.id, {
        matchResults: [],
        groupOrder: {},
        answers: { groupTopScoringTeam: 'A1' as import('@cup/engine').TeamId },
      });

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const bet = view!.specialBets.find((b) => b.key === 'groupTopScoringTeam')!;
      expect(bet.hit).toBe('missed');
      expect(bet.userPickDisplay).toBeNull();
      expect(bet.actualAnswerDisplay).toBe('Team A1');
    });

    it('resolves player display name from tournament player list', async () => {
      const player = miniTournament.players[0]!;
      const pred = await getOrCreatePrediction(db, {
        poolId,
        userId,
        tournamentId: miniTournament.id,
      });
      await upsertSpecialBet(db, pred.id, 'topScorerPlayer', player.id);

      await upsertTournamentResults(db, miniTournament.id, {
        matchResults: [],
        groupOrder: {},
        answers: { topScorerPlayer: player.id as import('@cup/engine').PlayerId },
      });

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const bet = view!.specialBets.find((b) => b.key === 'topScorerPlayer')!;
      expect(bet.hit).toBe('hit');
      expect(bet.userPickDisplay).toBe(player.name);
      expect(bet.actualAnswerDisplay).toBe(player.name);
    });

    it("populates teamId fields with the player's national team for player bets", async () => {
      const player = miniTournament.players[0]!;
      const pred = await getOrCreatePrediction(db, {
        poolId,
        userId,
        tournamentId: miniTournament.id,
      });
      await upsertSpecialBet(db, pred.id, 'topScorerPlayer', player.id);

      await upsertTournamentResults(db, miniTournament.id, {
        matchResults: [],
        groupOrder: {},
        answers: { topScorerPlayer: player.id as import('@cup/engine').PlayerId },
      });

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const bet = view!.specialBets.find((b) => b.key === 'topScorerPlayer')!;
      expect(bet.userPickTeamId).toBe(player.team);
      expect(bet.actualAnswerTeamId).toBe(player.team);
    });

    it('shows all bets as pending in view mode (no userId)', async () => {
      const view = await getResultsView({ db, poolId, now: NOW });
      expect(view!.specialBets.every((b) => b.hit === 'pending')).toBe(true);
      expect(view!.specialBets.every((b) => b.userPickDisplay === null)).toBe(true);
    });

    it('populates currentLeader for pending derivable bets with played matches', async () => {
      // mA1 = A1 vs A2; mA2 = A1 vs A3 — A1 scores 3 goals total across the group stage
      await finalizeMatch(db, miniTournament.id, 'mA1', 2, 0);
      await finalizeMatch(db, miniTournament.id, 'mA2', 1, 0);

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const groupScoring = view!.specialBets.find((b) => b.key === 'groupTopScoringTeam')!;
      expect(groupScoring.hit).toBe('pending');
      expect(groupScoring.currentLeader).not.toBeNull();
      expect(groupScoring.currentLeader!.teamIds).toContain('A1');
      expect(groupScoring.currentLeader!.detail).toBe('3 goals');
    });

    it('leaves currentLeader null for non-derivable pending bets', async () => {
      await finalizeMatch(db, miniTournament.id, 'mA1', 3, 0);

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const topScorer = view!.specialBets.find((b) => b.key === 'topScorerPlayer')!;
      expect(topScorer.hit).toBe('pending');
      expect(topScorer.currentLeader).toBeNull();

      const yellow = view!.specialBets.find((b) => b.key === 'mostYellowCardsTeam')!;
      expect(yellow.currentLeader).toBeNull();

      const firstRed = view!.specialBets.find((b) => b.key === 'firstRedCardPlayer')!;
      expect(firstRed.currentLeader).toBeNull();
    });

    it('leaves currentLeader null on resolved bets even when matches exist', async () => {
      await finalizeMatch(db, miniTournament.id, 'mA1', 3, 0);
      await upsertTournamentResults(db, miniTournament.id, {
        matchResults: [],
        groupOrder: {},
        answers: { groupTopScoringTeam: 'A1' as import('@cup/engine').TeamId },
      });

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const bet = view!.specialBets.find((b) => b.key === 'groupTopScoringTeam')!;
      expect(bet.hit).not.toBe('pending');
      expect(bet.currentLeader).toBeNull();
    });

    it('leaves currentLeader null when no matches have been played', async () => {
      const view = await getResultsView({ db, poolId, userId, now: NOW });
      expect(view!.specialBets.every((b) => b.currentLeader === null)).toBe(true);
    });

    it('returns null poolStats when no member has made the bet', async () => {
      const view = await getResultsView({ db, poolId, userId, now: NOW });
      expect(view!.specialBets.every((b) => b.poolStats === null)).toBe(true);
    });

    it('returns poolStats with correct counts when members have made the same bet', async () => {
      const pred1 = await getOrCreatePrediction(db, {
        poolId,
        userId,
        tournamentId: miniTournament.id,
      });
      await upsertSpecialBet(db, pred1.id, 'groupTopScoringTeam', 'A1');

      const ownerPred = await getOrCreatePrediction(db, {
        poolId,
        userId: ownerId,
        tournamentId: miniTournament.id,
      });
      await upsertSpecialBet(db, ownerPred.id, 'groupTopScoringTeam', 'A1');

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const bet = view!.specialBets.find((b) => b.key === 'groupTopScoringTeam')!;
      expect(bet.poolStats).not.toBeNull();
      expect(bet.poolStats!.totalPredictions).toBe(2);
      expect(bet.poolStats!.topValues[0]!.displayValue).toBe('Team A1');
      expect(bet.poolStats!.topValues[0]!.count).toBe(2);
      expect(bet.poolStats!.topValues[0]!.pct).toBe(100);
      expect(bet.poolStats!.topValues[0]!.teamId).toBe('A1');
    });

    it('returns poolStats sorted by count descending with correct percentages', async () => {
      const pred1 = await getOrCreatePrediction(db, {
        poolId,
        userId,
        tournamentId: miniTournament.id,
      });
      await upsertSpecialBet(db, pred1.id, 'groupTopScoringTeam', 'A1');

      const ownerPred = await getOrCreatePrediction(db, {
        poolId,
        userId: ownerId,
        tournamentId: miniTournament.id,
      });
      await upsertSpecialBet(db, ownerPred.id, 'groupTopScoringTeam', 'B1');

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const bet = view!.specialBets.find((b) => b.key === 'groupTopScoringTeam')!;
      expect(bet.poolStats!.totalPredictions).toBe(2);
      expect(bet.poolStats!.topValues).toHaveLength(2);
      expect(bet.poolStats!.topValues[0]!.pct).toBe(50);
      expect(bet.poolStats!.topValues[1]!.pct).toBe(50);
    });

    it('returns poolStats with teamId null for number bets', async () => {
      const pred = await getOrCreatePrediction(db, {
        poolId,
        userId,
        tournamentId: miniTournament.id,
      });
      await upsertSpecialBet(db, pred.id, 'highestMatchGoals', 5);

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const bet = view!.specialBets.find((b) => b.key === 'highestMatchGoals')!;
      expect(bet.poolStats!.totalPredictions).toBe(1);
      expect(bet.poolStats!.topValues[0]!.displayValue).toBe('5');
      expect(bet.poolStats!.topValues[0]!.teamId).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // userGroupSummary
  // ---------------------------------------------------------------------------

  describe('userGroupSummary', () => {
    it('is null in view mode (no userId)', async () => {
      const view = await getResultsView({ db, poolId, now: NOW });
      expect(view!.userGroupSummary).toBeNull();
    });

    it('earned=0, missed=0 before any group match resolves', async () => {
      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const s = view!.userGroupSummary!;
      const totalMax = computeRemainingMaxPoints(miniTournament, { finalMatchIds: new Set() });
      expect(s.earned).toBe(0);
      expect(s.missed).toBe(0);
      expect(s.canStillGet).toBe(totalMax.groupMatches + totalMax.groupOrder);
    });

    it('earned reflects group points and canStillGet decreases after a group match resolves', async () => {
      const oneMatch = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!;
      await finalizeMatch(db, miniTournament.id, oneMatch.id, 2, 1);

      const exactPts = miniTournament.scoring.groupMatch.exactScore;
      await upsertScore(db, {
        poolId,
        userId,
        pointsTotal: points(exactPts),
        breakdown: {
          groupMatches: points(exactPts),
          groupOrder: points(0),
          roundOf8: points(0),
          topFour: points(0),
          bronze: points(0),
          final: points(0),
          specials: points(0),
          total: points(exactPts),
        },
      });

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const s = view!.userGroupSummary!;
      const remaining = computeRemainingMaxPoints(miniTournament, {
        finalMatchIds: new Set([oneMatch.id]),
      });
      expect(s.earned).toBe(exactPts);
      expect(s.missed).toBe(0);
      expect(s.canStillGet).toBe(remaining.groupMatches + remaining.groupOrder);
    });

    it('missed reflects group points the user did not score', async () => {
      const oneMatch = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!;
      await finalizeMatch(db, miniTournament.id, oneMatch.id, 2, 1);

      await upsertScore(db, {
        poolId,
        userId,
        pointsTotal: points(0),
        breakdown: {
          groupMatches: points(0),
          groupOrder: points(0),
          roundOf8: points(0),
          topFour: points(0),
          bronze: points(0),
          final: points(0),
          specials: points(0),
          total: points(0),
        },
      });

      const totalMax = computeRemainingMaxPoints(miniTournament, { finalMatchIds: new Set() });
      const remaining = computeRemainingMaxPoints(miniTournament, {
        finalMatchIds: new Set([oneMatch.id]),
      });
      const maxFromResolved =
        totalMax.groupMatches +
        totalMax.groupOrder -
        (remaining.groupMatches + remaining.groupOrder);

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const s = view!.userGroupSummary!;
      expect(s.earned).toBe(0);
      expect(s.missed).toBe(maxFromResolved);
      expect(s.canStillGet).toBe(remaining.groupMatches + remaining.groupOrder);
    });
  });

  // ---------------------------------------------------------------------------
  // userKnockoutSummary
  // ---------------------------------------------------------------------------

  describe('userKnockoutSummary', () => {
    it('is null in view mode (no userId)', async () => {
      const view = await getResultsView({ db, poolId, now: NOW });
      expect(view!.userKnockoutSummary).toBeNull();
    });

    it('earned=0, missed=0 before any knockout match resolves', async () => {
      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const s = view!.userKnockoutSummary!;
      const totalMax = computeRemainingMaxPoints(miniTournament, { finalMatchIds: new Set() });
      expect(s.earned).toBe(0);
      expect(s.missed).toBe(0);
      expect(s.canStillGet).toBe(
        totalMax.roundOf8 + totalMax.topFour + totalMax.bronze + totalMax.final,
      );
    });

    it('earned reflects knockout points from the breakdown', async () => {
      await upsertScore(db, {
        poolId,
        userId,
        pointsTotal: points(50),
        breakdown: {
          groupMatches: points(0),
          groupOrder: points(0),
          roundOf8: points(20),
          topFour: points(15),
          bronze: points(10),
          final: points(5),
          specials: points(0),
          total: points(50),
        },
      });

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const s = view!.userKnockoutSummary!;
      expect(s.earned).toBe(50);
    });

    it('canStillGet drops to 0 for topFour/bronze/final when actualResults resolves them', async () => {
      // KO matches are never inserted into the matches table by the sync pipeline, so the
      // engine's finalMatchIds check would wrongly keep these categories open. This test
      // verifies we read resolution state from actualResults instead.
      await upsertTournamentResults(db, miniTournament.id, {
        matchResults: [],
        groupOrder: {},
        answers: {
          topFourOrder: [teamId('A1'), teamId('B1'), teamId('C1'), teamId('D1')],
        },
        bronzeMatch: { home: teamId('C1'), away: teamId('D1'), homeGoals: 1, awayGoals: 0 },
        finalMatch: {
          home: teamId('A1'),
          away: teamId('B1'),
          homeGoals: 2,
          awayGoals: 1,
          decidedBy: 'regulation',
        },
      });

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const s = view!.userKnockoutSummary!;
      const totalMax = computeRemainingMaxPoints(miniTournament, { finalMatchIds: new Set() });

      // topFour/bronze/final are resolved → 0 remaining; roundOf8 still open (no group matches)
      expect(s.canStillGet).toBe(totalMax.roundOf8);
      // earned=0, all resolved max is missed
      expect(s.missed).toBe(totalMax.topFour + totalMax.bronze + totalMax.final);
    });
  });

  // ---------------------------------------------------------------------------
  // userSpecialsSummary
  // ---------------------------------------------------------------------------

  describe('userSpecialsSummary', () => {
    it('is null in view mode (no userId)', async () => {
      const view = await getResultsView({ db, poolId, now: NOW });
      expect(view!.userSpecialsSummary).toBeNull();
    });

    it('all pending and earned=0 when no actual answers exist', async () => {
      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const s = view!.userSpecialsSummary!;
      expect(s.earned).toBe(0);
      expect(s.missed).toBe(0);
      expect(s.canStillGet).toBe(view!.specialBets.reduce((sum, b) => sum + b.points, 0));
    });

    it('earned and missed reflect resolved special bets', async () => {
      const pred = await getOrCreatePrediction(db, {
        poolId,
        userId,
        tournamentId: miniTournament.id,
      });
      // User picks A1 for groupTopScoringTeam (will hit) and B1 for groupTopConcedingTeam (will miss)
      await upsertSpecialBet(db, pred.id, 'groupTopScoringTeam', 'A1');
      await upsertSpecialBet(db, pred.id, 'groupTopConcedingTeam', 'B1');

      await upsertTournamentResults(db, miniTournament.id, {
        matchResults: [],
        groupOrder: {},
        answers: {
          groupTopScoringTeam: 'A1' as import('@cup/engine').TeamId,
          groupTopConcedingTeam: 'C1' as import('@cup/engine').TeamId,
        },
      });

      const view = await getResultsView({ db, poolId, userId, now: NOW });
      const s = view!.userSpecialsSummary!;
      const hitBet = view!.specialBets.find((b) => b.key === 'groupTopScoringTeam')!;
      const missBet = view!.specialBets.find((b) => b.key === 'groupTopConcedingTeam')!;
      expect(s.earned).toBe(hitBet.points);
      expect(s.missed).toBe(missBet.points);
    });
  });

  describe('view mode (no userId)', () => {
    it('returns null userRank and userBreakdown when userId is omitted', async () => {
      const view = await getResultsView({ db, poolId, now: NOW });
      expect(view).not.toBeNull();
      expect(view!.userRank).toBeNull();
      expect(view!.userBreakdown).toBeNull();
    });

    it('builds pointsRaceView with no highlighted player when userId is omitted', async () => {
      const view = await getResultsView({ db, poolId, now: NOW });
      expect(view!.pointsRaceView.chartPlayers.every((p) => !p.isCurrentUser)).toBe(true);
    });

    it('builds completed-match rows without a predicted score when userId is omitted', async () => {
      const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
      await finalizeMatch(db, miniTournament.id, matchId, 2, 1);

      // Seed a prediction for the regular user — view mode should not pick it up.
      const pred = await getOrCreatePrediction(db, {
        poolId,
        userId,
        tournamentId: miniTournament.id,
      });
      await upsertGroupScore(db, pred.id, matchId, 2, 1);

      const view = await getResultsView({ db, poolId, now: NOW });
      const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
      const row = groupA.completedMatches[0]!;
      expect(row.predictedHome).toBeNull();
      expect(row.predictedAway).toBeNull();
      expect(row.hit).toBe('pending');
    });
  });
});
