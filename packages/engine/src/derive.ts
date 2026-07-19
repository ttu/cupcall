import type { CardInputs, DerivedCard, Tournament } from './types.js';
import { deriveGroupOrders } from './standings.js';
import { selectQualifiers } from './qualifiers.js';
import { buildBracket } from './bracket.js';

/**
 * Compose the full derivation pipeline for a player's card.
 *
 * Steps:
 *  1. Derive per-group standings from the player's group score picks.
 *  2. Select qualified teams (auto-qualifiers + best thirds if configured).
 *  3. Build the bracket to derive roundOf8, finalists, bronzePair, topFour, and roundOf4.
 *
 * Pure function — all inputs are value-typed, no IO or side effects.
 */
export function deriveCard(input: CardInputs, t: Tournament): DerivedCard {
  const groupOrders = deriveGroupOrders(t, input.groupScores);
  const qualifiers = selectQualifiers(t, input.groupScores, groupOrders);
  const { roundOf16, roundOf8, finalists, bronzePair, topFour, roundOf4 } = buildBracket(
    t,
    groupOrders,
    qualifiers,
    input.knockoutPicks,
    input.finishScores,
  );
  return { groupOrders, qualifiers, roundOf16, roundOf8, finalists, bronzePair, topFour, roundOf4 };
}
