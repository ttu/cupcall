import type { UserId, Tournament, GroupId, TeamId } from '@cup/engine';
import { deriveGroupOrders, matchId as makeMatchId } from '@cup/engine';
import type { LeaderboardEntry, MatchRow, PoolGroupScore } from '@cup/db';

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

  chartPlayers.sort((a, b) => (a.isCurrentUser ? 1 : 0) - (b.isCurrentUser ? 1 : 0));

  return { chartStages, chartNowIndex, chartPlayers };
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
  return [...dates].sort();
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

function buildKnockoutMilestoneDeltas(
  leaderboard: LeaderboardEntry[],
  allMatches: MatchRow[],
  def: Tournament,
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();

  const roundOf8Date = raceMilestoneDate(def.bracket.roundOf8Matches, allMatches);
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

export type DailyChartInput = {
  eventDates: string[];
  leaderboard: LeaderboardEntry[];
  userId: string | null;
  allMatches: MatchRow[];
  poolGroupScores: PoolGroupScore[];
  def: Tournament;
  anyStillLive: boolean;
  stillLiveByUser: Map<string, number>;
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
  } = input;

  const groupMatchDeltas = buildGroupMatchDeltas(
    poolGroupScores,
    allMatches,
    def.scoring.groupMatch,
  );
  const groupOrderDeltas = buildGroupOrderDeltas(poolGroupScores, allMatches, def, leaderboard);
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
