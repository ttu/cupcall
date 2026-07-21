import type { GroupId, TeamId } from './brand.js';
import type { GroupMatchDef, GroupScore, TiebreakKey, Tournament } from './types.js';

type ScoreAccumulator = { points: number; gf: number; ga: number; conduct?: number };

/** Applies one match's score to its home/away rows: goals, conduct (if tracked), and 3/1/0 points. */
function applyMatchResult(home: ScoreAccumulator, away: ScoreAccumulator, s: GroupScore): void {
  home.gf += s.home;
  home.ga += s.away;
  away.gf += s.away;
  away.ga += s.home;
  if (home.conduct !== undefined) home.conduct += s.homeConduct ?? 0;
  if (away.conduct !== undefined) away.conduct += s.awayConduct ?? 0;

  if (s.home > s.away) {
    home.points += 3;
  } else if (s.home < s.away) {
    away.points += 3;
  } else {
    home.points += 1;
    away.points += 1;
  }
}

/**
 * Per-team standings metrics within a group. This is the cross-module contract
 * returned by {@link teamMetrics} (consumed by the qualifiers ranking), so it is
 * intentionally part of the package's internal-but-shared type surface.
 */
export interface TeamMetrics {
  team: TeamId;
  seed: number;
  points: number;
  gf: number;
  ga: number;
  conduct: number;
}

/**
 * Compute the numeric metric value for a row given a tiebreak key.
 * H2h variants map to their overall counterparts — the caller is responsible
 * for passing head-to-head computed data when an h2h key is used.
 */
export function metric(
  key: TiebreakKey,
  r: { points: number; gf: number; ga: number; conduct?: number },
): number {
  switch (key) {
    case 'points':
    case 'h2hPoints':
      return r.points;
    case 'goalDifference':
    case 'h2hGoalDifference':
      return r.gf - r.ga;
    case 'goalsFor':
    case 'h2hGoalsFor':
      return r.gf;
    case 'conductScore':
      return r.conduct ?? 0;
  }
}

/**
 * Build a map of per-team metrics (points, gf, ga, seed) across all provided scores
 * for the teams in the given group. Matches not in the group are ignored.
 */
export function teamMetrics(
  t: Tournament,
  groupId: GroupId,
  scores: GroupScore[],
): Map<TeamId, TeamMetrics> {
  const grp = t.groups.find((g) => g.id === groupId);
  if (!grp) throw new Error(`Unknown group ${groupId}`);

  const rows = new Map<TeamId, TeamMetrics>(
    grp.teams.map((team, i) => [team, { team, seed: i, points: 0, gf: 0, ga: 0, conduct: 0 }]),
  );

  const byId = new Map(scores.map((s) => [s.matchId, s]));

  for (const m of t.groupMatches.filter((gm) => gm.group === groupId)) {
    const s = byId.get(m.id);
    if (!s) continue;

    applyMatchResult(rows.get(m.home)!, rows.get(m.away)!, s);
  }

  return rows;
}

/** Compute head-to-head metrics for a subset of teams using only their mutual matches. */
function computeH2HMetrics(
  teams: TeamMetrics[],
  scores: GroupScore[],
  groupMatches: GroupMatchDef[],
): Map<TeamId, { points: number; gf: number; ga: number }> {
  const teamSet = new Set(teams.map((t) => t.team));
  const rows = new Map(teams.map((t) => [t.team, { points: 0, gf: 0, ga: 0 }]));
  const scoreById = new Map(scores.map((s) => [s.matchId, s]));

  for (const m of groupMatches) {
    if (!teamSet.has(m.home) || !teamSet.has(m.away)) continue;
    const s = scoreById.get(m.id);
    if (!s) continue;

    applyMatchResult(rows.get(m.home)!, rows.get(m.away)!, s);
  }

  return rows;
}

/**
 * Recursively resolve the standings order for groups of tied teams.
 *
 * For each key in `keys` (applied left-to-right), teams are partitioned by the
 * metric value. When an h2h key is reached, metrics are computed only for the
 * mutual matches within each tied group. Seed order is the implicit final
 * tiebreaker when all configured keys are exhausted.
 */
function resolveOrder(
  tiedGroups: TeamMetrics[][],
  scores: GroupScore[],
  groupMatches: GroupMatchDef[],
  keys: TiebreakKey[],
): TeamId[] {
  const result: TeamId[] = [];

  for (const group of tiedGroups) {
    if (group.length === 1) {
      result.push(group[0]!.team);
      continue;
    }

    if (keys.length === 0) {
      // Final implicit fallback: seed order (lower index = higher rank)
      result.push(...[...group].sort((a, b) => a.seed - b.seed).map((r) => r.team));
      continue;
    }

    const key = keys[0]!;
    const remaining = keys.slice(1);
    const isH2H = key === 'h2hPoints' || key === 'h2hGoalDifference' || key === 'h2hGoalsFor';

    let getMetric: (r: TeamMetrics) => number;
    if (isH2H) {
      const h2hMap = computeH2HMetrics(group, scores, groupMatches);
      getMetric = (r) => metric(key, h2hMap.get(r.team)!);
    } else {
      getMetric = (r) => metric(key, r);
    }

    // Partition by this metric (descending: higher = better)
    const scored = [...group].map((r) => ({ r, m: getMetric(r) }));
    scored.sort((a, b) => b.m - a.m);

    const subGroups: TeamMetrics[][] = [];
    let current: TeamMetrics[] = [scored[0]!.r];
    for (let i = 1; i < scored.length; i++) {
      const cur = scored[i]!;
      const prev = scored[i - 1]!;
      if (cur.m === prev.m) {
        current.push(cur.r);
      } else {
        subGroups.push(current);
        current = [cur.r];
      }
    }
    subGroups.push(current);

    result.push(...resolveOrder(subGroups, scores, groupMatches, remaining));
  }

  return result;
}

/**
 * Compute the final standings order for a group.
 *
 * Tiebreak applied using `t.standingsTiebreak` (left to right). H2h keys
 * compare only the mutual matches among the currently-tied teams. Seed order
 * (lower index = higher rank) is the implicit final fallback.
 */
export function computeStandings(t: Tournament, group: GroupId, scores: GroupScore[]): TeamId[] {
  const rows = teamMetrics(t, group, scores);
  const groupMatches = t.groupMatches.filter((m) => m.group === group);
  return resolveOrder([[...rows.values()]], scores, groupMatches, t.standingsTiebreak);
}

/** Compute standings for every group in the tournament. */
export function deriveGroupOrders(t: Tournament, scores: GroupScore[]): Record<GroupId, TeamId[]> {
  return Object.fromEntries(
    t.groups.map((g) => [g.id, computeStandings(t, g.id, scores)]),
  ) as Record<GroupId, TeamId[]>;
}
