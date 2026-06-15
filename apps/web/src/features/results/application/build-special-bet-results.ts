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

  return defs.map((d) => {
    const userRaw = specials[d.key];

    let actualRaw: unknown;
    if (d.key === 'finalDecidedByPenalties') {
      actualRaw =
        actual.finalMatch !== undefined ? actual.finalMatch.decidedBy === 'penalties' : undefined;
    } else if (d.key === 'finalDecisiveGoalPlayer') {
      actualRaw = actual.finalMatch?.decisiveGoalPlayer;
    } else {
      actualRaw = (actual.answers as Record<string, unknown>)[d.key];
    }

    const userPickDisplay = resolveSpecialDisplay(userRaw, d.kind, teamMap, playerMap);
    const actualAnswerDisplay = resolveSpecialDisplay(actualRaw, d.kind, teamMap, playerMap);

    let hit: SpecialBetResultRow['hit'];
    let pointsAwarded: number;

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
      actualAnswerTeamId:
        d.kind === 'team' && actualRaw != null
          ? String(actualRaw)
          : d.kind === 'player' && actualRaw != null
            ? (playerTeamMap.get(String(actualRaw)) ?? null)
            : null,
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

    const display = resolveSpecialDisplay(typedVal, kind, teamMap, playerMap);
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

function resolveSpecialDisplay(
  raw: unknown,
  kind: 'player' | 'team' | 'number' | 'bool',
  teamMap: Map<string, string>,
  playerMap: Map<string, string>,
): string | number | boolean | null {
  if (raw === undefined || raw === null) return null;
  if (kind === 'team') return teamMap.get(String(raw)) ?? String(raw);
  if (kind === 'player') return playerMap.get(String(raw)) ?? String(raw);
  if (kind === 'bool') return raw as boolean;
  return raw as number;
}
