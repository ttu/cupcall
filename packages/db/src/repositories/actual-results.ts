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
} from '@cup/engine';

type Database = Db<typeof schema>;

/**
 * Assembles ActualResults from the DB for the given tournament.
 * Used by rescore pipelines after any mutation or sync.
 */
export async function getActualResults(db: Database, tournamentId: string): Promise<ActualResults> {
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
  }));

  const groupOrder: Record<GroupId, TeamId[]> = {};
  for (const row of groupOrderRows) {
    const gid = row.groupId as GroupId;
    if (!groupOrder[gid]) groupOrder[gid] = [];
    groupOrder[gid][row.position - 1] = teamId(row.teamId);
  }

  const answerMap = new Map(answerRows.map((r) => [r.betKey, r.value]));

  const getTeamId = (key: string): TeamId | undefined => {
    const v = answerMap.get(key);
    return typeof v === 'string' ? teamId(v) : undefined;
  };
  const getPlayerId = (key: string): PlayerId | undefined => {
    const v = answerMap.get(key);
    return typeof v === 'string' ? playerId(v) : undefined;
  };
  const getNum = (key: string): number | undefined => {
    const v = answerMap.get(key);
    return typeof v === 'number' ? v : undefined;
  };
  const getTeamIds = (key: string): TeamId[] | undefined => {
    const v = answerMap.get(key);
    return Array.isArray(v) ? (v as string[]).map((s) => teamId(s)) : undefined;
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

  // Auto-calculate stats derivable from match data; actualAnswers values take precedence.
  let calcHighestGoals: number | undefined;
  const groupGoalsFor = new Map<string, number>();
  const groupGoalsAgainst = new Map<string, number>();

  for (const m of allCompletedMatchRows) {
    const total = m.homeGoals! + m.awayGoals!;
    if (calcHighestGoals === undefined || total > calcHighestGoals) calcHighestGoals = total;
  }
  for (const m of completedGroupMatches) {
    if (m.homeTeamId && m.awayTeamId) {
      groupGoalsFor.set(m.homeTeamId, (groupGoalsFor.get(m.homeTeamId) ?? 0) + m.homeGoals!);
      groupGoalsFor.set(m.awayTeamId, (groupGoalsFor.get(m.awayTeamId) ?? 0) + m.awayGoals!);
      groupGoalsAgainst.set(
        m.homeTeamId,
        (groupGoalsAgainst.get(m.homeTeamId) ?? 0) + m.awayGoals!,
      );
      groupGoalsAgainst.set(
        m.awayTeamId,
        (groupGoalsAgainst.get(m.awayTeamId) ?? 0) + m.homeGoals!,
      );
    }
  }

  const calcGroupTopScoringId = [...groupGoalsFor.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const calcGroupTopConcedingId = [...groupGoalsAgainst.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];

  const roundOf8 = getTeamIds('roundOf8');
  const topFourOrder = getTeamIds('topFourOrder');
  const groupTopScoringTeam =
    getTeamId('groupTopScoringTeam') ??
    (calcGroupTopScoringId ? teamId(calcGroupTopScoringId) : undefined);
  const groupTopConcedingTeam =
    getTeamId('groupTopConcedingTeam') ??
    (calcGroupTopConcedingId ? teamId(calcGroupTopConcedingId) : undefined);
  const tournamentTopScoringTeam = getTeamId('tournamentTopScoringTeam');
  const tournamentTopConcedingTeam = getTeamId('tournamentTopConcedingTeam');
  const highestMatchGoals = getNum('highestMatchGoals') ?? calcHighestGoals;
  const mostYellowCardsTeam = getTeamId('mostYellowCardsTeam');
  const firstRedCardPlayer = getPlayerId('firstRedCardPlayer');
  const penaltyShootoutCount = getNum('penaltyShootoutCount');
  const topScorerPlayer = getPlayerId('topScorerPlayer');

  return {
    matchResults,
    groupOrder,
    ...(bronzeMatch !== undefined ? { bronzeMatch } : {}),
    ...(finalMatch !== undefined ? { finalMatch } : {}),
    answers: {
      ...(roundOf8 !== undefined ? { roundOf8 } : {}),
      ...(topFourOrder !== undefined ? { topFourOrder } : {}),
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
