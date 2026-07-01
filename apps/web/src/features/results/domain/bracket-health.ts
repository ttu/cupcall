import type { Tournament, BracketMatchKey } from '@cup/engine';
import type {
  BracketRoundHealth,
  BracketHealth,
  BracketRoundResultView,
  KnockoutMatchView,
  GroupResultView,
} from './types';

export function computeR32QualHealth(
  predictedQualifiers: string[],
  groupResults: GroupResultView[],
): BracketRoundHealth {
  const teamStanding = new Map<
    string,
    { eliminated: boolean; qualifies: 'auto' | 'best-third' | false }
  >();
  for (const gr of groupResults) {
    for (const row of gr.standing) {
      teamStanding.set(row.teamId, row);
    }
  }

  let alivePicks = 0;
  let bustedPicks = 0;
  let pendingPicks = 0;

  for (const teamId of predictedQualifiers) {
    const standing = teamStanding.get(teamId);
    if (!standing) {
      pendingPicks++;
    } else if (standing.qualifies !== false) {
      // Check qualifies BEFORE eliminated — a team with qualifies='best-third'
      // may transiently have eliminated=true due to bestThirdsSet/standing skew.
      alivePicks++;
    } else if (standing.eliminated) {
      bustedPicks++;
    } else {
      pendingPicks++;
    }
  }

  return {
    label: 'R32',
    alivePicks,
    pendingPicks,
    bustedPicks,
    totalPicks: predictedQualifiers.length,
    earnedPoints: 0,
    maxPossiblePoints: 0,
  };
}

export function computeBracketHealth(
  rounds: BracketRoundResultView[],
  bronze: KnockoutMatchView | null,
  def: Tournament,
): BracketHealth {
  const allMatches = [...rounds.flatMap((r) => r.matches), ...(bronze ? [bronze] : [])];
  const scoringMap = buildRoundScoringMap(def);
  const finalLabel = getRoundLabel(def.bracket.finalMatch as string, def.bracket.rounds);

  // Per-team scored rounds (R32→'R16', R16→'R8')
  const scoredRows: BracketRoundHealth[] = rounds
    .filter((r) => scoringMap.has(r.label))
    .map((r) => {
      const { targetLabel, ptsPerPick } = scoringMap.get(r.label)!;
      const alivePicks = r.matches.filter((m) => m.pickStatus === 'alive').length;
      const pendingPicks = r.matches.filter((m) => m.pickStatus === 'pending').length;
      const bustedPicks = r.matches.filter((m) => m.pickStatus === 'busted').length;
      return {
        label: targetLabel,
        alivePicks,
        pendingPicks,
        bustedPicks,
        totalPicks: r.matches.length,
        earnedPoints: alivePicks * ptsPerPick,
        maxPossiblePoints: (alivePicks + pendingPicks) * ptsPerPick,
      };
    });

  // SF picks: rounds not in scoring map and not the Final (after QF is mapped to 'Top 4')
  const sfMatches = rounds
    .filter((r) => !scoringMap.has(r.label) && r.label !== finalLabel)
    .flatMap((r) => r.matches);
  const sfRow: BracketRoundHealth | null =
    sfMatches.length > 0
      ? {
          label: 'SF',
          alivePicks: sfMatches.filter((m) => m.pickStatus === 'alive').length,
          pendingPicks: sfMatches.filter((m) => m.pickStatus === 'pending').length,
          bustedPicks: sfMatches.filter((m) => m.pickStatus === 'busted').length,
          totalPicks: sfMatches.length,
          earnedPoints: 0,
          maxPossiblePoints: 0,
        }
      : null;

  // Final row
  const finalRound = rounds.find((r) => r.label === finalLabel);
  const finalRow: BracketRoundHealth | null =
    finalRound && finalRound.matches.length > 0
      ? {
          label: 'Final',
          alivePicks: finalRound.matches.filter((m) => m.pickStatus === 'alive').length,
          pendingPicks: finalRound.matches.filter((m) => m.pickStatus === 'pending').length,
          bustedPicks: finalRound.matches.filter((m) => m.pickStatus === 'busted').length,
          totalPicks: finalRound.matches.length,
          earnedPoints: 0,
          maxPossiblePoints: 0,
        }
      : null;

  // Bronze row
  const bronzeRow: BracketRoundHealth | null = bronze
    ? {
        label: 'Bronze',
        alivePicks: bronze.pickStatus === 'alive' ? 1 : 0,
        pendingPicks: bronze.pickStatus === 'pending' ? 1 : 0,
        bustedPicks: bronze.pickStatus === 'busted' ? 1 : 0,
        totalPicks: 1,
        earnedPoints: 0,
        maxPossiblePoints: 0,
      }
    : null;

  const perRound = (
    [...scoredRows, sfRow, finalRow, bronzeRow] as (BracketRoundHealth | null)[]
  ).filter((r): r is BracketRoundHealth => r !== null);

  return {
    totalPicks: allMatches.length,
    alivePicks: allMatches.filter((m) => m.pickStatus === 'alive').length,
    pendingPicks: allMatches.filter((m) => m.pickStatus === 'pending').length,
    bustedPicks: allMatches.filter((m) => m.pickStatus === 'busted').length,
    missedPicks: allMatches.filter((m) => m.pickStatus === 'no-pick').length,
    perRound,
  };
}

/**
 * Maps each bracket round label to the scoring category it feeds into.
 *
 * R32 picks determine the R16 team set (roundOf16PerTeam each).
 * R16 picks determine the R8/QF team set (roundOf8PerTeam each).
 * Uses bracket.progression to find the feeding round without hardcoding round names.
 */
function buildRoundScoringMap(
  def: Tournament,
): Map<string, { targetLabel: string; ptsPerPick: number }> {
  const map = new Map<string, { targetLabel: string; ptsPerPick: number }>();
  const { bracket, scoring } = def;

  function addFeedingRound(
    targetMatchKeys: BracketMatchKey[],
    targetLabel: string,
    ptsPerPick: number,
  ) {
    if (targetMatchKeys.length === 0) return;
    const prog = bracket.progression.find((p) => p.match === targetMatchKeys[0]);
    if (!prog || prog.from.length === 0) return;
    const feedingLabel = getRoundLabel(prog.from[0] as string, bracket.rounds);
    map.set(feedingLabel, { targetLabel, ptsPerPick });
  }

  addFeedingRound(bracket.roundOf16Matches, 'R16', scoring.roundOf16PerTeam);
  addFeedingRound(bracket.roundOf8Matches, 'R8', scoring.roundOf8PerTeam);
  addFeedingRound(bracket.semiFinals, 'Top 4', 0);

  return map;
}

function getRoundLabel(matchKey: string, rounds: string[]): string {
  const prefixMap: Record<string, string> = {
    'ro32-': 'R32',
    'ro16-': 'R16',
    'qf-': 'QF',
    'sf-': 'SF',
  };
  for (const [prefix, label] of Object.entries(prefixMap)) {
    if (matchKey.startsWith(prefix)) return label;
  }
  for (const r of rounds) {
    if (matchKey.toLowerCase().startsWith(r.toLowerCase().replace(/\s+/g, '-'))) return r;
  }
  return matchKey;
}
