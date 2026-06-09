# Pool Backup & Restore

**Status:** Implemented  
**Location:** `apps/web/src/features/pools/`

## Purpose

Pool owners can export a full backup of their pool (all members + all predictions) as a JSON file, and restore it into any pool they own. This covers disaster recovery (accidental deletion), migration between deployments, and general archiving.

## Export

`exportPool` server action → `buildPoolExport` application function.

Produces a `PoolBackup` JSON file containing:

- Pool name, tournament ID, export timestamp, format version
- All members (userId + displayName) with their full prediction card (group scores, knockout picks, finish scores, special bets)

Members with no prediction yet are included with empty arrays.

## Import (Restore)

`importPool` server action → `restorePoolFromBackup` application function.

For each member in the backup:

1. **User resolution:** look up `userId` in the DB. If found, use them. If not (cross-environment restore), create a guest user with the exported `displayName`.
2. **Pool membership:** `addMember` is idempotent — re-importing a backup does not add duplicate rows.
3. **Prediction restore:** clear all existing prediction inputs for that user in the target pool, then write the backup data. This makes restore authoritative.
4. **Audit trail:** a `pool.backup.restore` edit record is written to every restored prediction, noting the `exportedAt` timestamp and the original `userId`.
5. **Rescore:** all restored predictions are rescored in parallel after the data write.

## Authorization

Both `exportPool` and `importPool` are **owner-only** operations. No lock-time check applies (same as all owner edits).

## Tournament compatibility

On import, the backup's `tournamentId` must match the target pool's `tournamentId`. Cross-tournament restore is rejected with a clear error message.

## Format (`PoolBackup`)

```ts
type PoolBackup = {
  version: 1;
  exportedAt: string; // ISO timestamp
  tournamentId: string;
  poolName: string;
  members: MemberBackup[];
};

type MemberBackup = {
  userId: string;
  displayName: string;
  prediction: {
    groupScores: { matchId: string; home: number; away: number }[];
    knockoutPicks: { bracketMatchKey: string; winner: string }[];
    finishScores: {
      final?: { home: number; away: number };
      bronze?: { home: number; away: number };
    };
    specials: Record<string, unknown>;
  };
};
```

The Zod schema (`PoolBackupSchema`, `MemberBackupSchema`) is the source of truth for both validation and TypeScript types via `z.infer`.

## File layout

```
features/pools/
  application/pool-backup.ts          ← buildPoolExport, restorePoolFromBackup, Zod schemas, types
  application/pool-backup.test.ts     ← 14 integration tests (export, restore, round-trip)
  api/actions.ts                      ← exportPool, importPool server actions
  ui/PoolBackupControls.tsx           ← client component (export button + import file input)
```

`rescoreCard` is exported from `@/features/predictions` (public barrel) so the pools feature can rescore without reaching into predictions internals.

## UI

`PoolBackupControls` appears in the owner section of the pool detail page (`/pools/[id]`), below the member management controls. Export downloads `cup-pool-backup-<poolId>.json`. Import reads any `.json` file and calls the restore action.
