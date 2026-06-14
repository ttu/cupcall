import type { ReactElement } from 'react';
import type { BracketRoundResultView, KnockoutMatchView } from '../domain/types';
import { BracketMatchCard } from './BracketMatchCard';
import { FinalResultCard } from './FinalResultCard';

const TIE_H = 80;
const TIE_GAP = 8;
const U = TIE_H + TIE_GAP;

function columnPaddingTop(n: number): number {
  return ((Math.pow(2, n) - 1) * U) / 2;
}

function columnItemGap(n: number): number {
  return Math.pow(2, n) * U - TIE_H;
}

type Props = {
  rounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
};

export function KnockoutBracket({ rounds, bronzeMatch }: Props): ReactElement {
  if (rounds.length === 0) {
    return (
      <div className="card p-[32px_24px] text-center">
        <p className="text-[13px] font-semibold text-ink-muted">
          Knockout stage bracket will appear here once teams are confirmed.
        </p>
      </div>
    );
  }

  // Split off the Final round so we can render the special FinalResultCard in
  // the right-most column alongside the bronze tie.
  const finalRound = rounds.find((r) => r.label === 'Final') ?? null;
  const finalMatch = finalRound?.matches[0] ?? null;
  const mainRounds = rounds.filter((r) => r.label !== 'Final');
  const finalColumnIndex = mainRounds.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Info banner */}
      <div className="flex items-start gap-[10px] p-[10px_14px] rounded-[10px] bg-green-050 border border-[var(--green-300)] text-[13px] text-green-700">
        <span className="font-extrabold">⚡</span>
        <span>
          Results drop into your bracket as we enter them.{' '}
          <strong>Green = your pick survived, red = it&apos;s out.</strong>
        </span>
      </div>

      {/* Bracket columns */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-4 items-start min-w-max">
          {mainRounds.map((round, i) => (
            <div
              key={round.label}
              data-testid={`bracket-round-${round.label}`}
              className="min-w-[190px]"
              style={{ paddingTop: columnPaddingTop(i) }}
            >
              <div className="eyebrow text-ink-muted mb-2 pl-0.5">{round.label}</div>
              <div className="flex flex-col" style={{ gap: columnItemGap(i) }}>
                {round.matches.map((match) => (
                  <BracketMatchCard key={match.bracketMatchKey} match={match} />
                ))}
              </div>
            </div>
          ))}

          {/* Final + Bronze column */}
          {(finalMatch || bronzeMatch) && (
            <div
              className="min-w-[220px]"
              style={{ paddingTop: columnPaddingTop(finalColumnIndex) }}
            >
              {finalMatch && (
                <>
                  <div className="eyebrow text-ink-muted mb-2 pl-0.5">Final</div>
                  <FinalResultCard match={finalMatch} matchKey="final" />
                </>
              )}
              {bronzeMatch && (
                <>
                  <div className="eyebrow text-ink-muted mt-4 mb-2 pl-0.5">3rd Place</div>
                  <FinalResultCard match={bronzeMatch} matchKey="bronze" />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
