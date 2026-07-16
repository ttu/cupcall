import { describe, expect, it, vi } from 'vitest';
import { resolveFinaleWinner } from './finale-winner';

describe('resolveFinaleWinner', () => {
  it('resolves the winner from the snapshot when present, without consulting deriveFromPicks', () => {
    const deriveFromPicks = vi.fn(() => 'SHOULD_NOT_BE_CALLED');
    const winner = resolveFinaleWinner(
      { home: 1, away: 2, homeTeamId: 'A1', awayTeamId: 'B1' },
      deriveFromPicks,
    );
    expect(winner).toBe('B1');
    expect(deriveFromPicks).not.toHaveBeenCalled();
  });

  it('prefers the snapshot even when a live re-derivation would disagree', () => {
    // Regression: a since-changed SF pick must not override the snapshot captured at save time.
    const deriveFromPicks = () => 'D1'; // what a live pickMap-based derivation would (wrongly) say
    const winner = resolveFinaleWinner(
      { home: 1, away: 2, homeTeamId: 'A1', awayTeamId: 'B1' },
      deriveFromPicks,
    );
    expect(winner).toBe('B1');
  });

  it('falls back to deriveFromPicks for legacy rows without a snapshot', () => {
    const winner = resolveFinaleWinner({ home: 2, away: 0 }, () => 'A1');
    expect(winner).toBe('A1');
  });

  it('returns null for a tied score, regardless of snapshot', () => {
    expect(
      resolveFinaleWinner({ home: 1, away: 1, homeTeamId: 'A1', awayTeamId: 'B1' }, () => 'A1'),
    ).toBeNull();
    expect(resolveFinaleWinner({ home: 1, away: 1 }, () => 'A1')).toBeNull();
  });

  it('returns null when no finish score exists', () => {
    expect(resolveFinaleWinner(undefined, () => 'A1')).toBeNull();
  });

  it('treats a partial snapshot (only one team-id set) as absent and falls back', () => {
    const winner = resolveFinaleWinner({ home: 2, away: 0, homeTeamId: 'A1' }, () => 'A1');
    expect(winner).toBe('A1');
  });
});
