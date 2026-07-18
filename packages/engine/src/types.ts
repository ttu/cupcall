import type { TeamId, PlayerId, GroupId, MatchId, BracketMatchKey, Points } from './brand.js';

export type TiebreakKey =
  | 'points'
  | 'h2hPoints'
  | 'h2hGoalDifference'
  | 'h2hGoalsFor'
  | 'goalDifference'
  | 'goalsFor'
  | 'conductScore';

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
// eslint-disable-next-line sonarjs/redundant-type-aliases -- named for domain readability, not structure
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
  roundOf16Matches: BracketMatchKey[];
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
  roundOf16PerTeam: number;
  roundOf8PerTeam: number;
  bronze: { exactScore: number; perTeam: number };
  final: { exactScore: number; perTeam: number };
  /** Per confirmed semifinalist (see scoreTopFour). Order never matters. */
  roundOf4PerTeam: number;
  /**
   * Bonus per team whose predicted final-standing slot (1st/2nd from the Final, 3rd/4th from
   * Bronze) exactly matches the actual slot. See scoreTopFour. Independent of roundOf4PerTeam —
   * resolves per finish match, not per QF match.
   */
  topFourPositionBonus: number;
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
  /** Pre-computed conduct score delta for this match. Yellow: -1, red for two yellows: -3, straight red: -4, yellow + straight red: -5. */
  homeConduct?: number;
  awayConduct?: number;
}
export interface KnockoutPick {
  bracketMatchKey: BracketMatchKey;
  winner: TeamId;
}
export interface FinishScore {
  home: number;
  away: number;
  /**
   * Snapshot of which real team each goal figure belongs to, captured at save time. Optional —
   * absent when the predicted finalists/bronze pair weren't yet resolved at save time (e.g. the
   * player entered a final score before completing their semifinal picks), and for the
   * predict-page's own live-editing flow, which doesn't need it (see design doc, "Out of scope").
   */
  homeTeamId?: TeamId | null;
  awayTeamId?: TeamId | null;
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
  roundOf16: TeamId[];
  roundOf8: TeamId[];
  finalists: TeamId[];
  bronzePair: TeamId[];
  /**
   * The player's 4 QF-winner picks — the teams they predict will reach the semifinal.
   * Unordered; present as soon as QF picks are made, independent of Final/Bronze picks.
   * This is what the "SF" scoring category (scoreTopFour) compares against
   * `actual.answers.roundOf4`.
   */
  roundOf4: TeamId[];
  /**
   * The final top-four ranking: [finalWinner, finalLoser, bronzeWinner, bronzeLoser].
   * Only populated once the player has explicit Final and Bronze winner picks. Used for the
   * Predict page's "predicted final standings" (1st/2nd/3rd/4th) display — not for scoring
   * (see `roundOf4` for that).
   */
  topFour: TeamId[];
}

export interface ActualMatchResult {
  matchId: MatchId;
  home: number;
  away: number;
  homeConduct?: number;
  awayConduct?: number;
}
export interface ActualFinishMatch {
  home: TeamId;
  away: TeamId;
  homeGoals: number;
  awayGoals: number;
  /** Not derivable from goals alone when the match went to penalties (tied goals). */
  winner: TeamId;
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
    roundOf16?: TeamId[];
    roundOf8?: TeamId[];
    /** Teams confirmed to have won their QF match (i.e. reached the SF). Grows incrementally as
     * QF matches complete — auto-derived in scripts/sync.ts, never manually entered. */
    roundOf4?: TeamId[];
    /** Teams confirmed to have won their SF match (i.e. reached the Final). Grows incrementally as
     * SF matches complete — auto-derived in scripts/sync.ts, never manually entered. */
    finalists?: TeamId[];
    /** One or more teams when there is a tie for the top spot. */
    groupTopScoringTeam?: TeamId[];
    groupTopConcedingTeam?: TeamId[];
    tournamentTopScoringTeam?: TeamId[];
    tournamentTopConcedingTeam?: TeamId[];
    highestMatchGoals?: number;
    mostYellowCardsTeam?: TeamId[];
    firstRedCardPlayer?: PlayerId;
    penaltyShootoutCount?: number;
    /** One or more players when there is a tie for the top scorer. */
    topScorerPlayer?: PlayerId[];
  };
}

export interface ScoreBreakdown {
  groupMatches: Points;
  groupOrder: Points;
  bronze: Points;
  final: Points;
  roundOf16: Points;
  roundOf8: Points;
  /** Equals topFourTeams + topFourPosition. See scoreTopFour. */
  topFour: Points;
  /** Correct top-4 (semifinalist) team predictions only — set membership, no order. Subset of topFour. */
  topFourTeams: Points;
  /** Position bonus (1st/2nd/3rd/4th exact slot) earned within topFour. Subset of topFour. */
  topFourPosition: Points;
  specials: Points;
  total: Points;
}
