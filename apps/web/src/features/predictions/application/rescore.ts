/**
 * Re-derives and re-scores a prediction card after any input change.
 * Reads the current CardInputs from the DB, calls @cup/engine, writes scores.
 */
import { getPredictionInputs, upsertScore } from '@cup/db';
import type { Db } from '@cup/db';
import { deriveCard, scoreCard, points } from '@cup/engine';
import type {
  Tournament,
  ActualResults,
  CardInputs,
  PoolId,
  PredictionId,
  UserId,
} from '@cup/engine';
import type { AppSchema } from '@/shared/db';

type Deps = {
  db: Db<AppSchema>;
  predictionId: PredictionId;
  poolId: PoolId;
  userId: UserId;
  tournament: Tournament;
  actual: ActualResults;
  /** Pre-loaded inputs — skips the DB fetch when provided. */
  inputs?: CardInputs;
};

/**
 * Reads the stored CardInputs for `predictionId`, derives the card, scores it,
 * and upserts the result into the scores table.
 */
export async function rescoreCard(deps: Deps): Promise<void> {
  const { db, predictionId, poolId, tournament, actual } = deps;

  const inputs = deps.inputs ?? (await getPredictionInputs(db, predictionId));

  // Augment group scores with actual results for matches not saved by the user
  // (e.g. late joiners who couldn't predict locked matches). This ensures
  // deriveCard/buildBracket resolves bracket slots correctly.
  const savedMatchIds = new Set(inputs.groupScores.map((gs) => gs.matchId as string));
  const augmentedGroupScores = [
    ...inputs.groupScores,
    ...actual.matchResults.filter((r) => !savedMatchIds.has(r.matchId as string)),
  ];

  const derived = deriveCard({ ...inputs, groupScores: augmentedGroupScores }, tournament);
  const breakdown = scoreCard(derived, inputs, actual, tournament.scoring);

  await upsertScore(db, {
    poolId,
    userId: deps.userId,
    pointsTotal: points(breakdown.total),
    breakdown,
  });
}
