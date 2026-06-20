import type { TeamId, PlayerId, GroupId, MatchId, BracketMatchKey, Points } from './brand.js';

export type TiebreakKey =
  | 'points'
  | 'h2hPoints'
  | 'h2hGoalDifference'
  | 'h2hGoalsFor'
  | 'goalDifference'
  | 'goalsFor';

export interface Team {
  id: TeamId;
  name: string;
  fifaRanking?: number | undefined;
}
export interface Player {
  id: PlayerId;
  name: string;
  team: TeamId;
}
export interface Group {
  id: GroupId;
  teams: TeamId[];
} // index order == seedOrder
export interface GroupMatchDef {
  id: MatchId;
  group: GroupId;
  home: TeamId;
  away: TeamId;
}

/** Slot reference tokens used by the bracket template: "1A", "2B", "3rd[0]". */
export type SlotRef = string;
export interface BracketSlot {
  match: BracketMatchKey;
  home: SlotRef;
  away: SlotRef;
}
export interface Progression {
  match: BracketMatchKey;
  from: BracketMatchKey[];
}
export interface BracketDef {
  rounds: string[];
  entryRound: string;
  roundOf8Matches: BracketMatchKey[];
  slots: BracketSlot[];
  progression: Progression[];
  semiFinals: BracketMatchKey[];
  finalMatch: BracketMatchKey;
  bronzeMatch: BracketMatchKey;
}

export interface Scoring {
  groupMatch: { exactScore: number; correctOutcome: number };
  groupOrder: { allCorrect: number; twoCorrect: number; oneCorrect: number };
  groupTopScoringTeam: number;
  groupTopConcedingTeam: number;
  roundOf8PerTeam: number;
  bronze: { exactScore: number; perTeam: number };
  final: { exactScore: number; perTeam: number };
  topFourOrder: {
    allCorrect: number;
    threeCorrect: number;
    twoCorrect: number;
    oneCorrect: number;
    teamRightWrongPlace: number;
  };
  tournamentTopScoringTeam: number;
  tournamentTopConcedingTeam: number;
  highestMatchGoals: number;
  mostYellowCardsTeam: number;
  firstRedCardPlayer: number;
  penaltyShootoutCount: number;
  finalDecidedByPenalties: number;
  finalDecisiveGoalPlayer: number;
  topScorerPlayer: number;
}

export interface Tournament {
  id: string;
  name: string;
  teams: Team[];
  players: Player[];
  groups: Group[];
  groupMatches: GroupMatchDef[];
  qualification: { autoQualifyPerGroup: number; bestThirdPlaced: number };
  standingsTiebreak: TiebreakKey[];
  bracket: BracketDef;
  scoring: Scoring;
}

export interface GroupScore {
  matchId: MatchId;
  home: number;
  away: number;
}
export interface KnockoutPick {
  bracketMatchKey: BracketMatchKey;
  winner: TeamId;
}
export interface FinishScore {
  home: number;
  away: number;
}
export interface SpecialBets {
  topScorerPlayer?: PlayerId;
  groupTopScoringTeam?: TeamId;
  groupTopConcedingTeam?: TeamId;
  tournamentTopScoringTeam?: TeamId;
  tournamentTopConcedingTeam?: TeamId;
  highestMatchGoals?: number;
  mostYellowCardsTeam?: TeamId;
  firstRedCardPlayer?: PlayerId;
  penaltyShootoutCount?: number;
  finalDecidedByPenalties?: boolean;
  finalDecisiveGoalPlayer?: PlayerId;
}
export interface CardInputs {
  groupScores: GroupScore[];
  knockoutPicks: KnockoutPick[];
  finishScores: { final?: FinishScore; bronze?: FinishScore };
  specials: SpecialBets;
}

export interface DerivedCard {
  groupOrders: Record<GroupId, TeamId[]>;
  qualifiers: TeamId[];
  roundOf8: TeamId[];
  finalists: TeamId[];
  bronzePair: TeamId[];
  topFour: TeamId[];
}

export interface ActualMatchResult {
  matchId: MatchId;
  home: number;
  away: number;
}
export interface ActualFinishMatch {
  home: TeamId;
  away: TeamId;
  homeGoals: number;
  awayGoals: number;
}
export interface ActualResults {
  matchResults: ActualMatchResult[];
  groupOrder: Record<GroupId, TeamId[]>;
  bronzeMatch?: ActualFinishMatch;
  finalMatch?: ActualFinishMatch & {
    decidedBy?: 'regulation' | 'extraTime' | 'penalties';
    decisiveGoalPlayer?: PlayerId;
  };
  answers: {
    roundOf8?: TeamId[];
    topFourOrder?: TeamId[];
    groupTopScoringTeam?: TeamId;
    groupTopConcedingTeam?: TeamId;
    tournamentTopScoringTeam?: TeamId;
    tournamentTopConcedingTeam?: TeamId;
    highestMatchGoals?: number;
    mostYellowCardsTeam?: TeamId;
    firstRedCardPlayer?: PlayerId;
    penaltyShootoutCount?: number;
    topScorerPlayer?: PlayerId;
  };
}

export interface ScoreBreakdown {
  groupMatches: Points;
  groupOrder: Points;
  bronze: Points;
  final: Points;
  roundOf8: Points;
  topFour: Points;
  specials: Points;
  total: Points;
}
