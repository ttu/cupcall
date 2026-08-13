import { z } from 'zod';
import type { Db } from '@cup/db';
import { getPoolArchiveWithEntries } from '@cup/db';
import type { PoolArchiveRecap } from '@cup/db';
import { points, teamId, matchId, userId } from '@cup/engine';
import type { PoolId, Points } from '@cup/engine';
import type { AppSchema } from '@/shared/db';
import { logger } from '@/shared/observability/logger';
import type { PoolArchiveView } from '../domain/types';
import { computeLeadChanges, computeBiggestRiser } from '../domain/race-history';
import type { StageHistoryPlayer } from '../domain/race-history';

// ---------------------------------------------------------------------------
// `recap` is stored as untyped jsonb — a row written before a field existed can lack
// it at runtime even though `PoolArchiveRecap` says it's always present. Validate once
// here at the read boundary: `stages` / `stageRoundLabels` / `groupCompletionStageIndex`
// get legacy defaults (older archives predate them); every other field must be present,
// or the whole recap is treated as malformed (same as a pool that was never archived).
// ---------------------------------------------------------------------------

const StageLeaderSchema = z.object({
  userId: z.string().transform(userId),
  displayName: z.string(),
  points: z.number(),
});

const ChampionPickHighlightSchema = z.object({
  teamId: z.string().transform(teamId),
  teamName: z.string(),
  count: z.number(),
  total: z.number(),
});

const BestSingleMatchHighlightSchema = z.object({
  matchId: z.string().transform(matchId),
  description: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  homeGoals: z.number(),
  awayGoals: z.number(),
  exactCount: z.number(),
  total: z.number(),
});

const BiggestUpsetHighlightSchema = z.object({
  matchId: z.string().transform(matchId),
  round: z.string(),
  winnerTeam: z.string(),
  loserTeam: z.string(),
  pickCount: z.number(),
  total: z.number(),
});

const PoolArchiveRecapSchema = z.object({
  stages: z.array(z.string()).default([]),
  stageRoundLabels: z.array(z.string().nullable()).default([]),
  championPick: ChampionPickHighlightSchema.nullable().default(null),
  bestSingleMatch: BestSingleMatchHighlightSchema.nullable().default(null),
  biggestUpset: BiggestUpsetHighlightSchema.nullable().default(null),
  predictionsMade: z.number().default(0),
  exactScoreRatePercent: z.number().default(0),
  overallAccuracyPercent: z.number().default(0),
  groupCompletionStageIndex: z.number().default(0),
  groupStageLeader: StageLeaderSchema.nullable().default(null),
  preSpecialsLeader: StageLeaderSchema.nullable().default(null),
  finalWinner: StageLeaderSchema.nullable().default(null),
  bestKnockoutPerformer: StageLeaderSchema.nullable().default(null),
  bestSpecialBetsPerformer: StageLeaderSchema.nullable().default(null),
});

/** Parses a raw `recap` JSON blob, logging and falling back to `null` if it's malformed. */
function parseRecap(raw: PoolArchiveRecap | null, poolId: PoolId): PoolArchiveRecap | null {
  if (raw === null) return null;

  const parsed = PoolArchiveRecapSchema.safeParse(raw);
  if (!parsed.success) {
    logger.error(
      { op: 'getPoolArchiveView', poolId, issues: parsed.error.issues },
      'pool-archive:getPoolArchiveView — malformed recap JSON, treating as absent',
    );
    return null;
  }
  return parsed.data;
}

export async function getPoolArchiveView(
  db: Db<AppSchema>,
  poolId: PoolId,
): Promise<PoolArchiveView | undefined> {
  const result = await getPoolArchiveWithEntries(db, poolId);
  if (!result) return undefined;

  const { archive, entries } = result;

  const entryViews = entries.map((e) => ({
    userId: e.userId,
    displayName: e.displayName,
    rank: e.rank,
    pointsTotal: e.pointsTotal,
    breakdown: e.breakdown,
    pointsHistory: e.pointsHistory ? e.pointsHistory.map(points) : null,
    stageReasons: e.stageReasons,
  }));

  const recap = parseRecap(archive.recap, poolId);

  const stages = recap?.stages ?? [];
  const historyPlayers: StageHistoryPlayer[] = entryViews
    .filter((e): e is typeof e & { pointsHistory: Points[] } => e.pointsHistory !== null)
    .map((e) => ({
      displayName: e.displayName,
      points: e.pointsHistory,
      stageReasons: e.stageReasons,
    }));

  return {
    poolId: archive.poolId,
    poolName: archive.poolName,
    tournamentId: archive.tournamentId,
    tournamentName: archive.tournamentName,
    archivedAt: archive.archivedAt,
    entries: entryViews,
    recap,
    leadChanges: recap ? computeLeadChanges(historyPlayers, stages, recap.stageRoundLabels) : [],
    biggestRiser: recap
      ? computeBiggestRiser(historyPlayers, stages, recap.groupCompletionStageIndex + 1)
      : null,
  };
}
