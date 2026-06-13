import type { Scoring } from '../types.js';

export type BetInputKind = 'player' | 'team' | 'number' | 'bool';

export type SpecialBetDef = {
  key: string;
  label: string;
  kind: BetInputKind;
  points: number;
  allowFreeText?: boolean;
};

export function getSpecialBetDefs(scoring: Scoring): SpecialBetDef[] {
  return [
    {
      key: 'topScorerPlayer',
      label: 'Top scorer',
      kind: 'player',
      points: scoring.topScorerPlayer,
      allowFreeText: true,
    },
    {
      key: 'finalDecisiveGoalPlayer',
      label: 'Decisive goal in the final',
      kind: 'player',
      points: scoring.finalDecisiveGoalPlayer,
      allowFreeText: true,
    },
    {
      key: 'firstRedCardPlayer',
      label: 'First red card',
      kind: 'player',
      points: scoring.firstRedCardPlayer,
    },
    {
      key: 'mostYellowCardsTeam',
      label: 'Most yellow cards (team)',
      kind: 'team',
      points: scoring.mostYellowCardsTeam,
    },
    {
      key: 'groupTopScoringTeam',
      label: 'Most goals scored — group stage',
      kind: 'team',
      points: scoring.groupTopScoringTeam,
    },
    {
      key: 'groupTopConcedingTeam',
      label: 'Most goals conceded — group stage',
      kind: 'team',
      points: scoring.groupTopConcedingTeam,
    },
    {
      key: 'tournamentTopScoringTeam',
      label: 'Most goals scored — whole tournament',
      kind: 'team',
      points: scoring.tournamentTopScoringTeam,
    },
    {
      key: 'tournamentTopConcedingTeam',
      label: 'Most goals conceded — whole tournament',
      kind: 'team',
      points: scoring.tournamentTopConcedingTeam,
    },
    {
      key: 'highestMatchGoals',
      label: 'Highest total goals in one match (exact number)',
      kind: 'number',
      points: scoring.highestMatchGoals,
    },
    {
      key: 'penaltyShootoutCount',
      label: 'Number of penalty shootouts in the tournament',
      kind: 'number',
      points: scoring.penaltyShootoutCount,
    },
    {
      key: 'finalDecidedByPenalties',
      label: 'Is the final decided by penalties?',
      kind: 'bool',
      points: scoring.finalDecidedByPenalties,
    },
  ];
}
