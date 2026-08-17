/**
 * scripts/generate-demo-fixtures.ts — builds the three static demo tournament fixtures
 * (wc-2026-demo-groups, wc-2026-demo-knockout, wc-2026-demo-completed) from the real,
 * committed data/tournaments/wc-2026 files. Run once; output is committed. Not part of the
 * runtime app.
 *
 * Usage: pnpm generate:demo-fixtures
 */
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export type RawGroupMatch = {
  id: string;
  group: string;
  home: string;
  away: string;
  kickoff: string;
};

export type RawTournament = {
  id: string;
  groupMatches: RawGroupMatch[];
  [key: string]: unknown;
};

export type RawMatchResult = {
  matchId: string;
  home: number;
  away: number;
  [key: string]: unknown;
};

export type RawKnockoutEntry = {
  round: 'R32' | 'R16' | 'QF' | 'SF' | 'Final' | 'bronze';
  matchId: string;
  kickoff?: string;
  [key: string]: unknown;
};

export type RawResults = {
  tournamentId: string;
  matchResults: RawMatchResult[];
  groupOrder: Record<string, string[]>;
  knockout?: RawKnockoutEntry[];
  finalMatch?: Record<string, unknown>;
  bronzeMatch?: Record<string, unknown>;
  answers: Record<string, unknown>;
  [key: string]: unknown;
};

export function renameTournamentId(tournament: RawTournament, newId: string): RawTournament {
  return { ...tournament, id: newId };
}

export function renameResultsTournamentId(results: RawResults, newId: string): RawResults {
  return { ...results, tournamentId: newId };
}

/**
 * Truncates results.json to a real cutoff moment: keeps only match/knockout results whose
 * kickoff is at or before the cutoff, derives groupOrder only for groups whose every match is
 * decided, and keeps only the two answers fields that are honestly derivable from a partial
 * tournament (highestMatchGoals from played matches; groupTopScoringTeam/groupTopConcedingTeam
 * once every group is complete). Every other answers field (firstRedCardPlayer, topScorerPlayer,
 * tournamentTopScoringTeam, penaltyShootoutCount, ...) requires full-tournament data and is
 * always dropped here, regardless of cutoff.
 */
export function truncateResults(
  tournament: RawTournament,
  results: RawResults,
  newTournamentId: string,
  cutoff: Date,
): RawResults {
  const kickoffByMatchId = new Map<string, Date>(
    tournament.groupMatches.map((m) => [m.id, new Date(m.kickoff)]),
  );

  const keptMatchResults = results.matchResults.filter((r) => {
    const kickoff = kickoffByMatchId.get(r.matchId);
    if (!kickoff) {
      throw new Error(
        `truncateResults: results.json references match "${r.matchId}" with no kickoff in tournament.json`,
      );
    }
    return kickoff.getTime() <= cutoff.getTime();
  });

  const matchIdsByGroup = new Map<string, string[]>();
  for (const m of tournament.groupMatches) {
    matchIdsByGroup.set(m.group, [...(matchIdsByGroup.get(m.group) ?? []), m.id]);
  }
  const completeGroups = new Set(
    [...matchIdsByGroup.entries()]
      .filter(([, matchIds]) =>
        matchIds.every((id) => kickoffByMatchId.get(id)!.getTime() <= cutoff.getTime()),
      )
      .map(([group]) => group),
  );
  const allGroupsComplete = completeGroups.size === matchIdsByGroup.size;

  const keptGroupOrder = Object.fromEntries(
    Object.entries(results.groupOrder).filter(([group]) => completeGroups.has(group)),
  );

  const keptKnockout = (results.knockout ?? []).filter(
    (k) => k.kickoff !== undefined && new Date(k.kickoff).getTime() <= cutoff.getTime(),
  );
  const finalKept = keptKnockout.some((k) => k.round === 'Final');
  const bronzeKept = keptKnockout.some((k) => k.round === 'bronze');

  const playedGoalTotals = [
    ...keptMatchResults.map((r) => r.home + r.away),
    ...keptKnockout
      .filter((k) => typeof k['homeGoals'] === 'number' && typeof k['awayGoals'] === 'number')
      .map((k) => (k['homeGoals'] as number) + (k['awayGoals'] as number)),
  ];

  const answers: Record<string, unknown> = {};
  if (playedGoalTotals.length > 0) {
    answers['highestMatchGoals'] = Math.max(...playedGoalTotals);
  }
  if (allGroupsComplete) {
    if (results.answers['groupTopScoringTeam'] !== undefined) {
      answers['groupTopScoringTeam'] = results.answers['groupTopScoringTeam'];
    }
    if (results.answers['groupTopConcedingTeam'] !== undefined) {
      answers['groupTopConcedingTeam'] = results.answers['groupTopConcedingTeam'];
    }
  }

  return {
    tournamentId: newTournamentId,
    matchResults: keptMatchResults,
    groupOrder: keptGroupOrder,
    ...(keptKnockout.length > 0 ? { knockout: keptKnockout } : {}),
    ...(finalKept && results.finalMatch ? { finalMatch: results.finalMatch } : {}),
    ...(bronzeKept && results.bronzeMatch ? { bronzeMatch: results.bronzeMatch } : {}),
    answers,
  };
}

// ---- CLI entry point ----

const isDirectlyExecuted =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/scripts/generate-demo-fixtures.ts') ||
    process.argv[1].endsWith('/scripts/generate-demo-fixtures.js'));

if (isDirectlyExecuted) {
  const tournamentsDir = join(process.cwd(), 'data', 'tournaments');
  const sourceDir = join(tournamentsDir, 'wc-2026');

  const sourceTournament = JSON.parse(
    readFileSync(join(sourceDir, 'tournament.json'), 'utf-8'),
  ) as RawTournament;
  const sourceResults = JSON.parse(
    readFileSync(join(sourceDir, 'results.json'), 'utf-8'),
  ) as RawResults;

  const truncatedTargets: { id: string; cutoff: Date }[] = [
    { id: 'wc-2026-demo-groups', cutoff: new Date('2026-06-20T00:00:00Z') },
    { id: 'wc-2026-demo-knockout', cutoff: new Date('2026-07-08T00:00:00Z') },
  ];

  for (const target of truncatedTargets) {
    const dir = join(tournamentsDir, target.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'tournament.json'),
      JSON.stringify(renameTournamentId(sourceTournament, target.id), null, 2) + '\n',
    );
    writeFileSync(
      join(dir, 'results.json'),
      JSON.stringify(
        truncateResults(sourceTournament, sourceResults, target.id, target.cutoff),
        null,
        2,
      ) + '\n',
    );
    process.stdout.write(`Wrote ${dir}\n`);
  }

  const completedId = 'wc-2026-demo-completed';
  const completedDir = join(tournamentsDir, completedId);
  mkdirSync(completedDir, { recursive: true });
  writeFileSync(
    join(completedDir, 'tournament.json'),
    JSON.stringify(renameTournamentId(sourceTournament, completedId), null, 2) + '\n',
  );
  writeFileSync(
    join(completedDir, 'results.json'),
    JSON.stringify(renameResultsTournamentId(sourceResults, completedId), null, 2) + '\n',
  );
  process.stdout.write(`Wrote ${completedDir}\n`);
}
