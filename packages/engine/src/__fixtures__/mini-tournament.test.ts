import { describe, it, expect } from 'vitest';
import { miniTournament } from './mini-tournament.js';

describe('mini-tournament fixture', () => {
  it('has 4 groups of 4 and 24 group matches', () => {
    expect(miniTournament.groups).toHaveLength(4);
    expect(miniTournament.groups.every((g) => g.teams.length === 4)).toBe(true);
    expect(miniTournament.groupMatches).toHaveLength(24);
  });
});
