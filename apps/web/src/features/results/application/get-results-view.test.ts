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
} from '@cup/db';
import * as schema from '@cup/db/schema';
import { miniTournament } from '@cup/engine/testing';
import { groupId, bracketMatchKey, points } from '@cup/engine';
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

  it('does not mark best-third while any group is incomplete', async () => {
    const t: Tournament = {
      ...miniTournament,
      qualification: { autoQualifyPerGroup: 2, bestThirdPlaced: 1 },
    };
    await upsertTournamentDef(db, t, firstKickoff, emptyKickoffs);

    // Finalize only group A — B, C, D remain incomplete
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
    expect(a3.qualifies).toBe(false);
  });

  it('sets group stage as active when some matches are final', async () => {
    await finalizeMatch(db, miniTournament.id, miniTournament.groupMatches[0]!.id, 1, 0);

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    expect(view!.currentStage).toBe('group');
    const groupStage = view!.stageProgress.find((s) => s.key === 'group');
    expect(groupStage!.state).toBe('active');
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

  it('builds projected standings with current user projected from bracket picks', async () => {
    await upsertScore(db, {
      poolId,
      userId,
      pointsTotal: points(100),
      breakdown: {} as ScoreBreakdown,
    });
    await upsertScore(db, {
      poolId,
      userId: ownerId,
      pointsTotal: points(120),
      breakdown: {} as ScoreBreakdown,
    });

    const pred = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    // Give user 2 bracket picks (pending → both still live)
    await upsertKnockoutPick(db, pred.id, bracketMatchKey('qf1'), 'A1');
    await upsertKnockoutPick(db, pred.id, bracketMatchKey('qf2'), 'B1');

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const race = view!.pointsRaceView;

    expect(race.myBanked).toBe(100);
    // 2 still-live picks × roundOf8PerTeam
    const expectedStillLive = 2 * miniTournament.scoring.roundOf8PerTeam;
    expect(race.myStillLive).toBe(expectedStillLive);
    expect(race.myProjected).toBe(100 + expectedStillLive);

    // user projected rank depends on whether projection surpasses owner's 120
    const me = race.projectedEntries.find((e) => e.isCurrentUser);
    expect(me?.currentRank).toBe(2);
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
});
