import { describe, it, expect } from 'vitest';
import { buildStageProgress } from './stage-progress';
import { miniTournament } from '@cup/engine/testing';
import type { MatchRow } from '@cup/db';
import { tournamentId } from '@cup/engine';

const TID = tournamentId('mini-2026');

function row(id: string, stage: MatchRow['stage'], status: MatchRow['status'] = 'final'): MatchRow {
  return {
    id,
    tournamentId: TID,
    stage,
    groupId: stage === 'group' ? 'A' : null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: null,
    homeGoals: null,
    awayGoals: null,
    homeConduct: null,
    awayConduct: null,
    winnerTeamId: null,
    decidedBy: null,
    status,
  };
}

const allGroupRows = (): MatchRow[] =>
  miniTournament.groupMatches.map((m) => row(m.id, 'group', 'final'));

// miniTournament: 4 groups × 6 matches = 24 group matches, entry round = QF (4 matches)
describe('buildStageProgress', () => {
  it('marks group as active before any matches are played', () => {
    const result = buildStageProgress(miniTournament, []);
    const group = result.find((s) => s.key === 'group')!;
    expect(group.state).toBe('active');
  });

  it('marks group as active while group matches are in progress', () => {
    const partialGroupRows = miniTournament.groupMatches
      .slice(0, 6)
      .map((m) => row(m.id, 'group', 'final'));
    const result = buildStageProgress(miniTournament, partialGroupRows);
    const group = result.find((s) => s.key === 'group')!;
    expect(group.state).toBe('active');
  });

  it('marks entry round as active when group is complete and no entry-round rows exist in DB', () => {
    // Simulates the stage-transition period: all 24 group matches final, 0 QF rows in DB.
    const result = buildStageProgress(miniTournament, allGroupRows());
    const group = result.find((s) => s.key === 'group')!;
    const qf = result.find((s) => s.key === 'QF')!;
    expect(group.state).toBe('completed');
    expect(qf.state).toBe('active');
  });

  it('marks entry round as active when DB has fewer rows than expected (partial sync)', () => {
    // Simulates WC 2026 situation: 7 of 16 R32 rows in DB, all final — but only
    // miniTournament is available in tests, so we use 2 of 4 QF rows instead.
    const twoQfRows = miniTournament.bracket.roundOf8Matches
      .slice(0, 2)
      .map((id) => row(id, 'QF', 'final'));
    const result = buildStageProgress(miniTournament, [...allGroupRows(), ...twoQfRows]);
    const qf = result.find((s) => s.key === 'QF')!;
    expect(qf.state).toBe('active');
  });

  it('marks entry round as completed and next round as active when entry round is done', () => {
    const allQfRows = miniTournament.bracket.roundOf8Matches.map((id) => row(id, 'QF', 'final'));
    const oneSfRow = row(miniTournament.bracket.semiFinals[0]!, 'SF', 'final');
    const result = buildStageProgress(miniTournament, [...allGroupRows(), ...allQfRows, oneSfRow]);
    const qf = result.find((s) => s.key === 'QF')!;
    const sf = result.find((s) => s.key === 'SF')!;
    expect(qf.state).toBe('completed');
    expect(sf.state).toBe('active');
  });
});
