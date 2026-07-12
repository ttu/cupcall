import type { MatchRow, PoolSpecialBet } from '@cup/db';
import { getSpecialBetDefs } from '@cup/engine';
import type { Tournament, ActualResults, CardInputs } from '@cup/engine';
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

  return defs.map((d) => {
    const userRaw = specials[d.key];

    // Array-answer bets support ties; single-answer bets stay as scalars.
    const isArrayAnswerBet = [
      'groupTopScoringTeam',
      'groupTopConcedingTeam',
      'tournamentTopScoringTeam',
      'tournamentTopConcedingTeam',
      'mostYellowCardsTeam',
      'topScorerPlayer',
    ].includes(d.key);

    let actualRaw: unknown;
    let actualArray: unknown[] | undefined;

    if (d.key === 'finalDecidedByPenalties') {
      actualRaw =
        actual.finalMatch !== undefined ? actual.finalMatch.decidedBy === 'penalties' : undefined;
    } else if (d.key === 'finalDecisiveGoalPlayer') {
      actualRaw = actual.finalMatch?.decisiveGoalPlayer;
    } else if (isArrayAnswerBet) {
      actualArray = (actual.answers as Record<string, unknown[]>)[d.key];
      // For display purposes, use the first element as the "raw" value only if single
      actualRaw = actualArray;
    } else {
      actualRaw = (actual.answers as Record<string, unknown>)[d.key];
    }

    const display = makeDisplayResolver(d.kind, teamMap, playerMap);
    const userPickDisplay = display(userRaw);

    // For array bets, join multiple correct answers (ties) with " / "
    const actualAnswerDisplay: string | number | boolean | null = isArrayAnswerBet
      ? actualArray && actualArray.length > 0
        ? actualArray.map((v) => display(v) ?? String(v)).join(' / ')
        : null
      : display(actualRaw);

    let hit: SpecialBetResultRow['hit'];
    let pointsAwarded: number;

    if (isArrayAnswerBet) {
      if (!actualArray || actualArray.length === 0) {
        hit = 'pending';
        pointsAwarded = 0;
      } else if (userRaw !== undefined && userRaw !== null && actualArray.includes(userRaw)) {
        hit = 'hit';
        pointsAwarded = d.points;
      } else {
        hit = 'missed';
        pointsAwarded = 0;
      }
    } else {
      if (actualRaw === undefined || actualRaw === null) {
        hit = 'pending';
        pointsAwarded = 0;
      } else if (userRaw !== undefined && userRaw !== null && userRaw === actualRaw) {
        hit = 'hit';
        pointsAwarded = d.points;
      } else {
        hit = 'missed';
        pointsAwarded = 0;
      }
    }

    // A pending pick that's already mathematically guaranteed to lose (the picked team is
    // done playing, or a monotonic counter already passed the guess) shows as missed without
    // waiting for the official results.json answer — see special-bet-impossibility.ts.
    if (
      hit === 'pending' &&
      userRaw !== undefined &&
      userRaw !== null &&
      impossibility.isImpossible(d.key, userRaw)
    ) {
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

    // For array-answer bets, collect all correct team IDs for badge display.
    const actualAnswerTeamIds: string[] =
      isArrayAnswerBet && actualArray && actualArray.length > 0
        ? actualArray.flatMap((v) => {
            if (d.kind === 'team') return [String(v)];
            if (d.kind === 'player') {
              const tid = playerTeamMap.get(String(v));
              return tid ? [tid] : [];
            }
            return [];
          })
        : d.kind === 'team' && actualRaw != null
          ? [String(actualRaw)]
          : d.kind === 'player' && actualRaw != null
            ? (() => {
                const tid = playerTeamMap.get(String(actualRaw));
                return tid ? [tid] : [];
              })()
            : [];

    return {
      key: d.key,
      label: d.label,
      kind: d.kind,
      points: d.points,
      userPickDisplay,
      actualAnswerDisplay,
      userPickTeamId:
        d.kind === 'team' && userRaw != null
          ? String(userRaw)
          : d.kind === 'player' && userRaw != null
            ? (playerTeamMap.get(String(userRaw)) ?? null)
            : null,
      actualAnswerTeamIds,
      hit,
      pointsAwarded,
      currentLeader,
      poolStats,
    };
  });
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
): (raw: unknown) => string | number | boolean | null {
  return (raw) => {
    if (raw === undefined || raw === null) return null;
    if (kind === 'team') return teamMap.get(String(raw)) ?? String(raw);
    if (kind === 'player') return playerMap.get(String(raw)) ?? String(raw);
    if (kind === 'bool') return raw as boolean;
    return raw as number;
  };
}
