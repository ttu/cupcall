import { Fragment, type ReactElement } from 'react';
import type { BracketRoundResultView, KnockoutMatchView } from '../domain/types';
import { BracketMatchCard } from './BracketMatchCard';
import { FinalResultCard } from './FinalResultCard';

const TIE_H = 114;
const TIE_GAP = 8;
const U = TIE_H + TIE_GAP; // 122

// Width of the SVG connector strip between columns.
const CONN_W = 28;

function columnPaddingTop(n: number): number {
  return ((Math.pow(2, n) - 1) * U) / 2;
}

function columnItemGap(n: number): number {
  return Math.pow(2, n) * U - TIE_H;
}

// Vertical centre of match j in column colIndex, measured from the top of the
// BRACKET ROW (no labels). Labels live in a sibling row above, so LABEL_H
// is not needed here — coordinates are label-free.
function matchCenterY(colIndex: number, matchIndex: number): number {
  return columnPaddingTop(colIndex) + matchIndex * Math.pow(2, colIndex) * U + TIE_H / 2;
}

type ConnectorSvgProps = {
  fromColIndex: number;
  fromMatchCount: number;
  totalHeight: number;
};

// Classic bracket connector: stubs from both match centres meet a vertical bar
// at midX; an output line runs from midX at their midpoint to the right edge.
function BracketConnector({
  fromColIndex,
  fromMatchCount,
  totalHeight,
}: ConnectorSvgProps): ReactElement {
  const midX = CONN_W / 2;
  const pairCount = Math.floor(fromMatchCount / 2);

  return (
    <svg
      width={CONN_W}
      height={totalHeight}
      style={{ flexShrink: 0, display: 'block' }}
      aria-hidden="true"
    >
      <g
        stroke="var(--line)"
        strokeWidth={1}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {Array.from({ length: pairCount }, (_, k) => {
          const y1 = matchCenterY(fromColIndex, 2 * k);
          const y2 = matchCenterY(fromColIndex, 2 * k + 1);
          const midY = (y1 + y2) / 2;
          return (
            <path key={k} d={`M 0 ${y1} H ${midX} V ${y2} H 0 M ${midX} ${midY} H ${CONN_W}`} />
          );
        })}
      </g>
    </svg>
  );
}

type Props = {
  rounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
};

function BracketInfoBanner(): ReactElement {
  return (
    <div className="flex items-start gap-2.5 p-[10px_14px] rounded-[10px] bg-green-050 border border-green-300 text-[13px] text-green-700">
      <span className="font-extrabold">⚡</span>
      <span>
        Results drop into your bracket as we enter them.{' '}
        <strong>Green = your pick survived, red = it&apos;s out.</strong>
      </span>
    </div>
  );
}

type FinalCardsProps = {
  finalMatch: KnockoutMatchView | null;
  bronzeMatch: KnockoutMatchView | null;
  paddingTop: number;
};

// Only renders the match cards — labels are in the sibling label row above.
function FinalCards({ finalMatch, bronzeMatch, paddingTop }: FinalCardsProps): ReactElement | null {
  if (!finalMatch && !bronzeMatch) return null;
  return (
    <div className="min-w-55" style={{ paddingTop }}>
      {finalMatch && <FinalResultCard match={finalMatch} matchKey="final" />}
      {bronzeMatch && (
        <>
          <div className="eyebrow text-ink-muted mt-4 mb-2 pl-0.5">3rd Place</div>
          <FinalResultCard match={bronzeMatch} matchKey="bronze" />
        </>
      )}
    </div>
  );
}

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

  const finalRound = rounds.find((r) => r.label === 'Final') ?? null;
  const finalMatch = finalRound?.matches[0] ?? null;
  const mainRounds = rounds.filter((r) => r.label !== 'Final');
  const finalColumnIndex = mainRounds.length;

  // Total height of the bracket row = height of column 0 (the tallest column,
  // no paddingTop). Used as the SVG height for all connector strips.
  const firstRound = mainRounds[0];
  const totalHeight = firstRound
    ? firstRound.matches.length * TIE_H + (firstRound.matches.length - 1) * TIE_GAP + 8
    : 100;

  return (
    <div className="flex flex-col gap-4">
      <BracketInfoBanner />

      <div className="overflow-x-auto pb-2">
        {/* ── Label row ── */}
        <div className="flex min-w-max mb-2">
          {mainRounds.map((round, i) => (
            <Fragment key={round.label}>
              <div className="min-w-47.5 eyebrow text-ink-muted pl-0.5">{round.label}</div>
              {/* spacer matches the connector SVG width */}
              <div style={{ width: CONN_W, flexShrink: 0 }} />
            </Fragment>
          ))}
          {(finalMatch || bronzeMatch) && (
            <div className="min-w-55 eyebrow text-ink-muted pl-0.5">
              {finalMatch ? 'Final' : '3rd Place'}
            </div>
          )}
        </div>

        {/* ── Bracket row (match cards + connector SVGs, no labels) ── */}
        <div className="flex items-start min-w-max">
          {mainRounds.map((round, i) => (
            <Fragment key={round.label}>
              <div
                data-testid={`bracket-round-${round.label}`}
                className="min-w-47.5"
                style={{ paddingTop: columnPaddingTop(i) }}
              >
                <div className="flex flex-col" style={{ gap: columnItemGap(i) }}>
                  {round.matches.map((match) => (
                    <BracketMatchCard key={match.bracketMatchKey} match={match} />
                  ))}
                </div>
              </div>

              <BracketConnector
                fromColIndex={i}
                fromMatchCount={round.matches.length}
                totalHeight={totalHeight}
              />
            </Fragment>
          ))}

          <FinalCards
            finalMatch={finalMatch}
            bronzeMatch={bronzeMatch}
            paddingTop={columnPaddingTop(finalColumnIndex)}
          />
        </div>
      </div>
    </div>
  );
}
