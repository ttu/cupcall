import { describe, it, expect } from 'vitest';
import { resolveCrossSlotPick } from './cross-slot-pick';

describe('resolveCrossSlotPick', () => {
  it('returns the direct pick when it matches one of the real match participants', () => {
    const result = resolveCrossSlotPick('FRA', 'FRA', 'SWE', new Set(['FRA']));
    expect(result).toBe('FRA');
  });

  it("falls back to the user's other same-round pick when it names one of the real participants", () => {
    // The user's stored pick for this slot is 'NOR' (their group-order prediction routed
    // Norway here), but France actually plays this fixture. The user separately picked
    // France to win a different slot in the same round — that's the team that should show.
    const result = resolveCrossSlotPick('NOR', 'FRA', 'SWE', new Set(['NOR', 'FRA']));
    expect(result).toBe('FRA');
  });

  it('returns null when neither real participant appears anywhere in the candidate picks', () => {
    // Callers that want to keep displaying the raw (invalid) pick in this case — e.g. an
    // "impossible pick" indicator — fall back to the direct pick themselves at the call site.
    const result = resolveCrossSlotPick('ESP', 'BRA', 'ARG', new Set(['ESP']));
    expect(result).toBeNull();
  });

  it('returns the direct pick unchanged when the real participants are not yet known', () => {
    const result = resolveCrossSlotPick('FRA', null, null, new Set(['FRA']));
    expect(result).toBe('FRA');
  });

  it('returns null when there is no direct pick and no round pick matches', () => {
    const result = resolveCrossSlotPick(null, 'BRA', 'ARG', new Set());
    expect(result).toBeNull();
  });

  it('prefers the home team when both home and away appear in the round picks', () => {
    const result = resolveCrossSlotPick('NOR', 'FRA', 'SWE', new Set(['NOR', 'FRA', 'SWE']));
    expect(result).toBe('FRA');
  });
});
