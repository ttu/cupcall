import { groupId } from './brand.js';
import type { BracketMatchKey, GroupId, TeamId } from './brand.js';
import type { FinishScore, KnockoutPick, Progression, Tournament } from './types.js';

export interface BracketResult {
  /** The 16 teams placed into the R16 slots, in slot order. Empty when bracket has no R16. */
  roundOf16: TeamId[];
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
  /** The player's 4 QF-winner picks (predicted semifinalists), unordered. */
  roundOf4: TeamId[];
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
 * Pure function. Picks that name a team that is not a participant in a match
 * are silently dropped — stale picks (e.g. from an earlier bracket projection)
 * are treated as if no pick was made, so the rest of the card can still be scored.
 */
export function buildBracket(
  t: Tournament,
  groupOrders: Record<GroupId, TeamId[]>,
  qualifiers: TeamId[],
  picks: KnockoutPick[],
  finishScores: { final?: FinishScore; bronze?: FinishScore } = {},
): BracketResult {
  const { bracket, groups, qualification } = t;

  // Derive ranked-thirds from the tail of qualifiers beyond auto-qualified slots
  const autoCount = groups.length * qualification.autoQualifyPerGroup;
  const rankedThirds: TeamId[] = qualifiers.slice(autoCount);

  // Build a map from BracketMatchKey → winning TeamId for O(1) lookup
  const pickByKey = new Map<BracketMatchKey, TeamId>(
    picks.map((p) => [p.bracketMatchKey, p.winner]),
  );

  // Resolve entry-round participants, then propagate picks round by round.
  // Order matters: stale entry picks are dropped before propagation so they can't corrupt
  // derived participants; bronze is resolved from SF losers; stale progression picks are
  // dropped last. See the individual helpers for the per-step conventions.
  const participantsByMatch = resolveEntryParticipants(bracket, groupOrders, rankedThirds);
  dropStalePicks(pickByKey, participantsByMatch);
  propagateProgressionWinners(bracket, pickByKey, participantsByMatch);
  resolveBronzeParticipants(bracket, pickByKey, participantsByMatch);
  dropStalePicks(pickByKey, participantsByMatch);

  return {
    roundOf16: teamsInMatches(participantsByMatch, bracket.roundOf16Matches),
    roundOf8: teamsInMatches(participantsByMatch, bracket.roundOf8Matches),
    finalists: pickedWinnersOf(pickByKey, bracket.semiFinals),
    bronzePair: sfLosers(bracket, participantsByMatch, pickByKey),
    topFour: deriveTopFour(bracket, participantsByMatch, pickByKey, finishScores),
    roundOf4: pickedWinnersOf(pickByKey, bracket.roundOf8Matches),
  };
}

/**
 * A pick is stale when it names a team that is not a participant of its match — or when the
 * match itself is unresolvable (a participant slot is unknown). Absent picks are never stale.
 */
function isPickStale(
  pick: TeamId | undefined,
  home: TeamId | undefined,
  away: TeamId | undefined,
): boolean {
  if (pick === undefined) return false;
  if (home === undefined || away === undefined) return true;
  return pick !== home && pick !== away;
}

/** Resolve each entry-round BracketSlot to its concrete [home, away] participants. */
function resolveEntryParticipants(
  bracket: Tournament['bracket'],
  groupOrders: Record<GroupId, TeamId[]>,
  rankedThirds: TeamId[],
): Map<BracketMatchKey, [TeamId, TeamId]> {
  const participantsByMatch = new Map<BracketMatchKey, [TeamId, TeamId]>();
  for (const slot of bracket.slots) {
    const home = resolveSlot(slot.home, groupOrders, rankedThirds);
    const away = resolveSlot(slot.away, groupOrders, rankedThirds);
    participantsByMatch.set(slot.match, [home, away]);
  }
  return participantsByMatch;
}

/**
 * Silently drop stale picks for every currently-resolved match. Called after entry resolution
 * (so bad entry picks don't corrupt later rounds) and again after progression/bronze resolution.
 */
function dropStalePicks(
  pickByKey: Map<BracketMatchKey, TeamId>,
  participantsByMatch: Map<BracketMatchKey, [TeamId, TeamId]>,
): void {
  for (const [key, [home, away]] of participantsByMatch) {
    if (isPickStale(pickByKey.get(key), home, away)) {
      pickByKey.delete(key);
    }
  }
}

/**
 * Propagate winner picks through non-bronze progression matches.
 *
 * Progression convention: for every match EXCEPT bronzeMatch, participants = WINNERS of the
 * `from` matches. Iterate in declaration order (valid topo order: R32 → R16 → QF → SF → Final).
 * If any prerequisite pick is absent the match is skipped — partial cards are normal during card
 * creation. Bronze is resolved separately (its participants are SF losers).
 */
function propagateProgressionWinners(
  bracket: Tournament['bracket'],
  pickByKey: Map<BracketMatchKey, TeamId>,
  participantsByMatch: Map<BracketMatchKey, [TeamId, TeamId]>,
): void {
  for (const prog of bracket.progression) {
    if (prog.match === bracket.bronzeMatch) continue;

    const maybeParticipants = prog.from.map((fromKey) => pickByKey.get(fromKey));
    if (maybeParticipants.some((p) => p === undefined)) continue;

    const participants = maybeParticipants as TeamId[];
    if (participants.length !== 2) {
      throw new Error(`Expected 2 participants for "${prog.match}", got ${participants.length}`);
    }
    participantsByMatch.set(prog.match, [participants[0]!, participants[1]!]);
  }
}

/**
 * Resolve bronze-match participants from the two SF losers (the fixed cup convention).
 * Does nothing until both semifinals are resolved (participants known and a winner picked).
 */
function resolveBronzeParticipants(
  bracket: Tournament['bracket'],
  pickByKey: Map<BracketMatchKey, TeamId>,
  participantsByMatch: Map<BracketMatchKey, [TeamId, TeamId]>,
): void {
  const bronzeProg = bracket.progression.find((p) => p.match === bracket.bronzeMatch);
  if (!bronzeProg) return;

  const losers: TeamId[] = [];
  for (const sfKey of bronzeProg.from) {
    const pair = participantsByMatch.get(sfKey);
    const winner = pickByKey.get(sfKey);
    if (!pair || !winner) break; // SF not yet resolved — skip bronze too
    const [sfHome, sfAway] = pair;
    losers.push(winner === sfHome ? sfAway : sfHome);
  }
  if (losers.length === 2) {
    participantsByMatch.set(bracket.bronzeMatch, [losers[0]!, losers[1]!]);
  }
}

/** The loser of a match, or null when participants or a winner pick are absent. */
function loserOf(
  participantsByMatch: Map<BracketMatchKey, [TeamId, TeamId]>,
  pickByKey: Map<BracketMatchKey, TeamId>,
  matchKey: BracketMatchKey,
): TeamId | null {
  const pair = participantsByMatch.get(matchKey);
  if (!pair) return null;
  const winner = pickByKey.get(matchKey);
  if (!winner) return null;
  const [home, away] = pair;
  return winner === home ? away : home;
}

/** All resolved teams across the given matches, in slot order (home then away). */
function teamsInMatches(
  participantsByMatch: Map<BracketMatchKey, [TeamId, TeamId]>,
  keys: BracketMatchKey[],
): TeamId[] {
  return keys.flatMap((key) => participantsByMatch.get(key) ?? []);
}

/** The picked winners of the given matches (only those with a pick), in match order. */
function pickedWinnersOf(
  pickByKey: Map<BracketMatchKey, TeamId>,
  keys: BracketMatchKey[],
): TeamId[] {
  return keys.flatMap((key) => {
    const winner = pickByKey.get(key);
    return winner ? [winner] : [];
  });
}

/** The SF losers (only those resolved) — the bronze pair. */
function sfLosers(
  bracket: Tournament['bracket'],
  participantsByMatch: Map<BracketMatchKey, [TeamId, TeamId]>,
  pickByKey: Map<BracketMatchKey, TeamId>,
): TeamId[] {
  return bracket.semiFinals.flatMap((sfKey) => {
    const loser = loserOf(participantsByMatch, pickByKey, sfKey);
    return loser ? [loser] : [];
  });
}

/**
 * Resolves the winner of a Final/Bronze match: the explicit pick if present (this is also the
 * only way a tied scoreline can register a winner — see the finish-score fallback below), else
 * the finish-score snapshot when it unambiguously implies one (both team ids known, goals not
 * tied). Mirrors the precedence of the web layer's `resolveFinaleWinner`
 * (apps/web/src/features/results/domain/finale-winner.ts) — kept in sync deliberately, since both
 * must treat "no explicit pick" the same way for the UI and scoring engine to agree.
 */
function resolveFinaleWinner(
  pickByKey: Map<BracketMatchKey, TeamId>,
  finishScore: FinishScore | undefined,
  matchKey: BracketMatchKey,
): TeamId | null {
  const picked = pickByKey.get(matchKey);
  if (picked) return picked;
  if (
    finishScore?.homeTeamId != null &&
    finishScore.awayTeamId != null &&
    finishScore.home !== finishScore.away
  ) {
    return finishScore.home > finishScore.away ? finishScore.homeTeamId : finishScore.awayTeamId;
  }
  return null;
}

/**
 * Resolves the loser given a known winner: prefers the resolved bracket participants (existing
 * behavior — requires the winner to actually be one of the two participants), else falls back to
 * "the other finish-score snapshot team" when the winner came from the snapshot itself.
 */
function resolveFinaleLoser(
  participantsByMatch: Map<BracketMatchKey, [TeamId, TeamId]>,
  finishScore: FinishScore | undefined,
  matchKey: BracketMatchKey,
  winner: TeamId,
): TeamId | null {
  const pair = participantsByMatch.get(matchKey);
  if (pair) {
    const [home, away] = pair;
    if (winner === home) return away;
    if (winner === away) return home;
  }
  if (finishScore?.homeTeamId != null && finishScore.awayTeamId != null) {
    if (winner === finishScore.homeTeamId) return finishScore.awayTeamId;
    if (winner === finishScore.awayTeamId) return finishScore.homeTeamId;
  }
  return null;
}

/**
 * topFour = [finalWinner, finalLoser, bronzeWinner, bronzeLoser].
 * Only includes positions that are fully resolved; may be shorter than 4 for partial cards.
 * Used for the Predict page's ordered "predicted final standings" display, and for scoring the
 * Top Four position bonus.
 */
function deriveTopFour(
  bracket: Tournament['bracket'],
  participantsByMatch: Map<BracketMatchKey, [TeamId, TeamId]>,
  pickByKey: Map<BracketMatchKey, TeamId>,
  finishScores: { final?: FinishScore; bronze?: FinishScore },
): TeamId[] {
  const topFour: TeamId[] = [];
  const finalWinner = resolveFinaleWinner(pickByKey, finishScores.final, bracket.finalMatch);
  if (finalWinner) {
    topFour.push(finalWinner);
    const finalLoser = resolveFinaleLoser(
      participantsByMatch,
      finishScores.final,
      bracket.finalMatch,
      finalWinner,
    );
    if (finalLoser) topFour.push(finalLoser);
  }
  const bronzeWinner = resolveFinaleWinner(pickByKey, finishScores.bronze, bracket.bronzeMatch);
  if (bronzeWinner) {
    topFour.push(bronzeWinner);
    const bronzeLoser = resolveFinaleLoser(
      participantsByMatch,
      finishScores.bronze,
      bracket.bronzeMatch,
      bronzeWinner,
    );
    if (bronzeLoser) topFour.push(bronzeLoser);
  }
  return topFour;
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

/** The mutable state threaded through the invalidation walk (topo order, one pass). */
interface InvalidationWalk {
  /** Picks still believed valid; an invalidated pick is deleted so dependents cascade. */
  readonly pickMap: Map<BracketMatchKey, TeamId>;
  /** Participants resolved so far, feeding later rounds' progression lookups. */
  readonly participantsByMatch: Map<BracketMatchKey, [TeamId, TeamId]>;
  /** Accumulated keys of picks found to be invalid. */
  readonly invalidKeys: BracketMatchKey[];
}

/**
 * A pick contradicts its match when a participant slot is unknown, or the pick names neither
 * participant. (Callers only invoke this for a present pick, so `pick` is never undefined.)
 */
function pickContradictsParticipants(
  pick: TeamId,
  home: TeamId | undefined,
  away: TeamId | undefined,
): boolean {
  return home === undefined || away === undefined || (pick !== home && pick !== away);
}

/**
 * Record a match's resolved participants (when both are known) and flag+drop its pick if that
 * pick no longer holds. Shared by the entry-slot and progression rounds, whose only difference
 * is how [home, away] are derived. Mutates the walk state.
 */
function resolveMatchAndFlagPick(
  walk: InvalidationWalk,
  match: BracketMatchKey,
  home: TeamId | undefined,
  away: TeamId | undefined,
): void {
  if (home !== undefined && away !== undefined) {
    walk.participantsByMatch.set(match, [home, away]);
  }
  const pick = walk.pickMap.get(match);
  if (pick !== undefined && pickContradictsParticipants(pick, home, away)) {
    walk.invalidKeys.push(match);
    walk.pickMap.delete(match);
  }
}

/** Phase 1: entry-round slots (e.g. R32 / QF depending on tournament). */
function flagEntrySlotPicks(
  bracket: Tournament['bracket'],
  groupOrders: Record<GroupId, TeamId[]>,
  rankedThirds: TeamId[],
  walk: InvalidationWalk,
): void {
  for (const slot of bracket.slots) {
    const home = resolveSlotSafe(slot.home, groupOrders, rankedThirds);
    const away = resolveSlotSafe(slot.away, groupOrders, rankedThirds);
    resolveMatchAndFlagPick(walk, slot.match, home, away);
  }
}

/**
 * Phase 2: progression entries in declaration order (topo: R32→R16→QF→SF→Final), skipping bronze.
 * Participants are the picked WINNERS of the `from` matches.
 */
function flagProgressionPicks(bracket: Tournament['bracket'], walk: InvalidationWalk): void {
  for (const prog of bracket.progression) {
    if (prog.match === bracket.bronzeMatch) continue;
    const home = prog.from[0] != null ? walk.pickMap.get(prog.from[0]) : undefined;
    const away = prog.from[1] != null ? walk.pickMap.get(prog.from[1]) : undefined;
    resolveMatchAndFlagPick(walk, prog.match, home, away);
  }
}

/** The resolved SF losers feeding the bronze match (only those whose SF is resolved). */
function bronzeParticipantsFromSfLosers(bronzeProg: Progression, walk: InvalidationWalk): TeamId[] {
  const losers: TeamId[] = [];
  for (const sfKey of bronzeProg.from) {
    const sfPair = walk.participantsByMatch.get(sfKey);
    const sfWinner = walk.pickMap.get(sfKey);
    if (sfPair !== undefined && sfWinner !== undefined) {
      losers.push(sfWinner === sfPair[0] ? sfPair[1] : sfPair[0]);
    }
  }
  return losers;
}

/** Phase 3: bronze — participants are SF losers (not winners), so it needs its own resolution. */
function flagBronzePick(bracket: Tournament['bracket'], walk: InvalidationWalk): void {
  const bronzeProg = bracket.progression.find((p) => p.match === bracket.bronzeMatch);
  if (!bronzeProg) return;

  const bronzeParticipants = bronzeParticipantsFromSfLosers(bronzeProg, walk);
  const bronzePick = walk.pickMap.get(bracket.bronzeMatch);
  if (
    bronzePick !== undefined &&
    (bronzeParticipants.length < 2 || !bronzeParticipants.includes(bronzePick))
  ) {
    walk.invalidKeys.push(bracket.bronzeMatch);
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

  const walk: InvalidationWalk = {
    pickMap: new Map<BracketMatchKey, TeamId>(
      existingPicks.map((p) => [p.bracketMatchKey, p.winner]),
    ),
    participantsByMatch: new Map<BracketMatchKey, [TeamId, TeamId]>(),
    invalidKeys: [],
  };

  flagEntrySlotPicks(bracket, newGroupOrders, rankedThirds, walk);
  flagProgressionPicks(bracket, walk);
  flagBronzePick(bracket, walk);

  return walk.invalidKeys;
}
