import { teamId, playerId, groupId, matchId, bracketMatchKey } from '@cup/engine';
import type { Tournament } from '@cup/engine';
import { z } from 'zod';

const teamIdSchema = z.string().transform(teamId);
const playerIdSchema = z.string().transform(playerId);
const groupIdSchema = z.string().transform(groupId);
const matchIdSchema = z.string().transform(matchId);
const bracketMatchKeySchema = z.string().transform(bracketMatchKey);

const teamSchema = z.object({
  id: teamIdSchema,
  name: z.string(),
});

const playerSchema = z.object({
  id: playerIdSchema,
  name: z.string(),
  team: teamIdSchema,
});

const groupSchema = z.object({
  id: groupIdSchema,
  teams: z.array(teamIdSchema),
});

const groupMatchDefSchema = z.object({
  id: matchIdSchema,
  group: groupIdSchema,
  home: teamIdSchema,
  away: teamIdSchema,
});

const bracketSlotSchema = z.object({
  match: bracketMatchKeySchema,
  home: z.string(),
  away: z.string(),
});

const progressionSchema = z.object({
  match: bracketMatchKeySchema,
  from: z.array(bracketMatchKeySchema),
});

const bracketDefSchema = z.object({
  rounds: z.array(z.string()),
  entryRound: z.string(),
  roundOf8Matches: z.array(bracketMatchKeySchema),
  slots: z.array(bracketSlotSchema),
  progression: z.array(progressionSchema),
  semiFinals: z.array(bracketMatchKeySchema),
  finalMatch: bracketMatchKeySchema,
  bronzeMatch: bracketMatchKeySchema,
});

const scoringSchema = z.object({
  groupMatch: z.object({
    exactScore: z.number(),
    correctOutcome: z.number(),
  }),
  groupOrder: z.object({
    allCorrect: z.number(),
    twoCorrect: z.number(),
    oneCorrect: z.number(),
  }),
  groupTopScoringTeam: z.number(),
  groupTopConcedingTeam: z.number(),
  roundOf8PerTeam: z.number(),
  bronze: z.object({
    exactScore: z.number(),
    perTeam: z.number(),
  }),
  final: z.object({
    exactScore: z.number(),
    perTeam: z.number(),
  }),
  topFourOrder: z.object({
    allCorrect: z.number(),
    threeCorrect: z.number(),
    twoCorrect: z.number(),
    oneCorrect: z.number(),
    teamRightWrongPlace: z.number(),
  }),
  tournamentTopScoringTeam: z.number(),
  tournamentTopConcedingTeam: z.number(),
  highestMatchGoals: z.number(),
  mostYellowCardsTeam: z.number(),
  firstRedCardPlayer: z.number(),
  penaltyShootoutCount: z.number(),
  finalDecidedByPenalties: z.number(),
  finalDecisiveGoalPlayer: z.number(),
  topScorerPlayer: z.number(),
});

const tiebreakKeySchema = z.enum(['points', 'goalDifference', 'goalsFor', 'seedOrder']);

// Internal (non-exported) schema retains Zod's inferred output type so we can drift-check it
// against the engine `Tournament`. The public `tournamentSchema` is annotated `z.ZodType<Tournament>`
// because the inferred type leaks the engine's `brand` symbol, which breaks declaration emit (TS4023)
// for an *exported* value. Keeping the inferred form non-exported sidesteps that.
const tournamentObjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  // `knockoutRounds` (display-only labels) and `firstKickoff` (lock time, an app-layer concern)
  // from tournament.json §4.1 are intentionally not modelled here: neither is part of the engine
  // `Tournament`, so both are stripped on parse.
  scoring: scoringSchema,
  teams: z.array(teamSchema),
  players: z.array(playerSchema),
  groups: z.array(groupSchema),
  groupMatches: z.array(groupMatchDefSchema),
  qualification: z.object({
    autoQualifyPerGroup: z.number(),
    bestThirdPlaced: z.number(),
  }),
  standingsTiebreak: z.array(tiebreakKeySchema),
  bracket: bracketDefSchema,
});

// Compile-time drift guard (non-exported → not emitted): the schema output must match `Tournament`
// in both directions. If the schema and the engine type diverge (missing/extra/mistyped field),
// this fails to compile — the same drift class that previously leaked `knockoutRounds`.
type Assert<T extends true> = T;
type _TournamentMatchesEngine = Assert<
  z.infer<typeof tournamentObjectSchema> extends Tournament
    ? Tournament extends z.infer<typeof tournamentObjectSchema>
      ? true
      : false
    : false
>;

export const tournamentSchema: z.ZodType<Tournament, z.ZodTypeDef, unknown> =
  tournamentObjectSchema;

export type TournamentInput = z.input<typeof tournamentSchema>;
