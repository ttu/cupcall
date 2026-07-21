import { teamId, groupId } from '@cup/engine';
import type { ActualResults, GroupId, TeamId } from '@cup/engine';
import { z } from 'zod';
import { teamIdSchema, playerIdSchema, matchIdSchema } from './ids.js';

const actualMatchResultSchema = z.object({
  matchId: matchIdSchema,
  home: z.number().int().nonnegative(),
  away: z.number().int().nonnegative(),
  homeConduct: z.number().int().optional(),
  awayConduct: z.number().int().optional(),
});

const actualFinishMatchSchema = z.object({
  home: teamIdSchema,
  away: teamIdSchema,
  homeGoals: z.number().int().nonnegative(),
  awayGoals: z.number().int().nonnegative(),
  winner: teamIdSchema,
});

const decidedBySchema = z.enum(['regulation', 'extraTime', 'penalties']);

export const knockoutEntrySchema = z.object({
  round: z.enum(['R32', 'R16', 'QF', 'SF', 'Final', 'bronze']),
  matchId: z.string(),
  home: z.string(),
  away: z.string(),
  homeGoals: z.number().int().nonnegative(),
  awayGoals: z.number().int().nonnegative(),
  winner: z.string(),
  decidedBy: decidedBySchema.optional(),
  kickoff: z.string().datetime().optional(),
});

export const knockoutResultsSchema = z
  .object({ knockout: z.array(knockoutEntrySchema).optional() })
  .passthrough();

const finalMatchSchema = actualFinishMatchSchema.extend({
  decidedBy: decidedBySchema.optional(),
  decisiveGoalPlayer: playerIdSchema.optional(),
});

// Accepts either a single id string or an array; always normalises to array.
// This makes results.json backward-compatible (existing single-value entries still parse).
const singleOrArrayTeam = z
  .union([teamIdSchema, z.array(teamIdSchema)])
  .transform((v) => (Array.isArray(v) ? v : [v]));

const singleOrArrayPlayer = z
  .union([playerIdSchema, z.array(playerIdSchema)])
  .transform((v) => (Array.isArray(v) ? v : [v]));

const answersSchema = z.object({
  roundOf16: z.array(teamIdSchema).optional(),
  roundOf8: z.array(teamIdSchema).optional(),
  roundOf4: z.array(teamIdSchema).optional(),
  groupTopScoringTeam: singleOrArrayTeam.optional(),
  groupTopConcedingTeam: singleOrArrayTeam.optional(),
  tournamentTopScoringTeam: singleOrArrayTeam.optional(),
  tournamentTopConcedingTeam: singleOrArrayTeam.optional(),
  highestMatchGoals: z.number().optional(),
  mostYellowCardsTeam: singleOrArrayTeam.optional(),
  firstRedCardPlayer: playerIdSchema.optional(),
  penaltyShootoutCount: z.number().optional(),
  topScorerPlayer: singleOrArrayPlayer.optional(),
});

// groupOrder is a Record<GroupId, TeamId[]> — validated as a record of string arrays
// then transformed to the branded types
const groupOrderSchema = z.record(z.string(), z.array(z.string())).transform((rec) => {
  const result: Record<GroupId, TeamId[]> = {};
  for (const [k, v] of Object.entries(rec)) {
    result[groupId(k)] = v.map(teamId);
  }
  return result;
});

// Non-strict: tolerate extra top-level fields (e.g. "knockout" array in §4.2)
// We use a passthrough object and then manually construct ActualResults in the transform.
const rawResultsSchema = z
  .object({
    matchResults: z.array(actualMatchResultSchema),
    groupOrder: groupOrderSchema,
    bronzeMatch: actualFinishMatchSchema.optional(),
    finalMatch: finalMatchSchema.optional(),
    answers: answersSchema,
  })
  .passthrough();

/** Build one match result, honouring exactOptionalPropertyTypes (only present fields are set). */
function buildMatchResult(
  r: z.output<typeof actualMatchResultSchema>,
): ActualResults['matchResults'][number] {
  return {
    matchId: r.matchId,
    home: r.home,
    away: r.away,
    ...(r.homeConduct !== undefined && { homeConduct: r.homeConduct }),
    ...(r.awayConduct !== undefined && { awayConduct: r.awayConduct }),
  };
}

/** Build the special-bet answers, honouring exactOptionalPropertyTypes. */
function buildAnswers(answers: z.output<typeof answersSchema>): ActualResults['answers'] {
  return {
    ...(answers.roundOf16 !== undefined && { roundOf16: answers.roundOf16 }),
    ...(answers.roundOf8 !== undefined && { roundOf8: answers.roundOf8 }),
    ...(answers.roundOf4 !== undefined && { roundOf4: answers.roundOf4 }),
    ...(answers.groupTopScoringTeam !== undefined && {
      groupTopScoringTeam: answers.groupTopScoringTeam,
    }),
    ...(answers.groupTopConcedingTeam !== undefined && {
      groupTopConcedingTeam: answers.groupTopConcedingTeam,
    }),
    ...(answers.tournamentTopScoringTeam !== undefined && {
      tournamentTopScoringTeam: answers.tournamentTopScoringTeam,
    }),
    ...(answers.tournamentTopConcedingTeam !== undefined && {
      tournamentTopConcedingTeam: answers.tournamentTopConcedingTeam,
    }),
    ...(answers.highestMatchGoals !== undefined && {
      highestMatchGoals: answers.highestMatchGoals,
    }),
    ...(answers.mostYellowCardsTeam !== undefined && {
      mostYellowCardsTeam: answers.mostYellowCardsTeam,
    }),
    ...(answers.firstRedCardPlayer !== undefined && {
      firstRedCardPlayer: answers.firstRedCardPlayer,
    }),
    ...(answers.penaltyShootoutCount !== undefined && {
      penaltyShootoutCount: answers.penaltyShootoutCount,
    }),
    ...(answers.topScorerPlayer !== undefined && {
      topScorerPlayer: answers.topScorerPlayer,
    }),
  };
}

/** Build the final match, honouring exactOptionalPropertyTypes (only present fields are set). */
function buildFinalMatch(
  fm: z.output<typeof finalMatchSchema>,
): NonNullable<ActualResults['finalMatch']> {
  return {
    home: fm.home,
    away: fm.away,
    homeGoals: fm.homeGoals,
    awayGoals: fm.awayGoals,
    winner: fm.winner,
    ...(fm.decidedBy !== undefined && { decidedBy: fm.decidedBy }),
    ...(fm.decisiveGoalPlayer !== undefined && { decisiveGoalPlayer: fm.decisiveGoalPlayer }),
  };
}

export const resultsSchema: z.ZodType<ActualResults, z.ZodTypeDef, unknown> =
  rawResultsSchema.transform((v): ActualResults => {
    // Build with exactOptionalPropertyTypes compliance — only include properties that are present
    const base: ActualResults = {
      matchResults: v.matchResults.map(buildMatchResult),
      groupOrder: v.groupOrder,
      answers: buildAnswers(v.answers),
    };
    if (v.bronzeMatch !== undefined) {
      base.bronzeMatch = v.bronzeMatch;
    }
    if (v.finalMatch !== undefined) {
      base.finalMatch = buildFinalMatch(v.finalMatch);
    }
    return base;
  });

export type ResultsInput = {
  matchResults: Array<{
    matchId: string;
    home: number;
    away: number;
    homeConduct?: number;
    awayConduct?: number;
  }>;
  groupOrder: Record<string, string[]>;
  bronzeMatch?: {
    home: string;
    away: string;
    homeGoals: number;
    awayGoals: number;
    winner: string;
  };
  finalMatch?: {
    home: string;
    away: string;
    homeGoals: number;
    awayGoals: number;
    winner: string;
    decidedBy?: 'regulation' | 'extraTime' | 'penalties';
    decisiveGoalPlayer?: string;
  };
  answers: {
    roundOf16?: string[];
    roundOf8?: string[];
    roundOf4?: string[];
    /** Single string or array — ties are represented as an array. */
    groupTopScoringTeam?: string | string[];
    groupTopConcedingTeam?: string | string[];
    tournamentTopScoringTeam?: string | string[];
    tournamentTopConcedingTeam?: string | string[];
    highestMatchGoals?: number;
    mostYellowCardsTeam?: string | string[];
    firstRedCardPlayer?: string;
    penaltyShootoutCount?: number;
    topScorerPlayer?: string | string[];
  };
  [key: string]: unknown;
};
