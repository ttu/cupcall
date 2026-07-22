import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { pools } from './pools';
import { users } from './auth';
import type { ScoreBreakdown } from '@cup/engine';
import type { TeamId, MatchId, UserId } from '@cup/engine';

export type ChampionPickHighlight = {
  teamId: TeamId;
  teamName: string;
  count: number;
  total: number;
};

export type BestSingleMatchHighlight = {
  matchId: MatchId;
  description: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  exactCount: number;
  total: number;
};

export type BiggestUpsetHighlight = {
  matchId: MatchId;
  round: string;
  winnerTeam: string;
  loserTeam: string;
  pickCount: number;
  total: number;
};

export type StageLeader = { userId: UserId; displayName: string; points: number };

export type PoolArchiveRecap = {
  stages: string[];
  stageRoundLabels: (string | null)[];
  championPick: ChampionPickHighlight | null;
  bestSingleMatch: BestSingleMatchHighlight | null;
  biggestUpset: BiggestUpsetHighlight | null;
  predictionsMade: number;
  exactScoreRatePercent: number;
  overallAccuracyPercent: number;
  groupCompletionStageIndex: number;
  groupStageLeader: StageLeader | null;
  preSpecialsLeader: StageLeader | null;
  finalWinner: StageLeader | null;
  bestKnockoutPerformer: StageLeader | null;
  bestSpecialBetsPerformer: StageLeader | null;
};

export const poolArchives = pgTable(
  'pool_archives',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poolId: text('pool_id')
      .notNull()
      .references(() => pools.id, { onDelete: 'cascade' }),
    poolName: text('pool_name').notNull(),
    tournamentId: text('tournament_id').notNull(),
    tournamentName: text('tournament_name').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }).notNull().defaultNow(),
    archivedBy: text('archived_by').references(() => users.id, { onDelete: 'set null' }),
    recap: jsonb('recap').$type<PoolArchiveRecap>(),
  },
  (t) => [uniqueIndex('pool_archives_pool_id_uniq').on(t.poolId)],
);

export const poolArchiveEntries = pgTable('pool_archive_entries', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  archiveId: text('archive_id')
    .notNull()
    .references(() => poolArchives.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  displayName: text('display_name').notNull(),
  rank: integer('rank').notNull(),
  pointsTotal: integer('points_total').notNull(),
  breakdown: jsonb('breakdown').notNull().$type<ScoreBreakdown>(),
  pointsHistory: jsonb('points_history').$type<number[]>(),
  stageReasons: jsonb('stage_reasons').$type<(string | null)[]>(),
});
