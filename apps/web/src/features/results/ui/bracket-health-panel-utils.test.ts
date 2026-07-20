import { describe, it, expect } from 'vitest';
import { buildTopFour } from './bracket-health-panel-utils';
import type { KnockoutMatchView, PickStatus } from '../domain/types';

function mkMatch(partial: Partial<KnockoutMatchView> = {}): KnockoutMatchView {
  return {
    bracketMatchKey: 'final',
    round: 'Final',
    homeTeamId: null,
    homeTeamName: null,
    homeTeamFifaRanking: null,
    awayTeamId: null,
    awayTeamName: null,
    awayTeamFifaRanking: null,
    actualHome: null,
    actualAway: null,
    actualWinnerId: null,
    actualWinnerName: null,
    kickoff: null,
    status: 'scheduled',
    pickedWinnerId: null,
    pickedWinnerName: null,
    pickedOpponentId: null,
    pickedOpponentName: null,
    pickStatus: 'no-pick',
    pickedOpponentStatus: 'no-pick',
    predictedHome: null,
    predictedAway: null,
    predictedGoalsByTeam: null,
    hit: 'pending',
    points: 0,
    projected: false,
    homeTeamConfirmed: false,
    awayTeamConfirmed: false,
    predictedHomeTeamId: null,
    predictedHomeTeamName: null,
    predictedAwayTeamId: null,
    predictedAwayTeamName: null,
    pickedHomeTeamId: null,
    pickedHomeTeamName: null,
    pickedAwayTeamId: null,
    pickedAwayTeamName: null,
    isEntryRound: false,
    homeTeamPredictedPct: null,
    awayTeamPredictedPct: null,
    homeTeamUserPredictedParticipant: false,
    awayTeamUserPredictedParticipant: false,
    poolPickHomePct: null,
    poolPickAwayPct: null,
    homeSlotFeederPickedId: null,
    awaySlotFeederPickedId: null,
    decidedBy: null,
    ...partial,
  };
}

describe('buildTopFour', () => {
  it('marks a genuinely eliminated team as busted with no wrong-match override', () => {
    const finalMatch = mkMatch({
      bracketMatchKey: 'final',
      homeTeamId: 'ESP',
      homeTeamName: 'Spain',
      awayTeamId: 'ARG',
      awayTeamName: 'Argentina',
      pickedWinnerId: 'ESP',
      pickedWinnerName: 'Spain',
      pickStatus: 'pending',
      pickedOpponentId: 'ENG',
      pickedOpponentName: 'England',
      pickedOpponentStatus: 'busted',
    });
    const bronzeMatch = mkMatch({
      bracketMatchKey: 'bronze',
      homeTeamId: 'FRA',
      homeTeamName: 'France',
      awayTeamId: 'ENG',
      awayTeamName: 'England',
      pickedWinnerId: 'GER',
      pickedWinnerName: 'Germany',
      pickStatus: 'busted',
      pickedOpponentId: 'ARG',
      pickedOpponentName: 'Argentina',
      pickedOpponentStatus: 'busted',
    });

    const rows = buildTopFour(finalMatch, bronzeMatch);

    const germany = rows.find((r) => r.position === '3rd');
    expect(germany?.status).toBe('busted');
    expect(germany?.realOutcomeLabel).toBeNull();
  });

  it('flags the predicted Final runner-up as playing Bronze when it is actually alive in Bronze', () => {
    const finalMatch = mkMatch({
      bracketMatchKey: 'final',
      homeTeamId: 'ESP',
      awayTeamId: 'ARG',
      pickedWinnerId: 'ESP',
      pickedWinnerName: 'Spain',
      pickStatus: 'pending',
      pickedOpponentId: 'ENG',
      pickedOpponentName: 'England',
      pickedOpponentStatus: 'busted',
    });
    const bronzeMatch = mkMatch({
      bracketMatchKey: 'bronze',
      homeTeamId: 'FRA',
      awayTeamId: 'ENG',
      actualWinnerId: null,
      pickedWinnerId: 'GER',
      pickedWinnerName: 'Germany',
      pickStatus: 'busted',
      pickedOpponentId: 'ARG',
      pickedOpponentName: 'Argentina',
      pickedOpponentStatus: 'busted',
    });

    const rows = buildTopFour(finalMatch, bronzeMatch);

    const england = rows.find((r) => r.position === '2nd');
    expect(england?.status).toBe('busted');
    expect(england?.realOutcomeLabel).toBe('playing Bronze');
  });

  it('flags the predicted Bronze loser as playing the Final when it is actually alive in the Final', () => {
    const finalMatch = mkMatch({
      bracketMatchKey: 'final',
      homeTeamId: 'ESP',
      awayTeamId: 'ARG',
      actualWinnerId: null,
      pickedWinnerId: 'ESP',
      pickedWinnerName: 'Spain',
      pickStatus: 'pending',
      pickedOpponentId: 'ENG',
      pickedOpponentName: 'England',
      pickedOpponentStatus: 'busted',
    });
    const bronzeMatch = mkMatch({
      bracketMatchKey: 'bronze',
      homeTeamId: 'FRA',
      awayTeamId: 'ENG',
      pickedWinnerId: 'GER',
      pickedWinnerName: 'Germany',
      pickStatus: 'busted',
      pickedOpponentId: 'ARG',
      pickedOpponentName: 'Argentina',
      pickedOpponentStatus: 'busted',
    });

    const rows = buildTopFour(finalMatch, bronzeMatch);

    const argentina = rows.find((r) => r.position === '4th');
    expect(argentina?.status).toBe('busted');
    expect(argentina?.realOutcomeLabel).toBe('playing Final');
  });

  it('reports the real 4th-place finish once the sibling Bronze match is final and the team lost it', () => {
    // England was predicted as the Final runner-up (2nd), but the real Bronze match sent it to
    // 4th place instead — still genuinely in the real top four, so it must not read "eliminated".
    const finalMatch = mkMatch({
      bracketMatchKey: 'final',
      homeTeamId: 'ESP',
      awayTeamId: 'ARG',
      pickedWinnerId: 'ESP',
      pickedWinnerName: 'Spain',
      pickStatus: 'pending',
      pickedOpponentId: 'ENG',
      pickedOpponentName: 'England',
      pickedOpponentStatus: 'busted',
    });
    const bronzeMatch = mkMatch({
      bracketMatchKey: 'bronze',
      homeTeamId: 'FRA',
      awayTeamId: 'ENG',
      status: 'final',
      actualWinnerId: 'FRA',
      pickedWinnerId: 'GER',
      pickedWinnerName: 'Germany',
      pickStatus: 'busted',
      pickedOpponentId: 'ARG',
      pickedOpponentName: 'Argentina',
      pickedOpponentStatus: 'busted',
    });

    const rows = buildTopFour(finalMatch, bronzeMatch);

    const england = rows.find((r) => r.position === '2nd');
    expect(england?.status).toBe('busted');
    expect(england?.realOutcomeLabel).toBe('4th place');
  });

  it('only overrides busted rows, leaving alive/pending/no-pick untouched', () => {
    const finalMatch = mkMatch({
      bracketMatchKey: 'final',
      homeTeamId: 'ESP',
      awayTeamId: 'ARG',
      status: 'final',
      actualWinnerId: 'ESP',
      pickedWinnerId: 'ESP',
      pickedWinnerName: 'Spain',
      pickStatus: 'alive' as PickStatus,
      pickedOpponentId: null,
      pickedOpponentStatus: 'no-pick',
    });

    const rows = buildTopFour(finalMatch, null);

    const spain = rows.find((r) => r.position === '1st');
    expect(spain?.status).toBe('alive');
    expect(spain?.realOutcomeLabel).toBeNull();
  });

  it('reports "runner-up" for a predicted Bronze pick that actually lost the real Final', () => {
    // Screenshot scenario: predicted top4 was ESP(1st)/ENG(2nd)/GER(3rd)/ARG(4th), but the real
    // Final was ESP vs ARG (ESP won) — ARG genuinely reached the real top4 as runner-up, so it
    // must not read "eliminated" even though its predicted slot (Bronze opponent) was wrong.
    const finalMatch = mkMatch({
      bracketMatchKey: 'final',
      homeTeamId: 'ESP',
      awayTeamId: 'ARG',
      status: 'final',
      actualWinnerId: 'ESP',
      pickedWinnerId: 'ESP',
      pickedWinnerName: 'Spain',
      pickStatus: 'alive',
      pickedOpponentId: 'ENG',
      pickedOpponentName: 'England',
      pickedOpponentStatus: 'busted',
    });
    const bronzeMatch = mkMatch({
      bracketMatchKey: 'bronze',
      homeTeamId: 'FRA',
      awayTeamId: 'ENG',
      status: 'final',
      actualWinnerId: 'ENG',
      pickedWinnerId: 'GER',
      pickedWinnerName: 'Germany',
      pickStatus: 'busted',
      pickedOpponentId: 'ARG',
      pickedOpponentName: 'Argentina',
      pickedOpponentStatus: 'busted',
    });

    const rows = buildTopFour(finalMatch, bronzeMatch);

    const argentina = rows.find((r) => r.position === '4th');
    expect(argentina?.status).toBe('busted');
    expect(argentina?.realOutcomeLabel).toBe('runner-up');

    const germany = rows.find((r) => r.position === '3rd');
    expect(germany?.status).toBe('busted');
    expect(germany?.realOutcomeLabel).toBeNull();
  });

  it('reports the real finish for every busted slot once both real matches are decided', () => {
    // The user's whole top-4 prediction was swapped: predicted Final = ARG v GER, predicted
    // Bronze = FRA v ESP. In reality the Final was ESP v FRA (ESP won) and Bronze was GER v ARG
    // (ARG won) — every predicted team actually reached the real top four, just in a different
    // slot than predicted, so none of them should read "eliminated".
    const finalMatch = mkMatch({
      bracketMatchKey: 'final',
      homeTeamId: 'ESP',
      awayTeamId: 'FRA',
      status: 'final',
      actualWinnerId: 'ESP',
      pickedWinnerId: 'ARG',
      pickedWinnerName: 'Argentina',
      pickStatus: 'busted',
      pickedOpponentId: 'GER',
      pickedOpponentName: 'Germany',
      pickedOpponentStatus: 'busted',
    });
    const bronzeMatch = mkMatch({
      bracketMatchKey: 'bronze',
      homeTeamId: 'GER',
      awayTeamId: 'ARG',
      status: 'final',
      actualWinnerId: 'ARG',
      pickedWinnerId: 'FRA',
      pickedWinnerName: 'France',
      pickStatus: 'busted',
      pickedOpponentId: 'ESP',
      pickedOpponentName: 'Spain',
      pickedOpponentStatus: 'busted',
    });

    const rows = buildTopFour(finalMatch, bronzeMatch);
    const labelFor = (position: string) =>
      rows.find((r) => r.position === position)?.realOutcomeLabel;

    // Predicted Final winner (ARG) actually won Bronze → real 3rd place.
    expect(labelFor('1st')).toBe('3rd place');
    // Predicted Final opponent (GER) actually lost Bronze → real 4th place.
    expect(labelFor('2nd')).toBe('4th place');
    // Predicted Bronze winner (FRA) actually lost the real Final → runner-up.
    expect(labelFor('3rd')).toBe('runner-up');
    // Predicted Bronze opponent (ESP) actually won the real Final → champion.
    expect(labelFor('4th')).toBe('champion');
  });
});
