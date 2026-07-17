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

type CompletedMatchRow = {
  id: string;
  stage: string;
  homeGoals: number | null;
  awayGoals: number | null;
  homeConduct: number | null;
  awayConduct: number | null;
};

type GroupOrderRow = {
  groupId: string;
  teamId: string;
  position: number;
};

type AnswerRow = {
  betKey: string;
  value: unknown;
};

type AnswerMap = Map<string, unknown>;

/** Group-stage results, keyed by match — derived from the completed match rows. */
function buildGroupMatchResults(rows: CompletedMatchRow[]): ActualResults['matchResults'] {
  return rows
    .filter((r) => r.stage === 'group')
    .map((r) => ({
      matchId: matchId(r.id),
      home: r.homeGoals!,
      away: r.awayGoals!,
      ...(r.homeConduct !== null && { homeConduct: r.homeConduct }),
      ...(r.awayConduct !== null && { awayConduct: r.awayConduct }),
    }));
}

/** Assembles the per-group final team order from flat (group, position, team) rows. */
function buildGroupOrder(rows: GroupOrderRow[]): Record<GroupId, TeamId[]> {
  const groupOrder: Record<GroupId, TeamId[]> = {};
  for (const row of rows) {
    const gid = row.groupId as GroupId;
    if (!groupOrder[gid]) groupOrder[gid] = [];
    groupOrder[gid][row.position - 1] = teamId(row.teamId);
  }
  return groupOrder;
}

function getPlayerIdAnswer(answerMap: AnswerMap, key: string): PlayerId | undefined {
  const v = answerMap.get(key);
  return typeof v === 'string' ? playerId(v) : undefined;
}

function getNumAnswer(answerMap: AnswerMap, key: string): number | undefined {
  const v = answerMap.get(key);
  return typeof v === 'number' ? v : undefined;
}

// Handles both single string (legacy) and array — always returns TeamId[].
function getTeamIdsAnswer(answerMap: AnswerMap, key: string): TeamId[] | undefined {
  const v = answerMap.get(key);
  if (Array.isArray(v)) return (v as string[]).map((s) => teamId(s));
  if (typeof v === 'string') return [teamId(v)];
  return undefined;
}

// Handles both single string (legacy) and array — always returns PlayerId[].
function getPlayerIdsAnswer(answerMap: AnswerMap, key: string): PlayerId[] | undefined {
  const v = answerMap.get(key);
  if (Array.isArray(v)) return (v as string[]).map((s) => playerId(s));
  if (typeof v === 'string') return [playerId(v)];
  return undefined;
}

/** bronzeMatch is stored as a structured JSON object in actualAnswers. */
function buildBronzeMatch(answerMap: AnswerMap): ActualResults['bronzeMatch'] {
  const rawBronze = answerMap.get('bronzeMatch') as Record<string, unknown> | undefined;
  if (!rawBronze) return undefined;
  return {
    home: teamId(rawBronze.home as string),
    away: teamId(rawBronze.away as string),
    homeGoals: rawBronze.homeGoals as number,
    awayGoals: rawBronze.awayGoals as number,
    winner: teamId(rawBronze.winner as string),
  };
}

/** finalMatch is stored as a structured JSON object in actualAnswers. */
function buildFinalMatch(answerMap: AnswerMap): ActualResults['finalMatch'] {
  const rawFinal = answerMap.get('finalMatch') as Record<string, unknown> | undefined;
  if (!rawFinal) return undefined;

  const rawFinalDecidedBy = rawFinal.decidedBy as
    | 'regulation'
    | 'extraTime'
    | 'penalties'
    | undefined;
  const rawFinalDecisivePlayer = rawFinal.decisiveGoalPlayer;
  const finalDecisiveGoalPlayer =
    typeof rawFinalDecisivePlayer === 'string' ? playerId(rawFinalDecisivePlayer) : undefined;

  return {
    home: teamId(rawFinal.home as string),
    away: teamId(rawFinal.away as string),
    homeGoals: rawFinal.homeGoals as number,
    awayGoals: rawFinal.awayGoals as number,
    winner: teamId(rawFinal.winner as string),
    ...(rawFinalDecidedBy !== undefined ? { decidedBy: rawFinalDecidedBy } : {}),
    ...(finalDecisiveGoalPlayer !== undefined
      ? { decisiveGoalPlayer: finalDecisiveGoalPlayer }
      : {}),
  };
}

/** Reassembles the flat, legacy-tolerant answer rows into the typed ActualResults answers shape. */
function buildAnswers(answerMap: AnswerMap): ActualResults['answers'] {
  const roundOf16 = getTeamIdsAnswer(answerMap, 'roundOf16');
  const roundOf8 = getTeamIdsAnswer(answerMap, 'roundOf8');
  const roundOf4 = getTeamIdsAnswer(answerMap, 'roundOf4');
  const finalists = getTeamIdsAnswer(answerMap, 'finalists');
  const groupTopScoringTeam = getTeamIdsAnswer(answerMap, 'groupTopScoringTeam');
  const groupTopConcedingTeam = getTeamIdsAnswer(answerMap, 'groupTopConcedingTeam');
  const tournamentTopScoringTeam = getTeamIdsAnswer(answerMap, 'tournamentTopScoringTeam');
  const tournamentTopConcedingTeam = getTeamIdsAnswer(answerMap, 'tournamentTopConcedingTeam');
  const highestMatchGoals = getNumAnswer(answerMap, 'highestMatchGoals');
  const mostYellowCardsTeam = getTeamIdsAnswer(answerMap, 'mostYellowCardsTeam');
  const firstRedCardPlayer = getPlayerIdAnswer(answerMap, 'firstRedCardPlayer');
  const penaltyShootoutCount = getNumAnswer(answerMap, 'penaltyShootoutCount');
  const topScorerPlayer = getPlayerIdsAnswer(answerMap, 'topScorerPlayer');

  return {
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
  };
}

/**
 * Assembles ActualResults from the DB for the given tournament.
 * Used by rescore pipelines after any mutation or sync.
 */
export async function getActualResults(
  db: Database,
  tournamentId: TournamentId,
): Promise<ActualResults> {
  const [allCompletedMatchRows, groupOrderRows, answerRows]: [
    CompletedMatchRow[],
    GroupOrderRow[],
    AnswerRow[],
  ] = await Promise.all([
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

  const matchResults = buildGroupMatchResults(allCompletedMatchRows);
  const groupOrder = buildGroupOrder(groupOrderRows);
  const answerMap: AnswerMap = new Map(answerRows.map((r) => [r.betKey, r.value]));
  const bronzeMatch = buildBronzeMatch(answerMap);
  const finalMatch = buildFinalMatch(answerMap);
  const answers = buildAnswers(answerMap);

  return {
    matchResults,
    groupOrder,
    ...(bronzeMatch !== undefined ? { bronzeMatch } : {}),
    ...(finalMatch !== undefined ? { finalMatch } : {}),
    answers,
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
