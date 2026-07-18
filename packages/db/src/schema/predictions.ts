import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { tournaments } from './tournament';
import { pools } from './pools';
import type { BracketMatchKey } from '@cup/engine';

export const finishMatchEnum = pgEnum('finish_match', ['final', 'bronze']);

export const editSourceEnum = pgEnum('edit_source', ['manual', 'import']);

export const predictions = pgTable(
  'predictions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poolId: text('pool_id')
      .notNull()
      .references(() => pools.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
  },
  (p) => [uniqueIndex('predictions_pool_user_uniq').on(p.poolId, p.userId)],
);

/**
 * One row per group match score the user has predicted.
 * matchId is the natural text id within the tournament (e.g. "m1").
 * No DB FK to matches — the composite PK on matches requires both tournamentId and id;
 * application-level validation enforces match existence.
 */
export const predictionGroupScores = pgTable(
  'prediction_group_scores',
  {
    predictionId: text('prediction_id')
      .notNull()
      .references(() => predictions.id, { onDelete: 'cascade' }),
    matchId: text('match_id').notNull(),
    homeGoals: integer('home_goals').notNull(),
    awayGoals: integer('away_goals').notNull(),
  },
  (gs) => [primaryKey({ columns: [gs.predictionId, gs.matchId] })],
);

export const predictionKnockoutPicks = pgTable(
  'prediction_knockout_picks',
  {
    predictionId: text('prediction_id')
      .notNull()
      .references(() => predictions.id, { onDelete: 'cascade' }),
    bracketMatchKey: text('bracket_match_key').notNull().$type<BracketMatchKey>(),
    winnerTeamId: text('winner_team_id').notNull(),
  },
  (kp) => [primaryKey({ columns: [kp.predictionId, kp.bracketMatchKey] })],
);

export const predictionFinishScores = pgTable(
  'prediction_finish_scores',
  {
    predictionId: text('prediction_id')
      .notNull()
      .references(() => predictions.id, { onDelete: 'cascade' }),
    match: finishMatchEnum('match').notNull(),
    homeGoals: integer('home_goals').notNull(),
    awayGoals: integer('away_goals').notNull(),
    /**
     * Snapshot of which real team each goal figure belongs to, captured at save time from the
     * user's then-current derived finalist/bronze pair. Null when that pair wasn't yet resolved
     * at save time (e.g. semifinal picks incomplete).
     */
    homeTeamId: text('home_team_id'),
    awayTeamId: text('away_team_id'),
  },
  (fs) => [primaryKey({ columns: [fs.predictionId, fs.match] })],
);

export const predictionSpecials = pgTable(
  'prediction_specials',
  {
    predictionId: text('prediction_id')
      .notNull()
      .references(() => predictions.id, { onDelete: 'cascade' }),
    betKey: text('bet_key').notNull(),
    value: jsonb('value').notNull(),
  },
  (ps) => [primaryKey({ columns: [ps.predictionId, ps.betKey] })],
);

export const predictionEdits = pgTable('prediction_edits', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  predictionId: text('prediction_id')
    .notNull()
    .references(() => predictions.id, { onDelete: 'cascade' }),
  editorUserId: text('editor_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  fieldPath: text('field_path').notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  reason: text('reason'),
  source: editSourceEnum('source').notNull(),
  editedAt: timestamp('edited_at', { withTimezone: true }).notNull().defaultNow(),
});
