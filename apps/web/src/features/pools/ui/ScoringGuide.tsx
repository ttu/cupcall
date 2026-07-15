import type { ReactElement } from 'react';
import type { Scoring } from '@cup/engine';

type Props = { scoring: Scoring };

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): ReactElement {
  return (
    <div className="rounded-cup border border-line bg-white shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="px-4 py-2.5 turf">
        <span className="text-sm font-bold tracking-widest uppercase text-on-dark font-cup-display">
          {title}
        </span>
      </div>
      <div className="divide">{children}</div>
    </div>
  );
}

function Row({
  label,
  pts,
  note,
  indent,
}: {
  label: string;
  pts?: number;
  note?: string;
  indent?: boolean;
}): ReactElement {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${indent ? 'pl-8' : ''}`}>
      <span className="flex-1 text-sm text-ink-soft">{label}</span>
      {note && <span className="text-xs text-ink-muted shrink-0">{note}</span>}
      {pts !== undefined && (
        <span className="text-sm font-semibold tabular-nums text-ink shrink-0 min-w-12 text-right">
          {pts} pts
        </span>
      )}
    </div>
  );
}

export function ScoringGuide({ scoring }: Props): ReactElement {
  const finishMatchMax = scoring.final.perTeam * 2 + scoring.final.exactScore;
  const roundOf16Max = scoring.roundOf16PerTeam * 16;
  const roundOf8Max = scoring.roundOf8PerTeam * 8;
  const roundOf4Max = scoring.roundOf4PerTeam * 4 + scoring.topFourPositionBonus * 4;

  return (
    <div className="space-y-4">
      {/* Group Stage */}
      <SectionCard title="Group Stage">
        <Row label="Exact score" pts={scoring.groupMatch.exactScore} />
        <Row label="Correct outcome (win / draw / loss)" pts={scoring.groupMatch.correctOutcome} />
      </SectionCard>

      {/* Group Final Order */}
      <SectionCard title="Group Final Order">
        <Row label="Your predicted order is derived from your group scores." note="per group" />
        <Row label="All 4 positions correct" pts={scoring.groupOrder.allCorrect} indent />
        <Row label="2 positions correct" pts={scoring.groupOrder.twoCorrect} indent />
        <Row label="1 position correct" pts={scoring.groupOrder.oneCorrect} indent />
        <Row label="0 positions correct" pts={0} indent />
      </SectionCard>

      {/* Knockout Matches */}
      <SectionCard title="Bronze & Final Matches">
        <Row label="Correct team in the match" pts={scoring.final.perTeam} note="up to 2 teams" />
        <Row label="Exact score" pts={scoring.final.exactScore} />
        <Row label="Maximum per match" pts={finishMatchMax} />
      </SectionCard>

      {/* Round of 16 */}
      <SectionCard title="Round of 16 teams">
        <Row label="Per correct team that reaches the Round of 16" pts={scoring.roundOf16PerTeam} />
        <Row label="Maximum (all 16 correct)" pts={roundOf16Max} />
      </SectionCard>

      {/* Round of 8 */}
      <SectionCard title="Quarter-finalists (Round of 8)">
        <Row
          label="Per correct team that reaches the quarter-finals"
          pts={scoring.roundOf8PerTeam}
        />
        <Row label="Maximum (all 8 correct)" pts={roundOf8Max} />
      </SectionCard>

      {/* Semifinalists */}
      <SectionCard title="Semifinalists">
        <Row
          label="Per correct team predicted to reach the semifinal"
          pts={scoring.roundOf4PerTeam}
          note="resolves as each QF match completes"
        />
        <Row
          label="Position bonus (1st, 2nd, 3rd or 4th place correct)"
          pts={scoring.topFourPositionBonus}
          note="per position, up to 4"
        />
        <Row label="Maximum (all 4 correct + all positions correct)" pts={roundOf4Max} />
      </SectionCard>

      {/* Special Bets */}
      <SectionCard title="Special Bets">
        <Row label="Top scorer (player)" pts={scoring.topScorerPlayer} />
        <Row label="Most goals scored — group stage (team)" pts={scoring.groupTopScoringTeam} />
        <Row label="Most goals conceded — group stage (team)" pts={scoring.groupTopConcedingTeam} />
        <Row
          label="Most goals scored — full tournament (team)"
          pts={scoring.tournamentTopScoringTeam}
        />
        <Row
          label="Most goals conceded — full tournament (team)"
          pts={scoring.tournamentTopConcedingTeam}
        />
        <Row label="Highest goals in one match (exact count)" pts={scoring.highestMatchGoals} />
        <Row label="Most yellow cards (team)" pts={scoring.mostYellowCardsTeam} />
        <Row label="First red card (player)" pts={scoring.firstRedCardPlayer} />
        <Row label="Number of penalty shootouts (exact count)" pts={scoring.penaltyShootoutCount} />
        <Row label="Final decided by penalties (yes / no)" pts={scoring.finalDecidedByPenalties} />
        <Row label="Decisive goal in final (player)" pts={scoring.finalDecisiveGoalPlayer} />
      </SectionCard>
    </div>
  );
}
