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
import {
  deriveImplicitFinaleWinner,
  derivePredictedOpponent,
  resolveFinaleWinner,
} from '../domain/finale-winner';
import {
  resolveActualWinner as resolveKnockoutWinner,
  computeKnockoutEliminatedTeams,
  computeSemiFinalLoserTeams,
} from '../domain/knockout-match-winner';
import { resolveCrossSlotPick } from '../domain/cross-slot-pick';
import {
  computeSpecialBetImpossibility,
  type SpecialBetImpossibility,
} from '../domain/special-bet-impossibility';
import { buildHitPointsMap } from '../domain/hit-points';
import { buildVariantCellKey } from '../domain/knockout-cell-key';

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

  const matchByKey = buildKnockoutMatchByKey(allMatches);
  const qfKeys = new Set<string>(bracket.roundOf8Matches as string[]);
  const ctx: KnockoutCanStillGetContext = {
    matchByKey,
    // Teams eliminated from any played knockout match.
    knockoutEliminatedTeams: computeKnockoutEliminatedTeams(allMatches),
    // A semifinal loser advances to play Bronze — it is not out of the tournament, unlike a
    // R32/R16/QF/SF loser elsewhere. The Bronze busted-pair check must not treat it as eliminated,
    // even though knockoutEliminatedTeams (correctly) does for Final purposes.
    semiFinalLoserTeams: computeSemiFinalLoserTeams(allMatches, bracket.semiFinals as string[]),
    progressionParticipants: buildProgressionParticipants(bracket, matchByKey),
    hitPoints: buildPerMatchHitPoints(bracket, scoring),
    entryKeys: new Set<string>(bracket.slots.map((s) => s.match as string)),
    r16Keys: new Set<string>(bracket.roundOf16Matches as string[]),
    qfKeys,
    sfKeys: bracket.semiFinals as string[],
    bronzeKey: bracket.bronzeMatch as string,
    sfQfFeeders: buildSfQfFeeders(bracket),
    finalPlayed: actualResults.finalMatch !== undefined,
    bronzePlayed: actualResults.bronzeMatch !== undefined,
    topFourResolved: (actualResults.answers.roundOf4?.length ?? 0) >= qfKeys.size,
    scoring,
  };

  const userPickMaps = buildUserPickMaps(poolKnockoutPicks);
  const result = new Map<string, number>();
  for (const userId of new Set(poolKnockoutPicks.map((p) => p.userId as string))) {
    const picks = userPickMaps.get(userId) ?? new Map<string, string>();
    result.set(userId, computeUserKnockoutCanStillGet(ctx, picks));
  }
  return result;
}

type KnockoutCanStillGetContext = {
  matchByKey: Map<string, MatchRow>;
  knockoutEliminatedTeams: Set<string>;
  semiFinalLoserTeams: Set<string>;
  progressionParticipants: Map<string, [string | null, string | null]>;
  hitPoints: Map<string, number>;
  entryKeys: Set<string>;
  r16Keys: Set<string>;
  qfKeys: Set<string>;
  sfKeys: string[];
  bronzeKey: string;
  sfQfFeeders: Map<string, [string | null, string | null]>;
  finalPlayed: boolean;
  bronzePlayed: boolean;
  topFourResolved: boolean;
  scoring: Tournament['scoring'];
};

/** Per-user pick lookup plus the shared team state the viability predicates consult. */
type KnockoutViabilityContext = {
  picks: Map<string, string>;
  matchByKey: Map<string, MatchRow>;
  knockoutEliminatedTeams: Set<string>;
  progressionParticipants: Map<string, [string | null, string | null]>;
};

/** Actual knockout match data keyed by bracketMatchKey (== m.id for non-group matches). */
function buildKnockoutMatchByKey(allMatches: MatchRow[]): Map<string, MatchRow> {
  const matchByKey = new Map<string, MatchRow>();
  for (const m of allMatches) {
    if (m.stage !== 'group') matchByKey.set(m.id, m);
  }
  return matchByKey;
}

/**
 * Confirmed participants for progression matches (R16, QF, SF, Final),
 * derived from actual feeder match winners.
 */
function buildProgressionParticipants(
  bracket: Tournament['bracket'],
  matchByKey: Map<string, MatchRow>,
): Map<string, [string | null, string | null]> {
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
  return progressionParticipants;
}

/**
 * Per-round scored hit points (R32 → roundOf16PerTeam, R16 → roundOf8PerTeam).
 * Restricted to the two per-match scored categories — semiFinals/final/bronze are handled
 * separately via dedicated TopFour/Final/Bronze can-still-get logic.
 */
function buildPerMatchHitPoints(
  bracket: Tournament['bracket'],
  scoring: Tournament['scoring'],
): Map<string, number> {
  const hitPoints = new Map<string, number>();
  for (const prog of bracket.progression) {
    if ((bracket.roundOf16Matches as string[]).includes(prog.match as string)) {
      for (const fromKey of prog.from) hitPoints.set(fromKey as string, scoring.roundOf16PerTeam);
    }
    if ((bracket.roundOf8Matches as string[]).includes(prog.match as string)) {
      for (const fromKey of prog.from) hitPoints.set(fromKey as string, scoring.roundOf8PerTeam);
    }
  }
  return hitPoints;
}

/** QF feeder map for each SF: sfKey → [qfKey1, qfKey2]. */
function buildSfQfFeeders(
  bracket: Tournament['bracket'],
): Map<string, [string | null, string | null]> {
  const sfQfFeeders = new Map<string, [string | null, string | null]>();
  for (const sfKey of bracket.semiFinals as string[]) {
    const sfProg = bracket.progression.find((p) => (p.match as string) === sfKey);
    sfQfFeeders.set(sfKey, [
      (sfProg?.from[0] as string | undefined) ?? null,
      (sfProg?.from[1] as string | undefined) ?? null,
    ]);
  }
  return sfQfFeeders;
}

/** Per-user pick maps: userId → (bracketMatchKey → winnerTeamId). */
function buildUserPickMaps(
  poolKnockoutPicks: PoolKnockoutPick[],
): Map<string, Map<string, string>> {
  const userPickMaps = new Map<string, Map<string, string>>();
  for (const pick of poolKnockoutPicks) {
    const uid = pick.userId as string;
    if (!userPickMaps.has(uid)) userPickMaps.set(uid, new Map());
    userPickMaps.get(uid)!.set(pick.bracketMatchKey as string, pick.winnerTeamId);
  }
  return userPickMaps;
}

/**
 * True when `matchKey`'s pick is one of the confirmed participants, or when the participants
 * aren't both known yet (in which case it can't be ruled out).
 */
function pickedIsParticipant(
  vctx: KnockoutViabilityContext,
  matchKey: string,
  m: MatchRow | null,
  pickedId: string,
): boolean {
  const pp = vctx.progressionParticipants.get(matchKey);
  const home = pp?.[0] ?? m?.homeTeamId ?? null;
  const away = pp?.[1] ?? m?.awayTeamId ?? null;
  if (home !== null && away !== null) return pickedId === home || pickedId === away;
  return true;
}

/**
 * True when the user's pick for `matchKey` is still viable: the match is unresolved, the picked
 * team is not eliminated, and (if both participants are confirmed) the pick is one of them.
 */
function pickIsViable(vctx: KnockoutViabilityContext, matchKey: string): boolean {
  const pickedId = vctx.picks.get(matchKey) ?? null;
  if (!pickedId) return false;
  const m = vctx.matchByKey.get(matchKey) ?? null;
  if (m?.status === 'final') return false;
  if (vctx.knockoutEliminatedTeams.has(pickedId)) return false;
  return pickedIsParticipant(vctx, matchKey, m, pickedId);
}

/**
 * True when the user's pick for `matchKey` is not busted. For resolved matches only the actual
 * winner is not busted; for unresolved matches the same check as pickIsViable applies.
 */
function pickIsNotBusted(vctx: KnockoutViabilityContext, matchKey: string): boolean {
  const pickedId = vctx.picks.get(matchKey) ?? null;
  if (!pickedId) return false;
  const m = vctx.matchByKey.get(matchKey) ?? null;
  if (m?.status === 'final') return resolveKnockoutWinner(m) === pickedId;
  if (vctx.knockoutEliminatedTeams.has(pickedId)) return false;
  return pickedIsParticipant(vctx, matchKey, m, pickedId);
}

/**
 * True only when `matchKey`'s match is final AND the user's pick was the winner — i.e. this pick's
 * points are already banked in the user's leaderboard total.
 */
function pickIsConfirmedCorrect(vctx: KnockoutViabilityContext, matchKey: string): boolean {
  const pickedId = vctx.picks.get(matchKey) ?? null;
  if (!pickedId) return false;
  const m = vctx.matchByKey.get(matchKey) ?? null;
  return m?.status === 'final' && resolveKnockoutWinner(m) === pickedId;
}

/** Sum of hit points for every per-match key whose pick is still viable. */
function sumViablePerMatchPoints(
  vctx: KnockoutViabilityContext,
  keys: Set<string>,
  hitPoints: Map<string, number>,
): number {
  let sum = 0;
  for (const key of keys) {
    const pts = hitPoints.get(key);
    if (pts !== undefined && pickIsViable(vctx, key)) sum += pts;
  }
  return sum;
}

/**
 * TopFour ceiling: non-busted QF picks × roundOf4PerTeam (no-pick = not busted, consistent with
 * buildKnockoutRoundBreakdown which uses totalPicks − bustedPicks). Already-confirmed-correct picks
 * are subtracted so this doesn't double-count points already banked via scoreTopFour.
 */
function topFourCanStillGet(
  vctx: KnockoutViabilityContext,
  ctx: KnockoutCanStillGetContext,
): number {
  if (ctx.topFourResolved) return 0;
  let nonBustedQf = ctx.qfKeys.size;
  let confirmedQf = 0;
  for (const key of ctx.qfKeys) {
    const pickedId = vctx.picks.get(key) ?? null;
    if (!pickedId) continue;
    if (!pickIsNotBusted(vctx, key)) {
      nonBustedQf--;
    } else if (pickIsConfirmedCorrect(vctx, key)) {
      confirmedQf++;
    }
  }
  return Math.max(0, (nonBustedQf - confirmedQf) * ctx.scoring.roundOf4PerTeam);
}

/**
 * Final ceiling: finalist perTeam × non-busted SF picks + exactScore, plus the same non-busted
 * count × topFourPositionBonus (1st/2nd place) — reachable while the predicted finalist is alive.
 */
function finalCanStillGet(vctx: KnockoutViabilityContext, ctx: KnockoutCanStillGetContext): number {
  if (ctx.finalPlayed) return 0;
  let bustedSfPicks = 0;
  for (const sfKey of ctx.sfKeys) {
    if (vctx.picks.has(sfKey) && !pickIsNotBusted(vctx, sfKey)) bustedSfPicks++;
  }
  const nonBusted = Math.max(0, 2 - bustedSfPicks);
  return (
    nonBusted * ctx.scoring.final.perTeam +
    ctx.scoring.final.exactScore +
    nonBusted * ctx.scoring.topFourPositionBonus
  );
}

/**
 * The implied bronze participant for one SF: the QF winner pick that the user did NOT pick to win
 * the SF. Null when neither QF feeder pick differs from the SF winner pick.
 */
function deriveBronzeTeam(
  picks: Map<string, string>,
  feeders: [string | null, string | null] | undefined,
  sfWinner: string,
): string | null {
  const [qfKey1, qfKey2] = feeders ?? [null, null];
  const qfW1 = qfKey1 ? (picks.get(qfKey1) ?? null) : null;
  const qfW2 = qfKey2 ? (picks.get(qfKey2) ?? null) : null;
  if (qfW1 && qfW1 !== sfWinner) return qfW1;
  if (qfW2 && qfW2 !== sfWinner) return qfW2;
  return null;
}

/** Whether one SF's implied bronze pair is busted (counts toward Bronze ceiling reduction). */
function isBronzePairBusted(
  vctx: KnockoutViabilityContext,
  ctx: KnockoutCanStillGetContext,
  sfKey: string,
  bronzeMatchRow: MatchRow | null,
): boolean {
  const sfWinner = vctx.picks.get(sfKey) ?? null;
  if (!sfWinner) return false;
  // If the SF winner pick itself is already busted, the whole predicted sub-bracket for this slot
  // is unreliable — the "other" QF feeder pick may look alive only because it never played a real
  // knockout match (upstream R32/R16 picks already diverged from reality), not because it's a
  // genuine live bronze contender. Treat this slot's bronze pair as busted too, mirroring Final.
  if (!pickIsNotBusted(vctx, sfKey)) return true;
  const bronzeTeam = deriveBronzeTeam(vctx.picks, ctx.sfQfFeeders.get(sfKey), sfWinner);
  if (!bronzeTeam) return false;
  if (ctx.knockoutEliminatedTeams.has(bronzeTeam) && !ctx.semiFinalLoserTeams.has(bronzeTeam)) {
    return true;
  }
  const bHome = bronzeMatchRow?.homeTeamId ?? null;
  const bAway = bronzeMatchRow?.awayTeamId ?? null;
  return bHome !== null && bAway !== null && bronzeTeam !== bHome && bronzeTeam !== bAway;
}

/**
 * Bronze ceiling: bronzePair perTeam × non-busted implied SF-loser picks + exactScore, plus the
 * same non-busted count × topFourPositionBonus (3rd/4th place). The bronze pair is derived from
 * each SF's loser (the QF winner pick the user did NOT pick to win the SF).
 */
function bronzeCanStillGet(
  vctx: KnockoutViabilityContext,
  ctx: KnockoutCanStillGetContext,
): number {
  if (ctx.bronzePlayed) return 0;
  const bronzeMatchRow = ctx.matchByKey.get(ctx.bronzeKey) ?? null;
  let bustedBronzePairs = 0;
  for (const sfKey of ctx.sfKeys) {
    if (isBronzePairBusted(vctx, ctx, sfKey, bronzeMatchRow)) bustedBronzePairs++;
  }
  const nonBusted = Math.max(0, 2 - bustedBronzePairs);
  return (
    nonBusted * ctx.scoring.bronze.perTeam +
    ctx.scoring.bronze.exactScore +
    nonBusted * ctx.scoring.topFourPositionBonus
  );
}

/** Maximum additional knockout points one user can still earn, given their pick map. */
function computeUserKnockoutCanStillGet(
  ctx: KnockoutCanStillGetContext,
  picks: Map<string, string>,
): number {
  const vctx: KnockoutViabilityContext = {
    picks,
    matchByKey: ctx.matchByKey,
    knockoutEliminatedTeams: ctx.knockoutEliminatedTeams,
    progressionParticipants: ctx.progressionParticipants,
  };
  // Per-match scored rounds: entry round (R32 in WC) and R16.
  return (
    sumViablePerMatchPoints(vctx, ctx.entryKeys, ctx.hitPoints) +
    sumViablePerMatchPoints(vctx, ctx.r16Keys, ctx.hitPoints) +
    topFourCanStillGet(vctx, ctx) +
    finalCanStillGet(vctx, ctx) +
    bronzeCanStillGet(vctx, ctx)
  );
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

/** A user's saved Final/Bronze finish score, including the team-identity snapshot when present. */
type KnockoutFinishScore = {
  home: number;
  away: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
};

/** Tournament-wide state shared by every knockout matrix cell, independent of the viewing user. */
type KnockoutCellSharedContext = {
  finalMatchKey: string;
  bronzeMatchKey: string;
  eliminatedTeams: Set<string>;
  semiFinalLoserTeams: Set<string>;
  hitPoints: Map<string, number>;
  bracket: Tournament['bracket'];
  scoring: Tournament['scoring'];
};

/** One pool member's picks used to derive their knockout matrix cells. */
type KnockoutCellUserContext = {
  userId: string;
  pickMap: Map<string, string>;
  userRoundPicks: Map<string, Set<string>>;
  userPickMap: Map<string, string>;
  finishScores: Map<'final' | 'bronze', KnockoutFinishScore> | undefined;
};

/** The user's effective prediction for one knockout match, before hit classification. */
type KnockoutCellPrediction = {
  pickedWinnerId: string | null;
  predictedHome: number | null;
  predictedAway: number | null;
  predictedScoreByTeam: { teamId: string; goals: number }[] | null;
  isExactScore: boolean;
};

/**
 * Records a losing team in the elimination sets. A semifinal loser is also tracked separately since
 * it advances to play Bronze — so it must not be treated as eliminated for Bronze impossibility.
 */
function recordKnockoutLoser(
  teamId: string | null,
  winnerId: string,
  isSemiFinal: boolean,
  eliminatedTeams: Set<string>,
  semiFinalLoserTeams: Set<string>,
): void {
  if (!teamId || teamId === winnerId) return;
  eliminatedTeams.add(teamId);
  if (isSemiFinal) semiFinalLoserTeams.add(teamId);
}

/**
 * Teams eliminated by a played knockout match, plus the subset that lost specifically in a
 * semifinal. A semifinal loser is not out of the tournament (it plays Bronze), so callers checking
 * Bronze picks must exclude it from the eliminated set even though it counts as eliminated for the
 * Final.
 */
function computeKnockoutEliminationSets(
  matches: KnockoutMatchView[],
  semiFinals: Set<string>,
): { eliminatedTeams: Set<string>; semiFinalLoserTeams: Set<string> } {
  const eliminatedTeams = new Set<string>();
  const semiFinalLoserTeams = new Set<string>();
  for (const m of matches) {
    if (m.status !== 'final' || !m.actualWinnerId) continue;
    const isSemiFinal = semiFinals.has(m.bracketMatchKey);
    recordKnockoutLoser(
      m.homeTeamId,
      m.actualWinnerId,
      isSemiFinal,
      eliminatedTeams,
      semiFinalLoserTeams,
    );
    recordKnockoutLoser(
      m.awayTeamId,
      m.actualWinnerId,
      isSemiFinal,
      eliminatedTeams,
      semiFinalLoserTeams,
    );
  }
  return { eliminatedTeams, semiFinalLoserTeams };
}

/** Orders knockout matches by kickoff, pushing matches with no kickoff to the end (stable). */
function compareKnockoutByKickoff(a: KnockoutMatchView, b: KnockoutMatchView): number {
  if (a.kickoff === null && b.kickoff === null) return 0;
  if (a.kickoff === null) return 1;
  if (b.kickoff === null) return -1;
  return a.kickoff.localeCompare(b.kickoff);
}

/** Per-user, per-round set of every picked team ID (regardless of which slot it was picked in). */
function buildUserRoundPicksMap(
  poolKnockoutPicks: PoolKnockoutPick[],
  matchRoundMap: Map<string, string>,
): Map<string, Map<string, Set<string>>> {
  const userRoundPicksMap = new Map<string, Map<string, Set<string>>>();
  for (const pick of poolKnockoutPicks) {
    const round = matchRoundMap.get(pick.bracketMatchKey);
    if (!round) continue;
    if (!userRoundPicksMap.has(pick.userId)) userRoundPicksMap.set(pick.userId, new Map());
    const roundMap = userRoundPicksMap.get(pick.userId)!;
    if (!roundMap.has(round)) roundMap.set(round, new Set());
    roundMap.get(round)!.add(pick.winnerTeamId);
  }
  return userRoundPicksMap;
}

/** Per-user finish scores: userId → 'final'|'bronze' → saved score (with team-identity snapshot). */
function buildFinishScoreMap(
  poolFinishScores: PoolFinishScore[],
): Map<string, Map<'final' | 'bronze', KnockoutFinishScore>> {
  const finishScoreMap = new Map<string, Map<'final' | 'bronze', KnockoutFinishScore>>();
  for (const fs of poolFinishScores) {
    if (!finishScoreMap.has(fs.userId)) finishScoreMap.set(fs.userId, new Map());
    finishScoreMap.get(fs.userId)!.set(fs.match, {
      home: fs.home,
      away: fs.away,
      homeTeamId: fs.homeTeamId,
      awayTeamId: fs.awayTeamId,
    });
  }
  return finishScoreMap;
}

/** Whether a finish score's positional home/away figures exactly match the actual result. */
function isPositionalExactScore(fs: { home: number; away: number }, m: KnockoutMatchView): boolean {
  return (
    m.actualHome !== null &&
    m.actualAway !== null &&
    fs.home === m.actualHome &&
    fs.away === m.actualAway
  );
}

/**
 * Whether a team-identity finish score snapshot exactly matches the actual result. Correct
 * regardless of how the real match's home/away assignment relates to the user's predicted
 * orientation.
 */
function isTeamIdentityExactScore(
  predictedScoreByTeam: { teamId: string; goals: number }[],
  m: KnockoutMatchView,
): boolean {
  if (
    m.actualHome === null ||
    m.actualAway === null ||
    m.homeTeamId === null ||
    m.awayTeamId === null
  ) {
    return false;
  }
  const predictedByTeam = new Map(predictedScoreByTeam.map((s) => [s.teamId, s.goals]));
  return (
    predictedByTeam.get(m.homeTeamId) === m.actualHome &&
    predictedByTeam.get(m.awayTeamId) === m.actualAway
  );
}

/**
 * Final/Bronze prediction derived from the user's finish score. The team-identity snapshot (when
 * present) drives the exact-score check and the effective winner; the positional figures and the
 * raw knockoutPick are the fallbacks for legacy rows that predate the snapshot.
 */
function resolveFinishScorePrediction(
  m: KnockoutMatchView,
  shared: KnockoutCellSharedContext,
  user: KnockoutCellUserContext,
  knockoutPick: string | null,
): KnockoutCellPrediction {
  const matchType = m.bracketMatchKey === shared.finalMatchKey ? 'final' : 'bronze';
  const fs = user.finishScores?.get(matchType);

  let predictedHome: number | null = null;
  let predictedAway: number | null = null;
  let predictedScoreByTeam: { teamId: string; goals: number }[] | null = null;
  let isExactScore = false;

  if (fs !== undefined) {
    predictedHome = fs.home;
    predictedAway = fs.away;
    isExactScore = isPositionalExactScore(fs, m);
    if (fs.homeTeamId != null && fs.awayTeamId != null) {
      predictedScoreByTeam = [
        { teamId: fs.homeTeamId, goals: fs.home },
        { teamId: fs.awayTeamId, goals: fs.away },
      ];
      isExactScore = isTeamIdentityExactScore(predictedScoreByTeam, m);
    }
  }

  // resolveFinaleWinner prefers the snapshot above when present (tied → null, so the fallback below
  // applies the same "explicit penalty pick" rule as the no-snapshot path); deriveImplicitFinaleWinner
  // only runs for legacy rows that predate the snapshot.
  const derivedWinner = resolveFinaleWinner(fs, (home, away) =>
    deriveImplicitFinaleWinner(m.bracketMatchKey, shared.bracket, user.userPickMap, home, away),
  );
  const pickedWinnerId =
    derivedWinner ??
    (fs !== undefined
      ? deriveEffectivePick(fs, m.homeTeamId, m.awayTeamId, knockoutPick)
      : knockoutPick);

  return { pickedWinnerId, predictedHome, predictedAway, predictedScoreByTeam, isExactScore };
}

/**
 * Progression-round (non Final/Bronze) prediction. The stored pick is keyed by bracket slot, but
 * which teams actually play that slot depends on how earlier rounds actually turned out — resolve
 * to the team identity so the summary reflects what the user predicted for these two teams, falling
 * back to the raw pick when no cross-slot match exists (a genuine miss/impossible pick).
 */
function resolveProgressionPrediction(
  m: KnockoutMatchView,
  user: KnockoutCellUserContext,
  knockoutPick: string | null,
): KnockoutCellPrediction {
  const pickedWinnerId =
    resolveCrossSlotPick(
      knockoutPick,
      m.homeTeamId,
      m.awayTeamId,
      user.userRoundPicks.get(m.round) ?? new Set(),
    ) ?? knockoutPick;
  return {
    pickedWinnerId,
    predictedHome: null,
    predictedAway: null,
    predictedScoreByTeam: null,
    isExactScore: false,
  };
}

/** Hit status for a not-yet-played knockout match: 'impossible' when the pick can no longer win. */
function pendingKnockoutHitStatus(
  m: KnockoutMatchView,
  shared: KnockoutCellSharedContext,
  pickedWinnerId: string | null,
): KnockoutMatchHit {
  if (pickedWinnerId === null) return 'pending';
  const isBronzeMatch = m.bracketMatchKey === shared.bronzeMatchKey;
  const isEliminated =
    shared.eliminatedTeams.has(pickedWinnerId) &&
    !(isBronzeMatch && shared.semiFinalLoserTeams.has(pickedWinnerId));
  const bothKnown = m.homeTeamId !== null && m.awayTeamId !== null;
  const isImpossible =
    isEliminated ||
    (bothKnown && pickedWinnerId !== m.homeTeamId && pickedWinnerId !== m.awayTeamId);
  return isImpossible ? 'impossible' : 'pending';
}

/** Classifies one played/pending progression-round (non-Final/Bronze) cell. */
function classifyKnockoutCell(
  m: KnockoutMatchView,
  shared: KnockoutCellSharedContext,
  user: KnockoutCellUserContext,
  prediction: KnockoutCellPrediction,
): KnockoutMatrixCell {
  const { pickedWinnerId, predictedHome, predictedAway, predictedScoreByTeam, isExactScore } =
    prediction;
  const base = {
    bracketMatchKey: m.bracketMatchKey,
    pickedWinnerId,
    pickedOpponentId: null,
    predictedHome,
    predictedAway,
    predictedScoreByTeam,
    isExactScore,
  };

  if (m.status !== 'final') {
    return { ...base, hit: pendingKnockoutHitStatus(m, shared, pickedWinnerId), points: 0 };
  }

  const isHit =
    m.actualWinnerId !== null && (user.userRoundPicks.get(m.round)?.has(m.actualWinnerId) ?? false);

  if (isHit) {
    const pts = shared.hitPoints.get(m.bracketMatchKey) ?? 0;
    return { ...base, hit: 'hit', points: pts };
  }
  if (pickedWinnerId === null) {
    return { ...base, hit: 'no-pick', points: 0 };
  }
  return { ...base, hit: 'miss', points: 0 };
}

/** Builds one knockout matrix cell for a progression round: resolves the pick, then classifies it. */
function buildKnockoutMatrixCell(
  m: KnockoutMatchView,
  shared: KnockoutCellSharedContext,
  user: KnockoutCellUserContext,
): KnockoutMatrixCell {
  const knockoutPick = user.pickMap.get(`${user.userId}::${m.bracketMatchKey}`) ?? null;
  const prediction = resolveProgressionPrediction(m, user, knockoutPick);
  return classifyKnockoutCell(m, shared, user, prediction);
}

/** 'teams'|'score' columns to render for a Final/Bronze match; null for a normal progression match. */
function finishColumnVariants(
  m: KnockoutMatchView,
  shared: KnockoutCellSharedContext,
): ('teams' | 'score')[] | null {
  if (m.bracketMatchKey === shared.finalMatchKey) return ['score'];
  if (m.bracketMatchKey === shared.bronzeMatchKey) return ['teams', 'score'];
  return null;
}

/**
 * 0/1/2 of the user's two predicted teams (winner + derived opponent) that actually played this
 * match, times perTeam. Side-agnostic and independent of who won — mirrors scoreFinishMatch in
 * packages/engine/src/scoring/finish-matches.ts.
 */
function finishTeamPoints(
  m: KnockoutMatchView,
  pickedWinnerId: string | null,
  pickedOpponentId: string | null,
  perTeam: number,
): number {
  if (m.status !== 'final') return 0;
  const actualTeams = new Set([m.homeTeamId, m.awayTeamId]);
  const count = [pickedWinnerId, pickedOpponentId].filter(
    (id): id is string => id !== null && actualTeams.has(id),
  ).length;
  return count * perTeam;
}

/** Exact-score bonus, independent of team correctness. */
function finishScorePoints(
  m: KnockoutMatchView,
  isExactScore: boolean,
  exactScore: number,
): number {
  return m.status === 'final' && isExactScore ? exactScore : 0;
}

/** Classifies one Final/Bronze 'teams' or 'score' cell given its already-computed points. */
function classifyFinishCell(
  m: KnockoutMatchView,
  shared: KnockoutCellSharedContext,
  prediction: KnockoutCellPrediction,
  pickedOpponentId: string | null,
  points: number,
): Omit<KnockoutMatrixCell, 'bracketMatchKey'> {
  const { pickedWinnerId, predictedHome, predictedAway, predictedScoreByTeam, isExactScore } =
    prediction;
  const base = {
    pickedWinnerId,
    pickedOpponentId,
    predictedHome,
    predictedAway,
    predictedScoreByTeam,
    isExactScore,
  };

  if (m.status !== 'final') {
    return { ...base, hit: pendingKnockoutHitStatus(m, shared, pickedWinnerId), points: 0 };
  }
  if (points > 0) return { ...base, hit: 'hit', points };
  if (pickedWinnerId === null) return { ...base, hit: 'no-pick', points: 0 };
  return { ...base, hit: 'miss', points: 0 };
}

/** Builds the 'teams'/'score' matrix cells for a Final or Bronze match (see finishColumnVariants). */
function buildFinishMatrixCells(
  m: KnockoutMatchView,
  variants: ('teams' | 'score')[],
  shared: KnockoutCellSharedContext,
  user: KnockoutCellUserContext,
): KnockoutMatrixCell[] {
  const knockoutPick = user.pickMap.get(`${user.userId}::${m.bracketMatchKey}`) ?? null;
  const prediction = resolveFinishScorePrediction(m, shared, user, knockoutPick);
  const pickedOpponentId = derivePredictedOpponent(
    m.bracketMatchKey,
    shared.bracket,
    user.userPickMap,
    prediction.pickedWinnerId,
  );
  const isFinal = m.bracketMatchKey === shared.finalMatchKey;
  const finishScoring = isFinal ? shared.scoring.final : shared.scoring.bronze;

  return variants.map((variant) => {
    const points =
      variant === 'teams'
        ? finishTeamPoints(m, prediction.pickedWinnerId, pickedOpponentId, finishScoring.perTeam)
        : finishScorePoints(m, prediction.isExactScore, finishScoring.exactScore);
    return {
      ...classifyFinishCell(m, shared, prediction, pickedOpponentId, points),
      bracketMatchKey: buildVariantCellKey(m.bracketMatchKey, variant),
    };
  });
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

  // A semifinal loser is not eliminated from the tournament — it advances to play Bronze.
  // So it must not count as "eliminated" when checking impossibility for a Bronze pick,
  // even though the same loss does eliminate it from Final contention.
  const semiFinals = new Set<string>(def.bracket.semiFinals as string[]);
  const { eliminatedTeams, semiFinalLoserTeams } = computeKnockoutEliminationSets(
    allKnockoutMatches,
    semiFinals,
  );

  const sortedMatches = allKnockoutMatches.toSorted(compareKnockoutByKickoff);

  const shared: KnockoutCellSharedContext = {
    finalMatchKey: def.bracket.finalMatch as string,
    bronzeMatchKey: def.bracket.bronzeMatch as string,
    eliminatedTeams,
    semiFinalLoserTeams,
    hitPoints: buildHitPointsMap(def),
    bracket: def.bracket,
    scoring: def.scoring,
  };

  const knockoutMatrixMatches: KnockoutMatrixMatch[] = sortedMatches.flatMap((m) => {
    const variants = finishColumnVariants(m, shared);
    const base = {
      round: m.round,
      homeTeamId: m.homeTeamId,
      homeTeamName: m.homeTeamName,
      awayTeamId: m.awayTeamId,
      awayTeamName: m.awayTeamName,
      actualWinnerId: m.actualWinnerId,
      kickoff: m.kickoff,
      status: m.status,
    };
    if (!variants) return [{ ...base, bracketMatchKey: m.bracketMatchKey }];
    return variants.map((variant) => ({
      ...base,
      bracketMatchKey: buildVariantCellKey(m.bracketMatchKey, variant),
      variant,
    }));
  });

  const pickMap = new Map<string, string>();
  for (const pick of poolKnockoutPicks) {
    pickMap.set(`${pick.userId}::${pick.bracketMatchKey}`, pick.winnerTeamId);
  }

  // Map bracketMatchKey → round label for cross-slot pick matching.
  const matchRoundMap = new Map<string, string>(
    allKnockoutMatches.map((m) => [m.bracketMatchKey, m.round]),
  );

  const userRoundPicksMap = buildUserRoundPicksMap(poolKnockoutPicks, matchRoundMap);
  const finishScoreMap = buildFinishScoreMap(poolFinishScores);

  const knockoutMatrix: KnockoutMatrixEntry[] = leaderboard.map((e) => {
    const user: KnockoutCellUserContext = {
      userId: e.userId,
      pickMap,
      userRoundPicks: userRoundPicksMap.get(e.userId) ?? new Map<string, Set<string>>(),
      userPickMap: new Map<string, string>(
        poolKnockoutPicks
          .filter((p) => p.userId === e.userId)
          .map((p) => [p.bracketMatchKey as string, p.winnerTeamId]),
      ),
      finishScores: finishScoreMap.get(e.userId),
    };
    const cells: KnockoutMatrixCell[] = sortedMatches.flatMap((m) => {
      const variants = finishColumnVariants(m, shared);
      return variants
        ? buildFinishMatrixCells(m, variants, shared, user)
        : [buildKnockoutMatrixCell(m, shared, user)];
    });
    const standingsPoints = e.breakdown?.topFourPosition ?? 0;
    const totalPoints = cells.reduce((sum, c) => sum + c.points, 0) + standingsPoints;

    return {
      userId: e.userId,
      displayName: e.displayName,
      isCurrentUser: userId !== null && e.userId === userId,
      cells,
      standingsPoints,
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
    groupId: m.groupId ?? '',
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
    let matchPoints = 0;
    const cells: MatchMatrixCell[] = allGroupMatches.map((m) => {
      const pred = predMap.get(`${e.userId}::${m.id}`) ?? null;
      const predictedOutcome = toPredictedOutcome(pred?.home ?? null, pred?.away ?? null);
      const predictedHome = pred?.home ?? null;
      const predictedAway = pred?.away ?? null;

      if (m.status !== 'final') {
        return {
          matchId: m.id,
          hit: 'pending',
          points: 0,
          predictedOutcome,
          predictedHome,
          predictedAway,
        };
      }

      const hit = computeHit(
        m.homeGoals!,
        m.awayGoals!,
        pred?.home ?? null,
        pred?.away ?? null,
        scoring,
      );
      matchPoints += hit.points;
      return {
        matchId: m.id,
        hit: hit.hit,
        points: hit.points,
        predictedOutcome,
        predictedHome,
        predictedAway,
      };
    });
    const groupOrderPoints = e.breakdown?.groupOrder ?? 0;
    return {
      userId: e.userId,
      displayName: e.displayName,
      isCurrentUser: userId !== null && e.userId === userId,
      cells,
      groupOrderPoints,
      totalPoints: matchPoints + groupOrderPoints,
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

/**
 * Classifies one special-bet cell for a single user.
 *
 * - Unresolved bet: 'missed' when the user has a pick that's already mathematically impossible,
 *   otherwise 'pending'.
 * - Resolved bet: 'no-pick' when the user never picked; for array-answer bets a hit means the pick
 *   is one of the accepted answers; for scalar bets a hit means the pick equals the actual answer.
 */
function classifySpecialsCellHit(
  betKey: string,
  raw: unknown,
  hasPick: boolean,
  actual: { isArray: boolean; scalar: unknown; array: unknown[] },
  impossibility: SpecialBetImpossibility,
): SpecialsMatrixCell['hit'] {
  const { isArray, scalar, array } = actual;
  const isResolved = isArray ? array.length > 0 : scalar !== undefined && scalar !== null;
  if (!isResolved) {
    return hasPick && impossibility.isImpossible(betKey, raw) ? 'missed' : 'pending';
  }
  if (!hasPick) return 'no-pick';
  if (isArray) return array.includes(raw) ? 'hit' : 'missed';
  return raw === scalar ? 'hit' : 'missed';
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
      const actual = resolveActualForBet(d.key, actualResults);
      const hit = classifySpecialsCellHit(d.key, raw, hasPick, actual, impossibility);

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
