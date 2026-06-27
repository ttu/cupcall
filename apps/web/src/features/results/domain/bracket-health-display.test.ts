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
    maxPossiblePoints: 0,
    ...overrides,
  };
}

describe('getRoundHealthDisplay', () => {
  describe('not started (alive=0, pending>0)', () => {
    it('uses pending count as numerator with notStarted=true', () => {
      const d = getRoundHealthDisplay(round({ pendingPicks: 13, totalPicks: 16 }));
      expect(d.numerator).toBe(13);
      expect(d.notStarted).toBe(true);
      expect(d.pendingAnnotation).toBeNull();
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
});
