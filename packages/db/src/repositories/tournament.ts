import { eq, and } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema/index';
import type { Tournament, ActualResults, GroupId, TeamId } from '@cup/engine';

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
  id: string;
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
    id: row.id,
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
  tournamentId: string,
): Promise<TournamentRow | undefined> {
  const [row] = await db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, tournamentId));
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    firstKickoff: row.firstKickoff,
    scoringConfig: row.scoringConfig,
    definition: (row.definition as Tournament) ?? null,
    status: row.status,
  };
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
  tournamentId: string,
  actual: ActualResults,
): Promise<void> {
  // 1. Update group match results
  for (const result of actual.matchResults) {
    await db
      .update(schema.matches)
      .set({ homeGoals: result.home, awayGoals: result.away, status: 'final' })
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
  const answerEntries: Array<{ tournamentId: string; betKey: string; value: unknown }> = [];

  const { answers } = actual;

  if (answers.roundOf8 !== undefined) {
    answerEntries.push({ tournamentId, betKey: 'roundOf8', value: answers.roundOf8 });
  }
  if (answers.topFourOrder !== undefined) {
    answerEntries.push({ tournamentId, betKey: 'topFourOrder', value: answers.topFourOrder });
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
        set: { value: schema.actualAnswers.value },
      });
  }
}
