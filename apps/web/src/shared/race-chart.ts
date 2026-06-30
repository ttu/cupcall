import type { UserId, Tournament, GroupId, TeamId } from '@cup/engine';
import { deriveGroupOrders, matchId as makeMatchId } from '@cup/engine';
import type { LeaderboardEntry, MatchRow, PoolGroupScore, PoolKnockoutPick } from '@cup/db';

export type MatchHit = 'exact' | 'outcome' | 'missed' | 'pending';

export type RaceChartPlayer = {
  userId: string;
  displayName: string;
  isCurrentUser: boolean;
  color: string;
  /** Cumulative points at each stage (parallel to chartStages). */
  points: number[];
};

export type RaceChartData = {
  chartStages: string[];
  chartNowIndex: number;
  chartPlayers: RaceChartPlayer[];
};

export type RaceChartExtras = {
  allMatches: MatchRow[];
  poolGroupScores: PoolGroupScore[];
  def: Tournament;
  knockoutPicks: PoolKnockoutPick[];
};

export const RACE_COLORS = [
  'var(--orange-500)',
  'oklch(0.55 0.13 250)',
  'oklch(0.64 0.12 30)',
  'oklch(0.72 0.02 160)',
  'oklch(0.65 0.10 60)',
  'oklch(0.55 0.12 280)',
  'oklch(0.70 0.10 200)',
  'oklch(0.60 0.08 100)',
];

export function buildRaceChartData(
  leaderboard: LeaderboardEntry[],
  userId: UserId | null,
  extras?: RaceChartExtras,
): RaceChartData {
  if (extras) {
    const eventDates = buildRaceEventDates(extras.allMatches);
    if (eventDates.length > 0) {
      const result = buildDailyChartPlayers({
        eventDates,
        leaderboard,
        userId,
        allMatches: extras.allMatches,
        poolGroupScores: extras.poolGroupScores,
        def: extras.def,
        knockoutPicks: extras.knockoutPicks,
        anyStillLive: false,
        stillLiveByUser: new Map(),
      });
      return {
        chartStages: result.stages,
        chartNowIndex: result.nowIndex,
        chartPlayers: result.chartPlayers,
      };
    }
  }

  // Milestone fallback
  const hasGroupPoints = leaderboard.some(
    (e) => e.breakdown && e.breakdown.groupMatches + e.breakdown.groupOrder > 0,
  );
  const chartStages: string[] = ['Start'];
  if (hasGroupPoints) chartStages.push('Group Stage');
  chartStages.push('Now');
  const chartNowIndex = chartStages.length - 1;

  let colorIdx = 0;
  const chartPlayers: RaceChartPlayer[] = leaderboard.map((e) => {
    const isCurrentUser = userId !== null && e.userId === userId;
    const color = isCurrentUser
      ? 'var(--green-500)'
      : (RACE_COLORS[colorIdx++] ?? 'var(--ink-muted)');
    const pts: number[] = [0];
    if (hasGroupPoints) {
      pts.push(e.breakdown ? e.breakdown.groupMatches + e.breakdown.groupOrder : 0);
    }
    pts.push(e.pointsTotal);
    return { userId: e.userId, displayName: e.displayName, isCurrentUser, color, points: pts };
  });

  return {
    chartStages,
    chartNowIndex,
    chartPlayers: chartPlayers.toSorted(
      (a, b) => (a.isCurrentUser ? 1 : 0) - (b.isCurrentUser ? 1 : 0),
    ),
  };
}

export function utcDateStr(d: Date): string {
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

export function formatRaceDate(dateStr: string): string {
  const parts = dateStr.split('-');
  const month = parseInt(parts[1] ?? '1', 10);
  const day = parseInt(parts[2] ?? '1', 10);
  return `${MONTH_ABBR[month - 1] ?? '?'} ${day}`;
}

export function buildRaceEventDates(allMatches: MatchRow[]): string[] {
  const dates = new Set<string>();
  for (const m of allMatches) {
    if (m.status === 'final' && m.kickoff) dates.add(utcDateStr(m.kickoff));
  }
  return [...dates].toSorted();
}

export function computeHit(
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

function raceGroupOrderPts(
  n: number,
  scoring: { allCorrect: number; twoCorrect: number; oneCorrect: number },
): number {
  if (n === 4) return scoring.allCorrect;
  if (n === 2) return scoring.twoCorrect;
  if (n === 1) return scoring.oneCorrect;
  return 0;
}

function buildGroupOrderDeltas(
  poolGroupScores: PoolGroupScore[],
  allMatches: MatchRow[],
  def: Tournament,
  leaderboard: LeaderboardEntry[],
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();

  const actualScores = allMatches
    .filter((m) => m.stage === 'group' && m.status === 'final')
    .map((m) => ({ matchId: makeMatchId(m.id), home: m.homeGoals!, away: m.awayGoals! }));
  const actualGroupOrders = deriveGroupOrders(def, actualScores);

  const userPredScores = new Map<string, typeof actualScores>();
  for (const gs of poolGroupScores) {
    if (!userPredScores.has(gs.userId)) userPredScores.set(gs.userId, []);
    userPredScores
      .get(gs.userId)!
      .push({ matchId: makeMatchId(gs.matchId), home: gs.home, away: gs.away });
  }
  const userPredOrders = new Map<string, Record<GroupId, TeamId[]>>();
  for (const entry of leaderboard) {
    userPredOrders.set(
      entry.userId,
      deriveGroupOrders(def, userPredScores.get(entry.userId) ?? []),
    );
  }

  const groupMatchIds = new Map<string, Set<string>>();
  for (const gm of def.groupMatches) {
    if (!groupMatchIds.has(gm.group)) groupMatchIds.set(gm.group, new Set());
    groupMatchIds.get(gm.group)!.add(gm.id);
  }

  for (const group of def.groups) {
    const matchIds = groupMatchIds.get(group.id) ?? new Set();
    const groupMatches = allMatches.filter((m) => matchIds.has(m.id));
    if (!groupMatches.every((m) => m.status === 'final')) continue;

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

function buildKnockoutSlotDeltas(
  picks: PoolKnockoutPick[],
  allMatches: MatchRow[],
  def: Tournament,
): Map<string, Map<string, number>> {
  // Slot picks only award roundOf16 points in tournaments that have an R16 round.
  // In entry-round-as-QF brackets (mini-tournament), slots are scored via roundOf8 milestones.
  if (def.bracket.roundOf16Matches.length === 0) return new Map();

  // Build set of predicted R16 teams per user — matches the engine's scoreRoundOf16 semantics,
  // which is set-based (intersection of predicted vs actual R16 teams). A cross-slot swap
  // (user correctly predicted both teams but swapped which slot each wins) earns full credit.
  const slotMatchIds = new Set(def.bracket.slots.map((s) => s.match));
  const userPredictedR16 = new Map<string, Set<string>>();
  for (const pick of picks) {
    if (!slotMatchIds.has(pick.bracketMatchKey)) continue;
    if (!userPredictedR16.has(pick.userId)) userPredictedR16.set(pick.userId, new Set());
    userPredictedR16.get(pick.userId)!.add(pick.winnerTeamId);
  }

  const result = new Map<string, Map<string, number>>();
  const matchById = new Map(allMatches.map((m) => [m.id, m]));

  for (const slot of def.bracket.slots) {
    const match = matchById.get(slot.match);
    if (!match || match.status !== 'final' || !match.kickoff || !match.winnerTeamId) continue;

    const date = utcDateStr(match.kickoff);
    const winner = match.winnerTeamId;

    for (const [uid, predictedSet] of userPredictedR16) {
      if (!predictedSet.has(winner)) continue;
      if (!result.has(uid)) result.set(uid, new Map());
      result.get(uid)!.set(date, (result.get(uid)!.get(date) ?? 0) + def.scoring.roundOf16PerTeam);
    }
  }

  return result;
}

function buildKnockoutMilestoneDeltas(
  leaderboard: LeaderboardEntry[],
  allMatches: MatchRow[],
  def: Tournament,
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();

  // For tournaments with an R16 round (WC 2026): roundOf8 points (teams in QF) are earned
  // when R16 completes and QF participants become known — not when QF matches finish.
  // For entry-round-as-QF brackets (mini): keep existing QF-completion attribution.
  const hasR16 = def.bracket.roundOf16Matches.length > 0;
  const roundOf8Date = hasR16
    ? raceMilestoneDate(def.bracket.roundOf16Matches, allMatches)
    : raceMilestoneDate(def.bracket.roundOf8Matches, allMatches);

  const bronzeDate = raceMilestoneDate([def.bracket.bronzeMatch], allMatches);
  const finalDate = raceMilestoneDate([def.bracket.finalMatch], allMatches);
  const topFourDate = maxDateStr(finalDate, bronzeDate);

  for (const entry of leaderboard) {
    const bd = entry.breakdown;
    if (!bd) continue;

    const add = (date: string | null, pts: number) => {
      if (!date || pts === 0) return;
      if (!result.has(entry.userId)) result.set(entry.userId, new Map());
      result.get(entry.userId)!.set(date, (result.get(entry.userId)!.get(date) ?? 0) + pts);
    };

    // roundOf16 is now attributed per-day by buildKnockoutSlotDeltas; skip here.
    add(roundOf8Date, bd.roundOf8);
    add(bronzeDate, bd.bronze);
    add(topFourDate, bd.topFour);
    add(finalDate, bd.final);
    add(finalDate, bd.specials);
  }

  return result;
}

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

function findLastCompleteMatchDay(allMatches: MatchRow[]): string | null {
  const matchesByDate = new Map<string, MatchRow[]>();
  for (const m of allMatches) {
    if (!m.kickoff) continue;
    const date = utcDateStr(m.kickoff);
    if (!matchesByDate.has(date)) matchesByDate.set(date, []);
    matchesByDate.get(date)!.push(m);
  }
  // Walk dates newest-first; return the first date where every match is final.
  const sorted = [...matchesByDate.keys()].toSorted().reverse();
  for (const date of sorted) {
    if (matchesByDate.get(date)!.every((m) => m.status === 'final')) return date;
  }
  return null;
}

export function buildLastDayPoints(
  leaderboard: LeaderboardEntry[],
  allMatches: MatchRow[],
  poolGroupScores: PoolGroupScore[],
  def: Tournament,
  knockoutPicks: PoolKnockoutPick[],
): { date: string; pointsByUser: Record<string, number> } | null {
  const lastDate = findLastCompleteMatchDay(allMatches);
  if (!lastDate) return null;

  const groupMatchDeltas = buildGroupMatchDeltas(
    poolGroupScores,
    allMatches,
    def.scoring.groupMatch,
  );
  const groupOrderDeltas = buildGroupOrderDeltas(poolGroupScores, allMatches, def, leaderboard);
  const slotDeltas = buildKnockoutSlotDeltas(knockoutPicks, allMatches, def);
  const knockoutDeltas = buildKnockoutMilestoneDeltas(leaderboard, allMatches, def);

  const pointsByUser: Record<string, number> = {};
  for (const entry of leaderboard) {
    const pts =
      (groupMatchDeltas.get(entry.userId)?.get(lastDate) ?? 0) +
      (groupOrderDeltas.get(entry.userId)?.get(lastDate) ?? 0) +
      (slotDeltas.get(entry.userId)?.get(lastDate) ?? 0) +
      (knockoutDeltas.get(entry.userId)?.get(lastDate) ?? 0);
    if (pts > 0) pointsByUser[entry.userId] = pts;
  }

  if (Object.keys(pointsByUser).length === 0) return null;
  return { date: lastDate, pointsByUser };
}

export type DailyChartInput = {
  eventDates: string[];
  leaderboard: LeaderboardEntry[];
  userId: string | null;
  allMatches: MatchRow[];
  poolGroupScores: PoolGroupScore[];
  def: Tournament;
  anyStillLive: boolean;
  stillLiveByUser: Map<string, number>;
  knockoutPicks: PoolKnockoutPick[];
};

export function buildDailyChartPlayers(input: DailyChartInput): {
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
    knockoutPicks,
  } = input;

  const groupMatchDeltas = buildGroupMatchDeltas(
    poolGroupScores,
    allMatches,
    def.scoring.groupMatch,
  );
  const groupOrderDeltas = buildGroupOrderDeltas(poolGroupScores, allMatches, def, leaderboard);
  const slotDeltas = buildKnockoutSlotDeltas(knockoutPicks, allMatches, def);
  const knockoutDeltas = buildKnockoutMilestoneDeltas(leaderboard, allMatches, def);

  const nowIndex = eventDates.length;
  const stages: string[] = ['Start', ...eventDates.map(formatRaceDate)];
  if (anyStillLive) stages.push('Projected');

  let colorIdx = 0;
  const chartPlayers: RaceChartPlayer[] = leaderboard.map((entry) => {
    const isCurrentUser = userId !== null && entry.userId === userId;
    const color = isCurrentUser
      ? 'var(--green-500)'
      : (RACE_COLORS[colorIdx++] ?? 'var(--ink-muted)');

    let cumulative = 0;
    const pts: number[] = [0];

    for (const date of eventDates) {
      cumulative += groupMatchDeltas.get(entry.userId)?.get(date) ?? 0;
      cumulative += groupOrderDeltas.get(entry.userId)?.get(date) ?? 0;
      cumulative += slotDeltas.get(entry.userId)?.get(date) ?? 0;
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

  return {
    stages,
    nowIndex,
    chartPlayers: chartPlayers.toSorted(
      (a, b) => (a.isCurrentUser ? 1 : 0) - (b.isCurrentUser ? 1 : 0),
    ),
  };
}

// Test-only exports — not part of the public API
export {
  buildKnockoutSlotDeltas as buildKnockoutSlotDeltasForTest,
  buildKnockoutMilestoneDeltas as buildKnockoutMilestoneDeltasForTest,
};
