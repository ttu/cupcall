import { teamId, playerId, matchId, bracketMatchKey } from '@cup/engine';
import type {
  CardInputs,
  Tournament,
  SpecialBets,
  GroupScore,
  KnockoutPick,
  FinishScore,
  TeamId,
  PlayerId,
  MatchId,
  BracketMatchKey,
} from '@cup/engine';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitive id transformers
// ---------------------------------------------------------------------------

const teamIdSchema = z.string().transform(teamId);
const playerIdSchema = z.string().transform(playerId);
const matchIdSchema = z.string().transform(matchId);
const bracketMatchKeySchema = z.string().transform(bracketMatchKey);

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const groupScoreSchema = z.object({
  matchId: matchIdSchema,
  home: z.number().int().nonnegative(),
  away: z.number().int().nonnegative(),
});

const knockoutPickSchema = z.object({
  bracketMatchKey: bracketMatchKeySchema,
  winner: teamIdSchema,
});

const finishScoreItemSchema = z.object({
  home: z.number().int().nonnegative(),
  away: z.number().int().nonnegative(),
});

const specialsSchema = z.object({
  topScorerPlayer: playerIdSchema.optional(),
  groupTopScoringTeam: teamIdSchema.optional(),
  groupTopConcedingTeam: teamIdSchema.optional(),
  tournamentTopScoringTeam: teamIdSchema.optional(),
  tournamentTopConcedingTeam: teamIdSchema.optional(),
  highestMatchGoals: z.number().optional(),
  mostYellowCardsTeam: teamIdSchema.optional(),
  firstRedCardPlayer: playerIdSchema.optional(),
  penaltyShootoutCount: z.number().optional(),
  finalDecidedByPenalties: z.boolean().optional(),
  finalDecisiveGoalPlayer: playerIdSchema.optional(),
});

// ---------------------------------------------------------------------------
// Output type (named interface so TS can reference it without inlining brand)
// ---------------------------------------------------------------------------

/** Parsed output of cardIoSchema — uses engine branded types. */
export interface CardIoOutput {
  tournamentId: string;
  version: number;
  groupScores: GroupScore[];
  knockoutPicks: KnockoutPick[];
  finishScores: { final?: FinishScore; bronze?: FinishScore };
  specials: SpecialBets;
}

/** Raw JSON input shape for cardIoSchema */
export interface CardIoInput {
  tournamentId: string;
  version: number;
  groupScores?: Array<{ matchId: string; home: number; away: number }>;
  knockoutPicks?: Array<{ bracketMatchKey: string; winner: string }>;
  finishScores?: {
    final?: { home: number; away: number };
    bronze?: { home: number; away: number };
  };
  specials?: {
    topScorerPlayer?: string;
    groupTopScoringTeam?: string;
    groupTopConcedingTeam?: string;
    tournamentTopScoringTeam?: string;
    tournamentTopConcedingTeam?: string;
    highestMatchGoals?: number;
    mostYellowCardsTeam?: string;
    firstRedCardPlayer?: string;
    penaltyShootoutCount?: number;
    finalDecidedByPenalties?: boolean;
    finalDecisiveGoalPlayer?: string;
  };
}

// ---------------------------------------------------------------------------
// Internal Zod schema (not exported — avoids TS4023 on unique symbol)
// ---------------------------------------------------------------------------

const _cardIoSchemaInternal = z
  .object({
    tournamentId: z.string(),
    version: z.number().int().positive(),
    groupScores: z.array(groupScoreSchema).optional().default([]),
    knockoutPicks: z.array(knockoutPickSchema).optional().default([]),
    finishScores: z
      .object({
        final: finishScoreItemSchema.optional(),
        bronze: finishScoreItemSchema.optional(),
      })
      .optional()
      .default({}),
    specials: specialsSchema.optional().default({}),
  })
  .strict();

// ---------------------------------------------------------------------------
// Exported schema — explicitly typed to avoid TS4023 on the brand symbol
// ---------------------------------------------------------------------------

/** Strict structural schema for card export/import. Stray fields surface as errors. */
export const cardIoSchema: z.ZodType<CardIoOutput, z.ZodTypeDef, unknown> =
  _cardIoSchemaInternal.transform((v): CardIoOutput => toCardIoOutput(v));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map the internal parsed shape to the public `CardIoOutput`. Single source of truth used by
 * both `cardIoSchema.transform` and `parseCardImport` so the two cannot drift. The `as` casts
 * re-apply the branded types the sub-schema transforms already produced (the explicit
 * `z.ZodType` annotation on the export erases that inference; see the TS4023 note above).
 */
function toCardIoOutput(v: z.output<typeof _cardIoSchemaInternal>): CardIoOutput {
  return {
    tournamentId: v.tournamentId,
    version: v.version,
    groupScores: v.groupScores as GroupScore[],
    knockoutPicks: v.knockoutPicks as KnockoutPick[],
    finishScores: {
      ...(v.finishScores.final !== undefined && { final: v.finishScores.final as FinishScore }),
      ...(v.finishScores.bronze !== undefined && {
        bronze: v.finishScores.bronze as FinishScore,
      }),
    },
    specials: buildSpecials(v.specials),
  };
}

function buildSpecials(s: z.output<typeof specialsSchema>): SpecialBets {
  return {
    ...(s.topScorerPlayer !== undefined && { topScorerPlayer: s.topScorerPlayer as PlayerId }),
    ...(s.groupTopScoringTeam !== undefined && {
      groupTopScoringTeam: s.groupTopScoringTeam as TeamId,
    }),
    ...(s.groupTopConcedingTeam !== undefined && {
      groupTopConcedingTeam: s.groupTopConcedingTeam as TeamId,
    }),
    ...(s.tournamentTopScoringTeam !== undefined && {
      tournamentTopScoringTeam: s.tournamentTopScoringTeam as TeamId,
    }),
    ...(s.tournamentTopConcedingTeam !== undefined && {
      tournamentTopConcedingTeam: s.tournamentTopConcedingTeam as TeamId,
    }),
    ...(s.highestMatchGoals !== undefined && { highestMatchGoals: s.highestMatchGoals }),
    ...(s.mostYellowCardsTeam !== undefined && {
      mostYellowCardsTeam: s.mostYellowCardsTeam as TeamId,
    }),
    ...(s.firstRedCardPlayer !== undefined && {
      firstRedCardPlayer: s.firstRedCardPlayer as PlayerId,
    }),
    ...(s.penaltyShootoutCount !== undefined && { penaltyShootoutCount: s.penaltyShootoutCount }),
    ...(s.finalDecidedByPenalties !== undefined && {
      finalDecidedByPenalties: s.finalDecidedByPenalties,
    }),
    ...(s.finalDecisiveGoalPlayer !== undefined && {
      finalDecisiveGoalPlayer: s.finalDecisiveGoalPlayer as PlayerId,
    }),
  };
}

/** Cross-reference errors with clear, actionable messages */
function crossReference(parsed: CardIoOutput, tournament: Tournament): string[] {
  const errors: string[] = [];

  if (parsed.tournamentId !== tournament.id) {
    errors.push(
      `Tournament id mismatch: expected "${tournament.id}", got "${parsed.tournamentId}"`,
    );
    // Return early — cross-referencing ids against the wrong tournament is pointless
    return errors;
  }

  const teamIds = new Set(tournament.teams.map((t) => t.id as string));
  const playerIds = new Set(tournament.players.map((p) => p.id as string));
  const groupMatchIds = new Set(tournament.groupMatches.map((m) => m.id as string));

  // Collect all known bracket match keys from bracket definition
  const bracketMatchKeys = new Set<string>();
  for (const slot of tournament.bracket.slots) {
    bracketMatchKeys.add(slot.match as string);
  }
  for (const prog of tournament.bracket.progression) {
    bracketMatchKeys.add(prog.match as string);
    for (const from of prog.from) {
      bracketMatchKeys.add(from as string);
    }
  }
  bracketMatchKeys.add(tournament.bracket.finalMatch as string);
  bracketMatchKeys.add(tournament.bracket.bronzeMatch as string);
  for (const sf of tournament.bracket.semiFinals) {
    bracketMatchKeys.add(sf as string);
  }
  for (const ro8 of tournament.bracket.roundOf8Matches) {
    bracketMatchKeys.add(ro8 as string);
  }

  for (const gs of parsed.groupScores) {
    if (!groupMatchIds.has(gs.matchId as string)) {
      errors.push(`Unknown match id "${gs.matchId}" in groupScores`);
    }
  }

  for (const kp of parsed.knockoutPicks) {
    if (!bracketMatchKeys.has(kp.bracketMatchKey as string)) {
      errors.push(`Unknown bracketMatchKey "${kp.bracketMatchKey}" in knockoutPicks`);
    }
    if (!teamIds.has(kp.winner as string)) {
      errors.push(
        `Unknown team id "${kp.winner}" in knockoutPicks (bracketMatchKey "${kp.bracketMatchKey}")`,
      );
    }
  }

  const { specials } = parsed;

  if (
    specials.topScorerPlayer !== undefined &&
    !playerIds.has(specials.topScorerPlayer as string)
  ) {
    errors.push(`Unknown player id "${specials.topScorerPlayer}" in specials.topScorerPlayer`);
  }
  if (
    specials.firstRedCardPlayer !== undefined &&
    !playerIds.has(specials.firstRedCardPlayer as string)
  ) {
    errors.push(
      `Unknown player id "${specials.firstRedCardPlayer}" in specials.firstRedCardPlayer`,
    );
  }
  if (
    specials.finalDecisiveGoalPlayer !== undefined &&
    !playerIds.has(specials.finalDecisiveGoalPlayer as string)
  ) {
    errors.push(
      `Unknown player id "${specials.finalDecisiveGoalPlayer}" in specials.finalDecisiveGoalPlayer`,
    );
  }

  const teamBets: Array<[string, TeamId | undefined]> = [
    ['specials.groupTopScoringTeam', specials.groupTopScoringTeam],
    ['specials.groupTopConcedingTeam', specials.groupTopConcedingTeam],
    ['specials.tournamentTopScoringTeam', specials.tournamentTopScoringTeam],
    ['specials.tournamentTopConcedingTeam', specials.tournamentTopConcedingTeam],
    ['specials.mostYellowCardsTeam', specials.mostYellowCardsTeam],
  ];
  for (const [field, val] of teamBets) {
    if (val !== undefined && !teamIds.has(val as string)) {
      errors.push(`Unknown team id "${val}" in ${field}`);
    }
  }

  return errors;
}

/** Build CardInputs from parsed, honouring exactOptionalPropertyTypes */
function toCardInputs(parsed: CardIoOutput): CardInputs {
  return {
    groupScores: parsed.groupScores,
    knockoutPicks: parsed.knockoutPicks,
    finishScores: parsed.finishScores,
    specials: parsed.specials,
  };
}

export type ParseCardImportResult =
  | { ok: true; value: CardInputs & { tournamentId: string; version: number } }
  | { ok: false; errors: string[] };

/**
 * Parse and cross-reference a card import JSON against a tournament.
 * Returns ok + CardInputs (+ tournamentId + version) on success,
 * or ok: false + all error messages.
 */
export function parseCardImport(json: unknown, tournament: Tournament): ParseCardImportResult {
  const structural = _cardIoSchemaInternal.safeParse(json);
  if (!structural.success) {
    return {
      ok: false,
      errors: structural.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }

  const output = toCardIoOutput(structural.data);

  const crossErrors = crossReference(output, tournament);
  if (crossErrors.length > 0) {
    return { ok: false, errors: crossErrors };
  }

  const cardInputs = toCardInputs(output);

  return {
    ok: true,
    value: {
      ...cardInputs,
      tournamentId: output.tournamentId,
      version: output.version,
    },
  };
}
