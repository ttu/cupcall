import { integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import type { Scoring, Tournament } from '@cup/engine';

export const stageEnum = pgEnum('stage', ['group', 'R32', 'R16', 'QF', 'SF', 'Final', 'bronze']);

export const decidedByEnum = pgEnum('decided_by', ['regulation', 'extraTime', 'penalties']);

export const matchStatusEnum = pgEnum('match_status', [
  'scheduled',
  'in_progress',
  'final',
  'cancelled',
]);

export const tournamentStatusEnum = pgEnum('tournament_status', ['upcoming', 'active', 'finished']);

export const tournaments = pgTable('tournaments', {
  id: text('id').primaryKey(), // e.g. "wc-2026"
  name: text('name').notNull(),
  firstKickoff: timestamp('first_kickoff', { withTimezone: true }).notNull(),
  scoringConfig: jsonb('scoring_config').notNull().$type<Scoring>(),
  /** Full Tournament definition (bracket, groups, qualification, tiebreak). Populated by sync. */
  definition: jsonb('definition').$type<Tournament>(),
  status: tournamentStatusEnum('status').notNull().default('upcoming'),
});

/**
 * Teams scoped per-tournament. Natural id (e.g. "ARG") + tournamentId = composite PK.
 * References to homeTeamId/awayTeamId/winnerTeamId in matches use plain text within
 * the same tournament — application-level referential integrity keeps the FK manageable.
 */
export const teams = pgTable(
  'teams',
  {
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    id: text('id').notNull(), // natural id e.g. "ARG"
    name: text('name').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tournamentId, t.id] })],
);

export const players = pgTable(
  'players',
  {
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    playerId: text('player_id').notNull(), // natural id e.g. "ARG-10"
    name: text('name').notNull(),
    teamId: text('team_id').notNull(), // natural team id within same tournament — application-level integrity (composite FK to teams(tournamentId, id) omitted for nullable-column simplicity, matching matches.homeTeamId/awayTeamId)
  },
  (p) => [primaryKey({ columns: [p.tournamentId, p.playerId] })],
);

export const stageGroups = pgTable(
  'stage_groups',
  {
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    id: text('id').notNull(), // e.g. "A"
  },
  (g) => [primaryKey({ columns: [g.tournamentId, g.id] })],
);

export const stageGroupTeams = pgTable(
  'stage_group_teams',
  {
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    groupId: text('group_id').notNull(),
    teamId: text('team_id').notNull(),
    seedOrder: integer('seed_order').notNull(),
  },
  (sgt) => [primaryKey({ columns: [sgt.tournamentId, sgt.groupId, sgt.teamId] })],
);

/**
 * Matches. Composite PK (tournamentId, id) where id is the natural text id from JSON
 * (e.g. "m1", "qf-1"). homeTeamId/awayTeamId/winnerTeamId are natural team ids within
 * the same tournament — application-level referential integrity (composite FK to
 * teams(tournamentId, id) is possible but omitted for nullable-column simplicity).
 */
export const matches = pgTable(
  'matches',
  {
    id: text('id').notNull(),
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    stage: stageEnum('stage').notNull(),
    groupId: text('group_id'), // null for knockout matches
    homeTeamId: text('home_team_id'), // null until teams are known (knockout)
    awayTeamId: text('away_team_id'),
    kickoff: timestamp('kickoff', { withTimezone: true }), // nullable: knockout matches don't have scheduled kickoffs in advance
    homeGoals: integer('home_goals'),
    awayGoals: integer('away_goals'),
    homeConduct: integer('home_conduct'),
    awayConduct: integer('away_conduct'),
    winnerTeamId: text('winner_team_id'),
    decidedBy: decidedByEnum('decided_by'),
    status: matchStatusEnum('status').notNull().default('scheduled'),
  },
  (m) => [primaryKey({ columns: [m.tournamentId, m.id] })],
);

export const actualGroupOrder = pgTable(
  'actual_group_order',
  {
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    groupId: text('group_id').notNull(),
    position: integer('position').notNull(), // 1–4
    teamId: text('team_id').notNull(),
  },
  (ago) => [primaryKey({ columns: [ago.tournamentId, ago.groupId, ago.position] })],
);

export const actualAnswers = pgTable(
  'actual_answers',
  {
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    betKey: text('bet_key').notNull(),
    value: jsonb('value').notNull(),
  },
  (aa) => [primaryKey({ columns: [aa.tournamentId, aa.betKey] })],
);
