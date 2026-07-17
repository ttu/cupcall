import { describe, expect, it } from 'vitest';
import { miniTournament, miniScoring } from '@cup/engine/testing';
import { bracketMatchKey as bmk } from '@cup/engine';
import { buildHitPointsMap } from './hit-points';

describe('buildHitPointsMap', () => {
  it('credits each QF match with the points for reaching the semifinal', () => {
    const def = {
      ...miniTournament,
      scoring: { ...miniScoring, roundOf4PerTeam: 11 },
    };

    const map = buildHitPointsMap(def);

    expect(map.get(bmk('qf1'))).toBe(11);
    expect(map.get(bmk('qf2'))).toBe(11);
    expect(map.get(bmk('qf3'))).toBe(11);
    expect(map.get(bmk('qf4'))).toBe(11);
  });

  it('credits each SF match with the points for reaching the final', () => {
    const def = {
      ...miniTournament,
      scoring: { ...miniScoring, final: { ...miniScoring.final, perTeam: 9 } },
    };

    const map = buildHitPointsMap(def);

    expect(map.get(bmk('sf1'))).toBe(9);
    expect(map.get(bmk('sf2'))).toBe(9);
  });

  it('credits the final and bronze matches with their own per-team points', () => {
    const def = {
      ...miniTournament,
      scoring: {
        ...miniScoring,
        final: { ...miniScoring.final, perTeam: 9 },
        bronze: { ...miniScoring.bronze, perTeam: 7 },
      },
    };

    const map = buildHitPointsMap(def);

    expect(map.get(bmk('final'))).toBe(9);
    expect(map.get(bmk('bronze'))).toBe(7);
  });
});
