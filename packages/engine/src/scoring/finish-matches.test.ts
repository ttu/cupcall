import { describe, it, expect } from 'vitest';
import { teamId, type TeamId } from '../brand.js';
import { miniScoring } from '../__fixtures__/mini-tournament.js';
import type { CardInputs, DerivedCard, ActualResults } from '../types.js';
import { scoreBronze, scoreFinal } from './finish-matches.js';

// Team ids used in tests
const A1 = teamId('A1');
const A2 = teamId('A2');
const B1 = teamId('B1');
const B2 = teamId('B2');

function makeDerived(finalists: TeamId[], bronzePair: TeamId[]): DerivedCard {
  return {
    groupOrders: {},
    qualifiers: [],
    roundOf16: [],
    roundOf8: [],
    finalists,
    bronzePair,
    topFour: [],
    roundOf4: [],
  };
}

function makeInputs(
  finalScore?: { home: number; away: number; homeTeamId?: TeamId; awayTeamId?: TeamId },
  bronzeScore?: { home: number; away: number; homeTeamId?: TeamId; awayTeamId?: TeamId },
): CardInputs {
  return {
    groupScores: [],
    knockoutPicks: [],
    finishScores: {
      ...(finalScore !== undefined ? { final: finalScore } : {}),
      ...(bronzeScore !== undefined ? { bronze: bronzeScore } : {}),
    },
    specials: {},
  };
}

function makeActual(opts?: {
  finalMatch?: ActualResults['finalMatch'];
  bronzeMatch?: ActualResults['bronzeMatch'];
  finalists?: TeamId[];
}): ActualResults {
  return {
    matchResults: [],
    groupOrder: {},
    answers: {
      ...(opts?.finalists !== undefined ? { finalists: opts.finalists } : {}),
    },
    ...(opts?.finalMatch !== undefined ? { finalMatch: opts.finalMatch } : {}),
    ...(opts?.bronzeMatch !== undefined ? { bronzeMatch: opts.bronzeMatch } : {}),
  };
}

describe('scoreFinal', () => {
  it('both teams correct + exact score → 15 (10 teams + 5 exact)', () => {
    // Derived finalists: A1, A2. Actual final: A1 vs A2 3-2. Predicted 3-2.
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 3, away: 2, homeTeamId: A1, awayTeamId: A2 });
    const actual = makeActual({
      finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2, winner: A1 },
    });
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(15);
  });

  it('both teams correct, wrong score → 10', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 1, away: 0, homeTeamId: A1, awayTeamId: A2 });
    const actual = makeActual({
      finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2, winner: A1 },
    });
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(10);
  });

  it('one team correct, score positionally matches but not by team identity → 5 (team only, no exact)', () => {
    // A1 correct, A2 wrong (actual has B1). Goals line up positionally (3-2 vs 3-2), but since
    // A2 never played, its predicted goals can't be matched against a real opponent → no exact.
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 3, away: 2, homeTeamId: A1, awayTeamId: A2 });
    const actual = makeActual({
      finalMatch: { home: A1, away: B1, homeGoals: 3, awayGoals: 2, winner: A1 },
    });
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(5);
  });

  it('predicted A1=3/A2=2 with team-id snapshot, actual reports the same score with sides swapped → exact points awarded', () => {
    // The user predicted A1 beats A2 3-2 (home=A1, away=A2, per the snapshot). The real match
    // assigns A2 as home and A1 as away, but the goals are identical per-team (A2 scored 2,
    // A1 scored 3) — this IS an exact-score match by team identity, even though the raw
    // home/away numbers are swapped relative to the actual match's own home/away assignment.
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 3, away: 2, homeTeamId: A1, awayTeamId: A2 });
    const actual = makeActual({
      finalMatch: { home: A2, away: A1, homeGoals: 2, awayGoals: 3, winner: A1 },
    });
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(15); // 10 teams + 5 exact
  });

  it('no team-id snapshot → 0 exact points even when goals positionally match the actual match', () => {
    // Predicted finalists/bronze pair weren't resolved when the score was saved, so there's no
    // team-id snapshot. Even though the raw home/away numbers happen to match the actual match
    // positionally, we can't verify which team they belong to, so no exact-score credit.
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 3, away: 2 }); // no homeTeamId/awayTeamId
    const actual = makeActual({
      finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2, winner: A1 },
    });
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(10); // 10 teams + 0 exact
  });

  it('predicted 2-3, actual 3-2 (sides swapped, teams wrong) → no exact points', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 2, away: 3 }); // predicted 2-3
    const actual = makeActual({
      finalMatch: { home: B1, away: B2, homeGoals: 3, awayGoals: 2, winner: B1 }, // actual 3-2
    });
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(0); // 0 teams + 0 exact
  });

  it('zero teams correct + wrong score → 0', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 1, away: 0 });
    const actual = makeActual({
      finalMatch: { home: B1, away: B2, homeGoals: 3, awayGoals: 2, winner: B1 },
    });
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(0);
  });

  it('actual finalMatch absent → 0', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 3, away: 2 });
    const actual = makeActual({}); // no finalMatch
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(0);
  });

  it('finishScores.final absent → teams still scored, exact 0', () => {
    // Both teams correct, no predicted score → 10 teams + 0 exact
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs(); // no final score
    const actual = makeActual({
      finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2, winner: A1 },
    });
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(10);
  });

  it('one predicted finalist confirmed via SF completion, final unplayed → perTeam banked early', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs();
    const actual = makeActual({ finalists: [A1] }); // A1's SF is decided, final not played
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(5); // 1 * perTeam
  });

  it('both predicted finalists confirmed via SF completion, final unplayed → 2 * perTeam, no exact', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 3, away: 2 }); // predicted score irrelevant, final unplayed
    const actual = makeActual({ finalists: [A1, A2] });
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(10); // 2 * perTeam
  });

  it('predicted finalist NOT in confirmed set → 0 for that team', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs();
    const actual = makeActual({ finalists: [B1] }); // neither A1 nor A2 confirmed
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(0);
  });

  it('finalists confirmed pre-final, then final played with matching exact score → team + exact', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 3, away: 2, homeTeamId: A1, awayTeamId: A2 });
    const actual = makeActual({
      finalists: [A1, A2],
      finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2, winner: A1 },
    });
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(15); // 10 teams + 5 exact
  });
});

describe('scoreBronze', () => {
  it('both teams correct + exact score → 15', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs(undefined, { home: 1, away: 0, homeTeamId: B1, awayTeamId: B2 });
    const actual = makeActual({
      bronzeMatch: { home: B1, away: B2, homeGoals: 1, awayGoals: 0, winner: B1 },
    });
    expect(scoreBronze(inputs, derived, actual, miniScoring)).toBe(15);
  });

  it('actual bronzeMatch absent → 0', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs(undefined, { home: 1, away: 0, homeTeamId: B1, awayTeamId: B2 });
    const actual = makeActual({}); // no bronzeMatch
    expect(scoreBronze(inputs, derived, actual, miniScoring)).toBe(0);
  });

  it('bronze uses bronzePair, not finalists', () => {
    // bronzePair = [B1, B2], finalists = [A1, A2]
    // actual bronze: B1 vs B2 → both in bronzePair → 10 teams
    // actual final: A1 vs A2 → but we call scoreBronze, not scoreFinal
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs(undefined, { home: 2, away: 1, homeTeamId: B1, awayTeamId: B2 });
    const actual = makeActual({
      bronzeMatch: { home: B1, away: B2, homeGoals: 2, awayGoals: 1, winner: B1 },
    });
    expect(scoreBronze(inputs, derived, actual, miniScoring)).toBe(15);
  });

  it('predicted B1=3/B2=0 with team-id snapshot, actual reports the same score with sides swapped → exact points awarded for bronze', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs(undefined, { home: 3, away: 0, homeTeamId: B1, awayTeamId: B2 });
    const actual = makeActual({
      bronzeMatch: { home: B2, away: B1, homeGoals: 0, awayGoals: 3, winner: B1 },
    });
    expect(scoreBronze(inputs, derived, actual, miniScoring)).toBe(15); // 10 teams + 5 exact
  });

  it('no team-id snapshot → 0 exact points even when goals positionally match the actual match', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs(undefined, { home: 1, away: 0 }); // no team-id snapshot
    const actual = makeActual({
      bronzeMatch: { home: B1, away: B2, homeGoals: 1, awayGoals: 0, winner: B1 },
    });
    expect(scoreBronze(inputs, derived, actual, miniScoring)).toBe(10); // 10 teams + 0 exact
  });
});
