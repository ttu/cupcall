import type { Tournament, BracketMatchKey, Points } from '@cup/engine';
import { points as toPoints } from '@cup/engine';

type Progression = Tournament['bracket']['progression'];

/**
 * Credits every feeder (`from`) match of each progression whose `match` is one of
 * `matchKeys` with `points` — i.e. reaching the next round earns the feeder's pick its reward.
 */
function creditFeedersOfMatches(
  progression: Progression,
  matchKeys: BracketMatchKey[],
  points: Points,
  map: Map<BracketMatchKey, Points>,
): void {
  for (const prog of progression) {
    if (!matchKeys.includes(prog.match)) continue;
    for (const fromKey of prog.from) map.set(fromKey, points);
  }
}

/**
 * Maps each knockout bracketMatchKey to the points earned for correctly picking that
 * match's winner. Final and Bronze map to their own key (not a feeder), since there is
 * no later progression match to derive the reward from.
 */
export function buildHitPointsMap(def: Tournament): Map<BracketMatchKey, Points> {
  const map = new Map<BracketMatchKey, Points>();
  const { bracket, scoring } = def;

  creditFeedersOfMatches(
    bracket.progression,
    bracket.roundOf16Matches,
    toPoints(scoring.roundOf16PerTeam),
    map,
  );
  creditFeedersOfMatches(
    bracket.progression,
    bracket.roundOf8Matches,
    toPoints(scoring.roundOf8PerTeam),
    map,
  );
  creditFeedersOfMatches(
    bracket.progression,
    bracket.semiFinals,
    toPoints(scoring.roundOf4PerTeam),
    map,
  );

  const finalProg = bracket.progression.find((p) => p.match === bracket.finalMatch);
  if (finalProg) {
    for (const sfKey of finalProg.from) map.set(sfKey, toPoints(scoring.final.perTeam));
  }
  map.set(bracket.finalMatch, toPoints(scoring.final.perTeam));
  map.set(bracket.bronzeMatch, toPoints(scoring.bronze.perTeam));
  return map;
}
