import type { GroupId, TeamId } from './brand.js';
import type { GroupScore, TiebreakKey, Tournament } from './types.js';

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
}

/** Compute the numeric metric value for a row given a tiebreak key. */
export function metric(
  key: TiebreakKey,
  r: { points: number; gf: number; ga: number; seed: number },
): number {
  switch (key) {
    case 'points':
      return r.points;
    case 'goalDifference':
      return r.gf - r.ga;
    case 'goalsFor':
      return r.gf;
    case 'seedOrder':
      // Lower seed index = higher rank → negate so higher metric = better rank
      return -r.seed;
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
    grp.teams.map((team, i) => [team, { team, seed: i, points: 0, gf: 0, ga: 0 }]),
  );

  const byId = new Map(scores.map((s) => [s.matchId, s]));

  for (const m of t.groupMatches.filter((gm) => gm.group === groupId)) {
    const s = byId.get(m.id);
    if (!s) continue;

    const home = rows.get(m.home)!;
    const away = rows.get(m.away)!;

    home.gf += s.home;
    home.ga += s.away;
    away.gf += s.away;
    away.ga += s.home;

    if (s.home > s.away) {
      home.points += 3;
    } else if (s.home < s.away) {
      away.points += 3;
    } else {
      home.points += 1;
      away.points += 1;
    }
  }

  return rows;
}

/**
 * Compute the final standings order for a group.
 *
 * Tiebreak applied top-to-bottom using `t.standingsTiebreak`:
 * points → goalDifference → goalsFor → seedOrder (lower index = higher rank).
 * Unpredicted matches (no GroupScore for that matchId) contribute nothing.
 */
export function computeStandings(t: Tournament, group: GroupId, scores: GroupScore[]): TeamId[] {
  const rows = teamMetrics(t, group, scores);

  const cmp = (a: TeamMetrics, b: TeamMetrics): number => {
    for (const key of t.standingsTiebreak) {
      const d = metric(key, b) - metric(key, a);
      if (d !== 0) return d;
    }
    return 0;
  };

  return [...rows.values()].sort(cmp).map((r) => r.team);
}

/** Compute standings for every group in the tournament. */
export function deriveGroupOrders(t: Tournament, scores: GroupScore[]): Record<GroupId, TeamId[]> {
  return Object.fromEntries(
    t.groups.map((g) => [g.id, computeStandings(t, g.id, scores)]),
  ) as Record<GroupId, TeamId[]>;
}
