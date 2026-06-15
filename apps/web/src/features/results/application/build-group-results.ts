import type { MatchRow, PoolGroupScore } from '@cup/db';
import {
  deriveGroupOrders,
  computeStandings,
  teamMetrics,
  selectQualifiers,
  matchId,
  metric,
} from '@cup/engine';
import type { Tournament, GroupId, GroupScore } from '@cup/engine';
import type {
  GroupResultView,
  GroupMatchResultRow,
  GroupUpcomingMatchRow,
  GroupStandingRow,
  Best3rdStandingRow,
  MatchPredictionStats,
  MatchResultPoolStats,
} from '../domain/types';
import { computeHit } from '../domain/race-chart';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function buildGroupResults(
  def: Tournament,
  allMatches: MatchRow[],
  inputs: { groupScores: { matchId: string; home: number; away: number }[] } | null,
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
          poolMatchStats: computeMatchResultPoolStats(
            m.id,
            m.homeGoals!,
            m.awayGoals!,
            poolGroupScores,
            scoring,
          ),
        };
      });

    const todayMatches: GroupUpcomingMatchRow[] = allMatches
      .filter(
        (m) =>
          m.stage === 'group' &&
          m.groupId === group.id &&
          m.status !== 'final' &&
          m.kickoff !== null &&
          m.kickoff.getTime() <= now.getTime() + ONE_DAY_MS,
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
 * Rank the current 3rd-place team from each group against each other.
 * Works during an ongoing group stage — uses whatever matches have been played so far.
 * Returns null when the tournament has no best-third advancement, or when no 3rd-place
 * team has played any matches yet.
 */
export function buildBest3rdStanding(
  def: Tournament,
  groupResults: GroupResultView[],
): Best3rdStandingRow[] | null {
  if (def.qualification.bestThirdPlaced === 0) return null;

  const autoQualify = def.qualification.autoQualifyPerGroup;

  const thirds = groupResults
    .map((gr, groupIndex) => {
      const row = gr.standing[autoQualify]; // 0-indexed: position after auto-qualifiers
      if (!row) return null;
      return { groupId: gr.groupId, row, groupIndex };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (thirds.every((t) => t.row.played === 0)) return null;

  // H2h keys don't apply across groups — filter to overall metrics only.
  const metricKeys = def.standingsTiebreak.filter(
    (k): k is 'points' | 'goalDifference' | 'goalsFor' =>
      k === 'points' || k === 'goalDifference' || k === 'goalsFor',
  );

  const toMetricRow = (row: (typeof thirds)[number]['row']) => ({
    points: row.points,
    gf: row.goalsFor,
    ga: row.goalsAgainst,
  });

  const sorted = [...thirds].sort((a, b) => {
    for (const key of metricKeys) {
      const d = metric(key, toMetricRow(b.row)) - metric(key, toMetricRow(a.row));
      if (d !== 0) return d;
    }
    return a.groupIndex - b.groupIndex;
  });

  return sorted.map(({ groupId, row }, i) => ({
    rank: i + 1,
    groupId,
    teamId: row.teamId,
    teamName: row.teamName,
    played: row.played,
    goalDifference: row.goalDifference,
    points: row.points,
    qualifies: i < def.qualification.bestThirdPlaced,
  }));
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
  const finalGroupMatches = allMatches.filter(
    (m) => m.stage === 'group' && m.groupId === groupId && m.status === 'final',
  );

  const scores: GroupScore[] = finalGroupMatches
    .filter((m) => m.homeTeamId && m.awayTeamId)
    .map((m) => ({ matchId: matchId(m.id), home: m.homeGoals!, away: m.awayGoals! }));

  // Engine applies the tournament's tiebreak rules (standingsTiebreak config).
  const orderedIds = computeStandings(def, groupId, scores);
  const metrics = teamMetrics(def, groupId, scores);

  // W/D/L are display-only stats not tracked by teamMetrics; accumulate here.
  const group = def.groups.find((g) => g.id === groupId);
  if (!group) return [];
  const wdl = new Map<string, { w: number; d: number; l: number }>(
    group.teams.map((t) => [t, { w: 0, d: 0, l: 0 }]),
  );
  for (const m of finalGroupMatches) {
    if (!m.homeTeamId || !m.awayTeamId) continue;
    const h = wdl.get(m.homeTeamId);
    const a = wdl.get(m.awayTeamId);
    if (!h || !a) continue;
    if (m.homeGoals! > m.awayGoals!) {
      h.w++;
      a.l++;
    } else if (m.homeGoals! < m.awayGoals!) {
      a.w++;
      h.l++;
    } else {
      h.d++;
      a.d++;
    }
  }

  const autoQualify = def.qualification.autoQualifyPerGroup;

  return orderedIds.map((tid, i) => {
    const m = metrics.get(tid) ?? { points: 0, gf: 0, ga: 0 };
    const r = wdl.get(tid) ?? { w: 0, d: 0, l: 0 };
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
      played: r.w + r.d + r.l,
      won: r.w,
      drawn: r.d,
      lost: r.l,
      goalsFor: m.gf,
      goalsAgainst: m.ga,
      goalDifference: m.gf - m.ga,
      points: m.points,
      qualifies,
    };
  });
}

function computeMatchResultPoolStats(
  mId: string,
  actualHome: number,
  actualAway: number,
  poolGroupScores: PoolGroupScore[],
  scoring: Parameters<typeof computeHit>[4],
): MatchResultPoolStats | null {
  const preds = poolGroupScores.filter((s) => s.matchId === mId);
  if (preds.length === 0) return null;

  const total = preds.length;
  let exactCount = 0;
  let outcomeCount = 0;

  for (const pred of preds) {
    const result = computeHit(actualHome, actualAway, pred.home, pred.away, scoring);
    if (result.hit === 'exact') exactCount++;
    else if (result.hit === 'outcome') outcomeCount++;
  }

  return {
    totalPredictions: total,
    exactPct: Math.round((exactCount / total) * 100),
    outcomePct: Math.round((outcomeCount / total) * 100),
  };
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
