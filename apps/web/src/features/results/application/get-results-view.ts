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
  getActualResults,
} from '@cup/db';
import type { MatchRow, LeaderboardEntry, PoolGroupScore } from '@cup/db';
import {
  deriveGroupOrders,
  selectQualifiers,
  matchId,
  computeRemainingMaxPoints,
  resolveSlot,
} from '@cup/engine';
import type {
  Tournament,
  GroupId,
  TeamId,
  BracketMatchKey,
  GroupScore,
  ActualResults,
  SpecialBets,
} from '@cup/engine';
import { getSpecialBetDefs } from '@cup/engine';
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
  MatchPredictionStats,
  UserRankChip,
  PointsRaceView,
  RaceChartPlayer,
  ProjectedEntry,
  MatchMatrixEntry,
  MatrixMatch,
  MatchMatrixCell,
  SpecialBetResultRow,
} from '../domain/types';
import { buildStageProgress } from '@/shared/stage-progress';
import type { StageProgress, StageKey } from '@/shared/stage-progress';

type Params = {
  db: Db<AppSchema>;
  poolId: string;
  userId?: string;
  now: Date;
};

export async function getResultsView(params: Params): Promise<ResultsView | null> {
  const { db, poolId, userId, now } = params;

  const pool = await getPoolById(db, poolId);
  if (!pool) return null;

  const tournament = await getTournamentById(db, pool.tournamentId);
  if (!tournament?.definition) return null;

  const def = tournament.definition;

  const [leaderboard, prediction, allMatches, poolGroupScores, actualResults] = await Promise.all([
    getLeaderboard(db, poolId),
    userId !== undefined
      ? getPrediction(db, poolId, userId as import('@cup/engine').UserId)
      : Promise.resolve(null),
    getMatchesForTournament(db, pool.tournamentId),
    getGroupScoresByPool(db, poolId),
    getActualResults(db, pool.tournamentId),
  ]);

  const inputs = prediction != null ? await getPredictionInputs(db, prediction.id) : null;

  const userRank = userId !== undefined ? buildUserRank(leaderboard, userId) : null;
  const userBreakdown =
    userId !== undefined ? (leaderboard.find((e) => e.userId === userId)?.breakdown ?? null) : null;
  const stageProgress = buildStageProgress(def, allMatches);
  const currentStage = deriveCurrentStage(stageProgress);
  const groupResults = buildGroupResults(def, allMatches, inputs, poolGroupScores, now);
  const { bracketRounds, bronzeMatch } = buildBracketRounds(def, allMatches, inputs);
  const bracketHealth = buildBracketHealth(bracketRounds, bronzeMatch);

  const pointsRaceView = buildPointsRaceView({
    leaderboard,
    userId: userId ?? null,
    allMatches,
    poolGroupScores,
    def,
  });

  const specialBets = buildSpecialBetResults(def, inputs, actualResults);

  return {
    poolName: pool.name,
    tournamentName: tournament.name,
    userRank,
    userBreakdown,
    stageProgress,
    currentStage,
    groupResults,
    bracketRounds,
    bronzeMatch,
    bracketHealth,
    leaderboard,
    pointsRaceView,
    specialBets,
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
  poolGroupScores: PoolGroupScore[],
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
          isWithinNext24h(m.kickoff, now),
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
        poolPredictionStats: computeMatchPredictionStats(m.id, poolGroupScores),
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
  const derivedParticipants = computeDerivedParticipants(def, allMatches);

  const finishScores = inputs?.finishScores ?? {};
  const finalMatchKey = def.bracket.finalMatch;
  const bronzeMatchKey = def.bracket.bronzeMatch;

  const buildMatchView = (key: BracketMatchKey, round: string): KnockoutMatchView => {
    const actual = matchByKey.get(key) ?? null;
    const pickedId = pickMap.get(key) ?? null;

    const derivedPair = derivedParticipants.get(key);
    const homeId = actual?.homeTeamId ?? derivedPair?.[0] ?? null;
    const awayId = actual?.awayTeamId ?? derivedPair?.[1] ?? null;
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

    // Predicted score: only Final and Bronze have a finish score.
    let predictedHome: number | null = null;
    let predictedAway: number | null = null;
    if (key === finalMatchKey && finishScores.final) {
      predictedHome = finishScores.final.home;
      predictedAway = finishScores.final.away;
    } else if (key === bronzeMatchKey && finishScores.bronze) {
      predictedHome = finishScores.bronze.home;
      predictedAway = finishScores.bronze.away;
    }

    // Per-tie hit
    const hit = computeKnockoutHit({
      pickedWinnerId: pickedId,
      actualWinnerId: winnerId,
      predictedHome,
      predictedAway,
      actualHome: actual?.homeGoals ?? null,
      actualAway: actual?.awayGoals ?? null,
    });

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
      predictedHome,
      predictedAway,
      hit,
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
    if (prog.match === finalMatchKey || prog.match === bronzeMatchKey) continue;
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
    matches: [buildMatchView(finalMatchKey, 'Final')],
  };
  bracketRounds.push(finalRound);

  const bronzeMatch = buildMatchView(bronzeMatchKey, 'Bronze');

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
  userId: string | null;
  allMatches: MatchRow[];
  poolGroupScores: PoolGroupScore[];
  def: Tournament;
};

/**
 * Per-user still-live projection.
 *
 * Formula: `stillLive = hitRate × remainingMax`, where
 *   hitRate    = banked / maxFromResolved
 *   resolvedMax = tournament-wide max ceiling − tournament-wide remaining max
 *
 * In words: "if the user keeps hitting at the same rate as they have so far,
 * how many points should they pick up from what's still pendable?"
 *
 * Edge cases:
 *  - `maxFromResolved <= 0` (nothing has resolved yet) → no signal to project
 *    from, so stillLive = 0. Projection collapses to current points and the
 *    chart's Projected stage is omitted.
 *  - `remainingMax <= 0` (tournament complete) → stillLive = 0 by construction.
 */
function projectStillLive(banked: number, maxFromResolved: number, remainingMax: number): number {
  if (maxFromResolved <= 0 || remainingMax <= 0) return 0;
  const hitRate = banked / maxFromResolved;
  return Math.round(hitRate * remainingMax);
}

function buildPointsRaceView(params: RaceParams): PointsRaceView {
  const { leaderboard, userId, allMatches, poolGroupScores, def } = params;

  const finalMatchIds = new Set(allMatches.filter((m) => m.status === 'final').map((m) => m.id));
  const totalMax = computeRemainingMaxPoints(def, { finalMatchIds: new Set() });
  const remainingMax = computeRemainingMaxPoints(def, { finalMatchIds });
  const maxFromResolved = totalMax.total - remainingMax.total;

  const stillLiveByUser = new Map<string, number>(
    leaderboard.map((e) => [
      e.userId,
      projectStillLive(e.pointsTotal, maxFromResolved, remainingMax.total),
    ]),
  );

  const myBanked = userId ? (leaderboard.find((e) => e.userId === userId)?.pointsTotal ?? 0) : 0;
  const myStillLive = userId ? (stillLiveByUser.get(userId) ?? 0) : 0;
  const myProjected = myBanked + myStillLive;
  const anyStillLive = Array.from(stillLiveByUser.values()).some((v) => v > 0);

  // Build event dates: unique UTC dates when at least one match was finalized with a kickoff.
  const eventDates = buildRaceEventDates(allMatches);

  let stages: string[];
  let nowIndex: number;
  let chartPlayers: RaceChartPlayer[];

  if (eventDates.length > 0) {
    // Day-by-day chart: one data point per match date.
    const result = buildDailyChartPlayers({
      eventDates,
      leaderboard,
      userId,
      allMatches,
      poolGroupScores,
      def,
      anyStillLive,
      stillLiveByUser,
    });
    stages = result.stages;
    nowIndex = result.nowIndex;
    chartPlayers = result.chartPlayers;
  } else {
    // Fallback: milestone chart (matches exist but no kickoff dates set).
    const hasGroupStagePoints = leaderboard.some(
      (e) => e.breakdown && e.breakdown.groupMatches + e.breakdown.groupOrder > 0,
    );
    stages = ['Start'];
    if (hasGroupStagePoints) stages.push('Group Stage');
    stages.push('Now');
    nowIndex = stages.length - 1;
    if (anyStillLive) stages.push('Projected');

    let colorIdx = 0;
    chartPlayers = leaderboard.map((e) => {
      const isCurrentUser = userId !== null && e.userId === userId;
      const color = isCurrentUser
        ? 'var(--green-500)'
        : (RACE_COLORS[colorIdx++] ?? 'var(--ink-muted)');
      const pts: number[] = [0];
      if (hasGroupStagePoints) {
        pts.push(e.breakdown ? e.breakdown.groupMatches + e.breakdown.groupOrder : 0);
      }
      pts.push(e.pointsTotal);
      if (anyStillLive) pts.push(e.pointsTotal + (stillLiveByUser.get(e.userId) ?? 0));
      return { userId: e.userId, displayName: e.displayName, isCurrentUser, color, points: pts };
    });
    chartPlayers.sort((a, b) => (a.isCurrentUser ? 1 : 0) - (b.isCurrentUser ? 1 : 0));
  }

  const projectedEntries = buildProjectedEntries(leaderboard, userId, stillLiveByUser);
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

// ---------------------------------------------------------------------------
// Day-by-day chart helpers
// ---------------------------------------------------------------------------

/** UTC date string from a Date, e.g. "2026-06-11". */
function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Format "2026-06-11" as "Jun 11". */
function formatRaceDate(dateStr: string): string {
  const parts = dateStr.split('-');
  const month = parseInt(parts[1] ?? '1', 10);
  const day = parseInt(parts[2] ?? '1', 10);
  return `${MONTH_ABBR[month - 1] ?? '?'} ${day}`;
}

/**
 * Returns sorted unique UTC date strings for all completed matches that have a kickoff set.
 * Only dates with at least one finalized match appear.
 */
function buildRaceEventDates(allMatches: MatchRow[]): string[] {
  const dates = new Set<string>();
  for (const m of allMatches) {
    if (m.status === 'final' && m.kickoff) dates.add(utcDateStr(m.kickoff));
  }
  return [...dates].sort();
}

/**
 * Per-user, per-date group match point deltas.
 * Result: Map<userId, Map<dateStr, deltaPoints>>
 */
function buildGroupMatchDeltas(
  poolGroupScores: PoolGroupScore[],
  allMatches: MatchRow[],
  scoring: { exactScore: number; correctOutcome: number },
): Map<string, Map<string, number>> {
  const predMap = new Map<string, { home: number; away: number }>();
  for (const gs of poolGroupScores) {
    predMap.set(`${gs.userId}::${gs.matchId}`, { home: gs.home, away: gs.away });
  }

  const result = new Map<string, Map<string, number>>();
  const completedGroup = allMatches.filter(
    (m) => m.stage === 'group' && m.status === 'final' && m.kickoff !== null,
  );

  for (const m of completedGroup) {
    const dateStr = utcDateStr(m.kickoff!);
    // Collect all user IDs that have a prediction for this match.
    for (const gs of poolGroupScores) {
      if (gs.matchId !== m.id) continue;
      const pred = predMap.get(`${gs.userId}::${m.id}`);
      const { points: pts } = computeHit(
        m.homeGoals!,
        m.awayGoals!,
        pred?.home ?? null,
        pred?.away ?? null,
        scoring,
      );
      if (pts === 0) continue;
      if (!result.has(gs.userId)) result.set(gs.userId, new Map());
      result.get(gs.userId)!.set(dateStr, (result.get(gs.userId)!.get(dateStr) ?? 0) + pts);
    }
  }

  return result;
}

/**
 * Per-user, per-date group ORDER point deltas.
 * Group order points are assigned to the date of the last completed match in a group.
 * Result: Map<userId, Map<dateStr, deltaPoints>>
 */
function buildGroupOrderDeltas(
  poolGroupScores: PoolGroupScore[],
  allMatches: MatchRow[],
  def: Tournament,
  leaderboard: LeaderboardEntry[],
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();

  // Actual group orders from all finalized group matches.
  const actualScores = allMatches
    .filter((m) => m.stage === 'group' && m.status === 'final')
    .map((m) => ({ matchId: matchId(m.id), home: m.homeGoals!, away: m.awayGoals! }));
  const actualGroupOrders = deriveGroupOrders(def, actualScores);

  // Per-user predicted group orders.
  const userPredScores = new Map<string, typeof actualScores>();
  for (const gs of poolGroupScores) {
    if (!userPredScores.has(gs.userId)) userPredScores.set(gs.userId, []);
    userPredScores
      .get(gs.userId)!
      .push({ matchId: matchId(gs.matchId), home: gs.home, away: gs.away });
  }
  const userPredOrders = new Map<string, Record<GroupId, TeamId[]>>();
  for (const entry of leaderboard) {
    userPredOrders.set(
      entry.userId,
      deriveGroupOrders(def, userPredScores.get(entry.userId) ?? []),
    );
  }

  // Group → set of match IDs.
  const groupMatchIds = new Map<string, Set<string>>();
  for (const gm of def.groupMatches) {
    if (!groupMatchIds.has(gm.group)) groupMatchIds.set(gm.group, new Set());
    groupMatchIds.get(gm.group)!.add(gm.id);
  }

  for (const group of def.groups) {
    const matchIds = groupMatchIds.get(group.id) ?? new Set();
    const groupMatches = allMatches.filter((m) => matchIds.has(m.id));

    // Group must be fully complete.
    if (!groupMatches.every((m) => m.status === 'final')) continue;

    // Need at least one kickoff to assign a date.
    const withKickoff = groupMatches.filter((m) => m.kickoff !== null);
    if (withKickoff.length === 0) continue;

    const lastMatch = withKickoff.reduce((a, b) =>
      b.kickoff!.getTime() > a.kickoff!.getTime() ? b : a,
    );
    const groupDate = utcDateStr(lastMatch.kickoff!);

    const actualOrder = actualGroupOrders[group.id];
    if (!actualOrder) continue;

    for (const entry of leaderboard) {
      const userOrder = (userPredOrders.get(entry.userId) ?? {})[group.id];
      if (!userOrder) continue;

      let positionsCorrect = 0;
      for (let i = 0; i < Math.min(userOrder.length, actualOrder.length); i++) {
        if (userOrder[i] === actualOrder[i]) positionsCorrect++;
      }

      const pts = raceGroupOrderPts(positionsCorrect, def.scoring.groupOrder);
      if (pts === 0) continue;

      if (!result.has(entry.userId)) result.set(entry.userId, new Map());
      result
        .get(entry.userId)!
        .set(groupDate, (result.get(entry.userId)!.get(groupDate) ?? 0) + pts);
    }
  }

  return result;
}

function raceGroupOrderPts(
  n: number,
  scoring: { allCorrect: number; twoCorrect: number; oneCorrect: number },
): number {
  if (n === 4) return scoring.allCorrect;
  if (n === 2) return scoring.twoCorrect;
  if (n === 1) return scoring.oneCorrect;
  return 0;
}

/**
 * Knockout & specials milestone point deltas from leaderboard breakdown.
 * Each breakdown component is assigned to the date of its scoring milestone.
 * Result: Map<userId, Map<dateStr, deltaPoints>>
 */
function buildKnockoutMilestoneDeltas(
  leaderboard: LeaderboardEntry[],
  allMatches: MatchRow[],
  def: Tournament,
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();

  // roundOf8: resolved when all entry-round (roundOf8Matches) are final.
  const roundOf8Date = raceMilestoneDate(def.bracket.roundOf8Matches, allMatches);
  // bronze: resolved when bronze match is final.
  const bronzeDate = raceMilestoneDate([def.bracket.bronzeMatch], allMatches);
  // final + topFour + specials: resolved when final match is final.
  const finalDate = raceMilestoneDate([def.bracket.finalMatch], allMatches);
  // topFour needs full top-4 standings (final + bronze), use later of the two.
  const topFourDate = maxDateStr(finalDate, bronzeDate);

  for (const entry of leaderboard) {
    const bd = entry.breakdown;
    if (!bd) continue;

    const add = (date: string | null, pts: number) => {
      if (!date || pts === 0) return;
      if (!result.has(entry.userId)) result.set(entry.userId, new Map());
      result.get(entry.userId)!.set(date, (result.get(entry.userId)!.get(date) ?? 0) + pts);
    };

    add(roundOf8Date, bd.roundOf8);
    add(bronzeDate, bd.bronze);
    add(topFourDate, bd.topFour);
    add(finalDate, bd.final);
    add(finalDate, bd.specials);
  }

  return result;
}

/** Date string of the latest kickoff among all-final matches. Null if not all final yet. */
function raceMilestoneDate(matchKeys: string[], allMatches: MatchRow[]): string | null {
  const relevant = allMatches.filter(
    (m) => matchKeys.includes(m.id) && m.status === 'final' && m.kickoff !== null,
  );
  if (relevant.length < matchKeys.length) return null;
  return relevant.reduce<string | null>((latest, m) => {
    const d = utcDateStr(m.kickoff!);
    return latest === null || d > latest ? d : latest;
  }, null);
}

function maxDateStr(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

type DailyChartInput = {
  eventDates: string[];
  leaderboard: LeaderboardEntry[];
  userId: string | null;
  allMatches: MatchRow[];
  poolGroupScores: PoolGroupScore[];
  def: Tournament;
  anyStillLive: boolean;
  stillLiveByUser: Map<string, number>;
};

function buildDailyChartPlayers(input: DailyChartInput): {
  stages: string[];
  nowIndex: number;
  chartPlayers: RaceChartPlayer[];
} {
  const {
    eventDates,
    leaderboard,
    userId,
    allMatches,
    poolGroupScores,
    def,
    anyStillLive,
    stillLiveByUser,
  } = input;

  const groupMatchDeltas = buildGroupMatchDeltas(
    poolGroupScores,
    allMatches,
    def.scoring.groupMatch,
  );
  const groupOrderDeltas = buildGroupOrderDeltas(poolGroupScores, allMatches, def, leaderboard);
  const knockoutDeltas = buildKnockoutMilestoneDeltas(leaderboard, allMatches, def);

  const nowIndex = eventDates.length; // 0 = Start, 1..N = dates, nowIndex = N

  const stages: string[] = ['Start', ...eventDates.map(formatRaceDate)];
  if (anyStillLive) stages.push('Projected');

  let colorIdx = 0;
  const chartPlayers: RaceChartPlayer[] = leaderboard.map((entry) => {
    const isCurrentUser = userId !== null && entry.userId === userId;
    const color = isCurrentUser
      ? 'var(--green-500)'
      : (RACE_COLORS[colorIdx++] ?? 'var(--ink-muted)');

    let cumulative = 0;
    const pts: number[] = [0]; // Start

    for (const date of eventDates) {
      cumulative += groupMatchDeltas.get(entry.userId)?.get(date) ?? 0;
      cumulative += groupOrderDeltas.get(entry.userId)?.get(date) ?? 0;
      cumulative += knockoutDeltas.get(entry.userId)?.get(date) ?? 0;
      pts.push(cumulative);
    }

    // Anchor the final "now" point to the leaderboard total, absorbing any attribution gap.
    if (pts.length > 1) pts[pts.length - 1] = entry.pointsTotal;

    if (anyStillLive) {
      pts.push(entry.pointsTotal + (stillLiveByUser.get(entry.userId) ?? 0));
    }

    return {
      userId: entry.userId,
      displayName: entry.displayName,
      isCurrentUser,
      color,
      points: pts,
    };
  });

  chartPlayers.sort((a, b) => (a.isCurrentUser ? 1 : 0) - (b.isCurrentUser ? 1 : 0));

  return { stages, nowIndex, chartPlayers };
}

function buildProjectedEntries(
  leaderboard: LeaderboardEntry[],
  userId: string | null,
  stillLiveByUser: Map<string, number>,
): ProjectedEntry[] {
  const currentRankMap = new Map<string, number>(leaderboard.map((e, i) => [e.userId, i + 1]));

  const withProjected = leaderboard.map((e) => ({
    userId: e.userId,
    displayName: e.displayName,
    isCurrentUser: userId !== null && e.userId === userId,
    currentPoints: e.pointsTotal,
    projectedPoints: e.pointsTotal + (stillLiveByUser.get(e.userId) ?? 0),
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
  userId: string | null,
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
      isCurrentUser: userId !== null && e.userId === userId,
      cells,
      totalPoints,
    };
  });

  matchMatrix.sort((a, b) => b.totalPoints - a.totalPoints);

  return { matchMatrix, matrixMatches };
}

// ---------------------------------------------------------------------------
// Special bets
// ---------------------------------------------------------------------------

function buildSpecialBetResults(
  def: Tournament,
  inputs: Awaited<ReturnType<typeof getPredictionInputs>> | null,
  actual: ActualResults,
): SpecialBetResultRow[] {
  const teamMap = new Map<string, string>(def.teams.map((t) => [t.id, t.name]));
  const playerMap = new Map<string, string>(def.players.map((p) => [p.id, p.name]));
  const defs = getSpecialBetDefs(def.scoring);
  const specials: SpecialBets = inputs?.specials ?? {};

  return defs.map((d) => {
    const userRaw = (specials as Record<string, unknown>)[d.key];

    let actualRaw: unknown;
    if (d.key === 'finalDecidedByPenalties') {
      actualRaw =
        actual.finalMatch !== undefined ? actual.finalMatch.decidedBy === 'penalties' : undefined;
    } else if (d.key === 'finalDecisiveGoalPlayer') {
      actualRaw = actual.finalMatch?.decisiveGoalPlayer;
    } else {
      actualRaw = (actual.answers as Record<string, unknown>)[d.key];
    }

    const userPickDisplay = resolveSpecialDisplay(userRaw, d.kind, teamMap, playerMap);
    const actualAnswerDisplay = resolveSpecialDisplay(actualRaw, d.kind, teamMap, playerMap);

    let hit: SpecialBetResultRow['hit'];
    let pointsAwarded: number;

    if (actualRaw === undefined || actualRaw === null) {
      hit = 'pending';
      pointsAwarded = 0;
    } else if (userRaw !== undefined && userRaw !== null && userRaw === actualRaw) {
      hit = 'hit';
      pointsAwarded = d.points;
    } else {
      hit = 'missed';
      pointsAwarded = 0;
    }

    return {
      key: d.key,
      label: d.label,
      kind: d.kind,
      points: d.points,
      userPickDisplay,
      actualAnswerDisplay,
      hit,
      pointsAwarded,
    };
  });
}

function resolveSpecialDisplay(
  raw: unknown,
  kind: 'player' | 'team' | 'number' | 'bool',
  teamMap: Map<string, string>,
  playerMap: Map<string, string>,
): string | number | boolean | null {
  if (raw === undefined || raw === null) return null;
  if (kind === 'team') return teamMap.get(String(raw)) ?? String(raw);
  if (kind === 'player') return playerMap.get(String(raw)) ?? String(raw);
  if (kind === 'bool') return raw as boolean;
  return raw as number;
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

function computeKnockoutHit(args: {
  pickedWinnerId: string | null;
  actualWinnerId: string | null;
  predictedHome: number | null;
  predictedAway: number | null;
  actualHome: number | null;
  actualAway: number | null;
}): MatchHit {
  const { pickedWinnerId, actualWinnerId, predictedHome, predictedAway, actualHome, actualAway } =
    args;

  // Tie not yet decided → pending regardless of pick.
  if (actualWinnerId === null) return 'pending';

  // Exact requires both predicted and actual scores; only Final/Bronze populate predicted.
  if (
    predictedHome !== null &&
    predictedAway !== null &&
    actualHome !== null &&
    actualAway !== null &&
    predictedHome === actualHome &&
    predictedAway === actualAway
  ) {
    return 'exact';
  }

  if (pickedWinnerId !== null && pickedWinnerId === actualWinnerId) return 'outcome';
  return 'missed';
}

function isWithinNext24h(kickoff: Date, now: Date): boolean {
  return kickoff.getTime() <= now.getTime() + 24 * 60 * 60 * 1000;
}

function computeMatchPredictionStats(
  matchId: string,
  poolGroupScores: PoolGroupScore[],
): MatchPredictionStats | null {
  const preds = poolGroupScores.filter((s) => s.matchId === matchId);
  if (preds.length === 0) return null;

  const total = preds.length;
  const homeWins = preds.filter((s) => s.home > s.away).length;
  const draws = preds.filter((s) => s.home === s.away).length;
  const awayWins = preds.filter((s) => s.home < s.away).length;
  const avgHome = preds.reduce((sum, s) => sum + s.home, 0) / total;
  const avgAway = preds.reduce((sum, s) => sum + s.away, 0) / total;

  return {
    homeWinPct: Math.round((homeWins / total) * 100),
    drawPct: Math.round((draws / total) * 100),
    awayWinPct: Math.round((awayWins / total) * 100),
    avgHomeGoals: Math.round(avgHome * 10) / 10,
    avgAwayGoals: Math.round(avgAway * 10) / 10,
    totalPredictions: total,
  };
}

function computeDerivedParticipants(
  def: Tournament,
  allMatches: MatchRow[],
): Map<BracketMatchKey, [string, string]> {
  const participantsByMatch = new Map<BracketMatchKey, [string, string]>();
  const matchByKey = new Map<string, MatchRow>(allMatches.map((m) => [m.id, m]));

  // 1. Entry-round slots from group orders (only if all group matches are final)
  const finalGroupMatchIds = new Set(
    allMatches.filter((m) => m.stage === 'group' && m.status === 'final').map((m) => m.id),
  );
  const allGroupsFinal = def.groupMatches.every((gm) => finalGroupMatchIds.has(gm.id));
  if (allGroupsFinal) {
    const scores: GroupScore[] = def.groupMatches.map((gm) => {
      const m = matchByKey.get(gm.id)!;
      return { matchId: matchId(gm.id), home: m.homeGoals!, away: m.awayGoals! };
    });
    const groupOrders = deriveGroupOrders(def, scores);
    const qualifiers = selectQualifiers(def, scores, groupOrders);
    const autoCount = def.groups.length * def.qualification.autoQualifyPerGroup;
    const rankedThirds = qualifiers.slice(autoCount);

    for (const slot of def.bracket.slots) {
      try {
        const home = resolveSlot(slot.home, groupOrders, rankedThirds);
        const away = resolveSlot(slot.away, groupOrders, rankedThirds);
        participantsByMatch.set(slot.match, [home, away]);
      } catch {
        // unresolvable ref — leave unset; downstream just shows TBD
      }
    }
  }

  // 2. Non-bronze progression: participants = winners of `from` matches (when both final)
  for (const prog of def.bracket.progression) {
    if (prog.match === def.bracket.bronzeMatch) continue;
    const winners = prog.from.map((k) => matchByKey.get(k)?.winnerTeamId ?? null);
    if (winners.length === 2 && winners[0] && winners[1]) {
      participantsByMatch.set(prog.match, [winners[0], winners[1]]);
    }
  }

  // 3. Bronze: SF losers (need both SFs final; participants of SF can be derived or from DB row)
  const bronzeProg = def.bracket.progression.find((p) => p.match === def.bracket.bronzeMatch);
  if (bronzeProg) {
    const losers: (string | null)[] = bronzeProg.from.map((sfKey) => {
      const sfMatch = matchByKey.get(sfKey);
      const sfWinner = sfMatch?.winnerTeamId ?? null;
      if (!sfWinner) return null;
      const sfParts = participantsByMatch.get(sfKey);
      const sfHome = sfMatch?.homeTeamId ?? sfParts?.[0] ?? null;
      const sfAway = sfMatch?.awayTeamId ?? sfParts?.[1] ?? null;
      if (!sfHome || !sfAway) return null;
      return sfWinner === sfHome ? sfAway : sfHome;
    });
    if (losers.length === 2 && losers[0] && losers[1]) {
      participantsByMatch.set(def.bracket.bronzeMatch, [losers[0], losers[1]]);
    }
  }

  return participantsByMatch;
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
