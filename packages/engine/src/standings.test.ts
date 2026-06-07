import { describe, expect, it } from 'vitest';
import { groupId, matchId } from './brand.js';
import { miniTournament } from './__fixtures__/mini-tournament.js';
import { computeStandings, deriveGroupOrders } from './standings.js';
import type { GroupScore } from './types.js';

// Group A: A1..A4 (seed 0..3)
// Matches (from fixture): mA1=A1vA2, mA2=A1vA3, mA3=A1vA4, mA4=A2vA3, mA5=A2vA4, mA6=A3vA4

describe('computeStandings', () => {
  it('orders by points then GD then GF — A1>A2>A3>A4', () => {
    // Design scores so each team has distinct points:
    // A1 wins all 3 matches (9pts), A2 wins 2 loses 1 (6pts), A3 wins 1 loses 2 (3pts), A4 loses all (0pts)
    const scores: GroupScore[] = [
      { matchId: matchId('mA1'), home: 2, away: 0 }, // A1 beats A2
      { matchId: matchId('mA2'), home: 2, away: 0 }, // A1 beats A3
      { matchId: matchId('mA3'), home: 2, away: 0 }, // A1 beats A4
      { matchId: matchId('mA4'), home: 1, away: 0 }, // A2 beats A3
      { matchId: matchId('mA5'), home: 1, away: 0 }, // A2 beats A4
      { matchId: matchId('mA6'), home: 1, away: 0 }, // A3 beats A4
    ];
    const result = computeStandings(miniTournament, groupId('A'), scores);
    expect(result).toEqual(['A1', 'A2', 'A3', 'A4']);
  });

  it('breaks an equal-points tie by goal difference', () => {
    // A1, A2, A4 all finish on 6 pts; A3 on 0. GD separates the three: A1 +9, A2 +1, A4 -3.
    const scores: GroupScore[] = [
      { matchId: matchId('mA1'), home: 0, away: 1 }, // A2 beats A1
      { matchId: matchId('mA2'), home: 5, away: 0 }, // A1 beats A3 (big GD)
      { matchId: matchId('mA3'), home: 5, away: 0 }, // A1 beats A4 (big GD)
      { matchId: matchId('mA4'), home: 1, away: 0 }, // A2 beats A3
      { matchId: matchId('mA5'), home: 0, away: 1 }, // A4 beats A2
      { matchId: matchId('mA6'), home: 0, away: 1 }, // A4 beats A3
    ];
    const result = computeStandings(miniTournament, groupId('A'), scores);
    expect(result).toEqual(['A1', 'A2', 'A4', 'A3']);
  });

  it('breaks an equal-points, equal-GD tie by goals for', () => {
    // All four draw every match (3 pts, GD 0 each); goals-for separates them:
    // A1=5, A3=4, A2=3, A4=0.
    const scores: GroupScore[] = [
      { matchId: matchId('mA1'), home: 2, away: 2 }, // A1–A2
      { matchId: matchId('mA2'), home: 3, away: 3 }, // A1–A3
      { matchId: matchId('mA3'), home: 0, away: 0 }, // A1–A4
      { matchId: matchId('mA4'), home: 1, away: 1 }, // A2–A3
      { matchId: matchId('mA5'), home: 0, away: 0 }, // A2–A4
      { matchId: matchId('mA6'), home: 0, away: 0 }, // A3–A4
    ];
    const result = computeStandings(miniTournament, groupId('A'), scores);
    expect(result).toEqual(['A1', 'A3', 'A2', 'A4']);
  });

  it('falls back to seed order when all matches are draws', () => {
    // All draws → all teams have 1pt per match played (3 matches each → 3pts)
    // Same GD=0, GF=3, so seedOrder decides: A1 < A2 < A3 < A4 (lower index = higher rank)
    const scores: GroupScore[] = [
      { matchId: matchId('mA1'), home: 1, away: 1 },
      { matchId: matchId('mA2'), home: 1, away: 1 },
      { matchId: matchId('mA3'), home: 1, away: 1 },
      { matchId: matchId('mA4'), home: 1, away: 1 },
      { matchId: matchId('mA5'), home: 1, away: 1 },
      { matchId: matchId('mA6'), home: 1, away: 1 },
    ];
    const result = computeStandings(miniTournament, groupId('A'), scores);
    expect(result).toEqual(['A1', 'A2', 'A3', 'A4']);
  });

  it('throws for unknown group', () => {
    expect(() => computeStandings(miniTournament, groupId('Z'), [])).toThrow('Unknown group Z');
  });
});

describe('deriveGroupOrders', () => {
  it('computes standings for all groups', () => {
    const scores: GroupScore[] = [
      // Group A all draws → seed order
      { matchId: matchId('mA1'), home: 0, away: 0 },
      { matchId: matchId('mA2'), home: 0, away: 0 },
      { matchId: matchId('mA3'), home: 0, away: 0 },
      { matchId: matchId('mA4'), home: 0, away: 0 },
      { matchId: matchId('mA5'), home: 0, away: 0 },
      { matchId: matchId('mA6'), home: 0, away: 0 },
    ];
    const orders = deriveGroupOrders(miniTournament, scores);
    expect(Object.keys(orders)).toHaveLength(4); // A, B, C, D
    // Group A with only draws → seed order
    expect(orders[groupId('A')]).toEqual(['A1', 'A2', 'A3', 'A4']);
    // Groups B, C, D have no scores → all zeros → seed order
    expect(orders[groupId('B')]).toEqual(['B1', 'B2', 'B3', 'B4']);
    expect(orders[groupId('C')]).toEqual(['C1', 'C2', 'C3', 'C4']);
    expect(orders[groupId('D')]).toEqual(['D1', 'D2', 'D3', 'D4']);
  });
});
