import {
  upsertGroupScore,
  upsertKnockoutPick,
  upsertFinishScore,
  upsertSpecialBet,
  createPredictionEdit,
  getPredictionInputs,
} from '@cup/db';
import type { Db } from '@cup/db';
import { bracketMatchKey as bmk, deriveCard } from '@cup/engine';
import type {
  BracketMatchKey,
  MatchId,
  TeamId,
  Tournament,
  UserId,
  PredictionId,
} from '@cup/engine';
import type { AppSchema } from '@/shared/db';
import { toPair } from '../domain/pair';

export type CardExportData = {
  tournamentId: string;
  groupScores?: { matchId: string; home: number; away: number }[] | undefined;
  knockoutPicks?: { bracketMatchKey: string; winner: string }[] | undefined;
  finishScores?:
    | {
        final?: { home: number; away: number } | undefined;
        bronze?: { home: number; away: number } | undefined;
      }
    | undefined;
  specials?: Record<string, unknown> | undefined;
};

export type CardImportResult = { imported: number; skipped: string[] };

type Deps = {
  db: Db<AppSchema>;
  predictionId: PredictionId;
  tournamentDef: Tournament;
  exportData: CardExportData;
  /** When true, write audit records for each imported item. */
  isOwnerEdit: boolean;
  editorUserId: UserId;
};

/**
 * Applies export data to an existing prediction: validates each item against
 * the tournament definition and upserts the valid ones.
 * Caller is responsible for auth, prediction creation, and rescoring.
 */
export async function applyCardImport(deps: Deps): Promise<CardImportResult> {
  const { db, predictionId, tournamentDef, exportData, isOwnerEdit, editorUserId } = deps;

  const matchIds = new Set(tournamentDef.groupMatches.map((m) => m.id));
  const teamIds = new Set(tournamentDef.teams.map((t) => t.id));
  const bracketKeys = new Set([
    ...tournamentDef.bracket.slots.map((s) => s.match),
    ...tournamentDef.bracket.progression.map((p) => p.match),
  ]);

  const groupScoresResult = await importGroupScores(
    db,
    predictionId,
    editorUserId,
    isOwnerEdit,
    exportData.groupScores,
    matchIds,
  );
  const knockoutPicksResult = await importKnockoutPicks(
    db,
    predictionId,
    exportData.knockoutPicks,
    bracketKeys,
    teamIds,
  );
  const finishScoresImported = await importFinishScores(
    db,
    predictionId,
    tournamentDef,
    exportData.finishScores,
  );
  const specialsImported = await importSpecialBets(db, predictionId, exportData.specials);

  return {
    imported:
      groupScoresResult.imported +
      knockoutPicksResult.imported +
      finishScoresImported +
      specialsImported,
    skipped: [...groupScoresResult.skipped, ...knockoutPicksResult.skipped],
  };
}

async function importGroupScores(
  db: Db<AppSchema>,
  predictionId: PredictionId,
  editorUserId: UserId,
  isOwnerEdit: boolean,
  groupScores: CardExportData['groupScores'],
  matchIds: Set<MatchId>,
): Promise<{ imported: number; skipped: string[] }> {
  let imported = 0;
  const skipped: string[] = [];

  for (const gs of groupScores ?? []) {
    if (!matchIds.has(gs.matchId as MatchId)) {
      skipped.push(`matchId:${gs.matchId}`);
      continue;
    }
    await upsertGroupScore(db, predictionId, gs.matchId, gs.home, gs.away);
    if (isOwnerEdit) {
      await createPredictionEdit(db, {
        predictionId,
        editorUserId,
        fieldPath: `groupScores.${gs.matchId}`,
        oldValue: null,
        newValue: gs,
        source: 'import',
      });
    }
    imported++;
  }

  return { imported, skipped };
}

async function importKnockoutPicks(
  db: Db<AppSchema>,
  predictionId: PredictionId,
  knockoutPicks: CardExportData['knockoutPicks'],
  bracketKeys: Set<BracketMatchKey>,
  teamIds: Set<TeamId>,
): Promise<{ imported: number; skipped: string[] }> {
  let imported = 0;
  const skipped: string[] = [];

  for (const kp of knockoutPicks ?? []) {
    if (!bracketKeys.has(kp.bracketMatchKey as BracketMatchKey)) {
      skipped.push(`bracketMatchKey:${kp.bracketMatchKey}`);
      continue;
    }
    if (!teamIds.has(kp.winner as TeamId)) {
      skipped.push(`team:${kp.winner}`);
      continue;
    }
    await upsertKnockoutPick(
      db,
      predictionId,
      bmk(kp.bracketMatchKey) as BracketMatchKey,
      kp.winner,
    );
    imported++;
  }

  return { imported, skipped };
}

async function importFinishScores(
  db: Db<AppSchema>,
  predictionId: PredictionId,
  tournamentDef: Tournament,
  finishScores: CardExportData['finishScores'],
): Promise<number> {
  const { final, bronze } = finishScores ?? {};
  if (!final && !bronze) return 0;

  const inputs = await getPredictionInputs(db, predictionId);
  const derived = deriveCard(inputs, tournamentDef);

  let imported = 0;
  if (final) {
    const pair = toPair(derived.finalists);
    await upsertFinishScore(
      db,
      predictionId,
      'final',
      final.home,
      final.away,
      pair?.[0] ?? null,
      pair?.[1] ?? null,
    );
    imported++;
  }
  if (bronze) {
    const pair = toPair(derived.bronzePair);
    await upsertFinishScore(
      db,
      predictionId,
      'bronze',
      bronze.home,
      bronze.away,
      pair?.[0] ?? null,
      pair?.[1] ?? null,
    );
    imported++;
  }

  return imported;
}

async function importSpecialBets(
  db: Db<AppSchema>,
  predictionId: PredictionId,
  specials: CardExportData['specials'],
): Promise<number> {
  let imported = 0;

  for (const [betKey, value] of Object.entries(specials ?? {})) {
    await upsertSpecialBet(db, predictionId, betKey, value);
    imported++;
  }

  return imported;
}
