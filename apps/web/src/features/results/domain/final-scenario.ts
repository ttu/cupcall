import { getSpecialBetDefs } from '@cup/engine';
import type { Tournament, ActualResults } from '@cup/engine';
import type {
  LeaderboardEntry,
  MatchRow,
  PoolKnockoutPick,
  PoolFinishScore,
  PoolSpecialBet,
} from '@cup/db';
import type { BracketRoundResultView, KnockoutMatchView } from './types';
import {
  deriveImplicitFinaleWinner,
  derivePredictedOpponent,
  resolveFinaleWinner,
} from './finale-winner';
import {
  computeSpecialBetImpossibility,
  type SpecialBetImpossibility,
} from './special-bet-impossibility';
import { resolveActualForBet, isBetResolved } from './special-bet-resolution';

export type FinalScenarioPendingItem = { label: string; points: number };

export type FinalScenarioOutcome = {
  winnerTeamId: string;
  winnerTeamName: string;
  projectedWinnerUserId: string;
  projectedWinnerDisplayName: string;
  projectedPoints: number;
  status: 'clinched' | 'checklist' | 'too-close';
  mustHit: FinalScenarioPendingItem[];
};

export type FinalScenarioView = {
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  home: FinalScenarioOutcome;
  away: FinalScenarioOutcome;
} | null;

type Params = {
  leaderboard: LeaderboardEntry[];
  allMatches: MatchRow[];
  def: Tournament;
  bracketRounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
  poolKnockoutPicks: PoolKnockoutPick[];
  poolFinishScores: PoolFinishScore[];
  poolSpecialBets: PoolSpecialBet[];
  actualResults: ActualResults;
};

/** Locates the Final's KnockoutMatchView and confirms both finalists + Bronze are settled. */
function findActiveFinalMatch(
  bracketRounds: BracketRoundResultView[],
  bronzeMatch: KnockoutMatchView | null,
  finalMatchKey: string,
): KnockoutMatchView | null {
  const finalMatchView =
    bracketRounds.flatMap((r) => r.matches).find((m) => m.bracketMatchKey === finalMatchKey) ??
    null;
  if (finalMatchView === null) return null;
  if (finalMatchView.status === 'final') return null;
  if (finalMatchView.homeTeamId === null || finalMatchView.awayTeamId === null) return null;
  if (bronzeMatch === null || bronzeMatch.status !== 'final') return null;
  return finalMatchView;
}

type UserFinalPick = { pickedWinner: string | null; predictedOpponent: string | null };

/**
 * Per-user effective Final winner pick + derived predicted opponent (from the user's own SF pick
 * chain — may not resolve to a real pair when the user's bracket is busted, which is expected and
 * handled by the caller via independent comparisons rather than an assumed 2x/0x binary).
 */
function buildFinalPicksByUser(
  leaderboard: LeaderboardEntry[],
  poolKnockoutPicks: PoolKnockoutPick[],
  poolFinishScores: PoolFinishScore[],
  finalMatchView: KnockoutMatchView,
  bracket: Tournament['bracket'],
): Map<string, UserFinalPick> {
  const finalMatchKey = bracket.finalMatch as string;
  const picksByUser = new Map<string, Map<string, string>>();
  for (const pick of poolKnockoutPicks) {
    const uid = pick.userId as string;
    if (!picksByUser.has(uid)) picksByUser.set(uid, new Map());
    picksByUser.get(uid)!.set(pick.bracketMatchKey as string, pick.winnerTeamId);
  }
  const finishScoreByUser = new Map<string, PoolFinishScore>();
  for (const fs of poolFinishScores) {
    if (fs.match === 'final') finishScoreByUser.set(fs.userId as string, fs);
  }

  const result = new Map<string, UserFinalPick>();
  for (const entry of leaderboard) {
    const uid = entry.userId as string;
    const userPickMap = picksByUser.get(uid) ?? new Map<string, string>();
    const knockoutPick = userPickMap.get(finalMatchKey) ?? null;
    const fs = finishScoreByUser.get(uid);

    const derivedWinner = resolveFinaleWinner(fs, (home, away) =>
      deriveImplicitFinaleWinner(finalMatchKey, bracket, userPickMap, home, away),
    );

    let pickedWinner: string | null;
    if (derivedWinner !== null) {
      pickedWinner = derivedWinner;
    } else if (fs === undefined || fs.home === fs.away) {
      pickedWinner = knockoutPick;
    } else {
      pickedWinner =
        fs.home > fs.away
          ? (finalMatchView.homeTeamId ?? knockoutPick)
          : (finalMatchView.awayTeamId ?? knockoutPick);
    }

    const predictedOpponent = derivePredictedOpponent(
      finalMatchKey,
      bracket,
      userPickMap,
      pickedWinner,
    );
    result.set(uid, { pickedWinner, predictedOpponent });
  }
  return result;
}

/** Every still-open special bet's points for each user, scenario-independent. */
function buildSpecialPendingItemsByUser(
  poolSpecialBets: PoolSpecialBet[],
  actualResults: ActualResults,
  specialDefs: { key: string; label: string; points: number }[],
  impossibility: SpecialBetImpossibility,
): Map<string, FinalScenarioPendingItem[]> {
  const defByKey = new Map(specialDefs.map((d) => [d.key, d]));
  const result = new Map<string, FinalScenarioPendingItem[]>();
  for (const sb of poolSpecialBets) {
    const def = defByKey.get(sb.betKey);
    if (def === undefined) continue;
    if (isBetResolved(resolveActualForBet(sb.betKey, actualResults))) continue;
    if (impossibility.isImpossible(sb.betKey, sb.value)) continue;
    const uid = sb.userId as string;
    if (!result.has(uid)) result.set(uid, []);
    result.get(uid)!.push({ label: def.label, points: def.points });
  }
  return result;
}

/**
 * Final exact-score bonus as a pending item for one user in one scenario, or null when it can
 * never be awarded (no team-id snapshot) or is structurally dead in this scenario (predicted a
 * decisive score for the other team).
 */
function finalExactScoreItem(
  fs: PoolFinishScore | undefined,
  scenarioWinnerTeamId: string,
  exactScorePoints: number,
): FinalScenarioPendingItem | null {
  if (fs === undefined || fs.homeTeamId === null || fs.awayTeamId === null) return null;
  if (fs.home === fs.away) return { label: 'Final exact score', points: exactScorePoints };
  const impliedWinner = fs.home > fs.away ? fs.homeTeamId : fs.awayTeamId;
  if (impliedWinner !== scenarioWinnerTeamId) return null;
  return { label: 'Final exact score', points: exactScorePoints };
}

function sumPoints(items: FinalScenarioPendingItem[]): number {
  return items.reduce((sum, item) => sum + item.points, 0);
}

function buildOutcome(options: {
  scenarioWinnerTeamId: string;
  scenarioWinnerTeamName: string;
  scenarioLoserTeamId: string;
  leaderboard: LeaderboardEntry[];
  finalPicksByUser: Map<string, UserFinalPick>;
  specialPendingByUser: Map<string, FinalScenarioPendingItem[]>;
  finishScoreByUser: Map<string, PoolFinishScore>;
  topFourPositionBonus: number;
  finalExactScorePoints: number;
}): FinalScenarioOutcome {
  const {
    scenarioWinnerTeamId,
    scenarioWinnerTeamName,
    scenarioLoserTeamId,
    leaderboard,
    finalPicksByUser,
    specialPendingByUser,
    finishScoreByUser,
    topFourPositionBonus,
    finalExactScorePoints,
  } = options;

  const rows = leaderboard.map((entry) => {
    const uid = entry.userId as string;
    const pick = finalPicksByUser.get(uid)!;
    const positionBonus =
      (pick.pickedWinner === scenarioWinnerTeamId ? topFourPositionBonus : 0) +
      (pick.predictedOpponent === scenarioLoserTeamId ? topFourPositionBonus : 0);
    const lockedScore = entry.pointsTotal + positionBonus;

    const pendingItems = [...(specialPendingByUser.get(uid) ?? [])];
    const exactItem = finalExactScoreItem(
      finishScoreByUser.get(uid),
      scenarioWinnerTeamId,
      finalExactScorePoints,
    );
    if (exactItem !== null) pendingItems.push(exactItem);

    return { userId: uid, displayName: entry.displayName, lockedScore, pendingItems };
  });

  const sorted = rows.toSorted(
    (a, b) => b.lockedScore - a.lockedScore || a.displayName.localeCompare(b.displayName),
  );
  const leader = sorted[0]!;
  const rivals = sorted.slice(1);
  const maxRivalCeiling =
    rivals.length === 0
      ? -Infinity
      : Math.max(...rivals.map((r) => r.lockedScore + sumPoints(r.pendingItems)));

  if (leader.lockedScore >= maxRivalCeiling) {
    return {
      winnerTeamId: scenarioWinnerTeamId,
      winnerTeamName: scenarioWinnerTeamName,
      projectedWinnerUserId: leader.userId,
      projectedWinnerDisplayName: leader.displayName,
      projectedPoints: leader.lockedScore,
      status: 'clinched',
      mustHit: [],
    };
  }

  const ordered = leader.pendingItems.toSorted((a, b) => b.points - a.points);
  const mustHit: FinalScenarioPendingItem[] = [];
  let running = leader.lockedScore;
  for (const item of ordered) {
    mustHit.push(item);
    running += item.points;
    if (running > maxRivalCeiling) break;
  }

  return {
    winnerTeamId: scenarioWinnerTeamId,
    winnerTeamName: scenarioWinnerTeamName,
    projectedWinnerUserId: leader.userId,
    projectedWinnerDisplayName: leader.displayName,
    projectedPoints: leader.lockedScore,
    status: running > maxRivalCeiling ? 'checklist' : 'too-close',
    mustHit,
  };
}

export function buildFinalScenarioView(params: Params): FinalScenarioView {
  const {
    leaderboard,
    allMatches,
    def,
    bracketRounds,
    bronzeMatch,
    poolKnockoutPicks,
    poolFinishScores,
    poolSpecialBets,
    actualResults,
  } = params;

  if (leaderboard.length === 0) return null;

  const finalMatchView = findActiveFinalMatch(
    bracketRounds,
    bronzeMatch,
    def.bracket.finalMatch as string,
  );
  if (finalMatchView === null) return null;

  const homeTeamId = finalMatchView.homeTeamId!;
  const awayTeamId = finalMatchView.awayTeamId!;
  const teamNames = new Map(def.teams.map((t) => [t.id as string, t.name]));
  const homeTeamName = teamNames.get(homeTeamId) ?? homeTeamId;
  const awayTeamName = teamNames.get(awayTeamId) ?? awayTeamId;

  const specialDefs = getSpecialBetDefs(def.scoring).filter((d) => d.points > 0);
  const impossibility = computeSpecialBetImpossibility(def, allMatches);
  const specialPendingByUser = buildSpecialPendingItemsByUser(
    poolSpecialBets,
    actualResults,
    specialDefs,
    impossibility,
  );
  const finalPicksByUser = buildFinalPicksByUser(
    leaderboard,
    poolKnockoutPicks,
    poolFinishScores,
    finalMatchView,
    def.bracket,
  );
  const finishScoreByUser = new Map(
    poolFinishScores.filter((fs) => fs.match === 'final').map((fs) => [fs.userId as string, fs]),
  );

  return {
    homeTeamId,
    homeTeamName,
    awayTeamId,
    awayTeamName,
    home: buildOutcome({
      scenarioWinnerTeamId: homeTeamId,
      scenarioWinnerTeamName: homeTeamName,
      scenarioLoserTeamId: awayTeamId,
      leaderboard,
      finalPicksByUser,
      specialPendingByUser,
      finishScoreByUser,
      topFourPositionBonus: def.scoring.topFourPositionBonus,
      finalExactScorePoints: def.scoring.final.exactScore,
    }),
    away: buildOutcome({
      scenarioWinnerTeamId: awayTeamId,
      scenarioWinnerTeamName: awayTeamName,
      scenarioLoserTeamId: homeTeamId,
      leaderboard,
      finalPicksByUser,
      specialPendingByUser,
      finishScoreByUser,
      topFourPositionBonus: def.scoring.topFourPositionBonus,
      finalExactScorePoints: def.scoring.final.exactScore,
    }),
  };
}
