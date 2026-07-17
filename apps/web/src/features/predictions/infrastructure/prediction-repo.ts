/**
 * Infrastructure: thin wrappers around @cup/db repositories for the predictions feature.
 * All DB access for the predictions slice goes through these functions.
 */
import {
  getOrCreatePrediction,
  getPrediction,
  upsertGroupScore,
  upsertKnockoutPick,
  deleteKnockoutPicks,
  upsertFinishScore,
  upsertSpecialBet,
  createPredictionEdit,
  listEditsForPrediction,
  getPredictionInputs,
  type PredictionRow,
  type EditRow,
} from '@cup/db';
import type { Db } from '@cup/db';

export type { PredictionRow, EditRow };

// Re-export the functions under the same names for use in the application layer.
export {
  getOrCreatePrediction,
  getPrediction,
  upsertGroupScore,
  upsertKnockoutPick,
  deleteKnockoutPicks,
  upsertFinishScore,
  upsertSpecialBet,
  createPredictionEdit,
  listEditsForPrediction,
  getPredictionInputs,
};

export type PredictionDb = Db<import('@/shared/db').AppSchema>;
