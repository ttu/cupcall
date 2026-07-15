import type { Tournament, ScoreBreakdown } from '../types.js';
import { points } from '../brand.js';

/**
 * Snapshot of which matches in the tournament have been played and finalised.
 * Pure value type so this module stays independent of any DB shape.
 */
export interface TournamentProgress {
  finalMatchIds: ReadonlySet<string>;
}

/**
 * Maximum points still attainable per scoring category, given current
 * tournament progress. Returns a `ScoreBreakdown` whose `total` is the sum of
 * the category fields.
 *
 * Semantics per category:
 *  - groupMatches: each unplayed group match can yield exactScore.
 *  - groupOrder:   each group with any unplayed match can yield allCorrect.
 *  - roundOf8:     once the group stage is complete the QF participants are
 *                  fixed, so the category is locked; before then the full
 *                  2 × |QF matches| × roundOf8PerTeam upside remains.
 *  - topFour:      resolves once every QF match has been played (the four
 *                  semifinalists are then fully known).
 *  - bronze:       yields 2 × perTeam + exactScore until played.
 *  - final:        yields 2 × perTeam + exactScore until both SFs are final (team points bank
 *                  as each SF completes — see finish-matches.ts scoreFinal); once both SFs are
 *                  final, only exactScore remains until the final itself is played.
 *  - specials:     resolved only once the tournament is fully complete
 *                  (every group match and every bracket match final). Until
 *                  then, the sum of every special's scoring value remains
 *                  attainable. This is a conservative upper bound: some
 *                  specials resolve earlier (e.g. groupTopScoringTeam at end
 *                  of group stage) but no banked specials points are awarded
 *                  to anyone before the full tournament resolves, so the
 *                  whole pool is "still attainable" in the projection sense.
 */
export function computeRemainingMaxPoints(
  tournament: Tournament,
  progress: TournamentProgress,
): ScoreBreakdown {
  const { scoring, groupMatches, groups, bracket } = tournament;
  const isFinal = (id: string): boolean => progress.finalMatchIds.has(id);

  // Group matches: each unplayed match is worth up to exactScore.
  const unplayedGroupMatches = groupMatches.filter((gm) => !isFinal(gm.id)).length;
  const groupMatchesMax = unplayedGroupMatches * scoring.groupMatch.exactScore;

  // Group order: each group with any unplayed match is worth up to allCorrect.
  const groupOrderMax = groups.reduce((sum, g) => {
    const gms = groupMatches.filter((gm) => gm.group === g.id);
    const allDone = gms.every((gm) => isFinal(gm.id));
    return sum + (allDone ? 0 : scoring.groupOrder.allCorrect);
  }, 0);

  // R16 / roundOf8: once group stage is complete, bracket slots are fixed so
  // participants for both R16 and QF are fully deterministic from user picks.
  const groupStageComplete = groupMatches.every((gm) => isFinal(gm.id));
  const roundOf16Max = groupStageComplete
    ? 0
    : bracket.roundOf16Matches.length * 2 * scoring.roundOf16PerTeam;
  const roundOf8Max = groupStageComplete
    ? 0
    : bracket.roundOf8Matches.length * 2 * scoring.roundOf8PerTeam;

  // Bronze: locked when played.
  const bronzePlayed = isFinal(bracket.bronzeMatch);
  const bronzeMax = bronzePlayed ? 0 : 2 * scoring.bronze.perTeam + scoring.bronze.exactScore;

  // Final: team points bank as each SF completes, so once both SFs are final the team
  // portion is resolved (banked or lost) — only exactScore remains attainable.
  const finalPlayed = isFinal(bracket.finalMatch);
  const bothSemisFinal = bracket.semiFinals.every(isFinal);
  const finalMax = finalPlayed
    ? 0
    : bothSemisFinal
      ? scoring.final.exactScore
      : 2 * scoring.final.perTeam + scoring.final.exactScore;

  // Top four (semifinalists): resolves once every QF match is played — at that point the
  // four actual semifinalists are fully known, independent of Final/Bronze results.
  const qfComplete = bracket.roundOf8Matches.every(isFinal);
  const topFourMax = qfComplete ? 0 : 4 * scoring.roundOf4PerTeam;

  // Specials: conservatively treat as fully open until the tournament is
  // entirely complete.
  const tournamentComplete =
    groupStageComplete &&
    bracket.roundOf8Matches.every(isFinal) &&
    bracket.semiFinals.every(isFinal) &&
    bronzePlayed &&
    finalPlayed;

  const specialsMax = tournamentComplete ? 0 : sumSpecialsMax(scoring);

  const total =
    groupMatchesMax +
    groupOrderMax +
    roundOf16Max +
    roundOf8Max +
    topFourMax +
    bronzeMax +
    finalMax +
    specialsMax;

  return {
    groupMatches: points(groupMatchesMax),
    groupOrder: points(groupOrderMax),
    bronze: points(bronzeMax),
    final: points(finalMax),
    roundOf16: points(roundOf16Max),
    roundOf8: points(roundOf8Max),
    topFour: points(topFourMax),
    specials: points(specialsMax),
    total: points(total),
  };
}

function sumSpecialsMax(scoring: Tournament['scoring']): number {
  return (
    scoring.groupTopScoringTeam +
    scoring.groupTopConcedingTeam +
    scoring.tournamentTopScoringTeam +
    scoring.tournamentTopConcedingTeam +
    scoring.highestMatchGoals +
    scoring.mostYellowCardsTeam +
    scoring.firstRedCardPlayer +
    scoring.penaltyShootoutCount +
    scoring.finalDecidedByPenalties +
    scoring.finalDecisiveGoalPlayer +
    scoring.topScorerPlayer
  );
}
