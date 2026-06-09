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
  // Iterate in declaration order (valid topo order: R32 → R16 → QF → SF → Final).
  // If any prerequisite pick is absent the match is skipped — partial cards are normal
  // during card creation. Invalid picks (wrong team) still throw.

  for (const prog of bracket.progression) {
    if (prog.match === bracket.bronzeMatch) {
      // Bronze participants are SF losers; resolved later after SFs are known.
      continue;
    }

    const maybeParticipants = prog.from.map((fromKey) => pickByKey.get(fromKey));
    // Skip if any prerequisite pick is missing — card is partially filled
    if (maybeParticipants.some((p) => p === undefined)) continue;

    const participants = maybeParticipants as TeamId[];
    if (participants.length !== 2) {
      throw new Error(`Expected 2 participants for "${prog.match}", got ${participants.length}`);
    }
    participantsByMatch.set(prog.match, [participants[0]!, participants[1]!]);
  }

  // ── Resolve bronze participants from SF losers ───────────────────────────────
  // Find the bronzeMatch progression entry to identify which SF matches feed it.
  const bronzeProg = bracket.progression.find((p) => p.match === bracket.bronzeMatch);
  if (bronzeProg) {
    const sfLosers: TeamId[] = [];
    for (const sfKey of bronzeProg.from) {
      const pair = participantsByMatch.get(sfKey);
      const winner = pickByKey.get(sfKey);
      if (!pair || !winner) break; // SF not yet resolved — skip bronze too
      const [sfHome, sfAway] = pair;
      sfLosers.push(winner === sfHome ? sfAway : sfHome);
    }
    if (sfLosers.length === 2) {
      participantsByMatch.set(bracket.bronzeMatch, [sfLosers[0]!, sfLosers[1]!]);
    }
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
  // All teams in entry-round slots, in slot order (home then away for each match).
  // Matches whose participants aren't yet resolved (partial card) are omitted.
  const roundOf8: TeamId[] = bracket.roundOf8Matches.flatMap((key) => {
    const pair = participantsByMatch.get(key);
    return pair ?? [];
  });

  // ── Helper: resolve a match's loser (null when participants/pick is absent) ──
  function loserOf(matchKey: BracketMatchKey): TeamId | null {
    const pair = participantsByMatch.get(matchKey);
    if (!pair) return null;
    const winner = pickByKey.get(matchKey);
    if (!winner) return null;
    const [home, away] = pair;
    return winner === home ? away : home;
  }

  // ── Finalists = SF winners (only those picked) ───────────────────────────────
  const finalists: TeamId[] = bracket.semiFinals.flatMap((sfKey) => {
    const winner = pickByKey.get(sfKey);
    return winner ? [winner] : [];
  });

  // ── bronzePair = SF losers (only those resolved) ────────────────────────────
  const bronzePair: TeamId[] = bracket.semiFinals.flatMap((sfKey) => {
    const loser = loserOf(sfKey);
    return loser ? [loser] : [];
  });

  // ── topFour = [finalWinner, finalLoser, bronzeWinner, bronzeLoser] ───────────
  // Only includes positions that are fully resolved; may be shorter than 4 for partial cards.
  const topFour: TeamId[] = [];
  const finalWinner = pickByKey.get(bracket.finalMatch);
  if (finalWinner) {
    topFour.push(finalWinner);
    const finalLoser = loserOf(bracket.finalMatch);
    if (finalLoser) topFour.push(finalLoser);
  }
  const bronzeWinner = pickByKey.get(bracket.bronzeMatch);
  if (bronzeWinner) {
    topFour.push(bronzeWinner);
    const bronzeLoser = loserOf(bracket.bronzeMatch);
    if (bronzeLoser) topFour.push(bronzeLoser);
  }

  return { roundOf8, finalists, bronzePair, topFour };
}

/** Helper exported for tests: resolve a slot reference (exposed for bracket.test.ts). */
export { resolveSlot };

/** Safe slot resolver — returns undefined instead of throwing when refs are unresolvable. */
function resolveSlotSafe(
  ref: string,
  groupOrders: Record<GroupId, TeamId[]>,
  rankedThirds: TeamId[],
): TeamId | undefined {
  try {
    return resolveSlot(ref, groupOrders, rankedThirds);
  } catch {
    return undefined;
  }
}

/**
 * Returns the BracketMatchKeys of picks that are no longer valid after a group score change.
 *
 * Walks the bracket in topological order (entry slots → progression → bronze).
 * When a pick is invalidated it is removed from the working pick map so that downstream
 * matches that depend on it are also flagged.
 *
 * Bronze is handled specially: its participants are SF losers, not SF winners.
 */
export function findInvalidatedPickKeys(
  t: Tournament,
  newGroupOrders: Record<GroupId, TeamId[]>,
  newQualifiers: TeamId[],
  existingPicks: KnockoutPick[],
): BracketMatchKey[] {
  const { bracket, groups, qualification } = t;
  const autoCount = groups.length * qualification.autoQualifyPerGroup;
  const rankedThirds: TeamId[] = newQualifiers.slice(autoCount);

  const pickMap = new Map<BracketMatchKey, TeamId>(
    existingPicks.map((p) => [p.bracketMatchKey, p.winner]),
  );
  const participantsByMatch = new Map<BracketMatchKey, [TeamId, TeamId]>();
  const invalidKeys: BracketMatchKey[] = [];

  // 1. Entry-round slots (e.g. R32 / QF depending on tournament)
  for (const slot of bracket.slots) {
    const home = resolveSlotSafe(slot.home, newGroupOrders, rankedThirds);
    const away = resolveSlotSafe(slot.away, newGroupOrders, rankedThirds);

    if (home !== undefined && away !== undefined) {
      participantsByMatch.set(slot.match, [home, away]);
    }

    const pick = pickMap.get(slot.match);
    if (pick !== undefined) {
      if (home === undefined || away === undefined || (pick !== home && pick !== away)) {
        invalidKeys.push(slot.match);
        pickMap.delete(slot.match);
      }
    }
  }

  // 2. Progression entries in declaration order (topo: R32→R16→QF→SF→Final); skip bronze
  for (const prog of bracket.progression) {
    if (prog.match === bracket.bronzeMatch) continue;

    const homePick = prog.from[0] != null ? pickMap.get(prog.from[0]) : undefined;
    const awayPick = prog.from[1] != null ? pickMap.get(prog.from[1]) : undefined;

    if (homePick !== undefined && awayPick !== undefined) {
      participantsByMatch.set(prog.match, [homePick, awayPick]);
    }

    const pick = pickMap.get(prog.match);
    if (pick !== undefined) {
      if (
        homePick === undefined ||
        awayPick === undefined ||
        (pick !== homePick && pick !== awayPick)
      ) {
        invalidKeys.push(prog.match);
        pickMap.delete(prog.match);
      }
    }
  }

  // 3. Bronze: participants are SF losers (not winners)
  const bronzeProg = bracket.progression.find((p) => p.match === bracket.bronzeMatch);
  if (bronzeProg) {
    const bronzeParticipants: TeamId[] = [];
    for (const sfKey of bronzeProg.from) {
      const sfPair = participantsByMatch.get(sfKey);
      const sfWinner = pickMap.get(sfKey);
      if (sfPair !== undefined && sfWinner !== undefined) {
        const loser = sfWinner === sfPair[0] ? sfPair[1] : sfPair[0];
        bronzeParticipants.push(loser);
      }
    }

    const bronzePick = pickMap.get(bracket.bronzeMatch);
    if (bronzePick !== undefined) {
      if (bronzeParticipants.length < 2 || !bronzeParticipants.includes(bronzePick)) {
        invalidKeys.push(bracket.bronzeMatch);
      }
    }
  }

  return invalidKeys;
}
