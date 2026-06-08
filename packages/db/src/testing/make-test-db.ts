import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as schema from '../schema/index';
import type { Db } from '../client';
import type { PgliteDatabase } from 'drizzle-orm/pglite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve migrations folder relative to the package root (two levels up from src/testing/).
const migrationsFolder = join(__dirname, '..', '..', 'migrations');

/**
 * Spins a fresh in-memory PGlite database, applies the committed SQL migrations, and
 * returns a fully-typed Drizzle handle. Each call produces an isolated database —
 * ideal for parallel integration tests with no shared state.
 */
export async function makeTestDb(): Promise<Db<typeof schema>> {
  const client = new PGlite();
  // Cast: PgliteDatabase<schema> ≈ PostgresJsDatabase<schema> at the PgDatabase level.
  const db = drizzle(client, { schema }) as unknown as Db<typeof schema>;
  // The migrate() call requires PgliteDatabase; we recover the underlying type here only.
  await migrate(db as unknown as PgliteDatabase<typeof schema>, { migrationsFolder });
  return db;
}
