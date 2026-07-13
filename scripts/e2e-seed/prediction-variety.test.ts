import { describe, it, expect } from 'vitest';
import { miniTournament } from '@cup/engine/testing';
import { teamId, bracketMatchKey } from '@cup/engine';
import {
  mulberry32,
  generateGroupScores,
  generateBracketPicks,
  generateFinishScore,
  generateSpecials,
  pickWinnerBiased,
} from './prediction-variety';

describe('prediction-variety generator', () => {
  const tournament = miniTournament;

  it('mulberry32 is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it('generateGroupScores returns one entry per match with non-negative goals', () => {
    const rng = mulberry32(1);
    const scores = generateGroupScores(rng, tournament.groupMatches);
    expect(scores).toHaveLength(tournament.groupMatches.length);
    for (const s of scores) {
      expect(s.home).toBeGreaterThanOrEqual(0);
      expect(s.away).toBeGreaterThanOrEqual(0);
    }
  });

  it('generateGroupScores is deterministic for the same seed', () => {
    const a = generateGroupScores(mulberry32(7), tournament.groupMatches);
    const b = generateGroupScores(mulberry32(7), tournament.groupMatches);
    expect(a).toEqual(b);
  });

  it("generateBracketPicks: every winner is one of that match's two participants", () => {
    const rng = mulberry32(3);
    const groupScores = generateGroupScores(rng, tournament.groupMatches);
    const picks = generateBracketPicks(rng, tournament, groupScores);
    for (const p of picks) {
      expect([p.home, p.away]).toContain(p.winner);
    }
  });

  it('generateBracketPicks covers every bracket match exactly once', () => {
    const rng = mulberry32(9);
    const groupScores = generateGroupScores(rng, tournament.groupMatches);
    const picks = generateBracketPicks(rng, tournament, groupScores);
    const keys = picks.map((p) => p.bracketMatchKey);
    const expectedCount = tournament.bracket.slots.length + tournament.bracket.progression.length;
    expect(keys).toHaveLength(expectedCount);
    expect(new Set(keys).size).toBe(expectedCount);
  });

  it('pickWinnerBiased favors the lower-fifaRanking team roughly 75% of the time', () => {
    const strong = teamId('STR');
    const weak = teamId('WEAK');
    const teams = [
      { id: strong, fifaRanking: 1 },
      { id: weak, fifaRanking: 50 },
    ];
    const rng = mulberry32(123);
    let strongWins = 0;
    const trials = 400;
    for (let i = 0; i < trials; i++) {
      if (pickWinnerBiased(rng, teams, strong, weak) === strong) strongWins++;
    }
    const ratio = strongWins / trials;
    expect(ratio).toBeGreaterThan(0.65);
    expect(ratio).toBeLessThan(0.85);
  });

  it('pickWinnerBiased is a 50/50 coin flip when fifaRanking is missing', () => {
    const a = teamId('A');
    const b = teamId('B');
    const teams = [{ id: a }, { id: b }];
    const rng = mulberry32(55);
    let aWins = 0;
    const trials = 400;
    for (let i = 0; i < trials; i++) {
      if (pickWinnerBiased(rng, teams, a, b) === a) aWins++;
    }
    const ratio = aWins / trials;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });

  it('generateFinishScore always gives the winner strictly more goals', () => {
    const rng = mulberry32(11);
    const pick = {
      bracketMatchKey: bracketMatchKey('final'),
      home: teamId('A1'),
      away: teamId('B1'),
      winner: teamId('A1'),
    };
    for (let i = 0; i < 20; i++) {
      const score = generateFinishScore(rng, pick);
      expect(score.home).toBeGreaterThan(score.away);
    }
  });

  it('generateSpecials returns all 11 bet keys with in-roster values', () => {
    const rng = mulberry32(5);
    const specials = generateSpecials(rng, tournament);
    const expectedKeys = [
      'topScorerPlayer',
      'finalDecisiveGoalPlayer',
      'firstRedCardPlayer',
      'mostYellowCardsTeam',
      'groupTopScoringTeam',
      'groupTopConcedingTeam',
      'tournamentTopScoringTeam',
      'tournamentTopConcedingTeam',
      'highestMatchGoals',
      'penaltyShootoutCount',
      'finalDecidedByPenalties',
    ];
    expect(Object.keys(specials).sort()).toEqual([...expectedKeys].sort());

    const teamIds = new Set(
      tournament.teams.map((t: (typeof tournament.teams)[0]) => t.id as string),
    );
    const playerIds = new Set(
      tournament.players.map((p: (typeof tournament.players)[0]) => p.id as string),
    );
    expect(playerIds.has(specials['topScorerPlayer'] as string)).toBe(true);
    expect(playerIds.has(specials['firstRedCardPlayer'] as string)).toBe(true);
    expect(teamIds.has(specials['mostYellowCardsTeam'] as string)).toBe(true);
    expect(typeof specials['highestMatchGoals']).toBe('number');
    expect(typeof specials['finalDecidedByPenalties']).toBe('boolean');
  });
});
