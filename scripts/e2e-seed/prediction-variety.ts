import { deriveGroupOrders, selectQualifiers, resolveSlot } from '@cup/engine';
import type {
  Tournament,
  GroupScore,
  TeamId,
  PlayerId,
  BracketMatchKey,
  MatchId,
} from '@cup/engine';

export type Rng = () => number;

/** Deterministic PRNG (mulberry32) — same seed always produces the same sequence. */
export function mulberry32(seed: number): Rng {
  let a = seed;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedChoice<T>(rng: Rng, items: ReadonlyArray<readonly [T, number]>): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let r = rng() * total;
  for (const [item, w] of items) {
    if (r < w) return item;
    r -= w;
  }
  return items[items.length - 1]![0];
}

// Weighted scoreline table built from real production group-score prediction frequencies
// (11 predictions, 1 pool, queried read-only — see docs/superpowers/specs/2026-07-13-e2e-test-data-design.md).
const GROUP_SCORELINE_WEIGHTS: ReadonlyArray<readonly [{ home: number; away: number }, number]> = [
  [{ home: 2, away: 0 }, 116],
  [{ home: 2, away: 1 }, 92],
  [{ home: 1, away: 1 }, 91],
  [{ home: 0, away: 2 }, 74],
  [{ home: 1, away: 2 }, 66],
  [{ home: 3, away: 0 }, 56],
  [{ home: 0, away: 1 }, 47],
  [{ home: 1, away: 0 }, 40],
  [{ home: 0, away: 3 }, 38],
  [{ home: 3, away: 1 }, 37],
  [{ home: 2, away: 2 }, 31],
  [{ home: 4, away: 0 }, 27],
  [{ home: 1, away: 3 }, 24],
  [{ home: 0, away: 0 }, 16],
  [{ home: 5, away: 0 }, 7],
  [{ home: 4, away: 1 }, 6],
  [{ home: 0, away: 4 }, 5],
  [{ home: 0, away: 5 }, 4],
  [{ home: 6, away: 0 }, 3],
  [{ home: 2, away: 4 }, 2],
];

export function generateGroupScores(
  rng: Rng,
  groupMatches: ReadonlyArray<{ id: MatchId }>,
): Array<{ matchId: MatchId; home: number; away: number }> {
  return groupMatches.map((m) => {
    const { home, away } = weightedChoice(rng, GROUP_SCORELINE_WEIGHTS);
    return { matchId: m.id, home, away };
  });
}

/**
 * Picks between `home`/`away`, favoring whichever team has the lower `fifaRanking` (stronger)
 * about 75% of the time — matching the ~75/25 favorite/upset split seen in real bracket picks.
 * Falls back to a 50/50 coin flip when either team's ranking is unknown.
 */
export function pickWinnerBiased(
  rng: Rng,
  teams: ReadonlyArray<{ id: TeamId; fifaRanking?: number | undefined }>,
  home: TeamId,
  away: TeamId,
): TeamId {
  const byId = new Map(teams.map((t) => [t.id, t.fifaRanking]));
  const homeRank = byId.get(home);
  const awayRank = byId.get(away);
  if (homeRank === undefined || awayRank === undefined || homeRank === awayRank) {
    return rng() < 0.5 ? home : away;
  }
  const favorite = homeRank < awayRank ? home : away;
  const underdog = favorite === home ? away : home;
  return rng() < 0.75 ? favorite : underdog;
}

export interface BracketPick {
  bracketMatchKey: BracketMatchKey;
  home: TeamId;
  away: TeamId;
  winner: TeamId;
}

/**
 * Walks the bracket the same way `packages/engine/src/bracket.ts`'s `buildBracket` does
 * (entry-round slots, then progression in declaration order, bronze from SF losers), but always
 * produces a full, internally-consistent set of picks — one winner per match, immediately.
 */
export function generateBracketPicks(
  rng: Rng,
  tournament: Tournament,
  groupScores: GroupScore[],
): BracketPick[] {
  const groupOrders = deriveGroupOrders(tournament, groupScores);
  const qualifiers = selectQualifiers(tournament, groupScores, groupOrders);
  const autoCount = tournament.groups.length * tournament.qualification.autoQualifyPerGroup;
  const rankedThirds = qualifiers.slice(autoCount);

  const participants = new Map<BracketMatchKey, [TeamId, TeamId]>();
  const winners = new Map<BracketMatchKey, TeamId>();
  const picks: BracketPick[] = [];

  const decide = (home: TeamId, away: TeamId): TeamId =>
    pickWinnerBiased(rng, tournament.teams, home, away);

  for (const slot of tournament.bracket.slots) {
    const home = resolveSlot(slot.home, groupOrders, rankedThirds);
    const away = resolveSlot(slot.away, groupOrders, rankedThirds);
    participants.set(slot.match, [home, away]);
    const winner = decide(home, away);
    winners.set(slot.match, winner);
    picks.push({ bracketMatchKey: slot.match, home, away, winner });
  }

  for (const prog of tournament.bracket.progression) {
    if (prog.match === tournament.bracket.bronzeMatch) continue;
    const [fromA, fromB] = prog.from;
    const home = winners.get(fromA!)!;
    const away = winners.get(fromB!)!;
    participants.set(prog.match, [home, away]);
    const winner = decide(home, away);
    winners.set(prog.match, winner);
    picks.push({ bracketMatchKey: prog.match, home, away, winner });
  }

  const bronzeProg = tournament.bracket.progression.find(
    (p) => p.match === tournament.bracket.bronzeMatch,
  );
  if (bronzeProg) {
    const losers = bronzeProg.from.map((sfKey) => {
      const [home, away] = participants.get(sfKey)!;
      const winner = winners.get(sfKey)!;
      return winner === home ? away : home;
    });
    const [home, away] = [losers[0]!, losers[1]!];
    const winner = decide(home, away);
    picks.push({ bracketMatchKey: tournament.bracket.bronzeMatch, home, away, winner });
  }

  return picks;
}

/** Winner strictly outscores the loser by 1-3 goals — no draws in a decisive knockout match. */
export function generateFinishScore(rng: Rng, pick: BracketPick): { home: number; away: number } {
  const winnerGoals = 1 + Math.floor(rng() * 3);
  const loserGoals = Math.floor(rng() * winnerGoals);
  return pick.winner === pick.home
    ? { home: winnerGoals, away: loserGoals }
    : { home: loserGoals, away: winnerGoals };
}

const HIGHEST_MATCH_GOALS_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [4, 1],
  [5, 3],
  [6, 5],
  [7, 1],
  [8, 1],
];

const PENALTY_SHOOTOUT_COUNT_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [2, 1],
  [3, 1],
  [4, 3],
  [5, 3],
  [6, 1],
  [7, 1],
  [8, 1],
];

function pickTeamBet(rng: Rng, tournament: Tournament): TeamId {
  const ranked = [...tournament.teams].sort(
    (a, b) => (a.fifaRanking ?? 999) - (b.fifaRanking ?? 999),
  );
  const topTeams = ranked.slice(0, 8);
  const pool = rng() < 0.7 ? topTeams : tournament.teams;
  return pool[Math.floor(rng() * pool.length)]!.id;
}

function pickPlayerBet(rng: Rng, tournament: Tournament): PlayerId {
  const ranked = [...tournament.teams].sort(
    (a, b) => (a.fifaRanking ?? 999) - (b.fifaRanking ?? 999),
  );
  const topTeamIds = new Set(ranked.slice(0, 8).map((t) => t.id));
  const topPlayers = tournament.players.filter((p) => topTeamIds.has(p.team));
  const pool = rng() < 0.7 && topPlayers.length > 0 ? topPlayers : tournament.players;
  return pool[Math.floor(rng() * pool.length)]!.id;
}

/** All 11 special-bet keys (see `SPECIAL_BET_KINDS` in `@cup/engine`), weighted toward realistic answers. */
export function generateSpecials(
  rng: Rng,
  tournament: Tournament,
): Record<string, string | number | boolean> {
  return {
    topScorerPlayer: pickPlayerBet(rng, tournament),
    finalDecisiveGoalPlayer: pickPlayerBet(rng, tournament),
    firstRedCardPlayer: pickPlayerBet(rng, tournament),
    mostYellowCardsTeam: pickTeamBet(rng, tournament),
    groupTopScoringTeam: pickTeamBet(rng, tournament),
    groupTopConcedingTeam: pickTeamBet(rng, tournament),
    tournamentTopScoringTeam: pickTeamBet(rng, tournament),
    tournamentTopConcedingTeam: pickTeamBet(rng, tournament),
    highestMatchGoals: weightedChoice(rng, HIGHEST_MATCH_GOALS_WEIGHTS),
    penaltyShootoutCount: weightedChoice(rng, PENALTY_SHOOTOUT_COUNT_WEIGHTS),
    finalDecidedByPenalties: rng() < 0.3,
  };
}
