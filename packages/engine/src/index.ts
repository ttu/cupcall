// Id constructors and branded primitive types
export { teamId, playerId, groupId, matchId, bracketMatchKey, points, userId } from './brand.js';
export type {
  TeamId,
  PlayerId,
  GroupId,
  MatchId,
  BracketMatchKey,
  Points,
  UserId,
} from './brand.js';

// Public types
export type {
  Tournament,
  CardInputs,
  DerivedCard,
  ActualResults,
  Scoring,
  ScoreBreakdown,
  // Input sub-types
  GroupScore,
  KnockoutPick,
  FinishScore,
  SpecialBets,
} from './types.js';

// Utility types
export type { Result } from './result.js';
export { ok, err } from './result.js';

// Core engine functions
export { deriveCard } from './derive.js';
export { scoreCard } from './score.js';
export { deriveGroupOrders } from './standings.js';
export { selectQualifiers } from './qualifiers.js';
export { findInvalidatedPickKeys, resolveSlot } from './bracket.js';
export { computeRemainingMaxPoints } from './scoring/remaining-max.js';
export type { TournamentProgress } from './scoring/remaining-max.js';
export { getSpecialBetDefs } from './scoring/special-bet-defs.js';
export type { SpecialBetDef, BetInputKind } from './scoring/special-bet-defs.js';
