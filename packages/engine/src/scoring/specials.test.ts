import { describe, it, expect } from 'vitest';
import { teamId, playerId } from '../brand.js';
import { miniScoring } from '../__fixtures__/mini-tournament.js';
import type { CardInputs, ActualResults } from '../types.js';
import { scoreSpecials } from './specials.js';

const SCORER = playerId('FRA-9');
const RED_CARD = playerId('GER-4');
const GOAL_SCORER = playerId('ARG-10');

const ARG = teamId('ARG');
const ESP = teamId('ESP');
const RSA = teamId('RSA');
const CRO = teamId('CRO');

function makeInputs(specials: CardInputs['specials']): CardInputs {
  return {
    groupScores: [],
    knockoutPicks: [],
    finishScores: {},
    specials,
  };
}

function makeActual(
  answers: ActualResults['answers'],
  finalMatch?: ActualResults['finalMatch'],
): ActualResults {
  return {
    matchResults: [],
    groupOrder: {},
    answers,
    ...(finalMatch !== undefined ? { finalMatch } : {}),
  };
}

describe('scoreSpecials — each bet in isolation', () => {
  it('topScorerPlayer correct → 15', () => {
    const inputs = makeInputs({ topScorerPlayer: SCORER });
    const actual = makeActual({ topScorerPlayer: SCORER });
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(15);
  });

  it('topScorerPlayer wrong → 0', () => {
    const inputs = makeInputs({ topScorerPlayer: playerId('ESP-7') });
    const actual = makeActual({ topScorerPlayer: SCORER });
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(0);
  });

  it('topScorerPlayer absent prediction → 0', () => {
    const inputs = makeInputs({});
    const actual = makeActual({ topScorerPlayer: SCORER });
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(0);
  });

  it('topScorerPlayer absent actual → 0', () => {
    const inputs = makeInputs({ topScorerPlayer: SCORER });
    const actual = makeActual({});
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(0);
  });

  it('groupTopScoringTeam correct → 10', () => {
    const inputs = makeInputs({ groupTopScoringTeam: ESP });
    const actual = makeActual({ groupTopScoringTeam: ESP });
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(10);
  });

  it('groupTopScoringTeam wrong → 0', () => {
    const inputs = makeInputs({ groupTopScoringTeam: ARG });
    const actual = makeActual({ groupTopScoringTeam: ESP });
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(0);
  });

  it('groupTopConcedingTeam correct → 10', () => {
    const inputs = makeInputs({ groupTopConcedingTeam: RSA });
    const actual = makeActual({ groupTopConcedingTeam: RSA });
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(10);
  });

  it('tournamentTopScoringTeam correct → 10', () => {
    const inputs = makeInputs({ tournamentTopScoringTeam: ARG });
    const actual = makeActual({ tournamentTopScoringTeam: ARG });
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(10);
  });

  it('tournamentTopConcedingTeam correct → 10', () => {
    const inputs = makeInputs({ tournamentTopConcedingTeam: RSA });
    const actual = makeActual({ tournamentTopConcedingTeam: RSA });
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(10);
  });

  it('highestMatchGoals correct (exact number) → 10', () => {
    const inputs = makeInputs({ highestMatchGoals: 7 });
    const actual = makeActual({ highestMatchGoals: 7 });
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(10);
  });

  it('highestMatchGoals wrong → 0', () => {
    const inputs = makeInputs({ highestMatchGoals: 5 });
    const actual = makeActual({ highestMatchGoals: 7 });
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(0);
  });

  it('mostYellowCardsTeam correct → 15', () => {
    const inputs = makeInputs({ mostYellowCardsTeam: CRO });
    const actual = makeActual({ mostYellowCardsTeam: CRO });
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(15);
  });

  it('firstRedCardPlayer correct → 20', () => {
    const inputs = makeInputs({ firstRedCardPlayer: RED_CARD });
    const actual = makeActual({ firstRedCardPlayer: RED_CARD });
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(20);
  });

  it('penaltyShootoutCount correct (exact number) → 10', () => {
    const inputs = makeInputs({ penaltyShootoutCount: 5 });
    const actual = makeActual({ penaltyShootoutCount: 5 });
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(10);
  });

  it('penaltyShootoutCount wrong → 0', () => {
    const inputs = makeInputs({ penaltyShootoutCount: 3 });
    const actual = makeActual({ penaltyShootoutCount: 5 });
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(0);
  });
});

describe('scoreSpecials — finalDecidedByPenalties', () => {
  it('predicted true, actual penalties → 10', () => {
    const inputs = makeInputs({ finalDecidedByPenalties: true });
    const actual = makeActual(
      {},
      { home: ARG, away: teamId('FRA'), homeGoals: 3, awayGoals: 2, decidedBy: 'penalties' },
    );
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(10);
  });

  it('predicted false, actual regulation → 10', () => {
    const inputs = makeInputs({ finalDecidedByPenalties: false });
    const actual = makeActual(
      {},
      { home: ARG, away: teamId('FRA'), homeGoals: 1, awayGoals: 0, decidedBy: 'regulation' },
    );
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(10);
  });

  it('predicted true, actual regulation → 0', () => {
    const inputs = makeInputs({ finalDecidedByPenalties: true });
    const actual = makeActual(
      {},
      { home: ARG, away: teamId('FRA'), homeGoals: 1, awayGoals: 0, decidedBy: 'regulation' },
    );
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(0);
  });

  it('predicted false, actual penalties → 0', () => {
    const inputs = makeInputs({ finalDecidedByPenalties: false });
    const actual = makeActual(
      {},
      { home: ARG, away: teamId('FRA'), homeGoals: 3, awayGoals: 2, decidedBy: 'penalties' },
    );
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(0);
  });

  it('absent finalMatch → 0 (undecided)', () => {
    const inputs = makeInputs({ finalDecidedByPenalties: true });
    const actual = makeActual({});
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(0);
  });

  it('absent prediction → 0', () => {
    const inputs = makeInputs({});
    const actual = makeActual(
      {},
      { home: ARG, away: teamId('FRA'), homeGoals: 3, awayGoals: 2, decidedBy: 'penalties' },
    );
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(0);
  });
});

describe('scoreSpecials — finalDecisiveGoalPlayer', () => {
  it('correct decisive goal scorer → 20', () => {
    const inputs = makeInputs({ finalDecisiveGoalPlayer: GOAL_SCORER });
    const actual = makeActual(
      {},
      {
        home: ARG,
        away: teamId('FRA'),
        homeGoals: 3,
        awayGoals: 2,
        decisiveGoalPlayer: GOAL_SCORER,
      },
    );
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(20);
  });

  it('wrong decisive goal scorer → 0', () => {
    const inputs = makeInputs({ finalDecisiveGoalPlayer: playerId('FRA-7') });
    const actual = makeActual(
      {},
      {
        home: ARG,
        away: teamId('FRA'),
        homeGoals: 3,
        awayGoals: 2,
        decisiveGoalPlayer: GOAL_SCORER,
      },
    );
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(0);
  });

  it('absent finalMatch → 0', () => {
    const inputs = makeInputs({ finalDecisiveGoalPlayer: GOAL_SCORER });
    const actual = makeActual({});
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(0);
  });

  it('finalMatch present but no decisiveGoalPlayer → 0', () => {
    const inputs = makeInputs({ finalDecisiveGoalPlayer: GOAL_SCORER });
    const actual = makeActual({}, { home: ARG, away: teamId('FRA'), homeGoals: 3, awayGoals: 2 });
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(0);
  });
});

describe('scoreSpecials — full house', () => {
  it('all bets correct → 15+10+10+10+10+10+15+20+10+10+20 = 140', () => {
    // topScorerPlayer(15) + groupTopScoringTeam(10) + groupTopConcedingTeam(10)
    // + tournamentTopScoringTeam(10) + tournamentTopConcedingTeam(10) + highestMatchGoals(10)
    // + mostYellowCardsTeam(15) + firstRedCardPlayer(20) + penaltyShootoutCount(10)
    // + finalDecidedByPenalties(10) + finalDecisiveGoalPlayer(20) = 140
    const inputs = makeInputs({
      topScorerPlayer: SCORER,
      groupTopScoringTeam: ESP,
      groupTopConcedingTeam: RSA,
      tournamentTopScoringTeam: ARG,
      tournamentTopConcedingTeam: RSA,
      highestMatchGoals: 7,
      mostYellowCardsTeam: CRO,
      firstRedCardPlayer: RED_CARD,
      penaltyShootoutCount: 5,
      finalDecidedByPenalties: true,
      finalDecisiveGoalPlayer: GOAL_SCORER,
    });
    const actual = makeActual(
      {
        topScorerPlayer: SCORER,
        groupTopScoringTeam: ESP,
        groupTopConcedingTeam: RSA,
        tournamentTopScoringTeam: ARG,
        tournamentTopConcedingTeam: RSA,
        highestMatchGoals: 7,
        mostYellowCardsTeam: CRO,
        firstRedCardPlayer: RED_CARD,
        penaltyShootoutCount: 5,
      },
      {
        home: ARG,
        away: teamId('FRA'),
        homeGoals: 3,
        awayGoals: 2,
        decidedBy: 'penalties',
        decisiveGoalPlayer: GOAL_SCORER,
      },
    );
    expect(scoreSpecials(inputs, actual, miniScoring)).toBe(140);
  });
});
