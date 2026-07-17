import type { GroupResultView } from '@/features/results';
import type { MatchScore } from '../ui/ReadOnlyCard';

/** Builds the per-match hit/points lookup that ReadOnlyCard uses to annotate group picks. */
export function buildMatchScores(groupResults: GroupResultView[]): Map<string, MatchScore> {
  return new Map(
    groupResults.flatMap((g) =>
      g.completedMatches.map((m) => [m.matchId, { hit: m.hit, points: m.pointsAwarded }] as const),
    ),
  );
}
