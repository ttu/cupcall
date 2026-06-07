import { groupId } from './brand.js';
import type { BracketMatchKey, GroupId, TeamId } from './brand.js';
import type { KnockoutPick, Tournament } from './types.js';

export interface BracketResult {
  /** The 8 teams placed into the entry-round (QF) slots, in slot order. */
  roundOf8: TeamId[];
  /** The two SF winners who contest the final. */
  finalists: TeamId[];
  /** The two SF losers who contest the bronze match. */
  bronzePair: TeamId[];
  /**
   * The final top-four ranking:
   * [finalWinner, finalLoser, bronzeWinner, bronzeLoser]
   */
  topFour: TeamId[];
}

/**
 * Resolve a SlotRef to a concrete TeamId.
 *
 * Slot reference conventions:
 *   "1A"     → groupOrders[A][0]  (1st place of group A)
 *   "2B"     → groupOrders[B][1]  (2nd place of group B)
 *   "3rd[i]" → rankedThirds[i]    (i-th best third-placed team)
 *
 * rankedThirds = qualifiers.slice(groups.length * autoQualifyPerGroup)
 *   (the tail of qualifiers beyond the auto-qualified teams, preserving order)
 */
function resolveSlot(
  ref: string,
  groupOrders: Record<GroupId, TeamId[]>,
  rankedThirds: TeamId[],
): TeamId {
  // "3rd[i]" pattern
  const thirdMatch = /^3rd\[(\d+)\]$/.exec(ref);
  if (thirdMatch) {
    const idx = parseInt(thirdMatch[1]!, 10);
    const team = rankedThirds[idx];
    if (!team) throw new Error(`No ranked third at index ${idx}`);
    return team;
  }

  // "NX" pattern: N = 1-based rank, X = group letter
  const slotMatch = /^(\d+)([A-Z])$/.exec(ref);
  if (!slotMatch) throw new Error(`Unrecognised slot reference: "${ref}"`);
  const rank = parseInt(slotMatch[1]!, 10);
  const groupLetter = groupId(slotMatch[2]!);
  const order = groupOrders[groupLetter];
  if (!order) throw new Error(`No group order for "${groupLetter}"`);
  const team = order[rank - 1];
  if (!team) throw new Error(`Rank ${rank} not found in group ${groupLetter}`);
  return team;
}

/**
 * Build the bracket from group results and knockout picks.
 *
 * Pure function — throws a descriptive Error if a pick names a team that is
 * not a participant in that match (caller may re-derive or surface the error).
 */
export function buildBracket(
  t: Tournament,
  groupOrders: Record<GroupId, TeamId[]>,
  qualifiers: TeamId[],
  picks: KnockoutPick[],
): BracketResult {
  const { bracket, groups, qualification } = t;

  // Derive ranked-thirds from the tail of qualifiers beyond auto-qualified slots
  const autoCount = groups.length * qualification.autoQualifyPerGroup;
  const rankedThirds: TeamId[] = qualifiers.slice(autoCount);

  // Build a map from BracketMatchKey → winning TeamId for O(1) lookup
  const pickByKey = new Map<BracketMatchKey, TeamId>(
    picks.map((p) => [p.bracketMatchKey, p.winner]),
  );

  // ── Resolve entry-round slots ────────────────────────────────────────────────
  // Each BracketSlot maps match key → [home, away] participants
  const participantsByMatch = new Map<BracketMatchKey, [TeamId, TeamId]>();

  for (const slot of bracket.slots) {
    const home = resolveSlot(slot.home, groupOrders, rankedThirds);
    const away = resolveSlot(slot.away, groupOrders, rankedThirds);
    participantsByMatch.set(slot.match, [home, away]);
  }

  // ── Propagate winners through non-bronze progression ─────────────────────────
  // Progression convention:
  //   - For all matches EXCEPT bronzeMatch: participants = WINNERS of `from` matches.
  //   - For bronzeMatch: participants = LOSERS of the two semi-final matches.
  //     (Bronze is always contested by SF losers — this is the fixed cup convention.)
  //
  // Iterate in declaration order (fixture: sf1, sf2, final, bronze — valid topo order).

  for (const prog of bracket.progression) {
    if (prog.match === bracket.bronzeMatch) {
      // Bronze participants are SF losers; resolved later after SFs are known.
      continue;
    }

    // Participants of this match = winners of the `from` matches
    const participants: TeamId[] = prog.from.map((fromKey) => {
      const winner = pickByKey.get(fromKey);
      if (!winner) {
        throw new Error(`Missing knockout pick for match "${fromKey}" (needed by "${prog.match}")`);
      }
      return winner;
    });
    if (participants.length !== 2) {
      throw new Error(`Expected 2 participants for "${prog.match}", got ${participants.length}`);
    }
    participantsByMatch.set(prog.match, [participants[0]!, participants[1]!]);
  }

  // ── Resolve bronze participants from SF losers ───────────────────────────────
  // Find the bronzeMatch progression entry to identify which SF matches feed it.
  const bronzeProg = bracket.progression.find((p) => p.match === bracket.bronzeMatch);
  if (bronzeProg) {
    const sfLosers = bronzeProg.from.map((sfKey) => {
      const pair = participantsByMatch.get(sfKey);
      if (!pair) throw new Error(`No participants resolved for SF "${sfKey}" (needed by bronze)`);
      const winner = pickByKey.get(sfKey);
      if (!winner) throw new Error(`Missing pick for SF "${sfKey}" (needed by bronze)`);
      const [sfHome, sfAway] = pair;
      return winner === sfHome ? sfAway : sfHome;
    });
    if (sfLosers.length !== 2) throw new Error('Expected 2 SF losers for bronze match');
    participantsByMatch.set(bracket.bronzeMatch, [sfLosers[0]!, sfLosers[1]!]);
  }

  // ── Validate all picks against their resolved participants ───────────────────
  for (const [key, [home, away]] of participantsByMatch) {
    const winner = pickByKey.get(key);
    if (winner !== undefined && winner !== home && winner !== away) {
      throw new Error(
        `Invalid pick for "${key}": picked "${winner}" but participants are "${home}" vs "${away}"`,
      );
    }
  }

  // ── Derive roundOf8 ──────────────────────────────────────────────────────────
  // All teams in entry-round slots, in slot order (home then away for each QF)
  const roundOf8: TeamId[] = bracket.roundOf8Matches.flatMap((key) => {
    const pair = participantsByMatch.get(key);
    if (!pair) throw new Error(`No participants resolved for round-of-8 match "${key}"`);
    return pair;
  });

  // ── Helper: resolve a match's loser ─────────────────────────────────────────
  function loserOf(matchKey: BracketMatchKey): TeamId {
    const pair = participantsByMatch.get(matchKey);
    if (!pair) throw new Error(`No participants for "${matchKey}"`);
    const winner = pickByKey.get(matchKey);
    if (!winner) throw new Error(`No pick for "${matchKey}"`);
    const [home, away] = pair;
    return winner === home ? away : home;
  }

  // ── Finalists = SF winners ───────────────────────────────────────────────────
  const finalists: TeamId[] = bracket.semiFinals.map((sfKey) => {
    const winner = pickByKey.get(sfKey);
    if (!winner) throw new Error(`Missing pick for semi-final "${sfKey}"`);
    return winner;
  });

  // ── bronzePair = SF losers ───────────────────────────────────────────────────
  const bronzePair: TeamId[] = bracket.semiFinals.map((sfKey) => loserOf(sfKey));

  // ── topFour = [finalWinner, finalLoser, bronzeWinner, bronzeLoser] ───────────
  const finalWinner = pickByKey.get(bracket.finalMatch);
  if (!finalWinner) throw new Error('Missing pick for final');
  const finalLoser = loserOf(bracket.finalMatch);

  const bronzeWinner = pickByKey.get(bracket.bronzeMatch);
  if (!bronzeWinner) throw new Error('Missing pick for bronze match');
  const bronzeLoser = loserOf(bracket.bronzeMatch);

  const topFour: TeamId[] = [finalWinner, finalLoser, bronzeWinner, bronzeLoser];

  return { roundOf8, finalists, bronzePair, topFour };
}

/** Helper exported for tests: resolve a slot reference (exposed for bracket.test.ts). */
export { resolveSlot };
