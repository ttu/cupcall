import { describe, it, expect } from 'vitest';
import { getRoundHealthDisplay } from './bracket-health-display';
import type { BracketRoundHealth } from './types';

function round(overrides: Partial<BracketRoundHealth>): BracketRoundHealth {
  return {
    label: 'R16',
    alivePicks: 0,
    pendingPicks: 0,
    bustedPicks: 0,
    totalPicks: 0,
    earnedPoints: 0,
    maxPossiblePoints: 0,
    ...overrides,
  };
}

describe('getRoundHealthDisplay', () => {
  describe('not started (alive=0, pending>0)', () => {
    it('shows 0 as numerator and pending count as annotation', () => {
      const d = getRoundHealthDisplay(round({ pendingPicks: 13, totalPicks: 16 }));
      expect(d.numerator).toBe(0);
      expect(d.notStarted).toBe(true);
      expect(d.pendingAnnotation).toBe(13);
      expect(d.color).toBe('ok');
    });

    it('is warning when some picks are busted', () => {
      const d = getRoundHealthDisplay(round({ pendingPicks: 10, bustedPicks: 3, totalPicks: 16 }));
      expect(d.color).toBe('warning');
      expect(d.notStarted).toBe(true);
    });
  });

  describe('in progress (alive>0, pending>0)', () => {
    it('uses alive count as numerator and surfaces pending as annotation', () => {
      const d = getRoundHealthDisplay(round({ alivePicks: 30, pendingPicks: 2, totalPicks: 32 }));
      expect(d.numerator).toBe(30);
      expect(d.notStarted).toBe(false);
      expect(d.pendingAnnotation).toBe(2);
      expect(d.color).toBe('ok');
    });

    it('is warning when some picks are busted', () => {
      const d = getRoundHealthDisplay(
        round({ alivePicks: 5, pendingPicks: 3, bustedPicks: 2, totalPicks: 10 }),
      );
      expect(d.color).toBe('warning');
      expect(d.pendingAnnotation).toBe(3);
    });
  });

  describe('complete (pending=0)', () => {
    it('uses alive count as numerator with no annotation', () => {
      const d = getRoundHealthDisplay(round({ alivePicks: 30, totalPicks: 32, bustedPicks: 2 }));
      expect(d.numerator).toBe(30);
      expect(d.notStarted).toBe(false);
      expect(d.pendingAnnotation).toBeNull();
      expect(d.color).toBe('warning');
    });

    it('is danger when all picks are busted', () => {
      const d = getRoundHealthDisplay(round({ bustedPicks: 16, totalPicks: 16 }));
      expect(d.color).toBe('danger');
      expect(d.numerator).toBe(0);
    });

    it('is ok when all picks are alive', () => {
      const d = getRoundHealthDisplay(round({ alivePicks: 8, totalPicks: 8 }));
      expect(d.color).toBe('ok');
      expect(d.pendingAnnotation).toBeNull();
    });
  });

  describe('missed picks (alive=0, pending=0, busted=0)', () => {
    it('is ok color with zero numerator when all picks are missed', () => {
      const d = getRoundHealthDisplay(round({ totalPicks: 16 }));
      expect(d.numerator).toBe(0);
      expect(d.notStarted).toBe(false);
      expect(d.color).toBe('ok');
    });
  });

  describe('bustedAnnotation and noPickAnnotation', () => {
    it('are both null when all picks are alive or pending', () => {
      const d = getRoundHealthDisplay(round({ alivePicks: 2, pendingPicks: 11, totalPicks: 13 }));
      expect(d.bustedAnnotation).toBeNull();
      expect(d.noPickAnnotation).toBeNull();
    });

    it('reports busted picks under bustedAnnotation, not noPickAnnotation', () => {
      const d = getRoundHealthDisplay(
        round({ alivePicks: 2, pendingPicks: 11, bustedPicks: 3, totalPicks: 16 }),
      );
      expect(d.bustedAnnotation).toBe(3);
      expect(d.noPickAnnotation).toBeNull();
    });

    it('reports no-pick slots under noPickAnnotation, not bustedAnnotation', () => {
      // 2 alive + 11 pending + 0 busted + 3 no-pick = 16 total
      const d = getRoundHealthDisplay(round({ alivePicks: 2, pendingPicks: 11, totalPicks: 16 }));
      expect(d.bustedAnnotation).toBeNull();
      expect(d.noPickAnnotation).toBe(3);
    });

    it('keeps busted and no-pick counts separate when both are present', () => {
      // 2 alive + 9 pending + 2 busted + 3 no-pick = 16
      const d = getRoundHealthDisplay(
        round({ alivePicks: 2, pendingPicks: 9, bustedPicks: 2, totalPicks: 16 }),
      );
      expect(d.bustedAnnotation).toBe(2);
      expect(d.noPickAnnotation).toBe(3);
    });

    it('are both null when total is zero', () => {
      const d = getRoundHealthDisplay(round({}));
      expect(d.bustedAnnotation).toBeNull();
      expect(d.noPickAnnotation).toBeNull();
    });
  });
});
