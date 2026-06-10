import type { ReactElement } from 'react';
import type { CardView } from '../domain/types';
import { CompletionBar } from './CompletionBar';
import { teamFlag } from './teamFlag';
import { SectionLabel, Icon } from '@/shared/ui';

type Props = { card: CardView };

export function ReadOnlyCard({ card }: Props): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <CompletionBar percent={card.completionPercent} />

      {/* Group stage */}
      <section aria-label="Group stage">
        <SectionLabel icon={<Icon name="ball" size={13} />}>Group Stage</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {card.groups.map((group) => (
            <div key={group.groupId} className="card" style={{ overflow: 'hidden' }}>
              <div className="turf" style={{ padding: '8px 16px' }}>
                <span className="display" style={{ fontSize: 15, color: 'var(--on-dark)' }}>
                  Group {group.groupId}
                </span>
              </div>
              <div className="divide">
                {group.matches.map((match) => (
                  <div
                    key={match.matchId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto 1fr',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 16px',
                    }}
                  >
                    <span
                      style={{
                        textAlign: 'right',
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {match.homeTeamName} {teamFlag(match.homeTeamId)}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {match.predictedHome !== null ? (
                        <>
                          <span className="score-cell filled" style={{ pointerEvents: 'none' }}>
                            {match.predictedHome}
                          </span>
                          <span className="score-sep">:</span>
                          <span className="score-cell filled" style={{ pointerEvents: 'none' }}>
                            {match.predictedAway}
                          </span>
                        </>
                      ) : (
                        <span
                          className="display"
                          style={{
                            fontSize: 20,
                            color: 'var(--ink-muted)',
                            minWidth: 58,
                            textAlign: 'center',
                          }}
                        >
                          –
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
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
        <SectionLabel icon={<Icon name="trophy" size={13} />}>Bracket</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {card.bracket.rounds.map((round) => (
            <div key={round.label} className="card" style={{ overflow: 'hidden' }}>
              <div className="turf" style={{ padding: '8px 16px' }}>
                <span className="display" style={{ fontSize: 15, color: 'var(--on-dark)' }}>
                  {round.label}
                </span>
              </div>
              <div className="divide">
                {round.ties.map((tie) => (
                  <div
                    key={tie.bracketMatchKey}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 16px',
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        textAlign: 'right',
                        fontSize: 13,
                        fontWeight: 700,
                        color:
                          tie.pickedWinnerId === tie.homeTeamId ? 'var(--green-700)' : 'var(--ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tie.homeTeamName ?? '?'} {teamFlag(tie.homeTeamId)}
                    </span>
                    <span
                      style={{
                        color: 'var(--ink-muted)',
                        fontSize: 11,
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      vs
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        fontWeight: 700,
                        color:
                          tie.pickedWinnerId === tie.awayTeamId ? 'var(--green-700)' : 'var(--ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {teamFlag(tie.awayTeamId)} {tie.awayTeamName ?? '?'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Final */}
          <div
            className="card"
            style={{
              overflow: 'hidden',
              background: 'var(--ink-900)',
              border: 'none',
            }}
          >
            <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              <span className="display" style={{ fontSize: 15, color: 'var(--on-dark)' }}>
                Final
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
              }}
            >
              <span
                style={{
                  flex: 1,
                  textAlign: 'right',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--on-dark)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {card.bracket.final.homeTeamName ?? '—'} {teamFlag(card.bracket.final.homeTeamId)}
              </span>
              <span
                className="display tnum"
                style={{ fontSize: 22, color: 'var(--on-dark)', minWidth: 56, textAlign: 'center' }}
              >
                {card.bracket.final.predictedHome !== null
                  ? `${card.bracket.final.predictedHome}–${card.bracket.final.predictedAway}`
                  : '–'}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--on-dark)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {teamFlag(card.bracket.final.awayTeamId)} {card.bracket.final.awayTeamName ?? '—'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Specials */}
      {card.specials.length > 0 && (
        <section aria-label="Special bets">
          <SectionLabel icon={<Icon name="spark" size={13} />}>Special Bets</SectionLabel>
          <div
            className="card"
            style={{
              overflow: 'hidden',
              marginTop: 12,
            }}
          >
            <div className="divide">
              {card.specials.map((bet) => (
                <div
                  key={bet.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 16px',
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--ink-soft)', flex: 1 }}>
                    {bet.label}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                    {bet.value !== null ? String(bet.value) : '—'}
                  </span>
                  {bet.points !== undefined && (
                    <span className="display" style={{ fontSize: 13, color: 'var(--green-600)' }}>
                      {bet.points}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
