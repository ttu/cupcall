import type { AppSchema } from '@/shared/db';
import type { Db } from '@cup/db';
import {
  getPoolById,
  getTournamentById,
  getLeaderboard,
  getPrediction,
  getPredictionInputs,
  getMatchesForTournament,
  getGroupScoresByPool,
} from '@cup/db';
import type { MatchRow, LeaderboardEntry, PoolGroupScore } from '@cup/db';
import {
  deriveGroupOrders,
  selectQualifiers,
  matchId,
  computeRemainingMaxPoints,
} from '@cup/engine';
import type { Tournament, GroupId, TeamId, BracketMatchKey, GroupScore } from '@cup/engine';
import type {
  ResultsView,
  GroupResultView,
  GroupMatchResultRow,
  GroupUpcomingMatchRow,
  GroupStandingRow,
  KnockoutMatchView,
  BracketRoundResultView,
  BracketHealth,
  MatchHit,
  UserRankChip,
  PointsRaceView,
  RaceChartPlayer,
  ProjectedEntry,
  MatchMatrixEntry,
  MatrixMatch,
  MatchMatrixCell,
} from '../domain/types';
import { buildStageProgress } from '@/shared/stage-progress';
import type { StageProgress, StageKey } from '@/shared/stage-progress';

type Params = {
  db: Db<AppSchema>;
  poolId: string;
  userId: string;
  now: Date;
};

export async function getResultsView(params: Params): Promise<ResultsView | null> {
  const { db, poolId, userId, now } = params;

  const pool = await getPoolById(db, poolId);
  if (!pool) return null;

  const tournament = await getTournamentById(db, pool.tournamentId);
  if (!tournament?.definition) return null;

  const def = tournament.definition;

  const [leaderboard, prediction, allMatches, poolGroupScores] = await Promise.all([
    getLeaderboard(db, poolId),
    getPrediction(db, poolId, userId as import('@cup/engine').UserId),
    getMatchesForTournament(db, pool.tournamentId),
    getGroupScoresByPool(db, poolId),
  ]);

  const inputs = prediction != null ? await getPredictionInputs(db, prediction.id) : null;

  const userRank = buildUserRank(leaderboard, userId);
  const stageProgress = buildStageProgress(def, allMatches);
  const currentStage = deriveCurrentStage(stageProgress);
  const groupResults = buildGroupResults(def, allMatches, inputs, now);
  const { bracketRounds, bronzeMatch } = buildBracketRounds(def, allMatches, inputs);
  const bracketHealth = buildBracketHealth(bracketRounds, bronzeMatch);

  const pointsRaceView = buildPointsRaceView({
    leaderboard,
    userId,
    allMatches,
    poolGroupScores,
    def,
  });

  return {
    poolName: pool.name,
    tournamentName: tournament.name,
    userRank,
    stageProgress,
    currentStage,
    groupResults,
    bracketRounds,
    bronzeMatch,
    bracketHealth,
    leaderboard,
    pointsRaceView,
  };
}

// ---------------------------------------------------------------------------
// User rank
// ---------------------------------------------------------------------------

function buildUserRank(
  leaderboard: Awaited<ReturnType<typeof getLeaderboard>>,
  userId: string,
): UserRankChip | null {
  const idx = leaderboard.findIndex((e) => e.userId === userId);
  if (idx === -1) return null;
  return {
    rank: idx + 1,
    totalMembers: leaderboard.length,
    points: leaderboard[idx]!.pointsTotal,
  };
}

function deriveCurrentStage(progress: StageProgress[]): StageKey {
  const active = progress.find((s) => s.state === 'active');
  if (active) return active.key;
  const first = progress[0];
  return first?.key ?? 'group';
}

// ---------------------------------------------------------------------------
// Group results
// ---------------------------------------------------------------------------

function buildGroupResults(
  def: Tournament,
  allMatches: MatchRow[],
  inputs: Awaited<ReturnType<typeof getPredictionInputs>> | null,
  now: Date,
): GroupResultView[] {
  const teamMap = new Map<string, string>(def.teams.map((t) => [t.id, t.name]));
  const predMap = new Map<string, { home: number; away: number }>(
    (inputs?.groupScores ?? []).map((gs) => [gs.matchId, { home: gs.home, away: gs.away }]),
  );
  const scoring = def.scoring.groupMatch;
  const bestThirdsSet = computeBestThirds(def, allMatches);

  return def.groups.map((group) => {
    const completedMatches: GroupMatchResultRow[] = allMatches
      .filter((m) => m.stage === 'group' && m.groupId === group.id && m.status === 'final')
      .map((m) => {
        const pred = predMap.get(m.id) ?? null;
        const hit = computeHit(
          m.homeGoals!,
          m.awayGoals!,
          pred?.home ?? null,
          pred?.away ?? null,
          scoring,
        );
        return {
          matchId: m.id,
          groupId: group.id,
          homeTeamId: m.homeTeamId ?? '',
          homeTeamName: teamMap.get(m.homeTeamId ?? '') ?? m.homeTeamId ?? '',
          awayTeamId: m.awayTeamId ?? '',
          awayTeamName: teamMap.get(m.awayTeamId ?? '') ?? m.awayTeamId ?? '',
          kickoff: m.kickoff?.toISOString() ?? null,
          actualHome: m.homeGoals!,
          actualAway: m.awayGoals!,
          predictedHome: pred?.home ?? null,
          predictedAway: pred?.away ?? null,
          hit: hit.hit,
          pointsAwarded: hit.points,
        };
      });

    const todayMatches: GroupUpcomingMatchRow[] = allMatches
      .filter(
        (m) =>
          m.stage === 'group' &&
          m.groupId === group.id &&
          m.status !== 'final' &&
          m.kickoff !== null &&
          isSameUtcDay(m.kickoff, now),
      )
      .map((m) => ({
        matchId: m.id,
        groupId: group.id,
        homeTeamId: m.homeTeamId ?? '',
        homeTeamName: teamMap.get(m.homeTeamId ?? '') ?? m.homeTeamId ?? '',
        awayTeamId: m.awayTeamId ?? '',
        awayTeamName: teamMap.get(m.awayTeamId ?? '') ?? m.awayTeamId ?? '',
        kickoff: m.kickoff!.toISOString(),
        predictedHome: predMap.get(m.id)?.home ?? null,
        predictedAway: predMap.get(m.id)?.away ?? null,
      }));

    const standing = buildGroupStanding(
      def,
      group.id as GroupId,
      allMatches,
      teamMap,
      bestThirdsSet,
    );

    return { groupId: group.id, completedMatches, todayMatches, standing };
  });
}

/**
 * Returns the set of team IDs that qualify as best-third finishers across all groups.
 * Only resolves once every group-stage match is final and `bestThirdPlaced > 0` —
 * otherwise the comparison across groups isn't yet meaningful, so the set is empty.
 */
function computeBestThirds(def: Tournament, allMatches: MatchRow[]): Set<string> {
  if (def.qualification.bestThirdPlaced === 0) return new Set();

  const finalsById = new Map<string, MatchRow>(
    allMatches.filter((m) => m.stage === 'group' && m.status === 'final').map((m) => [m.id, m]),
  );
  const allFinal = def.groupMatches.every((gm) => finalsById.has(gm.id));
  if (!allFinal) return new Set();

  const scores: GroupScore[] = def.groupMatches.map((gm) => {
    const m = finalsById.get(gm.id)!;
    return { matchId: matchId(gm.id), home: m.homeGoals!, away: m.awayGoals! };
  });

  const groupOrders = deriveGroupOrders(def, scores);
  const qualifiers = selectQualifiers(def, scores, groupOrders);
  const autoCount = def.groups.length * def.qualification.autoQualifyPerGroup;
  return new Set(qualifiers.slice(autoCount));
}

function buildGroupStanding(
  def: Tournament,
  groupId: GroupId,
  allMatches: MatchRow[],
  teamMap: Map<string, string>,
  bestThirdsSet: Set<string>,
): GroupStandingRow[] {
  const group = def.groups.find((g) => g.id === groupId);
  if (!group) return [];

  const stats = new Map<string, { w: number; d: number; l: number; gf: number; ga: number }>(
    group.teams.map((t) => [t, { w: 0, d: 0, l: 0, gf: 0, ga: 0 }]),
  );

  for (const m of allMatches) {
    if (m.stage !== 'group' || m.groupId !== groupId || m.status !== 'final') continue;
    if (!m.homeTeamId || !m.awayTeamId) continue;

    const h = stats.get(m.homeTeamId);
    const a = stats.get(m.awayTeamId);
    if (!h || !a) continue;

    const hg = m.homeGoals!;
    const ag = m.awayGoals!;
    h.gf += hg;
    h.ga += ag;
    a.gf += ag;
    a.ga += hg;

    if (hg > ag) {
      h.w++;
      a.l++;
    } else if (hg < ag) {
      a.w++;
      h.l++;
    } else {
      h.d++;
      a.d++;
    }
  }

  const autoQualify = def.qualification.autoQualifyPerGroup;

  // Sort: points → GD → GF → seed order
  const ranked = group.teams
    .map((tid, seed) => {
      const s = stats.get(tid) ?? { w: 0, d: 0, l: 0, gf: 0, ga: 0 };
      const pts = s.w * 3 + s.d;
      return { tid, seed, s, pts, gd: s.gf - s.ga };
    })
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.s.gf !== a.s.gf) return b.s.gf - a.s.gf;
      return a.seed - b.seed;
    });

  return ranked.map(({ tid, s, pts, gd }, i) => {
    let qualifies: 'auto' | 'best-third' | false = false;
    if (i < autoQualify) {
      qualifies = 'auto';
    } else if (i === autoQualify && bestThirdsSet.has(tid)) {
      qualifies = 'best-third';
    }
    return {
      position: i + 1,
      teamId: tid,
      teamName: teamMap.get(tid) ?? tid,
      played: s.w + s.d + s.l,
      won: s.w,
      drawn: s.d,
      lost: s.l,
      goalsFor: s.gf,
      goalsAgainst: s.ga,
      goalDifference: gd,
      points: pts,
      qualifies,
    };
  });
}

// ---------------------------------------------------------------------------
// Knockout bracket
// ---------------------------------------------------------------------------

function buildBracketRounds(
  def: Tournament,
  allMatches: MatchRow[],
  inputs: Awaited<ReturnType<typeof getPredictionInputs>> | null,
): { bracketRounds: BracketRoundResultView[]; bronzeMatch: KnockoutMatchView | null } {
  const teamMap = new Map<string, string>(def.teams.map((t) => [t.id, t.name]));
  const matchByKey = new Map<string, MatchRow>(allMatches.map((m) => [m.id, m]));
  const pickMap = new Map<string, string>(
    (inputs?.knockoutPicks ?? []).map((kp) => [kp.bracketMatchKey, kp.winner]),
  );

  const buildMatchView = (key: BracketMatchKey, round: string): KnockoutMatchView => {
    const actual = matchByKey.get(key) ?? null;
    const pickedId = pickMap.get(key) ?? null;

    const homeId = actual?.homeTeamId ?? null;
    const awayId = actual?.awayTeamId ?? null;
    const winnerId = actual?.winnerTeamId ?? null;

    let pickStatus: KnockoutMatchView['pickStatus'] = 'no-pick';
    if (pickedId) {
      if (!winnerId) {
        pickStatus = 'pending';
      } else if (winnerId === pickedId) {
        pickStatus = 'alive';
      } else {
        pickStatus = 'busted';
      }
    }

    return {
      bracketMatchKey: key,
      round,
      homeTeamId: homeId,
      homeTeamName: homeId ? (teamMap.get(homeId) ?? homeId) : null,
      awayTeamId: awayId,
      awayTeamName: awayId ? (teamMap.get(awayId) ?? awayId) : null,
      actualHome: actual?.homeGoals ?? null,
      actualAway: actual?.awayGoals ?? null,
      actualWinnerId: winnerId,
      actualWinnerName: winnerId ? (teamMap.get(winnerId) ?? winnerId) : null,
      kickoff: actual?.kickoff?.toISOString() ?? null,
      status: actual?.status === 'final' ? 'final' : 'scheduled',
      pickedWinnerId: pickedId,
      pickedWinnerName: pickedId ? (teamMap.get(pickedId) ?? pickedId) : null,
      pickStatus,
    };
  };

  const { bracket } = def;
  const mainRounds = bracket.rounds.filter((r) => r !== 'Final' && r !== 'bronze');

  // Collect all bracket match keys per round from slots + progression
  const keysByRound = new Map<string, BracketMatchKey[]>();

  for (const slot of bracket.slots) {
    const round = getRoundLabel(slot.match, bracket.rounds);
    if (!keysByRound.has(round)) keysByRound.set(round, []);
    keysByRound.get(round)!.push(slot.match);
  }

  for (const prog of bracket.progression) {
    if (prog.match === bracket.finalMatch || prog.match === bracket.bronzeMatch) continue;
    const round = getRoundLabel(prog.match, bracket.rounds);
    if (!keysByRound.has(round)) keysByRound.set(round, []);
    keysByRound.get(round)!.push(prog.match);
  }

  const bracketRounds: BracketRoundResultView[] = mainRounds
    .filter((r) => keysByRound.has(r))
    .map((r) => ({
      label: r,
      matches: (keysByRound.get(r) ?? []).map((key) => buildMatchView(key, r)),
    }));

  // Final (its own round in the display)
  const finalRound: BracketRoundResultView = {
    label: 'Final',
    matches: [buildMatchView(bracket.finalMatch, 'Final')],
  };
  bracketRounds.push(finalRound);

  const bronzeMatch = buildMatchView(bracket.bronzeMatch, 'Bronze');

  return { bracketRounds, bronzeMatch };
}

// ---------------------------------------------------------------------------
// Bracket health
// ---------------------------------------------------------------------------

function buildBracketHealth(
  rounds: BracketRoundResultView[],
  bronze: KnockoutMatchView | null,
): BracketHealth {
  const allMatches = [...rounds.flatMap((r) => r.matches), ...(bronze ? [bronze] : [])].filter(
    (m) => m.pickStatus !== 'no-pick',
  );

  return {
    totalPicks: allMatches.length,
    alivePicks: allMatches.filter((m) => m.pickStatus === 'alive').length,
    bustedPicks: allMatches.filter((m) => m.pickStatus === 'busted').length,
  };
}

// ---------------------------------------------------------------------------
// Points race
// ---------------------------------------------------------------------------

const RACE_COLORS = [
  'var(--orange-500)',
  'oklch(0.55 0.13 250)',
  'oklch(0.64 0.12 30)',
  'oklch(0.72 0.02 160)',
  'oklch(0.65 0.10 60)',
  'oklch(0.55 0.12 280)',
  'oklch(0.70 0.10 200)',
  'oklch(0.60 0.08 100)',
];

type RaceParams = {
  leaderboard: LeaderboardEntry[];
  userId: string;
  allMatches: MatchRow[];
  poolGroupScores: PoolGroupScore[];
  def: Tournament;
};

function buildPointsRaceView(params: RaceParams): PointsRaceView {
  const { leaderboard, userId, allMatches, poolGroupScores, def } = params;

  // Tournament-wide remaining-max ceiling: the max additional points anyone
  // could still earn from now until the tournament ends. We apply it to every
  // member so the projection reflects realistic potential rather than the old
  // `totalPicks × roundOf8PerTeam` heuristic.
  const finalMatchIds = new Set(allMatches.filter((m) => m.status === 'final').map((m) => m.id));
  const remainingMax = computeRemainingMaxPoints(def, { finalMatchIds });

  const myEntry = leaderboard.find((e) => e.userId === userId);
  const myBanked = myEntry?.pointsTotal ?? 0;
  const myStillLive = remainingMax.total;
  const myProjected = myBanked + myStillLive;

  // Chart stages
  const hasGroupStagePoints = leaderboard.some(
    (e) => e.breakdown && e.breakdown.groupMatches + e.breakdown.groupOrder > 0,
  );
  const stages: string[] = ['Start'];
  if (hasGroupStagePoints) stages.push('Group Stage');
  stages.push('Now');
  const nowIndex = stages.length - 1;
  if (myStillLive > 0) stages.push('Projected');

  let colorIdx = 0;
  const chartPlayers: RaceChartPlayer[] = leaderboard.map((e) => {
    const isCurrentUser = e.userId === userId;
    const color = isCurrentUser
      ? 'var(--green-500)'
      : (RACE_COLORS[colorIdx++] ?? 'var(--ink-muted)');

    const pts: number[] = [0]; // Start
    if (hasGroupStagePoints) {
      pts.push(e.breakdown ? e.breakdown.groupMatches + e.breakdown.groupOrder : 0);
    }
    pts.push(e.pointsTotal); // Now
    if (myStillLive > 0) {
      pts.push(e.pointsTotal + myStillLive);
    }

    return { userId: e.userId, displayName: e.displayName, isCurrentUser, color, points: pts };
  });
  // Draw current user last (on top in SVG).
  chartPlayers.sort((a, b) => (a.isCurrentUser ? 1 : 0) - (b.isCurrentUser ? 1 : 0));

  const projectedEntries = buildProjectedEntries(leaderboard, userId, myStillLive);
  const { matchMatrix, matrixMatches } = buildMatchMatrix(
    leaderboard,
    userId,
    allMatches,
    poolGroupScores,
    def,
  );

  return {
    chartStages: stages,
    chartNowIndex: nowIndex,
    chartPlayers,
    myBanked,
    myStillLive,
    myProjected,
    projectedEntries,
    matchMatrix,
    matrixMatches,
  };
}

function buildProjectedEntries(
  leaderboard: LeaderboardEntry[],
  userId: string,
  stillLive: number,
): ProjectedEntry[] {
  const currentRankMap = new Map<string, number>(leaderboard.map((e, i) => [e.userId, i + 1]));

  const withProjected = leaderboard.map((e) => ({
    userId: e.userId,
    displayName: e.displayName,
    isCurrentUser: e.userId === userId,
    currentPoints: e.pointsTotal,
    projectedPoints: e.pointsTotal + stillLive,
  }));

  const sorted = [...withProjected].sort((a, b) => b.projectedPoints - a.projectedPoints);

  return sorted.map((e, i) => {
    const currentRank = currentRankMap.get(e.userId) ?? 0;
    const projectedRank = i + 1;
    return {
      userId: e.userId,
      displayName: e.displayName,
      isCurrentUser: e.isCurrentUser,
      currentPoints: e.currentPoints,
      currentRank,
      projectedPoints: e.projectedPoints,
      projectedRank,
      rankDelta: currentRank - projectedRank,
    };
  });
}

function buildMatchMatrix(
  leaderboard: LeaderboardEntry[],
  userId: string,
  allMatches: MatchRow[],
  poolGroupScores: PoolGroupScore[],
  def: Tournament,
): { matchMatrix: MatchMatrixEntry[]; matrixMatches: MatrixMatch[] } {
  const teamMap = new Map<string, string>(def.teams.map((t) => [t.id, t.name]));
  const scoring = def.scoring.groupMatch;

  const completedGroupMatches = allMatches
    .filter((m) => m.stage === 'group' && m.status === 'final')
    .sort((a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0));

  const matrixMatches: MatrixMatch[] = completedGroupMatches.map((m) => ({
    matchId: m.id,
    homeTeamId: m.homeTeamId ?? '',
    homeTeamName: teamMap.get(m.homeTeamId ?? '') ?? m.homeTeamId ?? '',
    awayTeamId: m.awayTeamId ?? '',
    awayTeamName: teamMap.get(m.awayTeamId ?? '') ?? m.awayTeamId ?? '',
    actualHome: m.homeGoals!,
    actualAway: m.awayGoals!,
  }));

  const predMap = new Map<string, { home: number; away: number }>();
  for (const gs of poolGroupScores) {
    predMap.set(`${gs.userId}::${gs.matchId}`, { home: gs.home, away: gs.away });
  }

  const matchMatrix: MatchMatrixEntry[] = leaderboard.map((e) => {
    let totalPoints = 0;
    const cells: MatchMatrixCell[] = completedGroupMatches.map((m) => {
      const pred = predMap.get(`${e.userId}::${m.id}`) ?? null;
      const hit = computeHit(
        m.homeGoals!,
        m.awayGoals!,
        pred?.home ?? null,
        pred?.away ?? null,
        scoring,
      );
      totalPoints += hit.points;
      return { matchId: m.id, hit: hit.hit, points: hit.points };
    });
    return {
      userId: e.userId,
      displayName: e.displayName,
      isCurrentUser: e.userId === userId,
      cells,
      totalPoints,
    };
  });

  matchMatrix.sort((a, b) => b.totalPoints - a.totalPoints);

  return { matchMatrix, matrixMatches };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeHit(
  actualHome: number,
  actualAway: number,
  predictedHome: number | null,
  predictedAway: number | null,
  scoring: { exactScore: number; correctOutcome: number },
): { hit: MatchHit; points: number } {
  if (predictedHome === null || predictedAway === null) return { hit: 'pending', points: 0 };
  if (predictedHome === actualHome && predictedAway === actualAway) {
    return { hit: 'exact', points: scoring.exactScore };
  }
  const actualOutcome = Math.sign(actualHome - actualAway);
  const predictedOutcome = Math.sign(predictedHome - predictedAway);
  if (actualOutcome === predictedOutcome) {
    return { hit: 'outcome', points: scoring.correctOutcome };
  }
  return { hit: 'missed', points: 0 };
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function getRoundLabel(matchKey: string, rounds: string[]): string {
  const prefixMap: Record<string, string> = {
    'ro32-': 'R32',
    'ro16-': 'R16',
    'qf-': 'QF',
    'sf-': 'SF',
  };
  for (const [prefix, label] of Object.entries(prefixMap)) {
    if (matchKey.startsWith(prefix)) return label;
  }
  for (const r of rounds) {
    if (matchKey.toLowerCase().startsWith(r.toLowerCase().replace(/\s+/g, '-'))) return r;
  }
  return matchKey;
}
