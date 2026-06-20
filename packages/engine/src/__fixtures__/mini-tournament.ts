import { teamId, groupId, matchId, bracketMatchKey, playerId } from '../brand.js';
import type { Tournament, Scoring } from '../types.js';

// ---- Scoring defaults from functional-spec §4.1 ----
export const miniScoring: Scoring = {
  groupMatch: { exactScore: 6, correctOutcome: 3 },
  groupOrder: { allCorrect: 6, twoCorrect: 3, oneCorrect: 1 },
  groupTopScoringTeam: 10,
  groupTopConcedingTeam: 10,
  roundOf8PerTeam: 3,
  bronze: { exactScore: 5, perTeam: 5 },
  final: { exactScore: 5, perTeam: 5 },
  topFourOrder: {
    allCorrect: 20,
    threeCorrect: 15,
    twoCorrect: 10,
    oneCorrect: 5,
    teamRightWrongPlace: 2,
  },
  tournamentTopScoringTeam: 10,
  tournamentTopConcedingTeam: 10,
  highestMatchGoals: 10,
  mostYellowCardsTeam: 15,
  firstRedCardPlayer: 20,
  penaltyShootoutCount: 10,
  finalDecidedByPenalties: 10,
  finalDecisiveGoalPlayer: 20,
  topScorerPlayer: 15,
};

// ---- Teams: A1..A4, B1..B4, C1..C4, D1..D4 ----
// Array order within each group = seed order

const groups = ['A', 'B', 'C', 'D'] as const;
type GroupLetter = (typeof groups)[number];

const teamsByGroup = Object.fromEntries(
  groups.map((g) => [g, [1, 2, 3, 4].map((n) => teamId(`${g}${n}`))]),
) as Record<GroupLetter, ReturnType<typeof teamId>[]>;

// ---- Generate all 6 round-robin pairings for 4 teams ----
// Pairs: (0,1),(0,2),(0,3),(1,2),(1,3),(2,3)
const pairIndices: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];

const groupMatchDefs = groups.flatMap((g, _gi) =>
  pairIndices.map(([hi, ai], mi) => ({
    id: matchId(`m${g}${mi + 1}`),
    group: groupId(g),
    home: teamsByGroup[g]![hi]!,
    away: teamsByGroup[g]![ai]!,
  })),
);

// ---- Bracket: QF → SF → Final (+ Bronze) ----
const qf1 = bracketMatchKey('qf1');
const qf2 = bracketMatchKey('qf2');
const qf3 = bracketMatchKey('qf3');
const qf4 = bracketMatchKey('qf4');
const sf1 = bracketMatchKey('sf1');
const sf2 = bracketMatchKey('sf2');
const finalKey = bracketMatchKey('final');
const bronzeKey = bracketMatchKey('bronze');

// ---- Players: one per group (for player-bet references) ----
const players = groups.map((g) => ({
  id: playerId(`${g}1-P`),
  name: `Player ${g}1`,
  team: teamsByGroup[g]![0]!,
}));

export const miniTournament: Tournament = {
  id: 'mini-2026',
  name: 'Mini Tournament',
  teams: groups.flatMap((g) =>
    [1, 2, 3, 4].map((n) => ({
      id: teamId(`${g}${n}`),
      name: `Team ${g}${n}`,
      fifaRanking: (g.charCodeAt(0) - 65) * 4 + n, // A1=1 … D4=16
    })),
  ),
  players,
  groups: groups.map((g) => ({
    id: groupId(g),
    teams: teamsByGroup[g]!,
  })),
  groupMatches: groupMatchDefs,
  qualification: { autoQualifyPerGroup: 2, bestThirdPlaced: 0 },
  standingsTiebreak: [
    'points',
    'h2hPoints',
    'h2hGoalDifference',
    'h2hGoalsFor',
    'goalDifference',
    'goalsFor',
    'conductScore',
  ],
  bracket: {
    rounds: ['QF', 'SF', 'Final'],
    entryRound: 'QF',
    roundOf8Matches: [qf1, qf2, qf3, qf4],
    slots: [
      { match: qf1, home: '1A', away: '2B' },
      { match: qf2, home: '1C', away: '2D' },
      { match: qf3, home: '1B', away: '2A' },
      { match: qf4, home: '1D', away: '2C' },
    ],
    progression: [
      { match: sf1, from: [qf1, qf2] },
      { match: sf2, from: [qf3, qf4] },
      { match: finalKey, from: [sf1, sf2] },
      { match: bronzeKey, from: [sf1, sf2] },
    ],
    semiFinals: [sf1, sf2],
    finalMatch: finalKey,
    bronzeMatch: bronzeKey,
  },
  scoring: miniScoring,
};
