import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { ZodError } from 'zod';
import { tournamentSchema, resultsSchema, knockoutResultsSchema } from '@cup/schemas';
import type { Tournament, ActualResults } from '@cup/engine';

function formatZodError(err: ZodError): string {
  return err.errors.map((e) => `  ${e.path.join('.')} — ${e.message}`).join('\n');
}

function validateDir(dataDir: string): void {
  const tournamentRaw: unknown = JSON.parse(
    readFileSync(join(dataDir, 'tournament.json'), 'utf-8'),
  );
  const tournament: Tournament = tournamentSchema.parse(tournamentRaw);

  const resultsRaw: unknown = JSON.parse(readFileSync(join(dataDir, 'results.json'), 'utf-8'));
  const actual: ActualResults = resultsSchema.parse(resultsRaw);
  const { knockout } = knockoutResultsSchema.parse(resultsRaw);
  const knockoutMatches = knockout ?? [];

  const knownTeamIds = new Set<string>(tournament.teams.map((t) => t.id));
  const knownPlayerIds = new Set<string>(tournament.players.map((p) => p.id));
  const knownSlotMatchIds = new Set<string>(tournament.bracket.slots.map((s) => s.match));

  for (const km of knockoutMatches) {
    if (!knownSlotMatchIds.has(km.matchId)) {
      throw new Error(`knockout[${km.matchId}].matchId "${km.matchId}" not found in bracket slots`);
    }
    for (const [field, id] of [
      ['home', km.home],
      ['away', km.away],
      ['winner', km.winner],
    ] as [string, string][]) {
      if (!knownTeamIds.has(id)) {
        throw new Error(`knockout[${km.matchId}].${field} "${id}" is not a known team`);
      }
    }
  }

  for (const [grp, teamIds] of Object.entries(actual.groupOrder)) {
    for (const tid of teamIds) {
      if (!knownTeamIds.has(tid)) {
        throw new Error(`groupOrder[${grp}] has unknown team "${tid}"`);
      }
    }
  }

  const playerRefs: [string, string | undefined][] = [
    ['answers.firstRedCardPlayer', actual.answers.firstRedCardPlayer],
    ['finalMatch.decisiveGoalPlayer', actual.finalMatch?.decisiveGoalPlayer],
  ];
  for (const [field, pid] of playerRefs) {
    if (pid !== undefined && !knownPlayerIds.has(pid)) {
      throw new Error(`${field} "${pid}" is not a known player`);
    }
  }
  for (const pid of actual.answers.topScorerPlayer ?? []) {
    if (!knownPlayerIds.has(pid)) {
      throw new Error(`answers.topScorerPlayer "${pid}" is not a known player`);
    }
  }
}

const stagedFiles = process.argv.slice(2);
if (stagedFiles.length === 0) {
  console.error('Usage: tsx scripts/validate-data.ts <file> [...]');
  process.exit(1);
}

const dataDirs = [...new Set(stagedFiles.map((f) => dirname(resolve(f))))];
let hasErrors = false;

for (const dataDir of dataDirs) {
  try {
    validateDir(dataDir);
    console.log(`✓ ${dataDir} valid`);
  } catch (err) {
    if (err instanceof ZodError) {
      console.error(`✗ ${dataDir}:\n${formatZodError(err)}`);
    } else {
      console.error(`✗ ${dataDir}: ${err instanceof Error ? err.message : String(err)}`);
    }
    hasErrors = true;
  }
}

if (hasErrors) process.exit(1);
