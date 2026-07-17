import type { Tournament } from '@cup/engine';

type Progression = Tournament['bracket']['progression'];

/**
 * Credits every feeder (`from`) match of each progression whose `match` is one of
 * `matchKeys` with `points` — i.e. reaching the next round earns the feeder's pick its reward.
 */
function creditFeedersOfMatches(
  progression: Progression,
  matchKeys: string[],
  points: number,
  map: Map<string, number>,
): void {
  for (const prog of progression) {
    if (!matchKeys.includes(prog.match as string)) continue;
    for (const fromKey of prog.from) map.set(fromKey as string, points);
  }
}

/**
 * Maps each knockout bracketMatchKey to the points earned for correctly picking that
 * match's winner. Final and Bronze map to their own key (not a feeder), since there is
 * no later progression match to derive the reward from.
 */
export function buildHitPointsMap(def: Tournament): Map<string, number> {
  const map = new Map<string, number>();
  const { bracket, scoring } = def;

  creditFeedersOfMatches(
    bracket.progression,
    bracket.roundOf16Matches as string[],
    scoring.roundOf16PerTeam,
    map,
  );
  creditFeedersOfMatches(
    bracket.progression,
    bracket.roundOf8Matches as string[],
    scoring.roundOf8PerTeam,
    map,
  );
  creditFeedersOfMatches(
    bracket.progression,
    bracket.semiFinals as string[],
    scoring.roundOf4PerTeam,
    map,
  );

  const finalProg = bracket.progression.find((p) => p.match === bracket.finalMatch);
  if (finalProg) {
    for (const sfKey of finalProg.from) map.set(sfKey as string, scoring.final.perTeam);
  }
  map.set(bracket.finalMatch as string, scoring.final.perTeam);
  map.set(bracket.bronzeMatch as string, scoring.bronze.perTeam);
  return map;
}
