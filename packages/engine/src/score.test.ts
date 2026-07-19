import { describe, it, expect } from 'vitest';
import { teamId, playerId, matchId, groupId, bracketMatchKey, type TeamId } from './brand.js';
import { miniTournament, miniScoring } from './__fixtures__/mini-tournament.js';
import type { CardInputs, DerivedCard, ActualResults } from './types.js';
import { deriveCard } from './derive.js';
import { scoreCard } from './score.js';

// ---- Shared full-prediction fixtures ----

const fullKnockoutPicks: CardInputs['knockoutPicks'] = [
  { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
  { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
  { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
  { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
  { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') },
  { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') },
  { bracketMatchKey: bracketMatchKey('final'), winner: teamId('A1') },
  { bracketMatchKey: bracketMatchKey('bronze'), winner: teamId('C1') },
];

const allDrawGroupScores: CardInputs['groupScores'] = miniTournament.groupMatches.map((m) => ({
  matchId: m.id,
  home: 0,
  away: 0,
}));

describe('scoreCard — zero when no games have been played', () => {
  it('scores 0 for every category even when the prediction is fully filled', () => {
    const cardInput: CardInputs = {
      groupScores: allDrawGroupScores,
      knockoutPicks: fullKnockoutPicks,
      finishScores: {
        final: { home: 2, away: 1 },
        bronze: { home: 1, away: 0 },
      },
      specials: {
        topScorerPlayer: playerId('A1-P'),
        penaltyShootoutCount: 2,
        highestMatchGoals: 5,
        finalDecidedByPenalties: false,
      },
    };
    const emptyActual: ActualResults = { matchResults: [], groupOrder: {}, answers: {} };

    const derived = deriveCard(cardInput, miniTournament);
    const breakdown = scoreCard(derived, cardInput, emptyActual, miniScoring);

    expect(breakdown.groupMatches).toBe(0);
    expect(breakdown.groupOrder).toBe(0);
    expect(breakdown.roundOf8).toBe(0);
    expect(breakdown.topFour).toBe(0);
    expect(breakdown.final).toBe(0);
    expect(breakdown.bronze).toBe(0);
    expect(breakdown.specials).toBe(0);
    expect(breakdown.total).toBe(0);
  });
});

describe('scoreCard — partial prediction', () => {
  it('scores groupMatches=0 when no group scores are predicted', () => {
    const cardInput: CardInputs = {
      groupScores: [],
      knockoutPicks: fullKnockoutPicks,
      finishScores: {},
      specials: {},
    };
    const actual: ActualResults = {
      matchResults: [
        { matchId: matchId('mA1'), home: 2, away: 1 },
        { matchId: matchId('mA2'), home: 0, away: 0 },
      ],
      groupOrder: {},
      answers: {},
    };

    const derived = deriveCard(cardInput, miniTournament);
    const breakdown = scoreCard(derived, cardInput, actual, miniScoring);

    expect(breakdown.groupMatches).toBe(0);
  });

  it('scores specials=0 when no special bets are predicted', () => {
    const cardInput: CardInputs = {
      groupScores: [],
      knockoutPicks: [],
      finishScores: {},
      specials: {},
    };
    const actual: ActualResults = {
      matchResults: [],
      groupOrder: {},
      answers: {
        topScorerPlayer: [playerId('A1-P')],
        penaltyShootoutCount: 2,
        highestMatchGoals: 5,
        groupTopScoringTeam: [teamId('A1')],
      },
    };

    const derived = deriveCard(cardInput, miniTournament);
    const breakdown = scoreCard(derived, cardInput, actual, miniScoring);

    expect(breakdown.specials).toBe(0);
  });
});

// ---- §7.7 worked example setup ----
//
// groupMatches:   correct-outcome-only(3) + exact(6)       = 9
// groupOrder:     2 positions correct                       = 3
// roundOf8:       6-of-8 correct × 3                       = 18
// topFour:        all 4 predicted semifinalists confirmed (20) + 2 correct Final positions (6) = 26
// final:          both teams + exact 3–2                    = 15
// bronze:         none                                      = 0
// specials:       topScorerPlayer(15) + penalties(10)       = 25
// total:                                                    = 96

const ARG = teamId('ARG');
const FRA = teamId('FRA');
const NED = teamId('NED');
const POR = teamId('POR');
const BRA = teamId('BRA');
const FRA9 = playerId('FRA-9');

// 8 derived QF teams — ARG, FRA, NED, POR, ESP, ENG are in actual roundOf8; C7 and C8 are not
const ACTUAL_R8 = [ARG, FRA, NED, POR, teamId('ESP'), teamId('ENG'), teamId('BEL'), teamId('ITA')];
const DERIVED_R8: TeamId[] = [
  ARG,
  FRA,
  NED,
  POR,
  teamId('ESP'),
  teamId('ENG'),
  teamId('C7'), // NOT in actual
  teamId('C8'), // NOT in actual
];
// 6 of 8 overlap → 18 pts

// groupOrders: Group A with 2 correct positions
// derived A=[ARG,FRA,NED,POR], actual A=[ARG,POR,FRA,NED] → ARG correct at 0, none else → 1 correct
// Wait — need 2 correct. Let's use: derived A=[ARG,FRA,NED,POR], actual A=[ARG,FRA,BRA,BEL] → 2 correct
const gA = groupId('A');
const derivedGroupOrders: DerivedCard['groupOrders'] = {
  [gA]: [ARG, FRA, NED, POR],
};
const actualGroupOrder: ActualResults['groupOrder'] = {
  [gA]: [ARG, FRA, BRA, teamId('BEL')], // ARG@0 and FRA@1 correct → 2 positions
};

// DerivedCard for §7.7
const derived77: DerivedCard = {
  groupOrders: derivedGroupOrders,
  qualifiers: [],
  roundOf16: [],
  roundOf8: DERIVED_R8,
  finalists: [ARG, FRA],
  bronzePair: [NED, POR],
  topFour: [ARG, FRA, NED, POR],
  roundOf4: [ARG, FRA, NED, POR],
};

// CardInputs for §7.7
// group match 1: outcome only → need different exact, same outcome
// group match 2: exact
const m1 = matchId('g1');
const m2 = matchId('g2');

const inputs77: CardInputs = {
  groupScores: [
    { matchId: m1, home: 1, away: 0 }, // predicted home win
    { matchId: m2, home: 1, away: 0 }, // predicted exact 1-0
  ],
  knockoutPicks: [],
  finishScores: {
    final: { home: 3, away: 2, homeTeamId: ARG, awayTeamId: FRA }, // predicted 3-2 (side-agnostic exact)
  },
  specials: {
    topScorerPlayer: FRA9,
    finalDecidedByPenalties: true,
  },
};

// ActualResults for §7.7
const actual77: ActualResults = {
  matchResults: [
    { matchId: m1, home: 3, away: 1 }, // home win, different score → outcome only → 3
    { matchId: m2, home: 1, away: 0 }, // exact → 6
  ],
  groupOrder: actualGroupOrder,
  finalMatch: {
    home: ARG,
    away: FRA,
    homeGoals: 3,
    awayGoals: 2,
    winner: ARG,
    decidedBy: 'penalties',
  },
  answers: {
    roundOf8: ACTUAL_R8,
    roundOf4: [ARG, FRA, NED, POR], // all 4 of the player's predicted semifinalists confirmed → 20
    topScorerPlayer: [FRA9],
  },
};

describe('scoreCard — §7.7 worked example', () => {
  it('produces the correct ScoreBreakdown with total 96', () => {
    const breakdown = scoreCard(derived77, inputs77, actual77, miniScoring);

    expect(breakdown.groupMatches).toBe(9); // 3 + 6
    expect(breakdown.groupOrder).toBe(3); // 2 correct (twoCorrect)
    expect(breakdown.roundOf8).toBe(18); // 6 × 3
    expect(breakdown.topFour).toBe(26); // 4×5 membership + 2×3 Final position bonus
    expect(breakdown.topFourTeams).toBe(20); // 4×5 membership
    expect(breakdown.topFourPosition).toBe(6); // 2×3 Final position bonus
    expect(breakdown.final).toBe(15); // 10 teams + 5 exact
    expect(breakdown.bronze).toBe(0); // no bronzeMatch in actual
    expect(breakdown.specials).toBe(25); // 15 + 10
    expect(breakdown.total).toBe(96);
  });
});

describe('scoreCard — determinism property', () => {
  // §13: pure functions must produce identical output given the same input
  it('two calls with same inputs produce deeply equal ScoreBreakdown', () => {
    const result1 = scoreCard(derived77, inputs77, actual77, miniScoring);
    const result2 = scoreCard(derived77, inputs77, actual77, miniScoring);
    expect(result1).toEqual(result2);
  });

  it('deriveCard then scoreCard is deterministic over miniTournament', () => {
    // Use all-draw group scores (seed order) and explicit knockout picks
    const allDrawScores = miniTournament.groupMatches.map((m) => ({
      matchId: m.id,
      home: 0,
      away: 0,
    }));
    const knockoutPicks = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
      { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
      { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('final'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('bronze'), winner: teamId('C1') },
    ];
    const cardInput: CardInputs = {
      groupScores: allDrawScores,
      knockoutPicks,
      finishScores: {},
      specials: {},
    };
    const emptyActual: ActualResults = {
      matchResults: [],
      groupOrder: {},
      answers: {},
    };

    const derived1 = deriveCard(cardInput, miniTournament);
    const breakdown1 = scoreCard(derived1, cardInput, emptyActual, miniScoring);

    const derived2 = deriveCard(cardInput, miniTournament);
    const breakdown2 = scoreCard(derived2, cardInput, emptyActual, miniScoring);

    expect(breakdown1).toEqual(breakdown2);
  });
});

describe('scoreCard — integration sanity', () => {
  it('returns a well-formed ScoreBreakdown with non-negative numbers', () => {
    const allDrawScores = miniTournament.groupMatches.map((m) => ({
      matchId: m.id,
      home: 0,
      away: 0,
    }));
    const knockoutPicks = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
      { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
      { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('final'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('bronze'), winner: teamId('C1') },
    ];
    const cardInput: CardInputs = {
      groupScores: allDrawScores,
      knockoutPicks,
      finishScores: { final: { home: 1, away: 0 } },
      specials: { topScorerPlayer: playerId('A1-P') },
    };
    const emptyActual: ActualResults = {
      matchResults: [],
      groupOrder: {},
      answers: {},
    };

    const derived = deriveCard(cardInput, miniTournament);
    const breakdown = scoreCard(derived, cardInput, emptyActual, miniScoring);

    expect(typeof breakdown.groupMatches).toBe('number');
    expect(typeof breakdown.groupOrder).toBe('number');
    expect(typeof breakdown.bronze).toBe('number');
    expect(typeof breakdown.final).toBe('number');
    expect(typeof breakdown.roundOf16).toBe('number');
    expect(typeof breakdown.roundOf8).toBe('number');
    expect(typeof breakdown.topFour).toBe('number');
    expect(typeof breakdown.specials).toBe('number');
    expect(typeof breakdown.total).toBe('number');

    expect(breakdown.groupMatches).toBeGreaterThanOrEqual(0);
    expect(breakdown.groupOrder).toBeGreaterThanOrEqual(0);
    expect(breakdown.bronze).toBeGreaterThanOrEqual(0);
    expect(breakdown.final).toBeGreaterThanOrEqual(0);
    expect(breakdown.roundOf16).toBeGreaterThanOrEqual(0);
    expect(breakdown.roundOf8).toBeGreaterThanOrEqual(0);
    expect(breakdown.topFour).toBeGreaterThanOrEqual(0);
    expect(breakdown.specials).toBeGreaterThanOrEqual(0);
    expect(breakdown.total).toBeGreaterThanOrEqual(0);

    // total equals sum of all parts
    const expectedTotal =
      breakdown.groupMatches +
      breakdown.groupOrder +
      breakdown.bronze +
      breakdown.final +
      breakdown.roundOf16 +
      breakdown.roundOf8 +
      breakdown.topFour +
      breakdown.specials;
    expect(breakdown.total).toBe(expectedTotal);

    // topFour is the sum of its two sub-categories
    expect(breakdown.topFourTeams + breakdown.topFourPosition).toBe(breakdown.topFour);
  });
});

describe('scoreCard — SF position bonus survives a deleted explicit Final pick', () => {
  it('awards the position bonus from the finish-score snapshot when the explicit Final/Bronze pick is missing', () => {
    // Reproduces the production bug: the user picked A1/B1 to reach the final via their SF picks
    // and saved a Final score (A1 2-1 B1), but a later pick edit's invalidation cascade deleted
    // the explicit 'final' knockout pick — only the QF/SF picks and the finish-score snapshot
    // survive, exactly like fullKnockoutPicks minus its 'final'/'bronze' entries.
    const picksWithoutFinalBronze: CardInputs['knockoutPicks'] = fullKnockoutPicks.filter(
      (p) =>
        p.bracketMatchKey !== bracketMatchKey('final') &&
        p.bracketMatchKey !== bracketMatchKey('bronze'),
    );

    const cardInput: CardInputs = {
      groupScores: allDrawGroupScores,
      knockoutPicks: picksWithoutFinalBronze,
      finishScores: {
        final: { home: 2, away: 1, homeTeamId: teamId('A1'), awayTeamId: teamId('B1') },
        bronze: { home: 0, away: 3, homeTeamId: teamId('C1'), awayTeamId: teamId('D1') },
      },
      specials: {},
    };
    const actual: ActualResults = {
      matchResults: [],
      groupOrder: {},
      answers: { roundOf4: [teamId('A1'), teamId('B1'), teamId('C1'), teamId('D1')] },
      finalMatch: {
        home: teamId('A1'),
        away: teamId('B1'),
        homeGoals: 2,
        awayGoals: 1,
        winner: teamId('A1'),
      },
      bronzeMatch: {
        home: teamId('C1'),
        away: teamId('D1'),
        homeGoals: 0,
        awayGoals: 3,
        winner: teamId('D1'),
      },
    };

    const derived = deriveCard(cardInput, miniTournament);
    const breakdown = scoreCard(derived, cardInput, actual, miniScoring);

    // 4 correct semifinalists (membership) + all 4 correct positions (bonus).
    expect(breakdown.topFourPosition).toBeGreaterThan(0);
    expect(breakdown.topFourPosition).toBe(4 * miniScoring.topFourPositionBonus);
  });
});
