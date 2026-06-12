import type { ReactElement } from 'react';
import type { CardView } from '../domain/types';
import { CompletionBar } from './CompletionBar';
import { SectionLabel, Icon, TeamBadge } from '@/shared/ui';

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
              <div className="turf" style={{ padding: '10px 16px' }}>
                <span className="display" style={{ fontSize: 20, color: 'var(--on-dark)' }}>
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
                      gap: 10,
                      padding: '10px 16px',
                    }}
                  >
                    {/* Home */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
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
                        {match.homeTeamName}
                      </span>
                      <TeamBadge teamId={match.homeTeamId} size="lg" />
                    </div>

                    {/* Score */}
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

                    {/* Away */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      <TeamBadge teamId={match.awayTeamId} size="lg" />
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
                        {match.awayTeamName}
                      </span>
                    </div>
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
                      padding: '6px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <ReadOnlyPickRow
                      teamId={tie.homeTeamId}
                      teamName={tie.homeTeamName ?? '?'}
                      isPick={tie.pickedWinnerId !== null && tie.pickedWinnerId === tie.homeTeamId}
                    />
                    <ReadOnlyPickRow
                      teamId={tie.awayTeamId}
                      teamName={tie.awayTeamName ?? '?'}
                      isPick={tie.pickedWinnerId !== null && tie.pickedWinnerId === tie.awayTeamId}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Final */}
          <ReadOnlyFinishCard
            label="Final"
            homeTeamId={card.bracket.final.homeTeamId}
            homeTeamName={card.bracket.final.homeTeamName}
            awayTeamId={card.bracket.final.awayTeamId}
            awayTeamName={card.bracket.final.awayTeamName}
            predictedHome={card.bracket.final.predictedHome}
            predictedAway={card.bracket.final.predictedAway}
            pickedWinnerId={card.bracket.final.pickedWinnerId}
            isFinal
          />

          {/* 3rd Place */}
          <ReadOnlyFinishCard
            label="3rd Place"
            homeTeamId={card.bracket.bronze.homeTeamId}
            homeTeamName={card.bracket.bronze.homeTeamName}
            awayTeamId={card.bracket.bronze.awayTeamId}
            awayTeamName={card.bracket.bronze.awayTeamName}
            predictedHome={card.bracket.bronze.predictedHome}
            predictedAway={card.bracket.bronze.predictedAway}
            pickedWinnerId={card.bracket.bronze.pickedWinnerId}
            isFinal={false}
          />
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

function ReadOnlyPickRow({
  teamId,
  teamName,
  isPick,
}: {
  teamId: string | null;
  teamName: string;
  isPick: boolean;
}): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 7px',
        borderRadius: 7,
        background: isPick ? 'var(--green-050)' : 'transparent',
      }}
    >
      <TeamBadge teamId={teamId} size="sm" />
      <span
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: 700,
          color: isPick ? 'var(--green-700)' : teamId ? 'var(--ink)' : 'var(--ink-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {teamName}
      </span>
      {isPick && <Icon name="check" size={11} color="var(--green-700)" />}
    </div>
  );
}

function ReadOnlyFinishCard({
  label,
  homeTeamId,
  homeTeamName,
  awayTeamId,
  awayTeamName,
  predictedHome,
  predictedAway,
  pickedWinnerId,
  isFinal,
}: {
  label: string;
  homeTeamId: string | null;
  homeTeamName: string | null;
  awayTeamId: string | null;
  awayTeamName: string | null;
  predictedHome: number | null;
  predictedAway: number | null;
  pickedWinnerId: string | null;
  isFinal: boolean;
}): ReactElement {
  const champion = (() => {
    if (pickedWinnerId === null) return null;
    if (pickedWinnerId === homeTeamId) return { teamId: homeTeamId, teamName: homeTeamName };
    if (pickedWinnerId === awayTeamId) return { teamId: awayTeamId, teamName: awayTeamName };
    return null;
  })();

  return (
    <div
      style={{
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        background: isFinal ? 'var(--ink-900)' : 'var(--surface)',
        border: isFinal ? 'none' : '1px solid var(--line-soft)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: isFinal ? '1px solid rgba(255,255,255,.06)' : '1px solid var(--line-soft)',
        }}
      >
        <span
          className="display"
          style={{ fontSize: 15, color: isFinal ? 'var(--on-dark)' : 'var(--ink)' }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 6,
          padding: '10px 12px',
        }}
      >
        {/* Home team */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 5,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'right',
            }}
          >
            {homeTeamName ?? '—'}
          </span>
          <TeamBadge teamId={homeTeamId} size="sm" />
        </div>

        {/* Score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {predictedHome !== null ? (
            <>
              <span className="score-cell filled" style={{ pointerEvents: 'none' }}>
                {predictedHome}
              </span>
              <span className="score-sep">:</span>
              <span className="score-cell filled" style={{ pointerEvents: 'none' }}>
                {predictedAway}
              </span>
            </>
          ) : (
            <span
              className="display tnum"
              style={{
                fontSize: 22,
                color: isFinal ? 'var(--on-dark)' : 'var(--ink)',
                minWidth: 56,
                textAlign: 'center',
              }}
            >
              –
            </span>
          )}
        </div>

        {/* Away team */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            minWidth: 0,
          }}
        >
          <TeamBadge teamId={awayTeamId} size="sm" />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {awayTeamName ?? '—'}
          </span>
        </div>
      </div>

      {/* Winner pill */}
      {champion?.teamId && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '2px 8px 10px',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px 4px 6px',
              borderRadius: 999,
              background: isFinal ? 'var(--gold)' : 'oklch(0.80 0.06 55)',
            }}
          >
            <TeamBadge teamId={champion.teamId} size="sm" />
            <span
              className="display"
              style={{
                fontSize: 11,
                color: isFinal ? 'oklch(0.28 0.06 80)' : 'oklch(0.32 0.06 55)',
                letterSpacing: '0.04em',
              }}
            >
              {champion.teamName}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
