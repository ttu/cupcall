import type { GroupId, TeamId } from './brand.js';
import { metric, teamMetrics } from './standings.js';
import type { GroupScore, Tournament } from './types.js';

/**
 * Select qualified teams from group stage results.
 *
 * - Auto-qualifiers: top `autoQualifyPerGroup` teams from each group (by group order).
 * - Best thirds: if `bestThirdPlaced > 0`, collect the team at index `autoQualifyPerGroup`
 *   from each group (the first non-auto-qualifier), rank them by the same tiebreak metrics
 *   (points → goalDifference → goalsFor), then take the best `bestThirdPlaced`.
 *   When metrics are equal across groups, fall back to group-letter order then seed for
 *   a stable deterministic result.
 *
 * Returns `[...autoQualifiers, ...rankedThirds]` in that order.
 */
export function selectQualifiers(
  t: Tournament,
  scores: GroupScore[],
  groupOrders: Record<GroupId, TeamId[]>,
): TeamId[] {
  const { autoQualifyPerGroup, bestThirdPlaced } = t.qualification;

  // Auto-qualifiers: top N from each group in group order
  const auto: TeamId[] = t.groups.flatMap((g) => groupOrders[g.id]!.slice(0, autoQualifyPerGroup));

  if (bestThirdPlaced === 0) return auto;

  // Collect the third-placed (index = autoQualifyPerGroup) team from each group
  type ThirdEntry = {
    team: TeamId;
    groupIndex: number;
    points: number;
    gf: number;
    ga: number;
    conduct: number;
    seed: number;
  };

  const thirds: ThirdEntry[] = t.groups
    .map((g, groupIndex) => {
      const thirdTeam = groupOrders[g.id]![autoQualifyPerGroup];
      if (!thirdTeam) return null;
      // Compute this group's per-team metrics to rank its third-placed team across groups.
      const metricsMap = teamMetrics(t, g.id, scores);
      const m = metricsMap.get(thirdTeam)!;
      return {
        team: thirdTeam,
        groupIndex,
        points: m.points,
        gf: m.gf,
        ga: m.ga,
        conduct: m.conduct,
        seed: m.seed,
      };
    })
    .filter((x): x is ThirdEntry => x !== null);

  // Rank thirds: same tiebreak metrics, then group index (stable / deterministic)
  const thirdsMetricKeys = t.standingsTiebreak.filter(
    (k): k is 'points' | 'goalDifference' | 'goalsFor' | 'conductScore' =>
      k === 'points' || k === 'goalDifference' || k === 'goalsFor' || k === 'conductScore',
  );

  thirds.sort((a, b) => {
    for (const key of thirdsMetricKeys) {
      const d = metric(key, b) - metric(key, a);
      if (d !== 0) return d;
    }
    // Stable tie-break: group letter order, then seed
    if (a.groupIndex !== b.groupIndex) return a.groupIndex - b.groupIndex;
    return a.seed - b.seed;
  });

  const rankedThirds = thirds.slice(0, bestThirdPlaced).map((e) => e.team);
  return [...auto, ...rankedThirds];
}
