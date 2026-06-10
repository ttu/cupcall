import type { Tournament } from '@cup/engine';
import type { MatchRow } from '@cup/db';

export type StageKey = 'group' | 'R16' | 'QF' | 'SF' | 'Final';

export type StageProgress = {
  key: StageKey;
  label: string;
  state: 'completed' | 'active' | 'upcoming';
  startDate: Date | null;
};

const STAGE_ORDER: StageKey[] = ['group', 'R16', 'QF', 'SF', 'Final'];

const STAGE_LABELS: Record<StageKey, string> = {
  group: 'Group Stage',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  Final: 'Final',
};

export function buildStageProgress(def: Tournament, allMatches: MatchRow[]): StageProgress[] {
  const stages = STAGE_ORDER.filter((s) => {
    if (s === 'group') return def.groups.length > 0;
    return def.bracket.rounds.includes(s);
  });

  const finalCountByStage = new Map<string, number>();
  const totalCountByStage = new Map<string, number>();
  const startDateByStage = new Map<string, Date>();

  for (const m of allMatches) {
    const key = m.stage === 'group' ? 'group' : m.stage;
    totalCountByStage.set(key, (totalCountByStage.get(key) ?? 0) + 1);
    if (m.status === 'final') {
      finalCountByStage.set(key, (finalCountByStage.get(key) ?? 0) + 1);
    }
    if (m.kickoff) {
      const existing = startDateByStage.get(key);
      if (!existing || m.kickoff < existing) startDateByStage.set(key, m.kickoff);
    }
  }

  let foundActive = false;
  return stages.map((key) => {
    const total = totalCountByStage.get(key) ?? 0;
    const done = finalCountByStage.get(key) ?? 0;

    let state: StageProgress['state'];
    if (total > 0 && done === total) {
      state = 'completed';
    } else if (done > 0 && !foundActive) {
      state = 'active';
      foundActive = true;
    } else if (done === 0 && !foundActive) {
      // No matches played yet — first stage with scheduled matches becomes active
      if (key === stages[0] && total > 0) {
        state = 'active';
        foundActive = true;
      } else {
        state = 'upcoming';
      }
    } else {
      state = 'upcoming';
    }

    return { key, label: STAGE_LABELS[key], state, startDate: startDateByStage.get(key) ?? null };
  });
}
