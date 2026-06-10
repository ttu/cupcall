import type { ReactElement } from 'react';
import type { BracketRoundResultView, KnockoutMatchView } from '../domain/types';
import { BracketMatchCard } from './BracketMatchCard';

// Approximate height of one BracketMatchCard (header + 2 team rows + borders).
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
      <div className="card" style={{ padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)' }}>
          Knockout stage bracket will appear here once teams are confirmed.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        className="card"
        style={{
          background: 'var(--green-050)',
          border: '1px solid var(--green-300)',
          padding: '10px 14px',
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--green-700)', margin: 0 }}>
          Results drop into your bracket as we enter them.{' '}
          <strong>Green = your pick survived, red = it&apos;s out.</strong>
        </p>
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'flex-start',
            minWidth: 'max-content',
          }}
        >
          {rounds.map((round, i) => (
            <div
              key={round.label}
              style={{
                minWidth: 160,
                paddingTop: columnPaddingTop(i),
              }}
            >
              <div
                className="eyebrow"
                style={{ color: 'var(--ink-muted)', marginBottom: 8, paddingLeft: 2, fontSize: 10 }}
              >
                {round.label}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: columnItemGap(i),
                }}
              >
                {round.matches.map((match) => (
                  <BracketMatchCard key={match.bracketMatchKey} match={match} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {bronzeMatch && (
        <div>
          <div
            className="eyebrow"
            style={{ marginBottom: 8, fontSize: 10, color: 'var(--ink-muted)' }}
          >
            3rd Place
          </div>
          <BracketMatchCard match={bronzeMatch} />
        </div>
      )}
    </div>
  );
}
