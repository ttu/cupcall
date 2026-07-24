import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import {
  isMember,
  getPoolById,
  getTournamentById,
  getActualResults,
  getMatchesForTournament,
} from '@cup/db';
import { getCurrentActor } from '@/features/auth';
import { db } from '@/shared/db';
import {
  getPoolArchiveView,
  ArchivePoolCard,
  ArchiveStandingsPanel,
  ArchiveHeroCard,
  ArchiveHighlightsPanel,
  ArchiveLeadChangesPanel,
  ArchiveCategoryBreakdownPanel,
  ArchiveStatTiles,
  ArchivePoolStatsPanel,
  buildCategoryBreakdown,
  toRaceChartData,
} from '@/features/pool-archive';
import { RaceChart } from '@/features/results';
import { BackLink } from '@/shared/ui';
import { poolId as asPoolId, computeRemainingMaxPoints } from '@cup/engine';

type Props = { params: Promise<{ id: string }> };

export default async function PoolArchivePage({ params }: Props): Promise<ReactElement> {
  const { id } = await params;
  const poolId = asPoolId(id);

  const actor = await getCurrentActor();
  if (!actor) redirect('/');
  if (!(await isMember(db, poolId, actor.userId))) notFound();

  const pool = await getPoolById(db, poolId);
  if (!pool) notFound();

  const [archive, tournament, actualResults, allMatches] = await Promise.all([
    getPoolArchiveView(db, poolId),
    getTournamentById(db, pool.tournamentId),
    getActualResults(db, pool.tournamentId),
    getMatchesForTournament(db, pool.tournamentId),
  ]);

  const isOwner = actor.userId === pool.ownerId;
  const scoring = tournament?.scoringConfig ?? null;
  const def = tournament?.definition ?? null;
  const categoryMax = def ? computeRemainingMaxPoints(def, { finalMatchIds: new Set() }) : null;

  const finalMatch = actualResults.finalMatch;
  const final =
    finalMatch && def
      ? {
          homeTeamId: finalMatch.home,
          homeTeamName: def.teams.find((t) => t.id === finalMatch.home)?.name ?? finalMatch.home,
          awayTeamId: finalMatch.away,
          awayTeamName: def.teams.find((t) => t.id === finalMatch.away)?.name ?? finalMatch.away,
          homeGoals: finalMatch.homeGoals,
          awayGoals: finalMatch.awayGoals,
          winnerTeamId: finalMatch.winner,
        }
      : null;

  const getTeamName = (id: string) => def?.teams.find((t) => t.id === id)?.name ?? id;
  const topThree = (() => {
    if (!finalMatch) return [];
    const champion = finalMatch.winner;
    const runnerUp = champion === finalMatch.home ? finalMatch.away : finalMatch.home;
    const third = actualResults.bronzeMatch?.winner;
    return [
      { position: 1 as const, teamId: champion, teamName: getTeamName(champion) },
      { position: 2 as const, teamId: runnerUp, teamName: getTeamName(runnerUp) },
      ...(third ? [{ position: 3 as const, teamId: third, teamName: getTeamName(third) }] : []),
    ];
  })();

  const topEntries = archive
    ? archive.entries
        .slice()
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 3)
        .map((e) => ({
          rank: e.rank,
          displayName: e.displayName,
          points: e.pointsTotal,
          isCurrentUser: e.userId !== null && e.userId === actor.userId,
        }))
    : [];

  const matchesPlayed = allMatches.filter((m) => m.status === 'final').length;
  const raceChartData = archive ? toRaceChartData(archive, actor.userId) : null;
  const categoryBreakdown = archive ? buildCategoryBreakdown(archive.entries, actor.userId) : [];

  return (
    <div className="max-w-275 mx-auto p-[28px_20px]">
      <div className="eyebrow text-ink-muted mb-2 flex items-center gap-1.5">
        <BackLink href={`/pools/${poolId}`}>{pool.name}</BackLink>
        <span>· Archive</span>
      </div>
      <h1 className="display text-[34px] mb-5">Final standings</h1>

      <div className="mb-5">
        <ArchivePoolCard
          poolId={poolId}
          isOwner={isOwner}
          archivedAt={archive?.archivedAt ?? null}
        />
      </div>

      {!archive ? (
        <p className="text-sm text-ink-muted">This pool hasn&apos;t been archived yet.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <ArchiveHeroCard final={final} topThree={topThree} topEntries={topEntries} />

          <div className="grid gap-5 items-start md:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-4 min-w-0">
              {raceChartData && raceChartData.chartPlayers.length > 0 && (
                <div className="card p-4">
                  <span className="section-label">The race, start to finish</span>
                  <RaceChart
                    stages={raceChartData.chartStages}
                    nowIndex={raceChartData.chartNowIndex}
                    players={raceChartData.chartPlayers}
                  />
                </div>
              )}
              <ArchiveStatTiles matchesPlayed={matchesPlayed} recap={archive.recap} />
              <ArchivePoolStatsPanel recap={archive.recap} />
            </div>

            <div className="flex flex-col gap-4 min-w-0">
              <ArchiveHighlightsPanel recap={archive.recap} biggestRiser={archive.biggestRiser} />
              <ArchiveLeadChangesPanel leadChanges={archive.leadChanges} />
            </div>
          </div>

          <ArchiveCategoryBreakdownPanel rows={categoryBreakdown} />

          <div className="flex flex-col gap-3">
            <p className="text-xs text-ink-muted">
              Archived on {archive.archivedAt.toLocaleDateString()} — {archive.tournamentName}
            </p>
            <ArchiveStandingsPanel
              entries={archive.entries}
              currentUserId={actor.userId}
              scoring={scoring}
              categoryMax={categoryMax}
            />
          </div>
        </div>
      )}
    </div>
  );
}
