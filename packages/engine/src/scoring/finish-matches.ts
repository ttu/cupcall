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

/** Award exactScore iff finishScore is present AND home/away goals match the actual match exactly. */
function exactScorePoints(
  finishScore: FinishScore | undefined,
  actualMatch: ActualFinishMatch | undefined,
  exactScore: number,
): number {
  if (finishScore === undefined || actualMatch === undefined) {
    return 0;
  }
  return finishScore.home === actualMatch.homeGoals && finishScore.away === actualMatch.awayGoals
    ? exactScore
    : 0;
}

/**
 * Shared scoring logic for a finish match (bronze or final).
 * - TEAM points: count how many of the player's two derived teams appear in {actual.home, actual.away},
 *   regardless of side. Each match awards 0, perTeam, or perTeam*2.
 * - EXACT SCORE points: award exactScore iff finishScore is present AND home/away goals match exactly.
 *   Independent of team correctness.
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

  return teamPoints + exactScorePoints(finishScore, actualMatch, scoring.exactScore);
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
  // Confirmed finalists = SF winners (banked as each SF completes) plus, once the final is
  // played, its two participants (defensive: covers explicit finalMatch without answers).
  const confirmed = new Set<TeamId>(actual.answers.finalists ?? []);
  if (actual.finalMatch !== undefined) {
    confirmed.add(actual.finalMatch.home);
    confirmed.add(actual.finalMatch.away);
  }

  // Team points: perTeam for each predicted finalist confirmed to have reached the final.
  const teamCount = derived.finalists.filter((t) => confirmed.has(t)).length;
  const teamPoints = teamCount * scoring.final.perTeam;

  // Exact-score points: only once the final is actually played and goals match exactly.
  const exactPoints = exactScorePoints(
    inputs.finishScores.final,
    actual.finalMatch,
    scoring.final.exactScore,
  );

  return points(teamPoints + exactPoints);
}
