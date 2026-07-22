import type {
  CardInputs,
  DerivedCard,
  ActualResults,
  Scoring,
  ActualFinishMatch,
  FinishScore,
  CategoryAccuracy,
} from '../types.js';
import type { Points, TeamId } from '../brand.js';
import { points } from '../brand.js';

/**
 * Award exactScore iff finishScore has a team-id snapshot AND each team's predicted goals match
 * its actual goals. Without a snapshot (predicted finalists/bronze pair not yet resolved when
 * the score was saved) there's no way to know which team each goal count belongs to, so no
 * exact-score points are awarded.
 */
function exactScorePoints(
  finishScore: FinishScore | undefined,
  actualMatch: ActualFinishMatch | undefined,
  exactScore: number,
): number {
  if (
    finishScore === undefined ||
    actualMatch === undefined ||
    finishScore.homeTeamId == null ||
    finishScore.awayTeamId == null
  ) {
    return 0;
  }

  const predictedByTeam = new Map<TeamId, number>([
    [finishScore.homeTeamId, finishScore.home],
    [finishScore.awayTeamId, finishScore.away],
  ]);
  return predictedByTeam.get(actualMatch.home) === actualMatch.homeGoals &&
    predictedByTeam.get(actualMatch.away) === actualMatch.awayGoals
    ? exactScore
    : 0;
}

/** attempted=1 iff the user made this prediction and the match is decided; hit iff exact. */
function exactScoreDetail(
  finishScore: FinishScore | undefined,
  actualMatch: ActualFinishMatch | undefined,
): CategoryAccuracy {
  if (finishScore === undefined || actualMatch === undefined) return { hits: 0, attempted: 0 };
  return { hits: exactScorePoints(finishScore, actualMatch, 1), attempted: 1 };
}

function scoreFinishMatchDetail(
  derivedPair: TeamId[],
  actualMatch: ActualFinishMatch | undefined,
): CategoryAccuracy {
  if (actualMatch === undefined) return { hits: 0, attempted: 0 };
  const actualTeams = new Set<TeamId>([actualMatch.home, actualMatch.away]);
  return {
    hits: derivedPair.filter((t) => actualTeams.has(t)).length,
    attempted: derivedPair.length,
  };
}

function scoreFinalTeamDetail(derived: DerivedCard, actual: ActualResults): CategoryAccuracy {
  // Confirmed finalists = SF winners (banked as each SF completes) plus, once the final is
  // played, its two participants (defensive: covers explicit finalMatch without answers).
  const confirmed = new Set<TeamId>(actual.answers.finalists ?? []);
  if (actual.finalMatch !== undefined) {
    confirmed.add(actual.finalMatch.home);
    confirmed.add(actual.finalMatch.away);
  }
  if (confirmed.size === 0) return { hits: 0, attempted: 0 };
  return {
    hits: derived.finalists.filter((t) => confirmed.has(t)).length,
    attempted: derived.finalists.length,
  };
}

export function scoreBronze(
  inputs: CardInputs,
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  const team = scoreFinishMatchDetail(derived.bronzePair, actual.bronzeMatch);
  const exactPoints = exactScorePoints(
    inputs.finishScores.bronze,
    actual.bronzeMatch,
    scoring.bronze.exactScore,
  );
  return points(team.hits * scoring.bronze.perTeam + exactPoints);
}

export function scoreFinal(
  inputs: CardInputs,
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  const team = scoreFinalTeamDetail(derived, actual);
  const exactPoints = exactScorePoints(
    inputs.finishScores.final,
    actual.finalMatch,
    scoring.final.exactScore,
  );
  return points(team.hits * scoring.final.perTeam + exactPoints);
}

function sum(a: CategoryAccuracy, b: CategoryAccuracy): CategoryAccuracy {
  return { hits: a.hits + b.hits, attempted: a.attempted + b.attempted };
}

export function scoreBronzeDetail(
  inputs: CardInputs,
  derived: DerivedCard,
  actual: ActualResults,
): CategoryAccuracy {
  return sum(
    scoreFinishMatchDetail(derived.bronzePair, actual.bronzeMatch),
    exactScoreDetail(inputs.finishScores.bronze, actual.bronzeMatch),
  );
}

export function scoreFinalDetail(
  inputs: CardInputs,
  derived: DerivedCard,
  actual: ActualResults,
): CategoryAccuracy {
  return sum(
    scoreFinalTeamDetail(derived, actual),
    exactScoreDetail(inputs.finishScores.final, actual.finalMatch),
  );
}
