import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema/index';
import {
  userId,
  teamId,
  playerId,
  matchId,
  bracketMatchKey,
  type UserId,
  type CardInputs,
  type GroupScore,
  type KnockoutPick,
  type FinishScore,
  type SpecialBets,
  type BracketMatchKey,
} from '@cup/engine';

type Database = Db<typeof schema>;

export type PredictionRef = {
  predictionId: string;
  poolId: string;
  userId: UserId;
};

/**
 * Returns all predictions for a tournament across all pools.
 * Used by the sync pipeline to enumerate cards that need rescoring.
 */
export async function listPredictionsForTournament(
  db: Database,
  tournamentId: string,
): Promise<PredictionRef[]> {
  const rows = await db
    .select({
      id: schema.predictions.id,
      poolId: schema.predictions.poolId,
      userId: schema.predictions.userId,
    })
    .from(schema.predictions)
    .where(eq(schema.predictions.tournamentId, tournamentId));

  return rows.map((r) => ({
    predictionId: r.id,
    poolId: r.poolId,
    userId: userId(r.userId),
  }));
}

/**
 * Assembles CardInputs for a given prediction by querying the four sub-tables.
 */
export async function getPredictionInputs(db: Database, predictionId: string): Promise<CardInputs> {
  const [groupScoreRows, knockoutRows, finishRows, specialRows] = await Promise.all([
    db
      .select()
      .from(schema.predictionGroupScores)
      .where(eq(schema.predictionGroupScores.predictionId, predictionId)),
    db
      .select()
      .from(schema.predictionKnockoutPicks)
      .where(eq(schema.predictionKnockoutPicks.predictionId, predictionId)),
    db
      .select()
      .from(schema.predictionFinishScores)
      .where(eq(schema.predictionFinishScores.predictionId, predictionId)),
    db
      .select()
      .from(schema.predictionSpecials)
      .where(eq(schema.predictionSpecials.predictionId, predictionId)),
  ]);

  const groupScores: GroupScore[] = groupScoreRows.map((r) => ({
    matchId: matchId(r.matchId),
    home: r.homeGoals,
    away: r.awayGoals,
  }));

  const knockoutPicks: KnockoutPick[] = knockoutRows.map((r) => ({
    bracketMatchKey: bracketMatchKey(r.bracketMatchKey) as BracketMatchKey,
    winner: teamId(r.winnerTeamId),
  }));

  const finishScores: { final?: FinishScore; bronze?: FinishScore } = {};
  for (const r of finishRows) {
    const score: FinishScore = { home: r.homeGoals, away: r.awayGoals };
    if (r.match === 'final') {
      finishScores.final = score;
    } else {
      finishScores.bronze = score;
    }
  }

  const specials = buildSpecialBets(specialRows);

  return { groupScores, knockoutPicks, finishScores, specials };
}

/**
 * Reconstructs a SpecialBets object from the predictionSpecials rows.
 * Each row's value is a raw JSON scalar/array from the DB; we apply
 * branded constructors where needed.
 */
function buildSpecialBets(rows: Array<typeof schema.predictionSpecials.$inferSelect>): SpecialBets {
  const specials: SpecialBets = {};

  for (const row of rows) {
    const v = row.value;
    switch (row.betKey) {
      case 'topScorerPlayer':
        if (typeof v === 'string') specials.topScorerPlayer = playerId(v);
        break;
      case 'groupTopScoringTeam':
        if (typeof v === 'string') specials.groupTopScoringTeam = teamId(v);
        break;
      case 'groupTopConcedingTeam':
        if (typeof v === 'string') specials.groupTopConcedingTeam = teamId(v);
        break;
      case 'tournamentTopScoringTeam':
        if (typeof v === 'string') specials.tournamentTopScoringTeam = teamId(v);
        break;
      case 'tournamentTopConcedingTeam':
        if (typeof v === 'string') specials.tournamentTopConcedingTeam = teamId(v);
        break;
      case 'highestMatchGoals':
        if (typeof v === 'number') specials.highestMatchGoals = v;
        break;
      case 'mostYellowCardsTeam':
        if (typeof v === 'string') specials.mostYellowCardsTeam = teamId(v);
        break;
      case 'firstRedCardPlayer':
        if (typeof v === 'string') specials.firstRedCardPlayer = playerId(v);
        break;
      case 'penaltyShootoutCount':
        if (typeof v === 'number') specials.penaltyShootoutCount = v;
        break;
      case 'finalDecidedByPenalties':
        if (typeof v === 'boolean') specials.finalDecidedByPenalties = v;
        break;
      case 'finalDecisiveGoalPlayer':
        if (typeof v === 'string') specials.finalDecisiveGoalPlayer = playerId(v);
        break;
    }
  }

  return specials;
}
