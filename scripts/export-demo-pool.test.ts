import { describe, it, expect } from 'vitest';
import { anonymizeMembers, DEMO_NICKNAMES } from './export-demo-pool';
import type { DemoBackupMember } from './demo-backup-schema';

function member(userId: string, displayName: string): DemoBackupMember {
  return {
    userId,
    displayName,
    prediction: { groupScores: [], knockoutPicks: [], finishScores: {}, specials: {} },
  };
}

describe('anonymizeMembers', () => {
  it('replaces userId and displayName with synthetic ids and nicknames, preserving order', () => {
    const real = [member('real-1', 'Tomi'), member('real-2', 'Hexa'), member('real-3', 'Sepi')];
    const anon = anonymizeMembers(real);

    expect(anon).toHaveLength(3);
    expect(anon[0]).toMatchObject({ userId: 'demo-user-1', displayName: DEMO_NICKNAMES[0] });
    expect(anon[1]).toMatchObject({ userId: 'demo-user-2', displayName: DEMO_NICKNAMES[1] });
    expect(anon[2]).toMatchObject({ userId: 'demo-user-3', displayName: DEMO_NICKNAMES[2] });
  });

  it('never leaks the real userId or displayName into the output', () => {
    const real = [member('real-1', 'Tomi')];
    const anon = anonymizeMembers(real);
    expect(JSON.stringify(anon)).not.toContain('real-1');
    expect(JSON.stringify(anon)).not.toContain('Tomi');
  });

  it('preserves the prediction payload unchanged', () => {
    const real = [
      {
        ...member('real-1', 'Tomi'),
        prediction: {
          groupScores: [{ matchId: 'mA1', home: 2, away: 0 }],
          knockoutPicks: [{ bracketMatchKey: 'final', winner: 'ARG' }],
          finishScores: { final: { home: 1, away: 0 } },
          specials: { highestMatchGoals: 5 },
        },
      },
    ];
    const anon = anonymizeMembers(real);
    expect(anon[0]?.prediction).toEqual(real[0]?.prediction);
  });

  it('throws when there are more members than available nicknames', () => {
    const tooMany = Array.from({ length: DEMO_NICKNAMES.length + 1 }, (_, i) =>
      member(`real-${i}`, `Real ${i}`),
    );
    expect(() => anonymizeMembers(tooMany)).toThrow(/nicknames/);
  });
});
