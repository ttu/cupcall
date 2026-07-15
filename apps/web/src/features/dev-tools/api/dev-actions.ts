'use server';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/shared/db';
import { signInAsExistingGuest } from '@/features/auth';
import { userId as toUserId } from '@cup/engine';
import {
  upsertTournamentResults,
  upsertKnockoutMatch,
  resetTournamentResults,
  listPredictionsForTournament,
  getPredictionInputs,
  upsertScore,
  getTournamentById,
} from '@cup/db';
import {
  deriveCard,
  scoreCard,
  groupId,
  teamId,
  matchId,
  playerId,
  tournamentId as asTournamentId,
} from '@cup/engine';
import type { ActualResults } from '@cup/engine';
import type { SimulationCheckpoint } from '../application/get-dev-state';
import type { GroupId, TeamId } from '@cup/engine';

const TOURNAMENT_ID = asTournamentId('test-wc-2026');

// ── Group match kickoff dates ──────────────────────────────────────────────────

const GROUP_MATCH_KICKOFFS: Record<string, string> = {
  mA1: '2026-06-11',
  mA2: '2026-06-12',
  mA3: '2026-06-18',
  mA4: '2026-06-19',
  mA5: '2026-06-25',
  mA6: '2026-06-25',
  mB1: '2026-06-12',
  mB2: '2026-06-13',
  mB3: '2026-06-18',
  mB4: '2026-06-18',
  mB5: '2026-06-24',
  mB6: '2026-06-24',
  mC1: '2026-06-13',
  mC2: '2026-06-14',
  mC3: '2026-06-19',
  mC4: '2026-06-20',
  mC5: '2026-06-24',
  mC6: '2026-06-24',
  mD1: '2026-06-13',
  mD2: '2026-06-14',
  mD3: '2026-06-19',
  mD4: '2026-06-20',
  mD5: '2026-06-26',
  mD6: '2026-06-26',
  mE1: '2026-06-14',
  mE2: '2026-06-14',
  mE3: '2026-06-20',
  mE4: '2026-06-21',
  mE5: '2026-06-25',
  mE6: '2026-06-25',
  mF1: '2026-06-14',
  mF2: '2026-06-15',
  mF3: '2026-06-20',
  mF4: '2026-06-21',
  mF5: '2026-06-25',
  mF6: '2026-06-25',
  mG1: '2026-06-15',
  mG2: '2026-06-16',
  mG3: '2026-06-21',
  mG4: '2026-06-22',
  mG5: '2026-06-27',
  mG6: '2026-06-27',
  mH1: '2026-06-15',
  mH2: '2026-06-15',
  mH3: '2026-06-21',
  mH4: '2026-06-21',
  mH5: '2026-06-27',
  mH6: '2026-06-27',
  mI1: '2026-06-16',
  mI2: '2026-06-16',
  mI3: '2026-06-22',
  mI4: '2026-06-23',
  mI5: '2026-06-26',
  mI6: '2026-06-26',
  mJ1: '2026-06-17',
  mJ2: '2026-06-17',
  mJ3: '2026-06-22',
  mJ4: '2026-06-23',
  mJ5: '2026-06-28',
  mJ6: '2026-06-28',
  mK1: '2026-06-17',
  mK2: '2026-06-18',
  mK3: '2026-06-23',
  mK4: '2026-06-24',
  mK5: '2026-06-27',
  mK6: '2026-06-27',
  mL1: '2026-06-17',
  mL2: '2026-06-17',
  mL3: '2026-06-23',
  mL4: '2026-06-23',
  mL5: '2026-06-27',
  mL6: '2026-06-27',
};

// ── Group match scores ─────────────────────────────────────────────────────────

const GROUP_SCORES_A_F = [
  { id: 'mA1', home: 2, away: 0 },
  { id: 'mA2', home: 2, away: 1 },
  { id: 'mA3', home: 2, away: 0 },
  { id: 'mA4', home: 2, away: 1 },
  { id: 'mA5', home: 1, away: 2 },
  { id: 'mA6', home: 0, away: 2 },
  { id: 'mB1', home: 2, away: 0 },
  { id: 'mB2', home: 1, away: 3 },
  { id: 'mB3', home: 2, away: 0 },
  { id: 'mB4', home: 2, away: 1 },
  { id: 'mB5', home: 1, away: 0 },
  { id: 'mB6', home: 1, away: 2 },
  { id: 'mC1', home: 3, away: 0 },
  { id: 'mC2', home: 0, away: 2 },
  { id: 'mC3', home: 1, away: 2 },
  { id: 'mC4', home: 6, away: 1 },
  { id: 'mC5', home: 1, away: 2 },
  { id: 'mC6', home: 2, away: 0 },
  { id: 'mD1', home: 2, away: 0 },
  { id: 'mD2', home: 1, away: 2 },
  { id: 'mD3', home: 2, away: 1 },
  { id: 'mD4', home: 2, away: 0 },
  { id: 'mD5', home: 0, away: 1 },
  { id: 'mD6', home: 1, away: 2 },
  { id: 'mE1', home: 4, away: 0 },
  { id: 'mE2', home: 1, away: 2 },
  { id: 'mE3', home: 2, away: 0 },
  { id: 'mE4', home: 3, away: 0 },
  { id: 'mE5', home: 1, away: 2 },
  { id: 'mE6', home: 0, away: 2 },
  { id: 'mF1', home: 2, away: 1 },
  { id: 'mF2', home: 3, away: 0 },
  { id: 'mF3', home: 1, away: 0 },
  { id: 'mF4', home: 0, away: 2 },
  { id: 'mF5', home: 1, away: 2 },
  { id: 'mF6', home: 0, away: 2 },
];

const GROUP_SCORES_G_L = [
  { id: 'mG1', home: 2, away: 1 },
  { id: 'mG2', home: 2, away: 0 },
  { id: 'mG3', home: 2, away: 0 },
  { id: 'mG4', home: 0, away: 2 },
  { id: 'mG5', home: 2, away: 1 },
  { id: 'mG6', home: 0, away: 3 },
  { id: 'mH1', home: 3, away: 0 },
  { id: 'mH2', home: 1, away: 2 },
  { id: 'mH3', home: 2, away: 0 },
  { id: 'mH4', home: 2, away: 0 },
  { id: 'mH5', home: 1, away: 2 },
  { id: 'mH6', home: 1, away: 2 },
  { id: 'mI1', home: 2, away: 0 },
  { id: 'mI2', home: 0, away: 3 },
  { id: 'mI3', home: 3, away: 0 },
  { id: 'mI4', home: 2, away: 0 },
  { id: 'mI5', home: 1, away: 2 },
  { id: 'mI6', home: 2, away: 0 },
  { id: 'mJ1', home: 3, away: 0 },
  { id: 'mJ2', home: 2, away: 0 },
  { id: 'mJ3', home: 2, away: 1 },
  { id: 'mJ4', home: 1, away: 2 },
  { id: 'mJ5', home: 1, away: 2 },
  { id: 'mJ6', home: 0, away: 2 },
  { id: 'mK1', home: 3, away: 0 },
  { id: 'mK2', home: 0, away: 2 },
  { id: 'mK3', home: 2, away: 0 },
  { id: 'mK4', home: 2, away: 1 },
  { id: 'mK5', home: 1, away: 2 },
  { id: 'mK6', home: 2, away: 0 },
  { id: 'mL1', home: 2, away: 0 },
  { id: 'mL2', home: 2, away: 1 },
  { id: 'mL3', home: 2, away: 0 },
  { id: 'mL4', home: 0, away: 2 },
  { id: 'mL5', home: 0, away: 3 },
  { id: 'mL6', home: 2, away: 0 },
];

const ALL_GROUP_SCORES = [...GROUP_SCORES_A_F, ...GROUP_SCORES_G_L];

// ── Knockout match data ────────────────────────────────────────────────────────

const R32_MATCHES = [
  { id: 'r32m73', home: 'KOR', away: 'CAN', winner: 'KOR' },
  { id: 'r32m74', home: 'GER', away: 'CZE', winner: 'GER' },
  { id: 'r32m75', home: 'NED', away: 'MAR', winner: 'NED' },
  { id: 'r32m76', home: 'BRA', away: 'SWE', winner: 'BRA' },
  { id: 'r32m77', home: 'FRA', away: 'SCO', winner: 'FRA' },
  { id: 'r32m78', home: 'ECU', away: 'NOR', winner: 'NOR' },
  { id: 'r32m79', home: 'MEX', away: 'JPN', winner: 'MEX' },
  { id: 'r32m80', home: 'ENG', away: 'AUS', winner: 'ENG' },
  { id: 'r32m81', home: 'USA', away: 'CIV', winner: 'USA' },
  { id: 'r32m82', home: 'BEL', away: 'IRN', winner: 'BEL' },
  { id: 'r32m83', home: 'COL', away: 'CRO', winner: 'COL' },
  { id: 'r32m84', home: 'ESP', away: 'AUT', winner: 'ESP' },
  { id: 'r32m85', home: 'SUI', away: 'QAT', winner: 'SUI' },
  { id: 'r32m86', home: 'ARG', away: 'URU', winner: 'ARG' },
  { id: 'r32m87', home: 'POR', away: 'KSA', winner: 'POR' },
  { id: 'r32m88', home: 'TUR', away: 'EGY', winner: 'TUR' },
] as const;

const R16_MATCHES = [
  { id: 'r16m89', home: 'GER', away: 'FRA', winner: 'GER' },
  { id: 'r16m90', home: 'KOR', away: 'NED', winner: 'NED' },
  { id: 'r16m91', home: 'BRA', away: 'NOR', winner: 'BRA' },
  { id: 'r16m92', home: 'MEX', away: 'ENG', winner: 'ENG' },
  { id: 'r16m93', home: 'COL', away: 'ESP', winner: 'ESP' },
  { id: 'r16m94', home: 'USA', away: 'BEL', winner: 'BEL' },
  { id: 'r16m95', home: 'ARG', away: 'TUR', winner: 'ARG' },
  { id: 'r16m96', home: 'SUI', away: 'POR', winner: 'POR' },
] as const;

const QF_MATCHES = [
  { id: 'qf97', home: 'GER', away: 'NED', winner: 'GER' },
  { id: 'qf98', home: 'ESP', away: 'BEL', winner: 'ESP' },
  { id: 'qf99', home: 'BRA', away: 'ENG', winner: 'BRA' },
  { id: 'qf100', home: 'ARG', away: 'POR', winner: 'ARG' },
] as const;

const SF_MATCHES = [
  { id: 'sf101', home: 'GER', away: 'ESP', winner: 'ESP' },
  { id: 'sf102', home: 'BRA', away: 'ARG', winner: 'ARG' },
] as const;

const BRONZE_MATCH = {
  id: 'bronze',
  home: 'GER',
  away: 'BRA',
  winner: 'GER',
  homeGoals: 2,
  awayGoals: 1,
} as const;
const FINAL_MATCH = {
  id: 'final',
  home: 'ESP',
  away: 'ARG',
  winner: 'ARG',
  homeGoals: 1,
  awayGoals: 1,
} as const;

// ── Group orders ───────────────────────────────────────────────────────────────

const GROUP_ORDER_A_F: Record<GroupId, TeamId[]> = {
  [groupId('A')]: ['MEX', 'KOR', 'CZE', 'RSA'].map(teamId),
  [groupId('B')]: ['SUI', 'CAN', 'QAT', 'BIH'].map(teamId),
  [groupId('C')]: ['BRA', 'MAR', 'SCO', 'HAI'].map(teamId),
  [groupId('D')]: ['USA', 'TUR', 'AUS', 'PAR'].map(teamId),
  [groupId('E')]: ['GER', 'ECU', 'CIV', 'CUW'].map(teamId),
  [groupId('F')]: ['NED', 'SWE', 'JPN', 'TUN'].map(teamId),
};

const GROUP_ORDER_G_L: Record<GroupId, TeamId[]> = {
  [groupId('G')]: ['BEL', 'EGY', 'IRN', 'NZL'].map(teamId),
  [groupId('H')]: ['ESP', 'URU', 'KSA', 'CPV'].map(teamId),
  [groupId('I')]: ['FRA', 'NOR', 'SEN', 'IRQ'].map(teamId),
  [groupId('J')]: ['ARG', 'AUT', 'ALG', 'JOR'].map(teamId),
  [groupId('K')]: ['POR', 'COL', 'COD', 'UZB'].map(teamId),
  [groupId('L')]: ['ENG', 'CRO', 'GHA', 'PAN'].map(teamId),
};

const ALL_GROUP_ORDERS: Record<GroupId, TeamId[]> = { ...GROUP_ORDER_A_F, ...GROUP_ORDER_G_L };

// ── Checkpoint ActualResults builder ──────────────────────────────────────────

function buildActualResults(checkpoint: SimulationCheckpoint): ActualResults {
  const groupOrderAF = GROUP_ORDER_A_F;
  const groupOrderGL = GROUP_ORDER_G_L;

  if (checkpoint === 'groups-half') {
    return {
      matchResults: GROUP_SCORES_A_F.map((r) => ({
        matchId: matchId(r.id),
        home: r.home,
        away: r.away,
      })),
      groupOrder: groupOrderAF,
      answers: { highestMatchGoals: 7 },
    };
  }

  const allGroupMatchResults = ALL_GROUP_SCORES.map((r) => ({
    matchId: matchId(r.id),
    home: r.home,
    away: r.away,
  }));

  const allGroupOrder = { ...groupOrderAF, ...groupOrderGL };

  const baseGroupsDone: ActualResults = {
    matchResults: allGroupMatchResults,
    groupOrder: allGroupOrder,
    answers: {
      groupTopScoringTeam: [teamId('BRA')],
      groupTopConcedingTeam: [teamId('CUW')],
      highestMatchGoals: 7,
    },
  };

  if (checkpoint === 'groups-done') {
    return baseGroupsDone;
  }

  const r16Teams = [
    'GER',
    'NED',
    'FRA',
    'POR',
    'ESP',
    'BEL',
    'BRA',
    'ENG',
    'ARG',
    'MEX',
    'URU',
    'COL',
    'USA',
    'CAN',
    'JPN',
    'MAR',
  ].map(teamId);

  if (checkpoint === 'r32-done') {
    return {
      ...baseGroupsDone,
      answers: {
        ...baseGroupsDone.answers,
        roundOf16: r16Teams,
      },
    };
  }

  if (checkpoint === 'r16-done') {
    return {
      ...baseGroupsDone,
      answers: {
        ...baseGroupsDone.answers,
        roundOf16: r16Teams,
        roundOf8: ['GER', 'NED', 'ESP', 'BEL', 'BRA', 'ENG', 'ARG', 'POR'].map(teamId),
      },
    };
  }

  if (checkpoint === 'qf-done') {
    return {
      ...baseGroupsDone,
      answers: {
        ...baseGroupsDone.answers,
        roundOf16: r16Teams,
        roundOf8: ['GER', 'NED', 'ESP', 'BEL', 'BRA', 'ENG', 'ARG', 'POR'].map(teamId),
        roundOf4: ['ARG', 'ESP', 'GER', 'BRA'].map(teamId),
      },
    };
  }

  // finals-done
  return {
    ...baseGroupsDone,
    bronzeMatch: {
      home: teamId('GER'),
      away: teamId('BRA'),
      homeGoals: 2,
      awayGoals: 1,
      winner: teamId('GER'),
    },
    finalMatch: {
      home: teamId('ESP'),
      away: teamId('ARG'),
      homeGoals: 1,
      awayGoals: 1,
      winner: teamId('ESP'),
      decidedBy: 'penalties',
    },
    answers: {
      groupTopScoringTeam: [teamId('BRA')],
      groupTopConcedingTeam: [teamId('CUW')],
      tournamentTopScoringTeam: [teamId('ARG')],
      tournamentTopConcedingTeam: [teamId('CUW')],
      highestMatchGoals: 7,
      mostYellowCardsTeam: [teamId('ARG')],
      firstRedCardPlayer: playerId('mex-alvarez'),
      penaltyShootoutCount: 1,
      topScorerPlayer: [playerId('arg-messi')],
      roundOf16: r16Teams,
      roundOf8: ['GER', 'NED', 'ESP', 'BEL', 'BRA', 'ENG', 'ARG', 'POR'].map(teamId),
      roundOf4: ['ARG', 'ESP', 'GER', 'BRA'].map(teamId),
    },
  };
}

// ── Rescore helper ─────────────────────────────────────────────────────────────

async function rescoreAll(actual: ActualResults): Promise<void> {
  const tournamentRow = await getTournamentById(db, TOURNAMENT_ID);
  const def = tournamentRow?.definition;
  if (!def) return;

  const predictions = await listPredictionsForTournament(db, TOURNAMENT_ID);
  for (const { predictionId, poolId, userId } of predictions) {
    const inputs = await getPredictionInputs(db, predictionId);
    try {
      const derived = deriveCard(inputs, def);
      const breakdown = scoreCard(derived, inputs, actual, def.scoring);
      await upsertScore(db, { poolId, userId, pointsTotal: breakdown.total, breakdown });
    } catch {
      // skip incomplete predictions
    }
  }
}

// ── Upsert knockout matches helper ────────────────────────────────────────────

async function upsertKnockoutMatchesUpTo(checkpoint: SimulationCheckpoint): Promise<void> {
  const stageMap: Record<string, 'R32' | 'R16' | 'QF' | 'SF' | 'Final' | 'bronze'> = {
    r32: 'R32',
    r16: 'R16',
    qf: 'QF',
    sf: 'SF',
    final: 'Final',
    bronze: 'bronze',
  };

  const upsertAll = async (
    matches: ReadonlyArray<{ id: string; home: string; away: string; winner: string }>,
    stage: 'R32' | 'R16' | 'QF' | 'SF' | 'Final' | 'bronze',
    goals?: { homeGoals: number; awayGoals: number },
    decidedBy?: 'regulation' | 'extraTime' | 'penalties',
  ) => {
    for (const m of matches) {
      await upsertKnockoutMatch(db, {
        id: m.id,
        tournamentId: TOURNAMENT_ID,
        stage,
        homeTeamId: m.home,
        awayTeamId: m.away,
        homeGoals: goals?.homeGoals ?? 2,
        awayGoals: goals?.awayGoals ?? 0,
        winnerTeamId: m.winner,
        decidedBy: decidedBy ?? 'regulation',
        status: 'final',
      });
    }
  };

  if (['r32-done', 'r16-done', 'qf-done', 'finals-done'].includes(checkpoint)) {
    await upsertAll(R32_MATCHES, stageMap['r32']!);
  }
  if (['r16-done', 'qf-done', 'finals-done'].includes(checkpoint)) {
    await upsertAll(R16_MATCHES, stageMap['r16']!);
  }
  if (['qf-done', 'finals-done'].includes(checkpoint)) {
    await upsertAll(QF_MATCHES, stageMap['qf']!);
  }
  if (checkpoint === 'finals-done') {
    await upsertAll(SF_MATCHES, stageMap['sf']!);
    await upsertKnockoutMatch(db, {
      id: BRONZE_MATCH.id,
      tournamentId: TOURNAMENT_ID,
      stage: 'bronze',
      homeTeamId: BRONZE_MATCH.home,
      awayTeamId: BRONZE_MATCH.away,
      homeGoals: BRONZE_MATCH.homeGoals,
      awayGoals: BRONZE_MATCH.awayGoals,
      winnerTeamId: BRONZE_MATCH.winner,
      decidedBy: 'regulation',
      status: 'final',
    });
    await upsertKnockoutMatch(db, {
      id: FINAL_MATCH.id,
      tournamentId: TOURNAMENT_ID,
      stage: 'Final',
      homeTeamId: FINAL_MATCH.home,
      awayTeamId: FINAL_MATCH.away,
      homeGoals: FINAL_MATCH.homeGoals,
      awayGoals: FINAL_MATCH.awayGoals,
      winnerTeamId: FINAL_MATCH.winner,
      decidedBy: 'penalties',
      status: 'final',
    });
  }
}

// ── Server actions ─────────────────────────────────────────────────────────────

export async function loginAsUserAction(formData: FormData): Promise<never> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Dev login is not available in production');
  }
  const uid = formData.get('userId');
  if (typeof uid !== 'string' || !uid) {
    throw new Error('userId is required');
  }
  return signInAsExistingGuest(toUserId(uid), '/pools');
}

export async function resetToFreshAction(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Dev reset is not available in production');
  }
  await resetTournamentResults(db, TOURNAMENT_ID);
  await rescoreAll({ matchResults: [], groupOrder: {}, answers: {} });
  revalidatePath('/');
  redirect('/dev');
}

export async function applyGroupStageDayAction(formData: FormData): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Dev group stage day is not available in production');
  }

  const day = formData.get('day');
  if (typeof day !== 'string' || !day) throw new Error('day is required');

  const playedScores = ALL_GROUP_SCORES.filter((s) => (GROUP_MATCH_KICKOFFS[s.id] ?? '') <= day);

  const groupOrder: Record<GroupId, TeamId[]> = {} as Record<GroupId, TeamId[]>;
  for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const) {
    const allPlayed = [1, 2, 3, 4, 5, 6].every(
      (n) => (GROUP_MATCH_KICKOFFS[`m${letter}${n}`] ?? '') <= day,
    );
    if (allPlayed) {
      const key = groupId(letter);
      groupOrder[key] = ALL_GROUP_ORDERS[key]!;
    }
  }

  const playedGoals = playedScores.map((s) => s.home + s.away);
  const highestMatchGoals = playedGoals.length > 0 ? Math.max(...playedGoals) : 0;

  const allGroupsDone = Object.keys(groupOrder).length === 12;
  const answers: ActualResults['answers'] = { highestMatchGoals };
  if (allGroupsDone) {
    answers.groupTopScoringTeam = [teamId('BRA')];
    answers.groupTopConcedingTeam = [teamId('CUW')];
  }

  const actual: ActualResults = {
    matchResults: playedScores.map((r) => ({ matchId: matchId(r.id), home: r.home, away: r.away })),
    groupOrder,
    answers,
  };

  await resetTournamentResults(db, TOURNAMENT_ID);
  await upsertTournamentResults(db, TOURNAMENT_ID, actual);
  await rescoreAll(actual);

  revalidatePath('/');
  redirect('/dev');
}

export async function applyCheckpointAction(formData: FormData): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Dev checkpoint is not available in production');
  }

  const checkpoint = formData.get('checkpoint') as SimulationCheckpoint | null;
  if (!checkpoint) throw new Error('checkpoint is required');

  const actual = buildActualResults(checkpoint);
  await resetTournamentResults(db, TOURNAMENT_ID);
  await upsertTournamentResults(db, TOURNAMENT_ID, actual);
  await upsertKnockoutMatchesUpTo(checkpoint);
  await rescoreAll(actual);

  revalidatePath('/');
  redirect('/dev');
}

/**
 * Applies the actual current state of wc-2026 to the test-wc-2026 tournament.
 * Reads wc-2026/results.json to determine which matches have results and what the
 * knockout bracket looks like, then applies fictional test-wc-2026 scores for group
 * matches (so user picks are scored against known data) and real team IDs for knockout.
 */
export async function applyCurrentStateAction(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Dev action not available in production');
  }

  // Resolve data directory from repo root (Next.js runs from apps/web/)
  const tournamentsDir = join(process.cwd(), '../../data/tournaments');

  type RawMatch = { matchId: string; home: number; away: number };
  type RawKnockout = {
    round: 'R32' | 'R16' | 'QF' | 'SF' | 'Final' | 'bronze';
    matchId: string;
    home: string;
    away: string;
    homeGoals: number;
    awayGoals: number;
    winner: string;
    decidedBy?: 'regulation' | 'extraTime' | 'penalties';
    kickoff?: string;
  };

  const realRaw = JSON.parse(
    readFileSync(join(tournamentsDir, 'wc-2026', 'results.json'), 'utf-8'),
  ) as {
    matchResults: RawMatch[];
    knockout?: RawKnockout[];
    groupOrder?: Record<string, string[]>;
  };

  const testRaw = JSON.parse(
    readFileSync(join(tournamentsDir, 'test-wc-2026', 'results.json'), 'utf-8'),
  ) as { matchResults: RawMatch[]; groupOrder?: Record<string, string[]> };

  const realMatchIds = new Set(realRaw.matchResults.map((r) => r.matchId));
  const testGroupOrder = testRaw.groupOrder ?? {};

  const completeGroups = 'ABCDEFGHIJKL'
    .split('')
    .filter((g) => [1, 2, 3, 4, 5, 6].every((n) => realMatchIds.has(`m${g}${n}`)));

  const knockoutMatches = realRaw.knockout ?? [];
  const r32Winners = knockoutMatches.filter((m) => m.round === 'R32').map((m) => teamId(m.winner));
  const r16Winners = knockoutMatches.filter((m) => m.round === 'R16').map((m) => teamId(m.winner));

  const actual: ActualResults = {
    matchResults: testRaw.matchResults
      .filter((r) => realMatchIds.has(r.matchId))
      .map((r) => ({ matchId: matchId(r.matchId), home: r.home, away: r.away })),
    groupOrder: Object.fromEntries(
      completeGroups.map((g) => [groupId(g), (testGroupOrder[g] ?? []).map(teamId)]),
    ) as Record<GroupId, TeamId[]>,
    answers: {
      ...(r32Winners.length > 0 ? { roundOf16: r32Winners } : {}),
      ...(r16Winners.length > 0 ? { roundOf8: r16Winners } : {}),
    },
  };

  await resetTournamentResults(db, TOURNAMENT_ID);
  await upsertTournamentResults(db, TOURNAMENT_ID, actual);

  for (const km of knockoutMatches) {
    await upsertKnockoutMatch(db, {
      id: km.matchId,
      tournamentId: TOURNAMENT_ID,
      stage: km.round,
      homeTeamId: km.home,
      awayTeamId: km.away,
      homeGoals: km.homeGoals,
      awayGoals: km.awayGoals,
      winnerTeamId: km.winner,
      ...(km.decidedBy !== undefined && { decidedBy: km.decidedBy }),
      ...(km.kickoff !== undefined && { kickoff: new Date(km.kickoff) }),
      status: 'final',
    });
  }

  await rescoreAll(actual);
  revalidatePath('/');
  redirect('/dev');
}
