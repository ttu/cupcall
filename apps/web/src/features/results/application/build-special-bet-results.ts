import type { MatchRow, PoolSpecialBet } from '@cup/db';
import { getSpecialBetDefs } from '@cup/engine';
import type {
  Tournament,
  ActualResults,
  CardInputs,
  SpecialBetDef,
  BetInputKind,
} from '@cup/engine';
import type { SpecialBetResultRow, SpecialBetPoolStats, CurrentLeader } from '../domain/types';
import {
  computeGroupTopScoringLeader,
  computeGroupTopConcedingLeader,
  computeTournamentTopScoringLeader,
  computeTournamentTopConcedingLeader,
  computeHighestMatchGoalsLeader,
  computePenaltyShootoutCountLeader,
} from '../domain/special-bet-current';
import { computeSpecialBetImpossibility } from '../domain/special-bet-impossibility';
import type { SpecialBetImpossibility } from '../domain/special-bet-impossibility';

/** Special bets whose correct answer can be tied between multiple values (results.json stores
 * these as arrays); every other bet key stores a single scalar answer. */
const ARRAY_ANSWER_BET_KEYS = new Set<string>([
  'groupTopScoringTeam',
  'groupTopConcedingTeam',
  'tournamentTopScoringTeam',
  'tournamentTopConcedingTeam',
  'mostYellowCardsTeam',
  'topScorerPlayer',
]);

type ActualRawResolution = { actualRaw: unknown; actualArray: unknown[] | undefined };
type DisplayValue = string | number | boolean | null;
type DisplayResolver = (raw: unknown) => DisplayValue;

function resolveActualRaw(
  d: SpecialBetDef,
  actual: ActualResults,
  isArrayAnswerBet: boolean,
): ActualRawResolution {
  if (d.key === 'finalDecidedByPenalties') {
    const actualRaw =
      actual.finalMatch !== undefined ? actual.finalMatch.decidedBy === 'penalties' : undefined;
    return { actualRaw, actualArray: undefined };
  }
  if (d.key === 'finalDecisiveGoalPlayer') {
    return { actualRaw: actual.finalMatch?.decisiveGoalPlayer, actualArray: undefined };
  }
  if (isArrayAnswerBet) {
    const actualArray = (actual.answers as Record<string, unknown[]>)[d.key];
    // For display purposes, use the array itself as the "raw" value.
    return { actualRaw: actualArray, actualArray };
  }
  return {
    actualRaw: (actual.answers as Record<string, unknown>)[d.key],
    actualArray: undefined,
  };
}

// Intentionally polymorphic: a single value, or " / "-joined ties for array-answer bets.
// eslint-disable-next-line sonarjs/function-return-type
function resolveActualAnswerDisplay(
  isArrayAnswerBet: boolean,
  actualArray: unknown[] | undefined,
  actualRaw: unknown,
  display: DisplayResolver,
): DisplayValue {
  if (!isArrayAnswerBet) return display(actualRaw);
  // For array bets, join multiple correct answers (ties) with " / ".
  if (!actualArray || actualArray.length === 0) return null;
  return actualArray.map((v) => display(v) ?? String(v)).join(' / ');
}

type HitOutcome = { hit: SpecialBetResultRow['hit']; pointsAwarded: number };

function computeArrayBetHit(
  userRaw: unknown,
  actualArray: unknown[] | undefined,
  points: number,
): HitOutcome {
  if (!actualArray || actualArray.length === 0) return { hit: 'pending', pointsAwarded: 0 };
  const userPicked = userRaw !== undefined && userRaw !== null && actualArray.includes(userRaw);
  return userPicked ? { hit: 'hit', pointsAwarded: points } : { hit: 'missed', pointsAwarded: 0 };
}

function computeScalarBetHit(userRaw: unknown, actualRaw: unknown, points: number): HitOutcome {
  if (actualRaw === undefined || actualRaw === null) return { hit: 'pending', pointsAwarded: 0 };
  const userPicked = userRaw !== undefined && userRaw !== null && userRaw === actualRaw;
  return userPicked ? { hit: 'hit', pointsAwarded: points } : { hit: 'missed', pointsAwarded: 0 };
}

/** A pending pick that's already mathematically guaranteed to lose (the picked team is done
 * playing, or a monotonic counter already passed the guess) shows as missed without waiting
 * for the official results.json answer — see special-bet-impossibility.ts. */
function isPendingPickAlreadyImpossible(
  hit: SpecialBetResultRow['hit'],
  userRaw: unknown,
  key: string,
  impossibility: SpecialBetImpossibility,
): boolean {
  return (
    hit === 'pending' &&
    userRaw !== undefined &&
    userRaw !== null &&
    impossibility.isImpossible(key, userRaw)
  );
}

function scalarAnswerTeamIds(
  kind: BetInputKind,
  actualRaw: unknown,
  playerTeamMap: Map<string, string>,
): string[] {
  if (kind === 'team' && actualRaw != null) return [String(actualRaw)];
  if (kind === 'player' && actualRaw != null) {
    const tid = playerTeamMap.get(String(actualRaw));
    return tid ? [tid] : [];
  }
  return [];
}

function arrayAnswerTeamIds(
  kind: BetInputKind,
  actualArray: unknown[],
  playerTeamMap: Map<string, string>,
): string[] {
  return actualArray.flatMap((v) => {
    if (kind === 'team') return [String(v)];
    if (kind === 'player') {
      const tid = playerTeamMap.get(String(v));
      return tid ? [tid] : [];
    }
    return [];
  });
}

/** Collects the correct team ID(s) for badge display — multiple entries when the answer is a tie. */
function computeActualAnswerTeamIds(
  d: SpecialBetDef,
  isArrayAnswerBet: boolean,
  actualArray: unknown[] | undefined,
  actualRaw: unknown,
  playerTeamMap: Map<string, string>,
): string[] {
  if (isArrayAnswerBet && actualArray && actualArray.length > 0) {
    return arrayAnswerTeamIds(d.kind, actualArray, playerTeamMap);
  }
  return scalarAnswerTeamIds(d.kind, actualRaw, playerTeamMap);
}

function resolveUserPickTeamId(
  kind: BetInputKind,
  userRaw: unknown,
  playerTeamMap: Map<string, string>,
): string | null {
  if (kind === 'team' && userRaw != null) return String(userRaw);
  if (kind === 'player' && userRaw != null) return playerTeamMap.get(String(userRaw)) ?? null;
  return null;
}

type SpecialBetResultContext = {
  def: Tournament;
  matches: MatchRow[];
  poolSpecialBets: PoolSpecialBet[];
  teamMap: Map<string, string>;
  playerMap: Map<string, string>;
  playerTeamMap: Map<string, string>;
  impossibility: SpecialBetImpossibility;
};

function buildSpecialBetResultRow(
  d: SpecialBetDef,
  specials: Record<string, unknown>,
  actual: ActualResults,
  ctx: SpecialBetResultContext,
): SpecialBetResultRow {
  const { def, matches, poolSpecialBets, teamMap, playerMap, playerTeamMap, impossibility } = ctx;
  const userRaw = specials[d.key];
  const isArrayAnswerBet = ARRAY_ANSWER_BET_KEYS.has(d.key);

  const { actualRaw, actualArray } = resolveActualRaw(d, actual, isArrayAnswerBet);

  const display = makeDisplayResolver(d.kind, teamMap, playerMap);
  const userPickDisplay = display(userRaw);
  const actualAnswerDisplay = resolveActualAnswerDisplay(
    isArrayAnswerBet,
    actualArray,
    actualRaw,
    display,
  );

  let { hit, pointsAwarded } = isArrayAnswerBet
    ? computeArrayBetHit(userRaw, actualArray, d.points)
    : computeScalarBetHit(userRaw, actualRaw, d.points);

  if (isPendingPickAlreadyImpossible(hit, userRaw, d.key, impossibility)) {
    hit = 'missed';
    pointsAwarded = 0;
  }

  const currentLeader: CurrentLeader | null =
    hit === 'pending' ? computeCurrentLeaderFor(d.key, def, matches) : null;

  const poolStats = computeSpecialBetPoolStats(
    d.key,
    d.kind,
    poolSpecialBets,
    teamMap,
    playerMap,
    playerTeamMap,
  );

  const actualAnswerTeamIds = computeActualAnswerTeamIds(
    d,
    isArrayAnswerBet,
    actualArray,
    actualRaw,
    playerTeamMap,
  );

  return {
    key: d.key,
    label: d.label,
    kind: d.kind,
    points: d.points,
    userPickDisplay,
    actualAnswerDisplay,
    userPickTeamId: resolveUserPickTeamId(d.kind, userRaw, playerTeamMap),
    actualAnswerTeamIds,
    hit,
    pointsAwarded,
    currentLeader,
    poolStats,
  };
}

export function buildSpecialBetResults(
  def: Tournament,
  inputs: CardInputs | null,
  actual: ActualResults,
  matches: MatchRow[],
  poolSpecialBets: PoolSpecialBet[],
): SpecialBetResultRow[] {
  const teamMap = new Map<string, string>(def.teams.map((t) => [t.id, t.name]));
  const playerMap = new Map<string, string>(def.players.map((p) => [p.id, p.name]));
  const playerTeamMap = new Map<string, string>(def.players.map((p) => [p.id, p.team]));
  const defs = getSpecialBetDefs(def.scoring);
  const specials = (inputs?.specials ?? {}) as Record<string, unknown>;
  const impossibility = computeSpecialBetImpossibility(def, matches);

  const ctx: SpecialBetResultContext = {
    def,
    matches,
    poolSpecialBets,
    teamMap,
    playerMap,
    playerTeamMap,
    impossibility,
  };

  return defs.map((d) => buildSpecialBetResultRow(d, specials, actual, ctx));
}

function computeSpecialBetPoolStats(
  betKey: string,
  kind: 'player' | 'team' | 'number' | 'bool',
  poolSpecialBets: PoolSpecialBet[],
  teamMap: Map<string, string>,
  playerMap: Map<string, string>,
  playerTeamMap: Map<string, string>,
): SpecialBetPoolStats | null {
  const forKey = poolSpecialBets.filter((s) => s.betKey === betKey);
  if (forKey.length === 0) return null;

  const total = forKey.length;
  const counts = new Map<string, number>();
  for (const s of forKey) {
    const key = String(s.value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries()).sort(([, a], [, b]) => b - a);

  const topValues = sorted.map(([rawKey, count]) => {
    const typedVal: unknown =
      kind === 'bool' ? rawKey === 'true' : kind === 'number' ? Number(rawKey) : rawKey;

    const display = makeDisplayResolver(kind, teamMap, playerMap)(typedVal);
    const displayValue =
      display === null
        ? '?'
        : typeof display === 'boolean'
          ? display
            ? 'Yes'
            : 'No'
          : String(display);

    const teamId =
      kind === 'team' ? rawKey : kind === 'player' ? (playerTeamMap.get(rawKey) ?? null) : null;

    return { displayValue, count, pct: Math.round((count / total) * 100), teamId };
  });

  return { totalPredictions: total, topValues };
}

function computeCurrentLeaderFor(
  key: string,
  def: Tournament,
  matches: MatchRow[],
): CurrentLeader | null {
  switch (key) {
    case 'groupTopScoringTeam':
      return computeGroupTopScoringLeader(def, matches);
    case 'groupTopConcedingTeam':
      return computeGroupTopConcedingLeader(def, matches);
    case 'tournamentTopScoringTeam':
      return computeTournamentTopScoringLeader(def, matches);
    case 'tournamentTopConcedingTeam':
      return computeTournamentTopConcedingLeader(def, matches);
    case 'highestMatchGoals':
      return computeHighestMatchGoalsLeader(matches);
    case 'penaltyShootoutCount':
      return computePenaltyShootoutCountLeader(matches);
    default:
      return null;
  }
}

function makeDisplayResolver(
  kind: 'player' | 'team' | 'number' | 'bool',
  teamMap: Map<string, string>,
  playerMap: Map<string, string>,
): DisplayResolver {
  // Intentionally polymorphic: the return type tracks `kind`, not a bug.
  // eslint-disable-next-line sonarjs/function-return-type
  return (raw) => {
    if (raw === undefined || raw === null) return null;
    if (kind === 'team') return teamMap.get(String(raw)) ?? String(raw);
    if (kind === 'player') return playerMap.get(String(raw)) ?? String(raw);
    if (kind === 'bool') return raw as boolean;
    return raw as number;
  };
}
