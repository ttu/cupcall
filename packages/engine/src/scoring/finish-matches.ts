import type {
  CardInputs,
  DerivedCard,
  ActualResults,
  Scoring,
  ActualFinishMatch,
  FinishScore,
} from '../types.js';
import type { Points, TeamId } from '../brand.js';
import { points } from '../brand.js';

/**
 * Side-agnostic score equality: the multiset {a, b} == multiset {c, d}.
 * Equivalent to (a==c && b==d) || (a==d && b==c).
 */
function scoresMatchSideAgnostic(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number,
): boolean {
  return (
    (predictedHome === actualHome && predictedAway === actualAway) ||
    (predictedHome === actualAway && predictedAway === actualHome)
  );
}

/**
 * Shared scoring logic for a finish match (bronze or final).
 * - TEAM points: count how many of the player's two derived teams appear in {actual.home, actual.away},
 *   regardless of side. Each match awards 0, perTeam, or perTeam*2.
 * - EXACT SCORE points: award exactScore iff finishScore is present AND the scoreline matches
 *   side-agnostically. Independent of team correctness.
 */
function scoreFinishMatch(
  derivedPair: TeamId[],
  finishScore: FinishScore | undefined,
  actualMatch: ActualFinishMatch | undefined,
  scoring: { exactScore: number; perTeam: number },
): number {
  if (actualMatch === undefined) {
    return 0;
  }

  const actualTeams = new Set<TeamId>([actualMatch.home, actualMatch.away]);

  // Team points: count derived teams present in actual match team set
  const teamCount = derivedPair.filter((t) => actualTeams.has(t)).length;
  const teamPoints = teamCount * scoring.perTeam;

  // Exact score points: only if a score was predicted and it matches side-agnostically
  let exactPoints = 0;
  if (finishScore !== undefined) {
    if (
      scoresMatchSideAgnostic(
        finishScore.home,
        finishScore.away,
        actualMatch.homeGoals,
        actualMatch.awayGoals,
      )
    ) {
      exactPoints = scoring.exactScore;
    }
  }

  return teamPoints + exactPoints;
}

export function scoreBronze(
  inputs: CardInputs,
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  return points(
    scoreFinishMatch(
      derived.bronzePair,
      inputs.finishScores.bronze,
      actual.bronzeMatch,
      scoring.bronze,
    ),
  );
}

export function scoreFinal(
  inputs: CardInputs,
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  return points(
    scoreFinishMatch(
      derived.finalists,
      inputs.finishScores.final,
      actual.finalMatch,
      scoring.final,
    ),
  );
}
