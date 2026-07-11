import { eq, and, ne, sql } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema/index';
import {
  tournamentId as asTournamentId,
  type Tournament,
  type ActualResults,
  type GroupId,
  type TeamId,
  type TournamentId,
} from '@cup/engine';

type Database = Db<typeof schema>;

/**
 * Upserts the full tournament definition into the DB:
 * tournament row, teams, players, groups, group–team memberships, and group matches.
 *
 * Idempotent: running twice with the same data produces the same result.
 *
 * @param matchKickoffs - Map from matchId to kickoff Date (from raw JSON, before schema strips it).
 *   If a match is not in the map, kickoff is stored as null.
 */
export async function upsertTournamentDef(
  db: Database,
  tournament: Tournament,
  firstKickoff: Date,
  matchKickoffs: Map<string, Date | null>,
): Promise<void> {
  // 1. Upsert the tournament row (store full definition for bracket/qualification access)
  await db
    .insert(schema.tournaments)
    .values({
      id: tournament.id,
      name: tournament.name,
      firstKickoff,
      scoringConfig: tournament.scoring,
      definition: tournament,
    })
    .onConflictDoUpdate({
      target: schema.tournaments.id,
      set: {
        name: tournament.name,
        firstKickoff,
        scoringConfig: tournament.scoring,
        definition: tournament,
      },
    });

  // 2. Upsert all teams
  if (tournament.teams.length > 0) {
    await db
      .insert(schema.teams)
      .values(
        tournament.teams.map((t) => ({
          tournamentId: tournament.id,
          id: t.id,
          name: t.name,
        })),
      )
      .onConflictDoUpdate({
        target: [schema.teams.tournamentId, schema.teams.id],
        set: { name: schema.teams.name },
      });
  }

  // 3. Upsert all players
  if (tournament.players.length > 0) {
    await db
      .insert(schema.players)
      .values(
        tournament.players.map((p) => ({
          tournamentId: tournament.id,
          playerId: p.id,
          name: p.name,
          teamId: p.team,
        })),
      )
      .onConflictDoUpdate({
        target: [schema.players.tournamentId, schema.players.playerId],
        set: { name: schema.players.name, teamId: schema.players.teamId },
      });
  }

  // 4. Upsert all stage groups
  if (tournament.groups.length > 0) {
    await db
      .insert(schema.stageGroups)
      .values(
        tournament.groups.map((g) => ({
          tournamentId: tournament.id,
          id: g.id,
        })),
      )
      .onConflictDoNothing();
  }

  // 5. Upsert all stage group teams (team–group memberships)
  const groupTeamRows = tournament.groups.flatMap((g) =>
    g.teams.map((teamId, index) => ({
      tournamentId: tournament.id,
      groupId: g.id,
      teamId,
      seedOrder: index,
    })),
  );

  if (groupTeamRows.length > 0) {
    await db
      .insert(schema.stageGroupTeams)
      .values(groupTeamRows)
      .onConflictDoUpdate({
        target: [
          schema.stageGroupTeams.tournamentId,
          schema.stageGroupTeams.groupId,
          schema.stageGroupTeams.teamId,
        ],
        set: { seedOrder: schema.stageGroupTeams.seedOrder },
      });
  }

  // 6. Upsert all group matches
  if (tournament.groupMatches.length > 0) {
    await db
      .insert(schema.matches)
      .values(
        tournament.groupMatches.map((m) => ({
          id: m.id,
          tournamentId: tournament.id,
          stage: 'group' as const,
          groupId: m.group,
          homeTeamId: m.home,
          awayTeamId: m.away,
          kickoff: matchKickoffs.get(m.id) ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: [schema.matches.tournamentId, schema.matches.id],
        set: {
          homeTeamId: schema.matches.homeTeamId,
          awayTeamId: schema.matches.awayTeamId,
          kickoff: schema.matches.kickoff,
          groupId: schema.matches.groupId,
        },
      });
  }
}

export type TournamentRow = {
  id: TournamentId;
  name: string;
  firstKickoff: Date;
  scoringConfig: import('@cup/engine').Scoring;
  definition: Tournament | null;
  status: 'upcoming' | 'active' | 'finished';
};

/**
 * Returns all tournament rows, ordered by firstKickoff ascending.
 */
export async function listTournaments(db: Database): Promise<TournamentRow[]> {
  const rows = await db.select().from(schema.tournaments).orderBy(schema.tournaments.firstKickoff);
  return rows.map((row) => ({
    id: asTournamentId(row.id),
    name: row.name,
    firstKickoff: row.firstKickoff,
    scoringConfig: row.scoringConfig,
    definition: (row.definition as Tournament) ?? null,
    status: row.status,
  }));
}

/**
 * Returns a tournament row including the stored definition.
 */
export async function getTournamentById(
  db: Database,
  tournamentId: TournamentId,
): Promise<TournamentRow | undefined> {
  const [row] = await db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, tournamentId));
  if (!row) return undefined;
  return {
    id: asTournamentId(row.id),
    name: row.name,
    firstKickoff: row.firstKickoff,
    scoringConfig: row.scoringConfig,
    definition: (row.definition as Tournament) ?? null,
    status: row.status,
  };
}

export type MatchRow = {
  id: string;
  tournamentId: TournamentId;
  stage: 'group' | 'R32' | 'R16' | 'QF' | 'SF' | 'Final' | 'bronze';
  groupId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  kickoff: Date | null;
  homeGoals: number | null;
  awayGoals: number | null;
  homeConduct: number | null;
  awayConduct: number | null;
  winnerTeamId: string | null;
  decidedBy: 'regulation' | 'extraTime' | 'penalties' | null;
  status: 'scheduled' | 'in_progress' | 'final' | 'cancelled';
};

/**
 * Returns all matches for a tournament, ordered by kickoff (nulls last).
 */
export async function getMatchesForTournament(
  db: Database,
  tournamentId: TournamentId,
): Promise<MatchRow[]> {
  const rows = await db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.tournamentId, tournamentId))
    .orderBy(schema.matches.kickoff);
  return rows.map((r) => ({
    id: r.id,
    tournamentId: asTournamentId(r.tournamentId),
    stage: r.stage,
    groupId: r.groupId ?? null,
    homeTeamId: r.homeTeamId ?? null,
    awayTeamId: r.awayTeamId ?? null,
    kickoff: r.kickoff ?? null,
    homeGoals: r.homeGoals ?? null,
    awayGoals: r.awayGoals ?? null,
    homeConduct: r.homeConduct ?? null,
    awayConduct: r.awayConduct ?? null,
    winnerTeamId: r.winnerTeamId ?? null,
    decidedBy: r.decidedBy ?? null,
    status: r.status,
  }));
}

/**
 * Upserts actual results for a tournament:
 *  - Updates group match rows with goals + status='final'
 *  - Replaces the actualGroupOrder for this tournament
 *  - Upserts all answers (including bronzeMatch / finalMatch as special bet keys)
 *
 * Idempotent: running twice with the same data produces the same result.
 */
export async function upsertTournamentResults(
  db: Database,
  tournamentId: TournamentId,
  actual: ActualResults,
): Promise<void> {
  // 1. Update group match results
  for (const result of actual.matchResults) {
    await db
      .update(schema.matches)
      .set({
        homeGoals: result.home,
        awayGoals: result.away,
        ...(result.homeConduct !== undefined && { homeConduct: result.homeConduct }),
        ...(result.awayConduct !== undefined && { awayConduct: result.awayConduct }),
        status: 'final',
      })
      .where(
        and(eq(schema.matches.tournamentId, tournamentId), eq(schema.matches.id, result.matchId)),
      );
  }

  // 2. Replace actual group order (delete + insert for full replacement)
  await db
    .delete(schema.actualGroupOrder)
    .where(eq(schema.actualGroupOrder.tournamentId, tournamentId));

  const groupOrderRows = (Object.entries(actual.groupOrder) as [GroupId, TeamId[]][]).flatMap(
    ([groupId, teams]) =>
      teams.map((teamId, index) => ({
        tournamentId,
        groupId,
        position: index + 1,
        teamId,
      })),
  );

  if (groupOrderRows.length > 0) {
    await db.insert(schema.actualGroupOrder).values(groupOrderRows);
  }

  // 3. Upsert answers
  const answerEntries: Array<{ tournamentId: TournamentId; betKey: string; value: unknown }> = [];

  const { answers } = actual;

  if (answers.roundOf16 !== undefined) {
    answerEntries.push({ tournamentId, betKey: 'roundOf16', value: answers.roundOf16 });
  }
  if (answers.roundOf8 !== undefined) {
    answerEntries.push({ tournamentId, betKey: 'roundOf8', value: answers.roundOf8 });
  }
  if (answers.roundOf4 !== undefined) {
    answerEntries.push({ tournamentId, betKey: 'roundOf4', value: answers.roundOf4 });
  }
  if (answers.groupTopScoringTeam !== undefined) {
    answerEntries.push({
      tournamentId,
      betKey: 'groupTopScoringTeam',
      value: answers.groupTopScoringTeam,
    });
  }
  if (answers.groupTopConcedingTeam !== undefined) {
    answerEntries.push({
      tournamentId,
      betKey: 'groupTopConcedingTeam',
      value: answers.groupTopConcedingTeam,
    });
  }
  if (answers.tournamentTopScoringTeam !== undefined) {
    answerEntries.push({
      tournamentId,
      betKey: 'tournamentTopScoringTeam',
      value: answers.tournamentTopScoringTeam,
    });
  }
  if (answers.tournamentTopConcedingTeam !== undefined) {
    answerEntries.push({
      tournamentId,
      betKey: 'tournamentTopConcedingTeam',
      value: answers.tournamentTopConcedingTeam,
    });
  }
  if (answers.highestMatchGoals !== undefined) {
    answerEntries.push({
      tournamentId,
      betKey: 'highestMatchGoals',
      value: answers.highestMatchGoals,
    });
  }
  if (answers.mostYellowCardsTeam !== undefined) {
    answerEntries.push({
      tournamentId,
      betKey: 'mostYellowCardsTeam',
      value: answers.mostYellowCardsTeam,
    });
  }
  if (answers.firstRedCardPlayer !== undefined) {
    answerEntries.push({
      tournamentId,
      betKey: 'firstRedCardPlayer',
      value: answers.firstRedCardPlayer,
    });
  }
  if (answers.penaltyShootoutCount !== undefined) {
    answerEntries.push({
      tournamentId,
      betKey: 'penaltyShootoutCount',
      value: answers.penaltyShootoutCount,
    });
  }
  if (answers.topScorerPlayer !== undefined) {
    answerEntries.push({
      tournamentId,
      betKey: 'topScorerPlayer',
      value: answers.topScorerPlayer,
    });
  }

  // Store bronzeMatch and finalMatch as structured answer keys
  if (actual.bronzeMatch !== undefined) {
    answerEntries.push({ tournamentId, betKey: 'bronzeMatch', value: actual.bronzeMatch });
  }
  if (actual.finalMatch !== undefined) {
    answerEntries.push({ tournamentId, betKey: 'finalMatch', value: actual.finalMatch });
  }

  if (answerEntries.length > 0) {
    await db
      .insert(schema.actualAnswers)
      .values(answerEntries)
      .onConflictDoUpdate({
        target: [schema.actualAnswers.tournamentId, schema.actualAnswers.betKey],
        // `schema.actualAnswers.value` here would reference the existing row (a no-op:
        // "set value = value"). `excluded.value` is the incoming row being inserted.
        set: { value: sql`excluded.value` },
      });
  }
}

/**
 * Resets all tournament results to a clean state:
 *  - Group matches reset to scheduled (goals cleared)
 *  - All knockout match rows deleted
 *  - All actual group orders deleted
 *  - All actual answers deleted
 *
 * Used by the dev simulator before applying a new checkpoint so that
 * going backwards in time produces a fully consistent state.
 */
export async function resetTournamentResults(
  db: Database,
  tournamentId: TournamentId,
): Promise<void> {
  await db
    .update(schema.matches)
    .set({
      homeGoals: null,
      awayGoals: null,
      winnerTeamId: null,
      decidedBy: null,
      status: 'scheduled',
    })
    .where(and(eq(schema.matches.tournamentId, tournamentId), eq(schema.matches.stage, 'group')));

  await db
    .delete(schema.matches)
    .where(and(eq(schema.matches.tournamentId, tournamentId), ne(schema.matches.stage, 'group')));

  await db
    .delete(schema.actualGroupOrder)
    .where(eq(schema.actualGroupOrder.tournamentId, tournamentId));

  await db.delete(schema.actualAnswers).where(eq(schema.actualAnswers.tournamentId, tournamentId));
}

/**
 * Sets a group match to 'final' status with the given goals.
 * Used by the sync pipeline and by integration tests.
 */
export async function finalizeMatch(
  db: Database,
  tournamentId: TournamentId,
  matchId: string,
  homeGoals: number,
  awayGoals: number,
): Promise<void> {
  await db
    .update(schema.matches)
    .set({ homeGoals, awayGoals, status: 'final' })
    .where(and(eq(schema.matches.tournamentId, tournamentId), eq(schema.matches.id, matchId)));
}

/**
 * Upserts a knockout match (insert or update) with full result data.
 * Used by the sync pipeline when knockout fixtures and results become known.
 */
export async function upsertKnockoutMatch(
  db: Database,
  input: {
    id: string;
    tournamentId: TournamentId;
    stage: 'R32' | 'R16' | 'QF' | 'SF' | 'Final' | 'bronze';
    homeTeamId?: string;
    awayTeamId?: string;
    homeGoals?: number;
    awayGoals?: number;
    winnerTeamId?: string;
    decidedBy?: 'regulation' | 'extraTime' | 'penalties';
    kickoff?: Date;
    status?: 'scheduled' | 'in_progress' | 'final';
  },
): Promise<void> {
  await db
    .insert(schema.matches)
    .values({
      id: input.id,
      tournamentId: input.tournamentId,
      stage: input.stage,
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      homeGoals: input.homeGoals,
      awayGoals: input.awayGoals,
      winnerTeamId: input.winnerTeamId,
      decidedBy: input.decidedBy,
      kickoff: input.kickoff,
      status: input.status ?? 'scheduled',
    })
    .onConflictDoUpdate({
      target: [schema.matches.tournamentId, schema.matches.id],
      set: {
        homeTeamId: schema.matches.homeTeamId,
        awayTeamId: schema.matches.awayTeamId,
        homeGoals: schema.matches.homeGoals,
        awayGoals: schema.matches.awayGoals,
        winnerTeamId: schema.matches.winnerTeamId,
        decidedBy: schema.matches.decidedBy,
        kickoff: schema.matches.kickoff,
        status: schema.matches.status,
      },
    });
}
