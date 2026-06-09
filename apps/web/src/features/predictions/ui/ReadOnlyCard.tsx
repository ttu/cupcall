import type { ReactElement } from 'react';
import type { CardView } from '../domain/types';
import { CompletionBar } from './CompletionBar';
import { teamFlag } from './teamFlag';

type Props = { card: CardView };

export function ReadOnlyCard({ card }: Props): ReactElement {
  return (
    <div className="space-y-6">
      <CompletionBar percent={card.completionPercent} />

      {/* Group stage */}
      <section aria-label="Group stage">
        <h3
          className="text-xs font-bold tracking-widest uppercase text-[var(--ink-muted)] mb-3"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Group Stage
        </h3>
        <div className="space-y-4">
          {card.groups.map((group) => (
            <div
              key={group.groupId}
              className="rounded-[var(--radius)] border border-[var(--line)] overflow-hidden bg-white shadow-[var(--shadow-sm)]"
            >
              <div className="px-4 py-2 turf">
                <span
                  className="text-sm font-bold tracking-widest uppercase text-[var(--on-dark)]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Group {group.groupId}
                </span>
              </div>
              <div className="divide">
                {group.matches.map((match) => (
                  <div key={match.matchId} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex-1 text-right text-sm text-[var(--ink)] truncate">
                      {match.homeTeamName} {teamFlag(match.homeTeamId)}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-[var(--ink)] min-w-[3.5rem] text-center">
                      {match.predictedHome !== null
                        ? `${match.predictedHome} : ${match.predictedAway}`
                        : '—'}
                    </span>
                    <span className="flex-1 text-left text-sm text-[var(--ink)] truncate">
                      {teamFlag(match.awayTeamId)} {match.awayTeamName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bracket */}
      <section aria-label="Bracket picks">
        <h3
          className="text-xs font-bold tracking-widest uppercase text-[var(--ink-muted)] mb-3"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Bracket
        </h3>
        <div className="space-y-4">
          {card.bracket.rounds.map((round) => (
            <div
              key={round.label}
              className="rounded-[var(--radius)] border border-[var(--line)] overflow-hidden bg-white shadow-[var(--shadow-sm)]"
            >
              <div className="px-4 py-2 turf">
                <span
                  className="text-sm font-bold tracking-widest uppercase text-[var(--on-dark)]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {round.label}
                </span>
              </div>
              <div className="divide">
                {round.ties.map((tie) => (
                  <div key={tie.bracketMatchKey} className="flex items-center gap-2 px-4 py-2.5">
                    <span
                      className={`flex-1 text-right text-sm truncate ${tie.pickedWinnerId === tie.homeTeamId ? 'font-semibold text-[var(--green-700)]' : 'text-[var(--ink)]'}`}
                    >
                      {tie.homeTeamName ?? '?'} {teamFlag(tie.homeTeamId)}
                    </span>
                    <span className="text-xs text-[var(--ink-muted)] font-bold select-none px-1">
                      vs
                    </span>
                    <span
                      className={`flex-1 text-left text-sm truncate ${tie.pickedWinnerId === tie.awayTeamId ? 'font-semibold text-[var(--green-700)]' : 'text-[var(--ink)]'}`}
                    >
                      {teamFlag(tie.awayTeamId)} {tie.awayTeamName ?? '?'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Final */}
          <div className="rounded-[var(--radius)] border border-[var(--line)] overflow-hidden bg-white shadow-[var(--shadow-sm)]">
            <div className="px-4 py-2 turf">
              <span
                className="text-sm font-bold tracking-widest uppercase text-[var(--on-dark)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Final
              </span>
            </div>
            <div className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex-1 text-right text-sm text-[var(--ink)] truncate">
                {card.bracket.final.homeTeamName ?? '—'} {teamFlag(card.bracket.final.homeTeamId)}
              </span>
              <span className="text-sm font-semibold tabular-nums text-[var(--ink)] min-w-[3.5rem] text-center">
                {card.bracket.final.predictedHome !== null
                  ? `${card.bracket.final.predictedHome} : ${card.bracket.final.predictedAway}`
                  : '—'}
              </span>
              <span className="flex-1 text-left text-sm text-[var(--ink)] truncate">
                {teamFlag(card.bracket.final.awayTeamId)} {card.bracket.final.awayTeamName ?? '—'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Specials */}
      {card.specials.length > 0 && (
        <section aria-label="Special bets">
          <h3
            className="text-xs font-bold tracking-widest uppercase text-[var(--ink-muted)] mb-3"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Special Bets
          </h3>
          <div className="rounded-[var(--radius)] border border-[var(--line)] overflow-hidden bg-white shadow-[var(--shadow-sm)] divide">
            {card.specials.map((bet) => (
              <div key={bet.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm text-[var(--ink-soft)]">{bet.label}</span>
                <span className="text-sm font-medium text-[var(--ink)]">
                  {bet.value !== null ? String(bet.value) : '—'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
