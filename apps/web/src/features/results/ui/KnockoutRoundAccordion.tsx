'use client';

import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { BracketRoundResultView, KnockoutMatchView } from '../domain/types';
import { getRoundPlayedCount, pickDefaultExpandedRound } from '../domain/knockout-mobile-view';
import { BracketMatchCard } from './BracketMatchCard';
import { FinalResultCard } from './FinalResultCard';
import { Icon, cn } from '@/shared/ui';

type Props = {
  rounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
  userPredictedKnockoutTeamIds: string[] | null;
  onOpenMatch?: ((bracketMatchKey: string) => void) | undefined;
};

function formatRoundDate(round: BracketRoundResultView): string | null {
  const kickoff = round.matches.find((m) => m.kickoff !== null)?.kickoff ?? null;
  if (!kickoff) return null;
  return new Date(kickoff).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function RoundStatusChip({ round }: { round: BracketRoundResultView }): ReactElement {
  const { played, total } = getRoundPlayedCount(round);
  if (played > 0) {
    return (
      <span className="text-[11px] font-bold text-ink-muted tnum">
        {played}/{total} played
      </span>
    );
  }
  const date = formatRoundDate(round);
  return <span className="text-[11px] font-bold text-ink-muted">{date ?? round.label}</span>;
}

function AccordionSection({
  label,
  statusChip,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  statusChip: ReactElement;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="card overflow-hidden" data-testid={`knockout-round-section-${label}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex items-center justify-between w-full p-[12px_14px] bg-none border-0 cursor-pointer"
      >
        <span className="eyebrow text-ink">{label}</span>
        <span className="flex items-center gap-2">
          {statusChip}
          <span className={cn('inline-flex transition-transform', isOpen && 'rotate-90')}>
            <Icon name="chevron" size={14} color="var(--ink-muted)" />
          </span>
        </span>
      </button>
      {isOpen && <div className="flex flex-col gap-2 p-[0_14px_14px]">{children}</div>}
    </div>
  );
}

export function KnockoutRoundAccordion({
  rounds,
  bronzeMatch,
  userPredictedKnockoutTeamIds,
  onOpenMatch,
}: Props): ReactElement {
  const [openLabels, setOpenLabels] = useState<Set<string>>(() => {
    const defaultLabel = pickDefaultExpandedRound(rounds);
    return new Set(defaultLabel ? [defaultLabel] : []);
  });

  if (rounds.length === 0) {
    return (
      <div className="card p-[32px_24px] text-center">
        <p className="text-[13px] font-semibold text-ink-muted">
          Knockout stage bracket will appear here once teams are confirmed.
        </p>
      </div>
    );
  }

  const predictedQualifierIds = new Set<string>(userPredictedKnockoutTeamIds ?? []);

  function toggle(label: string): void {
    setOpenLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {rounds.map((round, i) => (
        <AccordionSection
          key={round.label}
          label={round.label}
          statusChip={<RoundStatusChip round={round} />}
          isOpen={openLabels.has(round.label)}
          onToggle={() => toggle(round.label)}
        >
          {round.label === 'Final' ? (
            <FinalResultCard
              match={round.matches[0]!}
              matchKey="final"
              onSelect={
                onOpenMatch ? () => onOpenMatch(round.matches[0]!.bracketMatchKey) : undefined
              }
            />
          ) : (
            round.matches.map((match) => (
              <BracketMatchCard
                key={match.bracketMatchKey}
                match={match}
                predictedQualifierIds={i === 0 ? predictedQualifierIds : new Set()}
                onSelect={onOpenMatch ? () => onOpenMatch(match.bracketMatchKey) : undefined}
              />
            ))
          )}
        </AccordionSection>
      ))}

      {bronzeMatch && (
        <AccordionSection
          label="3rd Place"
          statusChip={<RoundStatusChip round={{ label: '3rd Place', matches: [bronzeMatch] }} />}
          isOpen={openLabels.has('3rd Place')}
          onToggle={() => toggle('3rd Place')}
        >
          <FinalResultCard
            match={bronzeMatch}
            matchKey="bronze"
            onSelect={onOpenMatch ? () => onOpenMatch(bronzeMatch.bracketMatchKey) : undefined}
          />
        </AccordionSection>
      )}
    </div>
  );
}
