import type { Scoring } from '@cup/engine';

/**
 * Minimal valid Scoring configuration used across repository and schema tests.
 * Extracted here to avoid repeating the 37-line literal in every test file.
 */
export const testScoring: Scoring = {
  groupMatch: { exactScore: 6, correctOutcome: 3 },
  groupOrder: { allCorrect: 6, twoCorrect: 3, oneCorrect: 1 },
  groupTopScoringTeam: 10,
  groupTopConcedingTeam: 10,
  roundOf16PerTeam: 2,
  roundOf8PerTeam: 3,
  bronze: { exactScore: 5, perTeam: 5 },
  final: { exactScore: 5, perTeam: 5 },
  roundOf4PerTeam: 5,
  topFourPositionBonus: 3,
  tournamentTopScoringTeam: 10,
  tournamentTopConcedingTeam: 10,
  highestMatchGoals: 10,
  mostYellowCardsTeam: 15,
  firstRedCardPlayer: 20,
  penaltyShootoutCount: 10,
  finalDecidedByPenalties: 10,
  finalDecisiveGoalPlayer: 20,
  topScorerPlayer: 15,
};
