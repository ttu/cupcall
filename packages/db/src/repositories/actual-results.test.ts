import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../testing/make-test-db';
import type { Db } from '../client';
import * as schema from '../schema/index';
import { upsertTournamentDef, upsertTournamentResults } from './tournament';
import { getActualResults } from './actual-results';
import { miniTournament } from '@cup/engine/testing';
import type { ActualResults } from '@cup/engine';
import { teamId, tournamentId as asTournamentId } from '@cup/engine';

const firstKickoff = new Date('2026-06-11T18:00:00Z');
const tournamentId = asTournamentId('mini-2026');

describe('getActualResults', () => {
  let db: Db<typeof schema>;

  beforeEach(async () => {
    db = await makeTestDb();
    await upsertTournamentDef(db, miniTournament, firstKickoff, new Map());
  });

  it('reads back answers.finalists — grows incrementally as SF matches complete, mirroring roundOf4', async () => {
    const actual: ActualResults = {
      matchResults: [],
      groupOrder: {},
      answers: { finalists: [teamId('A1')] },
    };
    await upsertTournamentResults(db, tournamentId, actual);

    const result = await getActualResults(db, tournamentId);

    expect(result.answers.finalists).toEqual([teamId('A1')]);
  });
});
