'use server';

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
import { deriveCard, scoreCard, groupId, teamId, matchId, playerId } from '@cup/engine';
import type { ActualResults } from '@cup/engine';
import type { SimulationCheckpoint } from '../application/get-dev-state';

const TOURNAMENT_ID = 'test-wc-2026';

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

// ── Checkpoint ActualResults builder ──────────────────────────────────────────

function buildActualResults(checkpoint: SimulationCheckpoint): ActualResults {
  const groupOrderAF = {
    [groupId('A')]: ['MEX', 'KOR', 'CZE', 'RSA'].map(teamId),
    [groupId('B')]: ['SUI', 'CAN', 'QAT', 'BIH'].map(teamId),
    [groupId('C')]: ['BRA', 'MAR', 'SCO', 'HAI'].map(teamId),
    [groupId('D')]: ['USA', 'TUR', 'AUS', 'PAR'].map(teamId),
    [groupId('E')]: ['GER', 'ECU', 'CIV', 'CUW'].map(teamId),
    [groupId('F')]: ['NED', 'SWE', 'JPN', 'TUN'].map(teamId),
  };

  const groupOrderGL = {
    [groupId('G')]: ['BEL', 'EGY', 'IRN', 'NZL'].map(teamId),
    [groupId('H')]: ['ESP', 'URU', 'KSA', 'CPV'].map(teamId),
    [groupId('I')]: ['FRA', 'NOR', 'SEN', 'IRQ'].map(teamId),
    [groupId('J')]: ['ARG', 'AUT', 'ALG', 'JOR'].map(teamId),
    [groupId('K')]: ['POR', 'COL', 'COD', 'UZB'].map(teamId),
    [groupId('L')]: ['ENG', 'CRO', 'GHA', 'PAN'].map(teamId),
  };

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
      groupTopScoringTeam: teamId('BRA'),
      groupTopConcedingTeam: teamId('CUW'),
      highestMatchGoals: 7,
    },
  };

  if (checkpoint === 'groups-done') {
    return baseGroupsDone;
  }

  if (checkpoint === 'r32-done') {
    return {
      ...baseGroupsDone,
      answers: { ...baseGroupsDone.answers },
    };
  }

  if (checkpoint === 'r16-done') {
    return {
      ...baseGroupsDone,
      answers: {
        ...baseGroupsDone.answers,
        roundOf8: ['GER', 'NED', 'ESP', 'BEL', 'BRA', 'ENG', 'ARG', 'POR'].map(teamId),
      },
    };
  }

  if (checkpoint === 'qf-done') {
    return {
      ...baseGroupsDone,
      answers: {
        ...baseGroupsDone.answers,
        roundOf8: ['GER', 'NED', 'ESP', 'BEL', 'BRA', 'ENG', 'ARG', 'POR'].map(teamId),
      },
    };
  }

  // finals-done
  return {
    ...baseGroupsDone,
    bronzeMatch: { home: teamId('GER'), away: teamId('BRA'), homeGoals: 2, awayGoals: 1 },
    finalMatch: {
      home: teamId('ESP'),
      away: teamId('ARG'),
      homeGoals: 1,
      awayGoals: 1,
      decidedBy: 'penalties',
    },
    answers: {
      groupTopScoringTeam: teamId('BRA'),
      groupTopConcedingTeam: teamId('CUW'),
      tournamentTopScoringTeam: teamId('ARG'),
      tournamentTopConcedingTeam: teamId('CUW'),
      highestMatchGoals: 7,
      mostYellowCardsTeam: teamId('ARG'),
      firstRedCardPlayer: playerId('mex-alvarez'),
      penaltyShootoutCount: 1,
      topScorerPlayer: playerId('arg-messi'),
      roundOf8: ['GER', 'NED', 'ESP', 'BEL', 'BRA', 'ENG', 'ARG', 'POR'].map(teamId),
      topFourOrder: ['ARG', 'ESP', 'GER', 'BRA'].map(teamId),
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
