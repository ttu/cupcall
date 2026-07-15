import { eq, and, isNotNull } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema/index';
import {
  teamId,
  playerId,
  matchId,
  type ActualResults,
  type TeamId,
  type PlayerId,
  type GroupId,
  type TournamentId,
} from '@cup/engine';

type Database = Db<typeof schema>;

/**
 * Assembles ActualResults from the DB for the given tournament.
 * Used by rescore pipelines after any mutation or sync.
 */
export async function getActualResults(
  db: Database,
  tournamentId: TournamentId,
): Promise<ActualResults> {
  const [allCompletedMatchRows, groupOrderRows, answerRows] = await Promise.all([
    db
      .select()
      .from(schema.matches)
      .where(
        and(
          eq(schema.matches.tournamentId, tournamentId),
          isNotNull(schema.matches.homeGoals),
          isNotNull(schema.matches.awayGoals),
        ),
      ),
    db
      .select()
      .from(schema.actualGroupOrder)
      .where(eq(schema.actualGroupOrder.tournamentId, tournamentId)),
    db
      .select()
      .from(schema.actualAnswers)
      .where(eq(schema.actualAnswers.tournamentId, tournamentId)),
  ]);

  const completedGroupMatches = allCompletedMatchRows.filter((r) => r.stage === 'group');

  const matchResults = completedGroupMatches.map((r) => ({
    matchId: matchId(r.id),
    home: r.homeGoals!,
    away: r.awayGoals!,
    ...(r.homeConduct !== null && { homeConduct: r.homeConduct }),
    ...(r.awayConduct !== null && { awayConduct: r.awayConduct }),
  }));

  const groupOrder: Record<GroupId, TeamId[]> = {};
  for (const row of groupOrderRows) {
    const gid = row.groupId as GroupId;
    if (!groupOrder[gid]) groupOrder[gid] = [];
    groupOrder[gid][row.position - 1] = teamId(row.teamId);
  }

  const answerMap = new Map(answerRows.map((r) => [r.betKey, r.value]));

  const getPlayerId = (key: string): PlayerId | undefined => {
    const v = answerMap.get(key);
    return typeof v === 'string' ? playerId(v) : undefined;
  };
  const getNum = (key: string): number | undefined => {
    const v = answerMap.get(key);
    return typeof v === 'number' ? v : undefined;
  };
  // Handles both single string (legacy) and array — always returns TeamId[].
  const getTeamIds = (key: string): TeamId[] | undefined => {
    const v = answerMap.get(key);
    if (Array.isArray(v)) return (v as string[]).map((s) => teamId(s));
    if (typeof v === 'string') return [teamId(v)];
    return undefined;
  };
  // Handles both single string (legacy) and array — always returns PlayerId[].
  const getPlayerIds = (key: string): PlayerId[] | undefined => {
    const v = answerMap.get(key);
    if (Array.isArray(v)) return (v as string[]).map((s) => playerId(s));
    if (typeof v === 'string') return [playerId(v)];
    return undefined;
  };

  // bronzeMatch and finalMatch are stored as structured JSON objects in actualAnswers
  const rawBronze = answerMap.get('bronzeMatch') as Record<string, unknown> | undefined;
  const rawFinal = answerMap.get('finalMatch') as Record<string, unknown> | undefined;

  const bronzeMatch: ActualResults['bronzeMatch'] = rawBronze
    ? {
        home: teamId(rawBronze.home as string),
        away: teamId(rawBronze.away as string),
        homeGoals: rawBronze.homeGoals as number,
        awayGoals: rawBronze.awayGoals as number,
      }
    : undefined;

  const rawFinalDecidedBy = rawFinal?.decidedBy as
    | 'regulation'
    | 'extraTime'
    | 'penalties'
    | undefined;
  const rawFinalDecisivePlayer = rawFinal?.decisiveGoalPlayer;
  const finalDecisiveGoalPlayer =
    typeof rawFinalDecisivePlayer === 'string' ? playerId(rawFinalDecisivePlayer) : undefined;

  const finalMatch: ActualResults['finalMatch'] = rawFinal
    ? {
        home: teamId(rawFinal.home as string),
        away: teamId(rawFinal.away as string),
        homeGoals: rawFinal.homeGoals as number,
        awayGoals: rawFinal.awayGoals as number,
        ...(rawFinalDecidedBy !== undefined ? { decidedBy: rawFinalDecidedBy } : {}),
        ...(finalDecisiveGoalPlayer !== undefined
          ? { decisiveGoalPlayer: finalDecisiveGoalPlayer }
          : {}),
      }
    : undefined;

  const roundOf16 = getTeamIds('roundOf16');
  const roundOf8 = getTeamIds('roundOf8');
  const roundOf4 = getTeamIds('roundOf4');
  const finalists = getTeamIds('finalists');
  const groupTopScoringTeam = getTeamIds('groupTopScoringTeam');
  const groupTopConcedingTeam = getTeamIds('groupTopConcedingTeam');
  const tournamentTopScoringTeam = getTeamIds('tournamentTopScoringTeam');
  const tournamentTopConcedingTeam = getTeamIds('tournamentTopConcedingTeam');
  const highestMatchGoals = getNum('highestMatchGoals');
  const mostYellowCardsTeam = getTeamIds('mostYellowCardsTeam');
  const firstRedCardPlayer = getPlayerId('firstRedCardPlayer');
  const penaltyShootoutCount = getNum('penaltyShootoutCount');
  const topScorerPlayer = getPlayerIds('topScorerPlayer');

  return {
    matchResults,
    groupOrder,
    ...(bronzeMatch !== undefined ? { bronzeMatch } : {}),
    ...(finalMatch !== undefined ? { finalMatch } : {}),
    answers: {
      ...(roundOf16 !== undefined ? { roundOf16 } : {}),
      ...(roundOf8 !== undefined ? { roundOf8 } : {}),
      ...(roundOf4 !== undefined ? { roundOf4 } : {}),
      ...(finalists !== undefined ? { finalists } : {}),
      ...(groupTopScoringTeam !== undefined ? { groupTopScoringTeam } : {}),
      ...(groupTopConcedingTeam !== undefined ? { groupTopConcedingTeam } : {}),
      ...(tournamentTopScoringTeam !== undefined ? { tournamentTopScoringTeam } : {}),
      ...(tournamentTopConcedingTeam !== undefined ? { tournamentTopConcedingTeam } : {}),
      ...(highestMatchGoals !== undefined ? { highestMatchGoals } : {}),
      ...(mostYellowCardsTeam !== undefined ? { mostYellowCardsTeam } : {}),
      ...(firstRedCardPlayer !== undefined ? { firstRedCardPlayer } : {}),
      ...(penaltyShootoutCount !== undefined ? { penaltyShootoutCount } : {}),
      ...(topScorerPlayer !== undefined ? { topScorerPlayer } : {}),
    },
  };
}

/** Returns true if the match (group or knockout) has a recorded final score. */
export async function matchHasResult(
  db: Database,
  tournamentId: TournamentId,
  matchId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.matches.id })
    .from(schema.matches)
    .where(
      and(
        eq(schema.matches.tournamentId, tournamentId),
        eq(schema.matches.id, matchId),
        isNotNull(schema.matches.homeGoals),
      ),
    );
  return row !== undefined;
}

/** Returns true if the given special bet key has a recorded answer. */
export async function betKeyHasAnswer(
  db: Database,
  tournamentId: TournamentId,
  betKey: string,
): Promise<boolean> {
  const [row] = await db
    .select({ betKey: schema.actualAnswers.betKey })
    .from(schema.actualAnswers)
    .where(
      and(
        eq(schema.actualAnswers.tournamentId, tournamentId),
        eq(schema.actualAnswers.betKey, betKey),
      ),
    );
  return row !== undefined;
}

/**
 * Returns the set of match IDs (group + knockout) that have a recorded final score.
 * Used by getCardView to compute per-item lock state for late joiners.
 */
export async function getKnownResultMatchIds(
  db: Database,
  tournamentId: TournamentId,
): Promise<Set<string>> {
  const rows = await db
    .select({ id: schema.matches.id })
    .from(schema.matches)
    .where(and(eq(schema.matches.tournamentId, tournamentId), isNotNull(schema.matches.homeGoals)));
  return new Set(rows.map((r) => r.id));
}

/**
 * Returns the set of bet keys that have a recorded answer in actualAnswers.
 * Used by getCardView to compute per-item lock state for late joiners.
 */
export async function getAnsweredBetKeys(
  db: Database,
  tournamentId: TournamentId,
): Promise<Set<string>> {
  const rows = await db
    .select({ betKey: schema.actualAnswers.betKey })
    .from(schema.actualAnswers)
    .where(eq(schema.actualAnswers.tournamentId, tournamentId));
  return new Set(rows.map((r) => r.betKey));
}

/**
 * Returns a map from group match ID to { home, away } goals for all completed group matches.
 * Used to prefill locked group matches for late joiners so their groups count as complete.
 */
export async function getActualGroupMatchScores(
  db: Database,
  tournamentId: TournamentId,
): Promise<Map<string, { home: number; away: number }>> {
  const rows = await db
    .select({
      id: schema.matches.id,
      homeGoals: schema.matches.homeGoals,
      awayGoals: schema.matches.awayGoals,
    })
    .from(schema.matches)
    .where(
      and(
        eq(schema.matches.tournamentId, tournamentId),
        eq(schema.matches.stage, 'group'),
        isNotNull(schema.matches.homeGoals),
        isNotNull(schema.matches.awayGoals),
      ),
    );
  return new Map(rows.map((r) => [r.id, { home: r.homeGoals!, away: r.awayGoals! }]));
}
