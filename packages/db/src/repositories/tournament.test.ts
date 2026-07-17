import { beforeEach, describe, expect, it } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { makeTestDb } from '../testing/make-test-db';
import type { Db } from '../client';
import * as schema from '../schema/index';
import {
  upsertTournamentDef,
  upsertTournamentResults,
  upsertKnockoutMatch,
  listTournaments,
} from './tournament';
import { miniTournament } from '@cup/engine/testing';
import type { ActualResults, GroupId, TeamId, TournamentId } from '@cup/engine';
import { teamId, groupId, matchId, tournamentId as asTournamentId } from '@cup/engine';

const firstKickoff = new Date('2026-06-11T18:00:00Z');

function makeMatchKickoffs(): Map<string, Date | null> {
  const map = new Map<string, Date | null>();
  let date = new Date(firstKickoff);
  for (const m of miniTournament.groupMatches) {
    map.set(m.id, new Date(date));
    date = new Date(date.getTime() + 24 * 60 * 60 * 1000); // +1 day per match
  }
  return map;
}

describe('tournament repository', () => {
  let db: Db<typeof schema>;

  beforeEach(async () => {
    db = await makeTestDb();
  });

  describe('listTournaments', () => {
    it('returns empty array when no tournaments exist', async () => {
      const result = await listTournaments(db);
      expect(result).toHaveLength(0);
    });

    it('returns all tournaments ordered by firstKickoff', async () => {
      await upsertTournamentDef(db, miniTournament, firstKickoff, makeMatchKickoffs());
      const later = { ...miniTournament, id: 'wc-2030', name: 'WC 2030' };
      await upsertTournamentDef(db, later, new Date('2030-06-01T18:00:00Z'), new Map());

      const rows = await listTournaments(db);
      expect(rows).toHaveLength(2);
      expect(rows[0]?.id).toBe('mini-2026');
      expect(rows[1]?.id).toBe('wc-2030');
    });
  });

  describe('upsertTournamentDef', () => {
    it('inserts tournament row, teams, players, groups, and matches', async () => {
      const kickoffs = makeMatchKickoffs();
      await upsertTournamentDef(db, miniTournament, firstKickoff, kickoffs);

      const tournaments = await db.select().from(schema.tournaments);
      expect(tournaments).toHaveLength(1);
      expect(tournaments[0]?.id).toBe('mini-2026');
      expect(tournaments[0]?.name).toBe(miniTournament.name);

      const teams = await db.select().from(schema.teams);
      expect(teams).toHaveLength(16);

      const players = await db.select().from(schema.players);
      expect(players).toHaveLength(4);

      const groups = await db.select().from(schema.stageGroups);
      expect(groups).toHaveLength(4);

      const groupTeams = await db.select().from(schema.stageGroupTeams);
      expect(groupTeams).toHaveLength(16);

      const matches = await db.select().from(schema.matches);
      expect(matches).toHaveLength(24); // 6 matches × 4 groups
    });

    it('stores kickoff times from the map for group matches', async () => {
      const kickoffs = makeMatchKickoffs();
      await upsertTournamentDef(db, miniTournament, firstKickoff, kickoffs);

      const [matchRow] = await db
        .select()
        .from(schema.matches)
        .where(and(eq(schema.matches.id, 'mA1'), eq(schema.matches.tournamentId, 'mini-2026')));
      expect(matchRow?.kickoff).toBeInstanceOf(Date);
    });

    it('stores null kickoff when match is not in the map', async () => {
      const emptyKickoffs = new Map<string, Date | null>();
      await upsertTournamentDef(db, miniTournament, firstKickoff, emptyKickoffs);

      const matches = await db.select().from(schema.matches);
      expect(matches.every((m) => m.kickoff === null)).toBe(true);
    });

    it('is idempotent — running twice produces the same rows', async () => {
      const kickoffs = makeMatchKickoffs();
      await upsertTournamentDef(db, miniTournament, firstKickoff, kickoffs);
      await upsertTournamentDef(db, miniTournament, firstKickoff, kickoffs);

      const tournaments = await db.select().from(schema.tournaments);
      expect(tournaments).toHaveLength(1);

      const teams = await db.select().from(schema.teams);
      expect(teams).toHaveLength(16);

      const matches = await db.select().from(schema.matches);
      expect(matches).toHaveLength(24);
    });

    it('updates tournament name when re-run with a different name', async () => {
      const kickoffs = makeMatchKickoffs();
      await upsertTournamentDef(db, miniTournament, firstKickoff, kickoffs);

      const updatedTournament = { ...miniTournament, name: 'Updated Name' };
      await upsertTournamentDef(db, updatedTournament, firstKickoff, kickoffs);

      const [row] = await db.select().from(schema.tournaments);
      expect(row?.name).toBe('Updated Name');
    });

    it('updates team name on re-run with different data', async () => {
      // Regression: onConflictDoUpdate's set clause must reference the incoming row
      // (`sql`excluded.name``), not the existing column (`schema.teams.name`) — the latter
      // resolves to "set name = name", a no-op that silently freezes the row at its
      // first-ever value forever, even as later syncs derive corrected data.
      const kickoffs = makeMatchKickoffs();
      await upsertTournamentDef(db, miniTournament, firstKickoff, kickoffs);

      const renamed = {
        ...miniTournament,
        teams: miniTournament.teams.map((t) => (t.id === 'A1' ? { ...t, name: 'Renamed A1' } : t)),
      };
      await upsertTournamentDef(db, renamed, firstKickoff, kickoffs);

      const [row] = await db
        .select()
        .from(schema.teams)
        .where(and(eq(schema.teams.tournamentId, 'mini-2026'), eq(schema.teams.id, 'A1')));
      expect(row?.name).toBe('Renamed A1');
    });

    it('updates player name and team on re-run with different data', async () => {
      const kickoffs = makeMatchKickoffs();
      await upsertTournamentDef(db, miniTournament, firstKickoff, kickoffs);

      const corrected = {
        ...miniTournament,
        players: miniTournament.players.map((p) =>
          p.id === 'A1-P' ? { ...p, name: 'Corrected Name', team: teamId('A2') } : p,
        ),
      };
      await upsertTournamentDef(db, corrected, firstKickoff, kickoffs);

      const [row] = await db
        .select()
        .from(schema.players)
        .where(
          and(eq(schema.players.tournamentId, 'mini-2026'), eq(schema.players.playerId, 'A1-P')),
        );
      expect(row?.name).toBe('Corrected Name');
      expect(row?.teamId).toBe('A2');
    });

    it('updates group team seed order on re-run with different data', async () => {
      const kickoffs = makeMatchKickoffs();
      await upsertTournamentDef(db, miniTournament, firstKickoff, kickoffs);

      const reseeded = {
        ...miniTournament,
        groups: miniTournament.groups.map((g) =>
          g.id === 'A' ? { ...g, teams: [...g.teams].reverse() } : g,
        ),
      };
      await upsertTournamentDef(db, reseeded, firstKickoff, kickoffs);

      const rows = await db
        .select()
        .from(schema.stageGroupTeams)
        .where(
          and(
            eq(schema.stageGroupTeams.tournamentId, 'mini-2026'),
            eq(schema.stageGroupTeams.groupId, 'A'),
            eq(schema.stageGroupTeams.teamId, 'A4'),
          ),
        );
      expect(rows[0]?.seedOrder).toBe(0);
    });

    it('updates group match kickoff on re-run with a different time', async () => {
      const kickoffs = makeMatchKickoffs();
      await upsertTournamentDef(db, miniTournament, firstKickoff, kickoffs);

      const updatedKickoff = new Date('2027-01-01T00:00:00Z');
      const updatedKickoffs = new Map(kickoffs);
      updatedKickoffs.set('mA1', updatedKickoff);
      await upsertTournamentDef(db, miniTournament, firstKickoff, updatedKickoffs);

      const [row] = await db
        .select()
        .from(schema.matches)
        .where(and(eq(schema.matches.id, 'mA1'), eq(schema.matches.tournamentId, 'mini-2026')));
      expect(row?.kickoff).toEqual(updatedKickoff);
    });
  });

  describe('upsertKnockoutMatch', () => {
    beforeEach(async () => {
      await upsertTournamentDef(db, miniTournament, firstKickoff, makeMatchKickoffs());
    });

    it('inserts a knockout match with full result data', async () => {
      await upsertKnockoutMatch(db, {
        id: 'qf1',
        tournamentId: asTournamentId('mini-2026'),
        stage: 'QF',
        homeTeamId: 'A1',
        awayTeamId: 'B2',
        homeGoals: 2,
        awayGoals: 1,
        winnerTeamId: 'A1',
        decidedBy: 'regulation',
        status: 'final',
      });

      const [row] = await db
        .select()
        .from(schema.matches)
        .where(and(eq(schema.matches.id, 'qf1'), eq(schema.matches.tournamentId, 'mini-2026')));
      expect(row?.homeGoals).toBe(2);
      expect(row?.awayGoals).toBe(1);
      expect(row?.winnerTeamId).toBe('A1');
      expect(row?.decidedBy).toBe('regulation');
    });

    it('updates goals, winner, and decidedBy on re-run with corrected data', async () => {
      // Regression for the ARG vs CPV production bug: a knockout match first synced as
      // 1-1/extraTime (regulation-time score, entered before the final score was known)
      // must be updated to the corrected final score (e.g. 3-2/extraTime) on the next sync.
      // onConflictDoUpdate's set clause previously referenced the existing columns
      // (`schema.matches.homeGoals`), a no-op that silently froze the row forever.
      await upsertKnockoutMatch(db, {
        id: 'qf1',
        tournamentId: asTournamentId('mini-2026'),
        stage: 'QF',
        homeTeamId: 'A1',
        awayTeamId: 'B2',
        homeGoals: 1,
        awayGoals: 1,
        winnerTeamId: 'A1',
        decidedBy: 'extraTime',
        status: 'final',
      });

      await upsertKnockoutMatch(db, {
        id: 'qf1',
        tournamentId: asTournamentId('mini-2026'),
        stage: 'QF',
        homeTeamId: 'A1',
        awayTeamId: 'B2',
        homeGoals: 3,
        awayGoals: 2,
        winnerTeamId: 'A1',
        decidedBy: 'extraTime',
        status: 'final',
      });

      const [row] = await db
        .select()
        .from(schema.matches)
        .where(and(eq(schema.matches.id, 'qf1'), eq(schema.matches.tournamentId, 'mini-2026')));
      expect(row?.homeGoals).toBe(3);
      expect(row?.awayGoals).toBe(2);
    });
  });

  describe('upsertTournamentResults', () => {
    beforeEach(async () => {
      // Seed the tournament definition first (required by FK constraints)
      await upsertTournamentDef(db, miniTournament, firstKickoff, makeMatchKickoffs());
    });

    it('updates match results to final status', async () => {
      const actual: ActualResults = {
        matchResults: [{ matchId: matchId('mA1'), home: 2, away: 1 }],
        groupOrder: {},
        answers: {},
      };
      await upsertTournamentResults(db, asTournamentId('mini-2026'), actual);

      const [match] = await db
        .select()
        .from(schema.matches)
        .where(and(eq(schema.matches.id, 'mA1'), eq(schema.matches.tournamentId, 'mini-2026')));
      expect(match?.homeGoals).toBe(2);
      expect(match?.awayGoals).toBe(1);
      expect(match?.status).toBe('final');
    });

    it('stores actual group order', async () => {
      const actual: ActualResults = {
        matchResults: [],
        groupOrder: {
          [groupId('A')]: [teamId('A1'), teamId('A2'), teamId('A3'), teamId('A4')],
        } as Record<GroupId, TeamId[]>,
        answers: {},
      };
      await upsertTournamentResults(db, asTournamentId('mini-2026'), actual);

      const rows = await db
        .select()
        .from(schema.actualGroupOrder)
        .where(eq(schema.actualGroupOrder.tournamentId, 'mini-2026'));

      expect(rows).toHaveLength(4);
      const firstPlace = rows.find((r) => r.position === 1);
      expect(firstPlace?.teamId).toBe('A1');
    });

    it('stores answers as betKey/value rows', async () => {
      const actual: ActualResults = {
        matchResults: [],
        groupOrder: {},
        answers: {
          groupTopScoringTeam: [teamId('A1')],
          penaltyShootoutCount: 3,
        },
      };
      await upsertTournamentResults(db, asTournamentId('mini-2026'), actual);

      const rows = await db
        .select()
        .from(schema.actualAnswers)
        .where(eq(schema.actualAnswers.tournamentId, 'mini-2026'));

      const keys = rows.map((r) => r.betKey);
      expect(keys).toContain('groupTopScoringTeam');
      expect(keys).toContain('penaltyShootoutCount');
    });

    it('stores answers.finalists as a betKey/value row', async () => {
      // finalists grows incrementally as SF matches complete, mirroring roundOf4 — it must be
      // persisted so scoreFinal's team points are banked as soon as an SF is confirmed, not
      // only once the Final is played.
      const actual: ActualResults = {
        matchResults: [],
        groupOrder: {},
        answers: { finalists: [teamId('A1')] },
      };
      await upsertTournamentResults(db, asTournamentId('mini-2026'), actual);

      const rows = await db
        .select()
        .from(schema.actualAnswers)
        .where(eq(schema.actualAnswers.tournamentId, 'mini-2026'));

      const finalistsRow = rows.find((r) => r.betKey === 'finalists');
      expect(finalistsRow?.value).toEqual(['A1']);
    });

    it('stores bronzeMatch and finalMatch as answer keys', async () => {
      const actual: ActualResults = {
        matchResults: [],
        groupOrder: {},
        answers: {},
        bronzeMatch: {
          home: teamId('A1'),
          away: teamId('B1'),
          homeGoals: 2,
          awayGoals: 0,
          winner: teamId('A1'),
        },
        finalMatch: {
          home: teamId('C1'),
          away: teamId('D1'),
          homeGoals: 1,
          awayGoals: 0,
          winner: teamId('C1'),
          decidedBy: 'regulation',
        },
      };
      await upsertTournamentResults(db, asTournamentId('mini-2026'), actual);

      const rows = await db
        .select()
        .from(schema.actualAnswers)
        .where(eq(schema.actualAnswers.tournamentId, 'mini-2026'));
      const keys = rows.map((r) => r.betKey);
      expect(keys).toContain('bronzeMatch');
      expect(keys).toContain('finalMatch');
    });

    it('is idempotent — running twice preserves answers without duplicates', async () => {
      const actual: ActualResults = {
        matchResults: [{ matchId: matchId('mA1'), home: 1, away: 0 }],
        groupOrder: {
          [groupId('A')]: [teamId('A1'), teamId('A2'), teamId('A3'), teamId('A4')],
        } as Record<GroupId, TeamId[]>,
        answers: { penaltyShootoutCount: 2 },
      };
      await upsertTournamentResults(db, asTournamentId('mini-2026'), actual);
      await upsertTournamentResults(db, asTournamentId('mini-2026'), actual);

      const answers = await db
        .select()
        .from(schema.actualAnswers)
        .where(eq(schema.actualAnswers.tournamentId, 'mini-2026'));
      const shootoutRows = answers.filter((r) => r.betKey === 'penaltyShootoutCount');
      expect(shootoutRows).toHaveLength(1);

      const orderRows = await db
        .select()
        .from(schema.actualGroupOrder)
        .where(eq(schema.actualGroupOrder.tournamentId, 'mini-2026'));
      // 4 positions for group A
      expect(orderRows).toHaveLength(4);
    });

    it('updates an existing answer value on re-run with different data', async () => {
      // Regression: the upsert's onConflictDoUpdate set clause must reference the incoming
      // row (`sql`excluded.value``), not the existing column (`schema.actualAnswers.value`) —
      // the latter resolves to "set value = value", a no-op that silently freezes any bet key
      // at whatever it was first written as, even as later syncs derive a larger/different set.
      const actual1: ActualResults = {
        matchResults: [],
        groupOrder: {},
        answers: { roundOf8: [teamId('A1')] },
      };
      await upsertTournamentResults(db, asTournamentId('mini-2026'), actual1);

      const actual2: ActualResults = {
        matchResults: [],
        groupOrder: {},
        answers: { roundOf8: [teamId('A1'), teamId('B1'), teamId('C1')] },
      };
      await upsertTournamentResults(db, asTournamentId('mini-2026'), actual2);

      const rows = await db
        .select()
        .from(schema.actualAnswers)
        .where(eq(schema.actualAnswers.tournamentId, 'mini-2026'));
      const roundOf8Row = rows.find((r) => r.betKey === 'roundOf8');
      expect(roundOf8Row?.value).toEqual(['A1', 'B1', 'C1']);
    });

    it('replaces group order entries on re-run (idempotency with updated data)', async () => {
      const actual1: ActualResults = {
        matchResults: [],
        groupOrder: {
          [groupId('A')]: [teamId('A1'), teamId('A2'), teamId('A3'), teamId('A4')],
        } as Record<GroupId, TeamId[]>,
        answers: {},
      };
      await upsertTournamentResults(db, asTournamentId('mini-2026'), actual1);

      // Re-run with a different order
      const actual2: ActualResults = {
        matchResults: [],
        groupOrder: {
          [groupId('A')]: [teamId('A4'), teamId('A3'), teamId('A2'), teamId('A1')],
        } as Record<GroupId, TeamId[]>,
        answers: {},
      };
      await upsertTournamentResults(db, asTournamentId('mini-2026'), actual2);

      const rows = await db
        .select()
        .from(schema.actualGroupOrder)
        .where(eq(schema.actualGroupOrder.tournamentId, 'mini-2026'));
      expect(rows).toHaveLength(4);
      const first = rows.find((r) => r.position === 1);
      expect(first?.teamId).toBe('A4');
    });
  });
});
