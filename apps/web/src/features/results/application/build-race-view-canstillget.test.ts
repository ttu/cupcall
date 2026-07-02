import { describe, it, expect } from 'vitest';
import { buildPerUserKnockoutRemaining, buildPerUserSpecialsRemaining } from './build-race-view';
import { miniTournament } from '@cup/engine/testing';
import { getSpecialBetDefs } from '@cup/engine';
import type { UserId, BracketMatchKey, ActualResults } from '@cup/engine';
import type { PoolKnockoutPick, PoolSpecialBet } from '@cup/db';
import type { KnockoutMatchView } from '../domain/types';

function makeKnockoutMatch(
  key: string,
  status: 'scheduled' | 'final',
  opts: { homeTeamId?: string | null; awayTeamId?: string | null } = {},
): KnockoutMatchView {
  return {
    bracketMatchKey: key,
    round: 'SF',
    homeTeamId: opts.homeTeamId ?? null,
    homeTeamName: null,
    awayTeamId: opts.awayTeamId ?? null,
    awayTeamName: null,
    actualHome: null,
    actualAway: null,
    actualWinnerId: null,
    actualWinnerName: null,
    kickoff: null,
    status,
    pickedWinnerId: null,
    pickedWinnerName: null,
    pickedOpponentId: null,
    pickedOpponentName: null,
    pickStatus: 'no-pick',
    predictedHome: null,
    predictedAway: null,
    hit: 'pending',
    projected: false,
    homeTeamConfirmed: true,
    awayTeamConfirmed: true,
    predictedHomeTeamId: null,
    predictedHomeTeamName: null,
    predictedAwayTeamId: null,
    predictedAwayTeamName: null,
    isEntryRound: false,
    homeTeamPredictedPct: null,
    awayTeamPredictedPct: null,
    homeTeamUserPredictedParticipant: false,
    awayTeamUserPredictedParticipant: false,
    poolPickHomePct: null,
    poolPickAwayPct: null,
    pickedOpponentStatus: 'no-pick',
    homeSlotFeederPickedId: null,
    awaySlotFeederPickedId: null,
  };
}

function makePick(userId: string, key: string, teamId: string): PoolKnockoutPick {
  return {
    userId: userId as UserId,
    bracketMatchKey: key as BracketMatchKey,
    winnerTeamId: teamId,
  };
}

function makeSpecialBet(userId: string, betKey: string, value: unknown): PoolSpecialBet {
  return { userId: userId as UserId, betKey, value };
}

const emptyActualResults: ActualResults = { matchResults: [], groupOrder: {}, answers: {} };

describe('buildPerUserKnockoutRemaining', () => {
  const hitPoints = new Map([
    ['sf1', 30],
    ['final', 50],
  ]);

  it('sums hitPoints for picks when both participant slots are TBD (conservative)', () => {
    const matches = [
      makeKnockoutMatch('sf1', 'scheduled'), // homeTeamId/awayTeamId null
      makeKnockoutMatch('final', 'scheduled'), // homeTeamId/awayTeamId null
    ];
    const picks = [makePick('u1', 'sf1', 'ENG'), makePick('u1', 'final', 'ENG')];
    const result = buildPerUserKnockoutRemaining(picks, matches, hitPoints);
    expect(result.get('u1')).toBe(80); // 30 + 50
  });

  it('includes pick when picked team is a confirmed participant', () => {
    const matches = [
      makeKnockoutMatch('sf1', 'scheduled', { homeTeamId: 'ENG', awayTeamId: 'FRA' }),
    ];
    const picks = [makePick('u1', 'sf1', 'ENG')];
    const result = buildPerUserKnockoutRemaining(picks, matches, hitPoints);
    expect(result.get('u1')).toBe(30);
  });

  it('excludes pick when picked team is NOT a confirmed participant (busted)', () => {
    const matches = [
      makeKnockoutMatch('sf1', 'scheduled', { homeTeamId: 'ENG', awayTeamId: 'FRA' }),
      makeKnockoutMatch('final', 'scheduled', { homeTeamId: 'ESP', awayTeamId: 'GER' }),
    ];
    const picks = [
      makePick('u1', 'sf1', 'BRA'), // busted — BRA not in ENG vs FRA
      makePick('u1', 'final', 'BRA'), // busted — BRA not in ESP vs GER
    ];
    const result = buildPerUserKnockoutRemaining(picks, matches, hitPoints);
    expect(result.get('u1')).toBe(0);
  });

  it('returns nothing for a player with no picks', () => {
    const matches = [
      makeKnockoutMatch('sf1', 'scheduled', { homeTeamId: 'ENG', awayTeamId: 'FRA' }),
    ];
    const result = buildPerUserKnockoutRemaining([], matches, hitPoints);
    expect(result.get('u1')).toBeUndefined();
  });

  it('returns 0 when the only picks are for already-final matches', () => {
    const matches = [makeKnockoutMatch('sf1', 'final', { homeTeamId: 'ENG', awayTeamId: 'FRA' })];
    const picks = [makePick('u1', 'sf1', 'ENG')];
    const result = buildPerUserKnockoutRemaining(picks, matches, hitPoints);
    expect(result.get('u1')).toBe(0);
  });

  it('differentiates two players: one with a viable pick, one with a busted pick', () => {
    const matches = [
      makeKnockoutMatch('sf1', 'scheduled', { homeTeamId: 'ENG', awayTeamId: 'FRA' }),
    ];
    const picks = [
      makePick('u1', 'sf1', 'ENG'), // alive
      makePick('u2', 'sf1', 'BRA'), // busted
    ];
    const result = buildPerUserKnockoutRemaining(picks, matches, hitPoints);
    expect(result.get('u1')).toBe(30);
    expect(result.get('u2')).toBe(0);
  });
});

describe('buildPerUserSpecialsRemaining', () => {
  const defs = getSpecialBetDefs(miniTournament.scoring).filter((d) => d.points > 0);

  it('includes points for a pending bet where the user has a pick', () => {
    const poolSpecialBets = [makeSpecialBet('u1', 'penaltyShootoutCount', 3)];
    const result = buildPerUserSpecialsRemaining(poolSpecialBets, defs, emptyActualResults);
    const penaltyDef = defs.find((d) => d.key === 'penaltyShootoutCount')!;
    expect(result.get('u1')).toBe(penaltyDef.points); // 10
  });

  it('excludes resolved bets even when the user has a pick', () => {
    const poolSpecialBets = [makeSpecialBet('u1', 'penaltyShootoutCount', 3)];
    const actualResults: ActualResults = {
      ...emptyActualResults,
      answers: { penaltyShootoutCount: 3 },
    };
    const result = buildPerUserSpecialsRemaining(poolSpecialBets, defs, actualResults);
    expect(result.get('u1') ?? 0).toBe(0);
  });

  it('returns nothing for a user with no picks on any pending bet', () => {
    const result = buildPerUserSpecialsRemaining([], defs, emptyActualResults);
    expect(result.get('u1')).toBeUndefined();
  });

  it('differentiates players: one with pick, one without', () => {
    const poolSpecialBets = [makeSpecialBet('u1', 'penaltyShootoutCount', 3)];
    const result = buildPerUserSpecialsRemaining(poolSpecialBets, defs, emptyActualResults);
    const penaltyDef = defs.find((d) => d.key === 'penaltyShootoutCount')!;
    expect(result.get('u1')).toBe(penaltyDef.points); // has a pick
    expect(result.get('u2')).toBeUndefined(); // no pick → absent from map
  });

  it('accumulates points across multiple pending bets for the same user', () => {
    const poolSpecialBets = [
      makeSpecialBet('u1', 'penaltyShootoutCount', 3),
      makeSpecialBet('u1', 'groupTopScoringTeam', 'A1'),
    ];
    const result = buildPerUserSpecialsRemaining(poolSpecialBets, defs, emptyActualResults);
    const penaltyPts = defs.find((d) => d.key === 'penaltyShootoutCount')!.points;
    const groupTopPts = defs.find((d) => d.key === 'groupTopScoringTeam')!.points;
    expect(result.get('u1')).toBe(penaltyPts + groupTopPts);
  });
});
