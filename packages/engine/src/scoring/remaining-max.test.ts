import { describe, it, expect } from 'vitest';
import { miniTournament, miniScoring } from '../__fixtures__/mini-tournament.js';
import { computeRemainingMaxPoints } from './remaining-max.js';
import type { Tournament } from '../types.js';

// ---------------------------------------------------------------------------
// Fixture-derived constants — kept here so the test breaks loudly if the
// mini-tournament fixture or scoring defaults change.
// ---------------------------------------------------------------------------

const ALL_GROUP_MATCH_IDS = miniTournament.groupMatches.map((gm) => gm.id);
const QF_KEYS = miniTournament.bracket.roundOf8Matches;
const SF_KEYS = miniTournament.bracket.semiFinals;
const FINAL_KEY = miniTournament.bracket.finalMatch;
const BRONZE_KEY = miniTournament.bracket.bronzeMatch;

const NUM_GROUP_MATCHES = ALL_GROUP_MATCH_IDS.length; // 24
const NUM_GROUPS = miniTournament.groups.length; // 4
const NUM_QF_MATCHES = QF_KEYS.length; // 4

// Max per category, computed independently from the scoring config so the
// expected numbers are derived rather than hand-rolled.
const MAX_GROUP_MATCHES = NUM_GROUP_MATCHES * miniScoring.groupMatch.exactScore;
const MAX_GROUP_ORDER = NUM_GROUPS * miniScoring.groupOrder.allCorrect;
const MAX_ROUND_OF_8 = NUM_QF_MATCHES * 2 * miniScoring.roundOf8PerTeam;
const MAX_TOP_FOUR = miniScoring.topFourOrder.allCorrect;
const MAX_BRONZE = 2 * miniScoring.bronze.perTeam + miniScoring.bronze.exactScore;
const MAX_FINAL = 2 * miniScoring.final.perTeam + miniScoring.final.exactScore;
const MAX_SPECIALS =
  miniScoring.groupTopScoringTeam +
  miniScoring.groupTopConcedingTeam +
  miniScoring.tournamentTopScoringTeam +
  miniScoring.tournamentTopConcedingTeam +
  miniScoring.highestMatchGoals +
  miniScoring.mostYellowCardsTeam +
  miniScoring.firstRedCardPlayer +
  miniScoring.penaltyShootoutCount +
  miniScoring.finalDecidedByPenalties +
  miniScoring.finalDecisiveGoalPlayer +
  miniScoring.topScorerPlayer;

const MAX_TOTAL =
  MAX_GROUP_MATCHES +
  MAX_GROUP_ORDER +
  MAX_ROUND_OF_8 +
  MAX_TOP_FOUR +
  MAX_BRONZE +
  MAX_FINAL +
  MAX_SPECIALS;

function progress(ids: string[]) {
  return { finalMatchIds: new Set(ids) };
}

// ---------------------------------------------------------------------------
// Whole-tournament shapes
// ---------------------------------------------------------------------------

describe('computeRemainingMaxPoints — overall', () => {
  it('returns the full max when nothing has been played', () => {
    const result = computeRemainingMaxPoints(miniTournament, progress([]));
    expect(result.total).toBe(MAX_TOTAL);
    expect(result.groupMatches).toBe(MAX_GROUP_MATCHES);
    expect(result.groupOrder).toBe(MAX_GROUP_ORDER);
    expect(result.roundOf8).toBe(MAX_ROUND_OF_8);
    expect(result.topFour).toBe(MAX_TOP_FOUR);
    expect(result.bronze).toBe(MAX_BRONZE);
    expect(result.final).toBe(MAX_FINAL);
    expect(result.specials).toBe(MAX_SPECIALS);
  });

  it('returns zero across the board when every match is final', () => {
    const everything = [...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS, FINAL_KEY, BRONZE_KEY];
    const result = computeRemainingMaxPoints(miniTournament, progress(everything));
    expect(result.total).toBe(0);
    expect(result.groupMatches).toBe(0);
    expect(result.groupOrder).toBe(0);
    expect(result.roundOf8).toBe(0);
    expect(result.topFour).toBe(0);
    expect(result.bronze).toBe(0);
    expect(result.final).toBe(0);
    expect(result.specials).toBe(0);
  });

  it('total equals the sum of category fields for every progress snapshot', () => {
    const snapshots: string[][] = [
      [],
      ALL_GROUP_MATCH_IDS.slice(0, 5),
      ALL_GROUP_MATCH_IDS,
      [...ALL_GROUP_MATCH_IDS, ...QF_KEYS],
      [...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS],
      [...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS, BRONZE_KEY],
      [...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS, BRONZE_KEY, FINAL_KEY],
    ];
    for (const snapshot of snapshots) {
      const r = computeRemainingMaxPoints(miniTournament, progress(snapshot));
      const sum =
        r.groupMatches + r.groupOrder + r.roundOf8 + r.topFour + r.bronze + r.final + r.specials;
      expect(r.total).toBe(sum);
    }
  });
});

// ---------------------------------------------------------------------------
// Group matches
// ---------------------------------------------------------------------------

describe('computeRemainingMaxPoints — group matches', () => {
  it('decreases by exactScore for each finalised group match', () => {
    const oneDone = computeRemainingMaxPoints(miniTournament, progress([ALL_GROUP_MATCH_IDS[0]!]));
    expect(oneDone.groupMatches).toBe(MAX_GROUP_MATCHES - miniScoring.groupMatch.exactScore);
  });

  it('half the matches done → half the group-match upside', () => {
    const half = ALL_GROUP_MATCH_IDS.slice(0, NUM_GROUP_MATCHES / 2);
    const result = computeRemainingMaxPoints(miniTournament, progress(half));
    expect(result.groupMatches).toBe((NUM_GROUP_MATCHES / 2) * miniScoring.groupMatch.exactScore);
  });

  it('all group matches done → zero group-match upside', () => {
    const result = computeRemainingMaxPoints(miniTournament, progress(ALL_GROUP_MATCH_IDS));
    expect(result.groupMatches).toBe(0);
  });

  it('unknown final match ids are ignored', () => {
    const result = computeRemainingMaxPoints(miniTournament, progress(['no-such-match']));
    expect(result.groupMatches).toBe(MAX_GROUP_MATCHES);
  });
});

// ---------------------------------------------------------------------------
// Group order
// ---------------------------------------------------------------------------

describe('computeRemainingMaxPoints — group order', () => {
  it('drops by allCorrect once an entire group is final', () => {
    const groupA = miniTournament.groupMatches
      .filter((gm) => gm.group === miniTournament.groups[0]!.id)
      .map((gm) => gm.id);
    const result = computeRemainingMaxPoints(miniTournament, progress(groupA));
    expect(result.groupOrder).toBe(MAX_GROUP_ORDER - miniScoring.groupOrder.allCorrect);
  });

  it('does not drop while any match in a group is unplayed', () => {
    // Finalise all of group A except the last match.
    const groupA = miniTournament.groupMatches.filter(
      (gm) => gm.group === miniTournament.groups[0]!.id,
    );
    const partial = groupA.slice(0, groupA.length - 1).map((gm) => gm.id);
    const result = computeRemainingMaxPoints(miniTournament, progress(partial));
    expect(result.groupOrder).toBe(MAX_GROUP_ORDER);
  });

  it('every group complete → zero group-order upside', () => {
    const result = computeRemainingMaxPoints(miniTournament, progress(ALL_GROUP_MATCH_IDS));
    expect(result.groupOrder).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Round of 8
// ---------------------------------------------------------------------------

describe('computeRemainingMaxPoints — roundOf8', () => {
  it('is fully open until the group stage is complete', () => {
    const partial = ALL_GROUP_MATCH_IDS.slice(0, ALL_GROUP_MATCH_IDS.length - 1);
    const result = computeRemainingMaxPoints(miniTournament, progress(partial));
    expect(result.roundOf8).toBe(MAX_ROUND_OF_8);
  });

  it('locks to zero the moment every group match is final', () => {
    const result = computeRemainingMaxPoints(miniTournament, progress(ALL_GROUP_MATCH_IDS));
    expect(result.roundOf8).toBe(0);
  });

  it('uses 2 teams per QF match (set covers both halves)', () => {
    const result = computeRemainingMaxPoints(miniTournament, progress([]));
    expect(result.roundOf8).toBe(NUM_QF_MATCHES * 2 * miniScoring.roundOf8PerTeam);
  });
});

// ---------------------------------------------------------------------------
// Bronze, final, top four
// ---------------------------------------------------------------------------

describe('computeRemainingMaxPoints — finish matches', () => {
  it('bronze upside zeroes when bronze is played', () => {
    const result = computeRemainingMaxPoints(miniTournament, progress([BRONZE_KEY]));
    expect(result.bronze).toBe(0);
    expect(result.final).toBe(MAX_FINAL);
  });

  it('final upside zeroes when final is played', () => {
    const result = computeRemainingMaxPoints(miniTournament, progress([FINAL_KEY]));
    expect(result.final).toBe(0);
    expect(result.bronze).toBe(MAX_BRONZE);
  });

  it('top-four upside stays open while either finish match is pending', () => {
    expect(computeRemainingMaxPoints(miniTournament, progress([BRONZE_KEY])).topFour).toBe(
      MAX_TOP_FOUR,
    );
    expect(computeRemainingMaxPoints(miniTournament, progress([FINAL_KEY])).topFour).toBe(
      MAX_TOP_FOUR,
    );
  });

  it('top-four upside zeroes only when both finish matches are played', () => {
    const result = computeRemainingMaxPoints(miniTournament, progress([BRONZE_KEY, FINAL_KEY]));
    expect(result.topFour).toBe(0);
  });

  it('bronze max = 2 × perTeam + exactScore', () => {
    expect(MAX_BRONZE).toBe(2 * miniScoring.bronze.perTeam + miniScoring.bronze.exactScore);
  });

  it('final max = 2 × perTeam + exactScore', () => {
    expect(MAX_FINAL).toBe(2 * miniScoring.final.perTeam + miniScoring.final.exactScore);
  });
});

// ---------------------------------------------------------------------------
// Specials
// ---------------------------------------------------------------------------

describe('computeRemainingMaxPoints — specials', () => {
  it('remain fully open until the tournament is entirely complete', () => {
    const almost = [
      ...ALL_GROUP_MATCH_IDS,
      ...QF_KEYS,
      ...SF_KEYS,
      BRONZE_KEY,
      // final still unplayed
    ];
    const result = computeRemainingMaxPoints(miniTournament, progress(almost));
    expect(result.specials).toBe(MAX_SPECIALS);
  });

  it('zero only when every group + bracket match is final', () => {
    const everything = [...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS, BRONZE_KEY, FINAL_KEY];
    const result = computeRemainingMaxPoints(miniTournament, progress(everything));
    expect(result.specials).toBe(0);
  });

  it('sum matches every special category in the scoring config', () => {
    expect(MAX_SPECIALS).toBe(
      miniScoring.groupTopScoringTeam +
        miniScoring.groupTopConcedingTeam +
        miniScoring.tournamentTopScoringTeam +
        miniScoring.tournamentTopConcedingTeam +
        miniScoring.highestMatchGoals +
        miniScoring.mostYellowCardsTeam +
        miniScoring.firstRedCardPlayer +
        miniScoring.penaltyShootoutCount +
        miniScoring.finalDecidedByPenalties +
        miniScoring.finalDecisiveGoalPlayer +
        miniScoring.topScorerPlayer,
    );
  });
});

// ---------------------------------------------------------------------------
// Realistic stage transitions
// ---------------------------------------------------------------------------

describe('computeRemainingMaxPoints — stage transitions', () => {
  it('opening day (nothing played): total equals every category maxed out', () => {
    const result = computeRemainingMaxPoints(miniTournament, progress([]));
    expect(result.total).toBe(
      MAX_GROUP_MATCHES +
        MAX_GROUP_ORDER +
        MAX_ROUND_OF_8 +
        MAX_TOP_FOUR +
        MAX_BRONZE +
        MAX_FINAL +
        MAX_SPECIALS,
    );
  });

  it('end of group stage: group + roundOf8 locked, knockout & specials open', () => {
    const result = computeRemainingMaxPoints(miniTournament, progress(ALL_GROUP_MATCH_IDS));
    expect(result.groupMatches).toBe(0);
    expect(result.groupOrder).toBe(0);
    expect(result.roundOf8).toBe(0);
    expect(result.topFour).toBe(MAX_TOP_FOUR);
    expect(result.bronze).toBe(MAX_BRONZE);
    expect(result.final).toBe(MAX_FINAL);
    expect(result.specials).toBe(MAX_SPECIALS);
    expect(result.total).toBe(MAX_TOP_FOUR + MAX_BRONZE + MAX_FINAL + MAX_SPECIALS);
  });

  it('after QF: only top-four, finishing matches, and specials remain', () => {
    const result = computeRemainingMaxPoints(
      miniTournament,
      progress([...ALL_GROUP_MATCH_IDS, ...QF_KEYS]),
    );
    expect(result.total).toBe(MAX_TOP_FOUR + MAX_BRONZE + MAX_FINAL + MAX_SPECIALS);
  });

  it('after SF: top-four still open (finals not played), bronze + final + specials open', () => {
    const result = computeRemainingMaxPoints(
      miniTournament,
      progress([...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS]),
    );
    expect(result.total).toBe(MAX_TOP_FOUR + MAX_BRONZE + MAX_FINAL + MAX_SPECIALS);
  });

  it('after bronze only: bronze locked, top-four + final + specials open', () => {
    const result = computeRemainingMaxPoints(
      miniTournament,
      progress([...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS, BRONZE_KEY]),
    );
    expect(result.bronze).toBe(0);
    expect(result.final).toBe(MAX_FINAL);
    expect(result.topFour).toBe(MAX_TOP_FOUR);
    expect(result.specials).toBe(MAX_SPECIALS);
  });

  it('after final only (bronze still pending): final locked, top-four + bronze + specials open', () => {
    const result = computeRemainingMaxPoints(
      miniTournament,
      progress([...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS, FINAL_KEY]),
    );
    expect(result.final).toBe(0);
    expect(result.bronze).toBe(MAX_BRONZE);
    expect(result.topFour).toBe(MAX_TOP_FOUR);
    expect(result.specials).toBe(MAX_SPECIALS);
  });

  it('upside monotonically decreases as more matches finalise', () => {
    const steps: string[][] = [
      [],
      ALL_GROUP_MATCH_IDS.slice(0, 6),
      ALL_GROUP_MATCH_IDS.slice(0, 12),
      ALL_GROUP_MATCH_IDS,
      [...ALL_GROUP_MATCH_IDS, ...QF_KEYS],
      [...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS],
      [...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS, BRONZE_KEY],
      [...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS, BRONZE_KEY, FINAL_KEY],
    ];
    const totals = steps.map((s) => computeRemainingMaxPoints(miniTournament, progress(s)).total);
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i]!).toBeLessThanOrEqual(totals[i - 1]!);
    }
    expect(totals[totals.length - 1]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scoring-config sensitivity
// ---------------------------------------------------------------------------

describe('computeRemainingMaxPoints — scoring config sensitivity', () => {
  it('scales with groupMatch.exactScore', () => {
    const doubled: Tournament = {
      ...miniTournament,
      scoring: {
        ...miniScoring,
        groupMatch: {
          ...miniScoring.groupMatch,
          exactScore: miniScoring.groupMatch.exactScore * 2,
        },
      },
    };
    const a = computeRemainingMaxPoints(miniTournament, progress([]));
    const b = computeRemainingMaxPoints(doubled, progress([]));
    expect(b.groupMatches).toBe(a.groupMatches * 2);
  });

  it('roundOf8 scales linearly with roundOf8PerTeam', () => {
    const tripled: Tournament = {
      ...miniTournament,
      scoring: { ...miniScoring, roundOf8PerTeam: miniScoring.roundOf8PerTeam * 3 },
    };
    const a = computeRemainingMaxPoints(miniTournament, progress([]));
    const b = computeRemainingMaxPoints(tripled, progress([]));
    expect(b.roundOf8).toBe(a.roundOf8 * 3);
  });

  it('zero scoring config produces zero total', () => {
    const zero: Tournament = {
      ...miniTournament,
      scoring: {
        groupMatch: { exactScore: 0, correctOutcome: 0 },
        groupOrder: { allCorrect: 0, twoCorrect: 0, oneCorrect: 0 },
        groupTopScoringTeam: 0,
        groupTopConcedingTeam: 0,
        roundOf8PerTeam: 0,
        bronze: { exactScore: 0, perTeam: 0 },
        final: { exactScore: 0, perTeam: 0 },
        topFourOrder: {
          allCorrect: 0,
          threeCorrect: 0,
          twoCorrect: 0,
          oneCorrect: 0,
          teamRightWrongPlace: 0,
        },
        tournamentTopScoringTeam: 0,
        tournamentTopConcedingTeam: 0,
        highestMatchGoals: 0,
        mostYellowCardsTeam: 0,
        firstRedCardPlayer: 0,
        penaltyShootoutCount: 0,
        finalDecidedByPenalties: 0,
        finalDecisiveGoalPlayer: 0,
        topScorerPlayer: 0,
      },
    };
    const result = computeRemainingMaxPoints(zero, progress([]));
    expect(result.total).toBe(0);
  });
});
