import type {
  MatchRow,
  LeaderboardEntry,
  PoolGroupScore,
  PoolKnockoutPick,
  PoolFinishScore,
  PoolSpecialBet,
} from '@cup/db';
import { computeRemainingMaxPoints, getSpecialBetDefs } from '@cup/engine';
import type { Tournament, ActualResults } from '@cup/engine';
import type {
  PointsRaceView,
  RaceChartPlayer,
  ProjectedEntry,
  MatchMatrixEntry,
  MatrixMatch,
  MatchMatrixCell,
  KnockoutMatrixEntry,
  KnockoutMatrixCell,
  KnockoutMatrixMatch,
  KnockoutMatchHit,
  BracketRoundResultView,
  KnockoutMatchView,
  SpecialsMatrixEntry,
  SpecialsMatrixBet,
  SpecialsMatrixCell,
} from '../domain/types';
import {
  computeHit,
  buildRaceEventDates,
  buildDailyChartPlayers,
  RACE_COLORS,
} from '../domain/race-chart';
import { deriveImplicitFinaleWinner } from './build-bracket-rounds';
import {
  computeSpecialBetImpossibility,
  type SpecialBetImpossibility,
} from '../domain/special-bet-impossibility';

type RaceParams = {
  leaderboard: LeaderboardEntry[];
  userId: string | null;
  allMatches: MatchRow[];
  poolGroupScores: PoolGroupScore[];
  def: Tournament;
  myTotalCanStillGet: number;
  bracketRounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
  poolKnockoutPicks: PoolKnockoutPick[];
  poolFinishScores: PoolFinishScore[];
  poolSpecialBets: PoolSpecialBet[];
  actualResults: ActualResults;
};

/**
 * Per-user still-live projection.
 *
 * Formula: `stillLive = hitRate × canStillGet`, where
 *   hitRate    = banked / maxFromResolved
 *   maxFromResolved = tournament-wide max ceiling − tournament-wide remaining max
 *   canStillGet = per-user remaining max (respects busted picks)
 *
 * Using per-user canStillGet means a player with more viable picks projects
 * higher than one with the same current points but fewer live picks.
 *
 * Edge cases:
 *  - `maxFromResolved <= 0` (nothing has resolved yet) → no signal to project
 *    from, so stillLive = 0.
 *  - `canStillGet <= 0` (all picks busted or tournament complete) → stillLive = 0.
 */
function projectStillLive(banked: number, maxFromResolved: number, canStillGet: number): number {
  if (maxFromResolved <= 0 || canStillGet <= 0) return 0;
  const hitRate = banked / maxFromResolved;
  return Math.round(hitRate * canStillGet);
}

export function buildPointsRaceView(params: RaceParams): PointsRaceView {
  const {
    leaderboard,
    userId,
    allMatches,
    poolGroupScores,
    def,
    myTotalCanStillGet,
    bracketRounds,
    bronzeMatch,
    poolKnockoutPicks,
    poolFinishScores,
    poolSpecialBets,
    actualResults,
  } = params;

  const finalMatchIds = new Set(allMatches.filter((m) => m.status === 'final').map((m) => m.id));
  const totalMax = computeRemainingMaxPoints(def, { finalMatchIds: new Set() });
  const remainingMax = computeRemainingMaxPoints(def, { finalMatchIds });
  const maxFromResolved = totalMax.total - remainingMax.total;

  // Compute per-user remaining ceilings before the projection so each user's
  // still-live estimate uses their own viable picks, not the tournament-wide max.
  const groupRemaining = remainingMax.groupMatches + remainingMax.groupOrder;
  const perUserKnockoutRemaining = buildPerUserKnockoutCanStillGet(
    poolKnockoutPicks,
    allMatches,
    def,
    actualResults,
  );
  const specialDefs = getSpecialBetDefs(def.scoring).filter((d) => d.points > 0);
  const specialBetImpossibility = computeSpecialBetImpossibility(def, allMatches);
  const perUserSpecialsRemaining = buildPerUserSpecialsRemaining(
    poolSpecialBets,
    specialDefs,
    actualResults,
    specialBetImpossibility,
  );
  const canStillGetByUser = new Map(
    leaderboard.map((e) => [
      e.userId,
      userId !== null && e.userId === userId
        ? Math.min(myTotalCanStillGet, remainingMax.total)
        : groupRemaining +
          (perUserKnockoutRemaining.get(e.userId) ?? 0) +
          (perUserSpecialsRemaining.get(e.userId) ?? 0),
    ]),
  );

  const stillLiveByUser = new Map<string, number>(
    leaderboard.map((e) => [
      e.userId,
      projectStillLive(e.pointsTotal, maxFromResolved, canStillGetByUser.get(e.userId) ?? 0),
    ]),
  );

  const myBanked = userId ? (leaderboard.find((e) => e.userId === userId)?.pointsTotal ?? 0) : 0;
  const myStillLive = userId ? (stillLiveByUser.get(userId) ?? 0) : 0;
  const myProjected = myBanked + myStillLive;
  const anyStillLive = Array.from(stillLiveByUser.values()).some((v) => v > 0);

  const eventDates = buildRaceEventDates(allMatches);

  let stages: string[];
  let nowIndex: number;
  let chartPlayers: RaceChartPlayer[];

  if (eventDates.length > 0) {
    const result = buildDailyChartPlayers({
      eventDates,
      leaderboard,
      userId,
      allMatches,
      poolGroupScores,
      def,
      anyStillLive,
      stillLiveByUser,
      knockoutPicks: poolKnockoutPicks,
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
    chartPlayers = chartPlayers.toSorted(
      (a, b) => (a.isCurrentUser ? 1 : 0) - (b.isCurrentUser ? 1 : 0),
    );
  }

  const projectedEntries = buildProjectedEntries(
    leaderboard,
    userId,
    stillLiveByUser,
    canStillGetByUser,
  );
  const { matchMatrix, matrixMatches } = buildMatchMatrix(
    leaderboard,
    userId,
    allMatches,
    poolGroupScores,
    def,
  );
  const { knockoutMatrix, knockoutMatrixMatches } = buildKnockoutMatrix({
    leaderboard,
    userId,
    bracketRounds,
    bronzeMatch,
    poolKnockoutPicks,
    poolFinishScores,
    def,
  });

  const { specialsMatrix, specialsMatrixBets } = buildSpecialsMatrix({
    leaderboard,
    userId,
    poolSpecialBets,
    actualResults,
    def,
    matches: allMatches,
  });

  return {
    chartStages: stages,
    chartNowIndex: nowIndex,
    chartPlayers,
    myBanked,
    myStillLive,
    myProjected,
    myTotalCanStillGet,
    projectedEntries,
    matchMatrix,
    matrixMatches,
    knockoutMatrix,
    knockoutMatrixMatches,
    specialsMatrix,
    specialsMatrixBets,
  };
}

/** Derives the winner of a knockout match from the DB row. */
function resolveKnockoutWinner(m: MatchRow | null): string | null {
  if (!m) return null;
  if (m.winnerTeamId) return m.winnerTeamId;
  if (
    m.status === 'final' &&
    m.homeGoals !== null &&
    m.awayGoals !== null &&
    m.homeGoals !== m.awayGoals
  ) {
    return m.homeGoals > m.awayGoals ? (m.homeTeamId ?? null) : (m.awayTeamId ?? null);
  }
  return null;
}

/**
 * Computes the maximum additional knockout points each user can still earn.
 *
 * Uses actual match data (not the current-user-projected bracketRounds) to evaluate
 * pick viability, so results are accurate for every pool member regardless of who
 * is viewing the page. Covers:
 *   - Per-match scored rounds (R32 → roundOf16PerTeam, R16 → roundOf8PerTeam)
 *   - TopFour membership based on non-busted QF picks
 *   - Final: max(0, 2 − bustedSfPicks) × perTeam + exactScore, plus the same non-busted count ×
 *     topFourPositionBonus (1st/2nd place)
 *   - Bronze: max(0, 2 − bustedBronzePairs) × perTeam + exactScore, plus the same non-busted
 *     count × topFourPositionBonus (3rd/4th place)
 *
 * Returns a Map<userId, points>. Users with no picks are absent from the map.
 */
export function buildPerUserKnockoutCanStillGet(
  poolKnockoutPicks: PoolKnockoutPick[],
  allMatches: MatchRow[],
  def: Tournament,
  actualResults: ActualResults,
): Map<string, number> {
  const { bracket, scoring } = def;

  // Actual knockout match data keyed by bracketMatchKey (== m.id for non-group matches).
  const matchByKey = new Map<string, MatchRow>();
  for (const m of allMatches) {
    if (m.stage !== 'group') matchByKey.set(m.id, m);
  }

  // Teams eliminated from any played knockout match.
  const knockoutEliminatedTeams = new Set<string>();
  for (const m of allMatches) {
    if (m.stage === 'group' || m.status !== 'final') continue;
    const winner = resolveKnockoutWinner(m);
    if (!winner) continue;
    if (m.homeTeamId && m.homeTeamId !== winner) knockoutEliminatedTeams.add(m.homeTeamId);
    if (m.awayTeamId && m.awayTeamId !== winner) knockoutEliminatedTeams.add(m.awayTeamId);
  }

  // Confirmed participants for progression matches (R16, QF, SF, Final),
  // derived from actual feeder match winners.
  const progressionParticipants = new Map<string, [string | null, string | null]>();
  for (const prog of bracket.progression) {
    const key = prog.match as string;
    if (key === (bracket.bronzeMatch as string)) continue;
    const fk0 = prog.from[0] as string | undefined;
    const fk1 = prog.from[1] as string | undefined;
    const w0 = fk0 ? resolveKnockoutWinner(matchByKey.get(fk0) ?? null) : null;
    const w1 = fk1 ? resolveKnockoutWinner(matchByKey.get(fk1) ?? null) : null;
    if (w0 !== null || w1 !== null) {
      progressionParticipants.set(key, [w0, w1]);
    }
  }

  // Per-round scored hit points (R32 → roundOf16PerTeam, R16 → roundOf8PerTeam).
  // Mirrors buildHitPointsMap but restricted to the two per-match scored categories.
  const hitPoints = new Map<string, number>();
  for (const prog of bracket.progression) {
    if ((bracket.roundOf16Matches as string[]).includes(prog.match as string)) {
      for (const fromKey of prog.from) hitPoints.set(fromKey as string, scoring.roundOf16PerTeam);
    }
    if ((bracket.roundOf8Matches as string[]).includes(prog.match as string)) {
      for (const fromKey of prog.from) hitPoints.set(fromKey as string, scoring.roundOf8PerTeam);
    }
  }

  const entryKeys = new Set<string>(bracket.slots.map((s) => s.match as string));
  const r16Keys = new Set<string>(bracket.roundOf16Matches as string[]);
  const qfKeys = new Set<string>(bracket.roundOf8Matches as string[]);
  const sfKeys = bracket.semiFinals as string[];
  const bronzeKey = bracket.bronzeMatch as string;

  // Pre-build the QF feeder map for each SF: sfKey → [qfKey1, qfKey2].
  const sfQfFeeders = new Map<string, [string | null, string | null]>();
  for (const sfKey of sfKeys) {
    const sfProg = bracket.progression.find((p) => (p.match as string) === sfKey);
    sfQfFeeders.set(sfKey, [
      (sfProg?.from[0] as string | undefined) ?? null,
      (sfProg?.from[1] as string | undefined) ?? null,
    ]);
  }

  const finalPlayed = actualResults.finalMatch !== undefined;
  const bronzePlayed = actualResults.bronzeMatch !== undefined;
  const topFourResolved = (actualResults.answers.roundOf4?.length ?? 0) >= qfKeys.size;

  // Build per-user pick maps once.
  const userPickMaps = new Map<string, Map<string, string>>();
  for (const pick of poolKnockoutPicks) {
    const uid = pick.userId as string;
    if (!userPickMaps.has(uid)) userPickMaps.set(uid, new Map());
    userPickMaps.get(uid)!.set(pick.bracketMatchKey as string, pick.winnerTeamId);
  }

  const result = new Map<string, number>();

  for (const userId of new Set(poolKnockoutPicks.map((p) => p.userId as string))) {
    const picks = userPickMaps.get(userId) ?? new Map<string, string>();
    let canStillGet = 0;

    // Returns true when the user's pick for `matchKey` is still viable:
    // the match is unresolved, the picked team is not eliminated, and (if both
    // participants are confirmed) the pick is one of them.
    function isViable(matchKey: string): boolean {
      const pickedId = picks.get(matchKey) ?? null;
      if (!pickedId) return false;
      const m = matchByKey.get(matchKey) ?? null;
      if (m?.status === 'final') return false;
      if (knockoutEliminatedTeams.has(pickedId)) return false;
      const pp = progressionParticipants.get(matchKey);
      const home = pp?.[0] ?? m?.homeTeamId ?? null;
      const away = pp?.[1] ?? m?.awayTeamId ?? null;
      if (home !== null && away !== null) return pickedId === home || pickedId === away;
      return true;
    }

    // Returns true when the user's pick for `matchKey` is not busted.
    // For resolved matches: only the actual winner is not busted.
    // For unresolved matches: same check as isViable.
    function isNotBusted(matchKey: string): boolean {
      const pickedId = picks.get(matchKey) ?? null;
      if (!pickedId) return false;
      const m = matchByKey.get(matchKey) ?? null;
      if (m?.status === 'final') return resolveKnockoutWinner(m) === pickedId;
      if (knockoutEliminatedTeams.has(pickedId)) return false;
      const pp = progressionParticipants.get(matchKey);
      const home = pp?.[0] ?? m?.homeTeamId ?? null;
      const away = pp?.[1] ?? m?.awayTeamId ?? null;
      if (home !== null && away !== null) return pickedId === home || pickedId === away;
      return true;
    }

    // Returns true only when `matchKey`'s match is final AND the user's pick was the winner —
    // i.e. this pick's points are already banked in the user's leaderboard total.
    function isConfirmedCorrect(matchKey: string): boolean {
      const pickedId = picks.get(matchKey) ?? null;
      if (!pickedId) return false;
      const m = matchByKey.get(matchKey) ?? null;
      return m?.status === 'final' && resolveKnockoutWinner(m) === pickedId;
    }

    // Per-match scored rounds: entry round (R32 in WC) and R16.
    for (const key of entryKeys) {
      const pts = hitPoints.get(key);
      if (pts !== undefined && isViable(key)) canStillGet += pts;
    }
    for (const key of r16Keys) {
      const pts = hitPoints.get(key);
      if (pts !== undefined && isViable(key)) canStillGet += pts;
    }

    // TopFour: non-busted QF picks × roundOf4PerTeam is the ceiling (no-pick = not busted,
    // consistent with buildKnockoutRoundBreakdown which uses totalPicks − bustedPicks). Subtract
    // already-confirmed-correct picks so this doesn't double-count points already banked in the
    // user's leaderboard total via scoreTopFour.
    if (!topFourResolved) {
      let nonBustedQf = qfKeys.size;
      let confirmedQf = 0;
      for (const key of qfKeys) {
        const pickedId = picks.get(key) ?? null;
        if (!pickedId) continue;
        if (!isNotBusted(key)) {
          nonBustedQf--;
        } else if (isConfirmedCorrect(key)) {
          confirmedQf++;
        }
      }
      canStillGet += Math.max(0, (nonBustedQf - confirmedQf) * scoring.roundOf4PerTeam);
    }

    // Final: finalist perTeam × non-busted SF picks + exactScore.
    if (!finalPlayed) {
      let bustedSfPicks = 0;
      for (const sfKey of sfKeys) {
        if (picks.has(sfKey) && !isNotBusted(sfKey)) bustedSfPicks++;
      }
      canStillGet +=
        Math.max(0, 2 - bustedSfPicks) * scoring.final.perTeam + scoring.final.exactScore;
      // TopFour position bonus (1st/2nd place): reachable while the predicted finalist is
      // still alive, independent of the Final team-points ceiling above.
      canStillGet += Math.max(0, 2 - bustedSfPicks) * scoring.topFourPositionBonus;
    }

    // Bronze: bronzePair perTeam × non-busted implied SF-loser picks + exactScore.
    // The bronze pair is derived from each SF's loser (the QF winner pick that the
    // user did NOT pick to win the SF).
    if (!bronzePlayed) {
      let bustedBronzePairs = 0;
      const bronzeMatchRow = matchByKey.get(bronzeKey) ?? null;
      for (const sfKey of sfKeys) {
        const sfWinner = picks.get(sfKey) ?? null;
        if (!sfWinner) continue;
        // If the SF winner pick itself is already busted, the whole predicted sub-bracket for
        // this slot is unreliable — the "other" QF feeder pick below may look alive only because
        // it never played a real knockout match (e.g. upstream R32/R16 picks already diverged
        // from reality), not because it's a genuine live bronze contender. Treat this slot's
        // bronze pair as busted too, mirroring the Final calculation above.
        if (!isNotBusted(sfKey)) {
          bustedBronzePairs++;
          continue;
        }
        const [qfKey1, qfKey2] = sfQfFeeders.get(sfKey) ?? [null, null];
        const qfW1 = qfKey1 ? (picks.get(qfKey1) ?? null) : null;
        const qfW2 = qfKey2 ? (picks.get(qfKey2) ?? null) : null;
        const bronzeTeam =
          qfW1 && qfW1 !== sfWinner ? qfW1 : qfW2 && qfW2 !== sfWinner ? qfW2 : null;
        if (!bronzeTeam) continue;
        if (knockoutEliminatedTeams.has(bronzeTeam)) {
          bustedBronzePairs++;
        } else {
          const bHome = bronzeMatchRow?.homeTeamId ?? null;
          const bAway = bronzeMatchRow?.awayTeamId ?? null;
          if (bHome !== null && bAway !== null && bronzeTeam !== bHome && bronzeTeam !== bAway) {
            bustedBronzePairs++;
          }
        }
      }
      canStillGet +=
        Math.max(0, 2 - bustedBronzePairs) * scoring.bronze.perTeam + scoring.bronze.exactScore;
      // TopFour position bonus (3rd/4th place): reachable while the predicted bronze
      // participant is still alive, independent of the Bronze team-points ceiling above.
      canStillGet += Math.max(0, 2 - bustedBronzePairs) * scoring.topFourPositionBonus;
    }

    result.set(userId, canStillGet);
  }

  return result;
}

/**
 * Computes the maximum additional special-bet points each user can still earn.
 * A bet contributes iff it is unresolved (no actual answer yet), the user has a pick, and
 * that pick isn't already mathematically impossible (see special-bet-impossibility.ts).
 * Returns a Map<userId, points>. Users with no viable picks on pending bets are absent.
 */
export function buildPerUserSpecialsRemaining(
  poolSpecialBets: PoolSpecialBet[],
  defs: Array<{ key: string; points: number }>,
  actualResults: ActualResults,
  impossibility: SpecialBetImpossibility,
): Map<string, number> {
  const unresolvedKeys = new Set(
    defs
      .filter((d) => {
        const { isArray, scalar, array } = resolveActualForBet(d.key, actualResults);
        return isArray ? array.length === 0 : scalar === undefined || scalar === null;
      })
      .map((d) => d.key),
  );

  const betPoints = new Map(defs.map((d) => [d.key, d.points]));
  const result = new Map<string, number>();

  for (const sb of poolSpecialBets) {
    if (!unresolvedKeys.has(sb.betKey)) continue;
    if (impossibility.isImpossible(sb.betKey, sb.value)) continue;
    const pts = betPoints.get(sb.betKey) ?? 0;
    result.set(sb.userId, (result.get(sb.userId) ?? 0) + pts);
  }

  return result;
}

export function buildProjectedEntries(
  leaderboard: LeaderboardEntry[],
  userId: string | null,
  stillLiveByUser: Map<string, number>,
  canStillGetByUser: Map<string, number>,
): ProjectedEntry[] {
  const currentRankMap = new Map<string, number>(leaderboard.map((e, i) => [e.userId, i + 1]));

  const withProjected = leaderboard.map((e) => ({
    userId: e.userId,
    displayName: e.displayName,
    isCurrentUser: userId !== null && e.userId === userId,
    currentPoints: e.pointsTotal,
    projectedPoints: e.pointsTotal + (stillLiveByUser.get(e.userId) ?? 0),
    canStillGet: canStillGetByUser.get(e.userId) ?? 0,
  }));

  const sorted = withProjected.toSorted((a, b) => b.projectedPoints - a.projectedPoints);

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
      canStillGet: e.canStillGet,
    };
  });
}

function buildHitPointsMap(def: Tournament): Map<string, number> {
  const map = new Map<string, number>();
  const { bracket, scoring } = def;
  for (const prog of bracket.progression) {
    if ((bracket.roundOf16Matches as string[]).includes(prog.match as string)) {
      for (const fromKey of prog.from) map.set(fromKey as string, scoring.roundOf16PerTeam);
    }
    if ((bracket.roundOf8Matches as string[]).includes(prog.match as string)) {
      for (const fromKey of prog.from) map.set(fromKey as string, scoring.roundOf8PerTeam);
    }
    if ((bracket.semiFinals as string[]).includes(prog.match as string)) {
      for (const fromKey of prog.from) map.set(fromKey as string, scoring.roundOf4PerTeam);
    }
  }
  const finalProg = bracket.progression.find((p) => p.match === bracket.finalMatch);
  if (finalProg) {
    for (const sfKey of finalProg.from) map.set(sfKey as string, scoring.final.perTeam);
  }
  map.set(bracket.finalMatch as string, scoring.final.perTeam);
  map.set(bracket.bronzeMatch as string, scoring.bronze.perTeam);
  return map;
}

export function buildKnockoutMatrix(params: {
  leaderboard: LeaderboardEntry[];
  userId: string | null;
  bracketRounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
  poolKnockoutPicks: PoolKnockoutPick[];
  poolFinishScores: PoolFinishScore[];
  def: Tournament;
}): { knockoutMatrix: KnockoutMatrixEntry[]; knockoutMatrixMatches: KnockoutMatrixMatch[] } {
  const {
    leaderboard,
    userId,
    bracketRounds,
    bronzeMatch,
    poolKnockoutPicks,
    poolFinishScores,
    def,
  } = params;

  const allKnockoutMatches: KnockoutMatchView[] = [
    ...bracketRounds.flatMap((r) => r.matches),
    ...(bronzeMatch ? [bronzeMatch] : []),
  ];

  const eliminatedTeams = new Set<string>();
  for (const m of allKnockoutMatches) {
    if (m.status === 'final' && m.actualWinnerId) {
      if (m.homeTeamId && m.homeTeamId !== m.actualWinnerId) eliminatedTeams.add(m.homeTeamId);
      if (m.awayTeamId && m.awayTeamId !== m.actualWinnerId) eliminatedTeams.add(m.awayTeamId);
    }
  }

  const sortedMatches = allKnockoutMatches.toSorted((a, b) => {
    if (a.kickoff === null && b.kickoff === null) return 0;
    if (a.kickoff === null) return 1;
    if (b.kickoff === null) return -1;
    return a.kickoff.localeCompare(b.kickoff);
  });

  const knockoutMatrixMatches: KnockoutMatrixMatch[] = sortedMatches.map((m) => ({
    bracketMatchKey: m.bracketMatchKey,
    round: m.round,
    homeTeamId: m.homeTeamId,
    homeTeamName: m.homeTeamName,
    awayTeamId: m.awayTeamId,
    awayTeamName: m.awayTeamName,
    actualWinnerId: m.actualWinnerId,
    kickoff: m.kickoff,
    status: m.status,
  }));

  const hitPoints = buildHitPointsMap(def);

  const pickMap = new Map<string, string>();
  for (const pick of poolKnockoutPicks) {
    pickMap.set(`${pick.userId}::${pick.bracketMatchKey}`, pick.winnerTeamId);
  }

  // Map bracketMatchKey → round label for cross-slot pick matching.
  const matchRoundMap = new Map<string, string>(
    allKnockoutMatches.map((m) => [m.bracketMatchKey, m.round]),
  );

  // Per-user, per-round set of all picked team IDs (regardless of which slot).
  const userRoundPicksMap = new Map<string, Map<string, Set<string>>>();
  for (const pick of poolKnockoutPicks) {
    const round = matchRoundMap.get(pick.bracketMatchKey);
    if (!round) continue;
    if (!userRoundPicksMap.has(pick.userId)) userRoundPicksMap.set(pick.userId, new Map());
    const roundMap = userRoundPicksMap.get(pick.userId)!;
    if (!roundMap.has(round)) roundMap.set(round, new Set());
    roundMap.get(round)!.add(pick.winnerTeamId);
  }

  // Per-user finish scores: userId → 'final'|'bronze' → {home, away}
  const finishScoreMap = new Map<string, Map<'final' | 'bronze', { home: number; away: number }>>();
  for (const fs of poolFinishScores) {
    if (!finishScoreMap.has(fs.userId)) finishScoreMap.set(fs.userId, new Map());
    finishScoreMap.get(fs.userId)!.set(fs.match, { home: fs.home, away: fs.away });
  }

  const finalMatchKey = def.bracket.finalMatch as string;
  const bronzeMatchKey = def.bracket.bronzeMatch as string;

  const knockoutMatrix: KnockoutMatrixEntry[] = leaderboard.map((e) => {
    const userRoundPicks = userRoundPicksMap.get(e.userId) ?? new Map<string, Set<string>>();
    const userPickMap = new Map<string, string>(
      poolKnockoutPicks
        .filter((p) => p.userId === e.userId)
        .map((p) => [p.bracketMatchKey as string, p.winnerTeamId]),
    );
    let totalPoints = 0;
    const cells: KnockoutMatrixCell[] = sortedMatches.map((m) => {
      const knockoutPick = pickMap.get(`${e.userId}::${m.bracketMatchKey}`) ?? null;

      // For the final and bronze, derive the effective pick from the finish score so that
      // stale auto-derived knockoutPicks from previous non-tied scores don't mislead the
      // display or the hit check.
      const isFinalOrBronze =
        m.bracketMatchKey === finalMatchKey || m.bracketMatchKey === bronzeMatchKey;
      let pickedWinnerId: string | null = knockoutPick;
      let predictedHome: number | null = null;
      let predictedAway: number | null = null;
      let isExactScore = false;
      if (isFinalOrBronze) {
        const matchType = m.bracketMatchKey === finalMatchKey ? 'final' : 'bronze';
        const fs = finishScoreMap.get(e.userId)?.get(matchType);
        if (fs !== undefined) {
          predictedHome = fs.home;
          predictedAway = fs.away;
          isExactScore =
            m.actualHome !== null &&
            m.actualAway !== null &&
            fs.home === m.actualHome &&
            fs.away === m.actualAway;
        }
        if (fs !== undefined && fs.home !== fs.away) {
          // Prefer deriving the winner from the user's own SF/QF pick chain — the score was
          // entered relative to the user's own predicted finalists, not the real match's
          // home/away teams, which can differ once real results diverge from the user's picks.
          pickedWinnerId = deriveImplicitFinaleWinner(
            m.bracketMatchKey,
            def.bracket,
            userPickMap,
            fs.home,
            fs.away,
          );
          if (pickedWinnerId === null) {
            pickedWinnerId = deriveEffectivePick(fs, m.homeTeamId, m.awayTeamId, knockoutPick);
          }
        } else {
          pickedWinnerId = deriveEffectivePick(fs, m.homeTeamId, m.awayTeamId, knockoutPick);
        }
      }

      if (m.status !== 'final') {
        const bothKnown = m.homeTeamId !== null && m.awayTeamId !== null;
        const isImpossible =
          pickedWinnerId !== null &&
          (eliminatedTeams.has(pickedWinnerId) ||
            (bothKnown && pickedWinnerId !== m.homeTeamId && pickedWinnerId !== m.awayTeamId));
        return {
          bracketMatchKey: m.bracketMatchKey,
          hit: isImpossible ? 'impossible' : ('pending' as KnockoutMatchHit),
          points: 0,
          pickedWinnerId,
          predictedHome,
          predictedAway,
          isExactScore,
        };
      }

      // For final/bronze use the effective pick directly; for other rounds use the
      // cross-slot round-pick set so swapped picks are still credited.
      const isHit = isFinalOrBronze
        ? m.actualWinnerId !== null && pickedWinnerId === m.actualWinnerId
        : m.actualWinnerId !== null &&
          (userRoundPicks.get(m.round)?.has(m.actualWinnerId) ?? false);

      if (isHit) {
        const pts = hitPoints.get(m.bracketMatchKey) ?? 0;
        totalPoints += pts;
        return {
          bracketMatchKey: m.bracketMatchKey,
          hit: 'hit' as KnockoutMatchHit,
          points: pts,
          pickedWinnerId,
          predictedHome,
          predictedAway,
          isExactScore,
        };
      }

      if (pickedWinnerId === null) {
        return {
          bracketMatchKey: m.bracketMatchKey,
          hit: 'no-pick' as KnockoutMatchHit,
          points: 0,
          pickedWinnerId: null,
          predictedHome,
          predictedAway,
          isExactScore,
        };
      }

      return {
        bracketMatchKey: m.bracketMatchKey,
        hit: 'miss' as KnockoutMatchHit,
        points: 0,
        pickedWinnerId,
        predictedHome,
        predictedAway,
        isExactScore,
      };
    });

    return {
      userId: e.userId,
      displayName: e.displayName,
      isCurrentUser: userId !== null && e.userId === userId,
      cells,
      totalPoints,
    };
  });

  return {
    knockoutMatrix: knockoutMatrix.toSorted((a, b) => b.totalPoints - a.totalPoints),
    knockoutMatrixMatches,
  };
}

/**
 * Determines the effective winner pick for the final or bronze match.
 *
 * - Non-tied finish score → winner is the home or away team derived from the score.
 *   Falls back to knockoutPick if the match teams are not yet known.
 * - Tied finish score → winner is the explicit knockoutPick (penalty pick).
 * - No finish score → falls back to knockoutPick (existing behaviour).
 */
function deriveEffectivePick(
  finishScore: { home: number; away: number } | undefined,
  homeTeamId: string | null,
  awayTeamId: string | null,
  knockoutPick: string | null,
): string | null {
  if (!finishScore) return knockoutPick;
  if (finishScore.home > finishScore.away) return homeTeamId ?? knockoutPick;
  if (finishScore.home < finishScore.away) return awayTeamId ?? knockoutPick;
  return knockoutPick; // tied — use explicit penalty pick
}

function toPredictedOutcome(home: number | null, away: number | null): '1' | 'X' | '2' | null {
  if (home === null || away === null) return null;
  if (home > away) return '1';
  if (home === away) return 'X';
  return '2';
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

  const allGroupMatches = allMatches
    .filter((m) => m.stage === 'group')
    .toSorted((a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0));

  const matrixMatches: MatrixMatch[] = allGroupMatches.map((m) => ({
    matchId: m.id,
    homeTeamId: m.homeTeamId ?? '',
    homeTeamName: teamMap.get(m.homeTeamId ?? '') ?? m.homeTeamId ?? '',
    awayTeamId: m.awayTeamId ?? '',
    awayTeamName: teamMap.get(m.awayTeamId ?? '') ?? m.awayTeamId ?? '',
    status: m.status,
    kickoff: m.kickoff?.toISOString() ?? null,
    actualHome: m.homeGoals ?? null,
    actualAway: m.awayGoals ?? null,
  }));

  const predMap = new Map<string, { home: number; away: number }>();
  for (const gs of poolGroupScores) {
    predMap.set(`${gs.userId}::${gs.matchId}`, { home: gs.home, away: gs.away });
  }

  const matchMatrix: MatchMatrixEntry[] = leaderboard.map((e) => {
    let totalPoints = 0;
    const cells: MatchMatrixCell[] = allGroupMatches.map((m) => {
      const pred = predMap.get(`${e.userId}::${m.id}`) ?? null;
      const predictedOutcome = toPredictedOutcome(pred?.home ?? null, pred?.away ?? null);

      if (m.status !== 'final') {
        return { matchId: m.id, hit: 'pending', points: 0, predictedOutcome };
      }

      const hit = computeHit(
        m.homeGoals!,
        m.awayGoals!,
        pred?.home ?? null,
        pred?.away ?? null,
        scoring,
      );
      totalPoints += hit.points;
      return { matchId: m.id, hit: hit.hit, points: hit.points, predictedOutcome };
    });
    return {
      userId: e.userId,
      displayName: e.displayName,
      isCurrentUser: userId !== null && e.userId === userId,
      cells,
      totalPoints,
    };
  });

  return {
    matchMatrix: matchMatrix.toSorted((a, b) => b.totalPoints - a.totalPoints),
    matrixMatches,
  };
}

// ---------------------------------------------------------------------------
// Specials matrix
// ---------------------------------------------------------------------------

const ARRAY_ANSWER_BETS = new Set([
  'groupTopScoringTeam',
  'groupTopConcedingTeam',
  'tournamentTopScoringTeam',
  'tournamentTopConcedingTeam',
  'mostYellowCardsTeam',
  'topScorerPlayer',
]);

function makePickLabel(
  raw: unknown,
  kind: 'player' | 'team' | 'number' | 'bool',
  playerMap: Map<string, string>,
): string | null {
  if (raw === null || raw === undefined) return null;
  if (kind === 'team') return String(raw);
  if (kind === 'bool') return raw === true || raw === 'true' ? 'Y' : 'N';
  if (kind === 'number') return String(raw);
  // player: last word of display name, uppercased, max 6 chars
  const name = playerMap.get(String(raw)) ?? String(raw);
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? name;
  return last.slice(0, 6).toUpperCase();
}

function resolveActualForBet(
  betKey: string,
  actualResults: ActualResults,
): { isArray: boolean; scalar: unknown; array: unknown[] } {
  if (betKey === 'finalDecidedByPenalties') {
    const val =
      actualResults.finalMatch !== undefined
        ? actualResults.finalMatch.decidedBy === 'penalties'
        : undefined;
    return { isArray: false, scalar: val, array: [] };
  }
  if (betKey === 'finalDecisiveGoalPlayer') {
    return { isArray: false, scalar: actualResults.finalMatch?.decisiveGoalPlayer, array: [] };
  }
  if (ARRAY_ANSWER_BETS.has(betKey)) {
    const arr = ((actualResults.answers as Record<string, unknown[]>)[betKey] ?? []) as unknown[];
    return { isArray: true, scalar: undefined, array: arr };
  }
  return {
    isArray: false,
    scalar: (actualResults.answers as Record<string, unknown>)[betKey],
    array: [],
  };
}

export function buildSpecialsMatrix(params: {
  leaderboard: LeaderboardEntry[];
  userId: string | null;
  poolSpecialBets: PoolSpecialBet[];
  actualResults: ActualResults;
  def: Tournament;
  matches?: MatchRow[];
}): { specialsMatrix: SpecialsMatrixEntry[]; specialsMatrixBets: SpecialsMatrixBet[] } {
  const { leaderboard, userId, poolSpecialBets, actualResults, def, matches = [] } = params;

  const playerMap = new Map<string, string>(def.players.map((p) => [p.id, p.name]));
  const impossibility = computeSpecialBetImpossibility(def, matches);

  const defs = getSpecialBetDefs(def.scoring).filter((d) => d.points > 0);

  const specialsMatrixBets: SpecialsMatrixBet[] = defs.map((d) => {
    const { isArray, scalar, array } = resolveActualForBet(d.key, actualResults);
    let actualPickLabel: string | null = null;
    if (isArray) {
      if (array.length > 0) {
        actualPickLabel = array
          .map((v) => makePickLabel(v, d.kind, playerMap) ?? String(v))
          .join(' / ');
      }
    } else if (scalar !== undefined && scalar !== null) {
      actualPickLabel = makePickLabel(scalar, d.kind, playerMap);
    }
    return { betKey: d.key, label: d.label, points: d.points, kind: d.kind, actualPickLabel };
  });

  // Build per-user pick index: userId → betKey → raw value
  const pickIndex = new Map<string, Map<string, unknown>>();
  for (const sb of poolSpecialBets) {
    if (!pickIndex.has(sb.userId)) pickIndex.set(sb.userId, new Map());
    pickIndex.get(sb.userId)!.set(sb.betKey, sb.value);
  }

  const specialsMatrix: SpecialsMatrixEntry[] = leaderboard.map((e) => {
    const userPicks = pickIndex.get(e.userId) ?? new Map<string, unknown>();
    let totalPoints = 0;

    const cells: SpecialsMatrixCell[] = defs.map((d) => {
      const raw = userPicks.get(d.key);
      const hasPick = raw !== null && raw !== undefined;
      const { isArray, scalar, array } = resolveActualForBet(d.key, actualResults);
      const isResolved = isArray ? array.length > 0 : scalar !== undefined && scalar !== null;

      let hit: SpecialsMatrixCell['hit'];
      if (!isResolved) {
        hit = hasPick && impossibility.isImpossible(d.key, raw) ? 'missed' : 'pending';
      } else if (!hasPick) {
        hit = 'no-pick';
      } else if (isArray) {
        hit = array.includes(raw) ? 'hit' : 'missed';
      } else {
        hit = raw === scalar ? 'hit' : 'missed';
      }

      const points = hit === 'hit' ? d.points : 0;
      totalPoints += points;

      return {
        betKey: d.key,
        hit,
        points,
        pickLabel: hasPick ? makePickLabel(raw, d.kind, playerMap) : null,
      };
    });

    return {
      userId: e.userId,
      displayName: e.displayName,
      isCurrentUser: userId !== null && e.userId === userId,
      cells,
      totalPoints,
    };
  });

  return {
    specialsMatrix: specialsMatrix.toSorted((a, b) => b.totalPoints - a.totalPoints),
    specialsMatrixBets,
  };
}
