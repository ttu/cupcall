import {
  upsertGroupScore,
  upsertKnockoutPick,
  upsertFinishScore,
  upsertSpecialBet,
  createPredictionEdit,
} from '@cup/db';
import type { Db } from '@cup/db';
import { bracketMatchKey as bmk } from '@cup/engine';
import type {
  BracketMatchKey,
  MatchId,
  TeamId,
  Tournament,
  UserId,
  PredictionId,
} from '@cup/engine';
import type { AppSchema } from '@/shared/db';

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

  let imported = 0;
  const skipped: string[] = [];

  for (const gs of exportData.groupScores ?? []) {
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

  for (const kp of exportData.knockoutPicks ?? []) {
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

  if (exportData.finishScores?.final) {
    await upsertFinishScore(
      db,
      predictionId,
      'final',
      exportData.finishScores.final.home,
      exportData.finishScores.final.away,
    );
    imported++;
  }
  if (exportData.finishScores?.bronze) {
    await upsertFinishScore(
      db,
      predictionId,
      'bronze',
      exportData.finishScores.bronze.home,
      exportData.finishScores.bronze.away,
    );
    imported++;
  }

  for (const [betKey, value] of Object.entries(exportData.specials ?? {})) {
    await upsertSpecialBet(db, predictionId, betKey, value);
    imported++;
  }

  return { imported, skipped };
}
