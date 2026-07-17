import type { Tournament } from '@cup/engine';

/**
 * Maps each knockout bracketMatchKey to the points earned for correctly picking that
 * match's winner. Final and Bronze map to their own key (not a feeder), since there is
 * no later progression match to derive the reward from.
 */
export function buildHitPointsMap(def: Tournament): Map<string, number> {
  const map = new Map<string, number>();
  const { bracket, scoring } = def;
  for (const prog of bracket.progression) {
    if ((bracket.roundOf16Matches as string[]).includes(prog.match as string)) {
      for (const fromKey of prog.from) map.set(fromKey as string, scoring.roundOf16PerTeam);
    }
    if ((bracket.roundOf8Matches as string[]).includes(prog.match as string)) {
      for (const fromKey of prog.from) map.set(fromKey as string, scoring.roundOf8PerTeam);
    }
    if ((bracket.semiFinals as string[]).includes(prog.match as string)) {
      for (const fromKey of prog.from) map.set(fromKey as string, scoring.roundOf4PerTeam);
    }
  }
  const finalProg = bracket.progression.find((p) => p.match === bracket.finalMatch);
  if (finalProg) {
    for (const sfKey of finalProg.from) map.set(sfKey as string, scoring.final.perTeam);
  }
  map.set(bracket.finalMatch as string, scoring.final.perTeam);
  map.set(bracket.bronzeMatch as string, scoring.bronze.perTeam);
  return map;
}
