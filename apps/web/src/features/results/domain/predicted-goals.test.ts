import { describe, expect, it } from 'vitest';
import { resolveGoalsByTeamId } from './predicted-goals';

describe('resolveGoalsByTeamId', () => {
  const snapshot = [
    { teamId: 'A1', goals: 2 },
    { teamId: 'B1', goals: 1 },
  ];

  it('returns the goals for the matching team', () => {
    expect(resolveGoalsByTeamId(snapshot, 'A1')).toBe(2);
    expect(resolveGoalsByTeamId(snapshot, 'B1')).toBe(1);
  });

  it('returns null when the snapshot is null', () => {
    expect(resolveGoalsByTeamId(null, 'A1')).toBeNull();
  });

  it('returns null when teamId is null', () => {
    expect(resolveGoalsByTeamId(snapshot, null)).toBeNull();
  });

  it('returns null when teamId is not one of the two snapshot teams', () => {
    expect(resolveGoalsByTeamId(snapshot, 'C1')).toBeNull();
  });
});
