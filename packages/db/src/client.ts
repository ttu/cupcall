import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import postgres from 'postgres';
import { PGlite } from '@electric-sql/pglite';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Logger } from 'drizzle-orm';

/**
 * The unified database type used by all repositories. Generic over the schema so that
 * repositories can use `Db<typeof schema>` for full type inference.
 * The production driver (postgres-js) owns the canonical type; the pglite factory
 * conforms via the single documented cast below — both drivers extend
 * `PgDatabase<_, TSchema>` and expose the same query surface.
 */
export type Db<TSchema extends Record<string, unknown> = Record<string, never>> =
  PostgresJsDatabase<TSchema>;

/** Production factory — wraps a real Postgres server via postgres-js. */
export function createDb<TSchema extends Record<string, unknown> = Record<string, never>>(
  connectionString: string,
  schema?: TSchema,
  options?: { logger?: Logger },
): Db<TSchema> {
  const client = postgres(connectionString, { max: 10 });
  return drizzlePostgres(client, {
    schema: schema ?? ({} as TSchema),
    ...(options?.logger ? { logger: options.logger } : {}),
  });
}

/**
 * In-memory test factory — backed by PGlite so tests run without a real server.
 * Two casts are used here:
 *   1. `{} as TSchema` — default when no schema is provided (same as createDb).
 *   2. `as unknown as Db<TSchema>` — driver-unification boundary: PgliteDatabase and
 *      PostgresJsDatabase both extend PgDatabase<_, TSchema> and are structurally
 *      identical at the schema-query level used by repositories, but TypeScript does
 *      not see that without an explicit widening cast.
 */
export function createPgliteDb<TSchema extends Record<string, unknown> = Record<string, never>>(
  schema?: TSchema,
): Db<TSchema> {
  const client = new PGlite();
  // Cast: PgliteDatabase<TSchema> ≈ PostgresJsDatabase<TSchema> at the PgDatabase<_, TSchema> level.
  return drizzlePglite(client, { schema: schema ?? ({} as TSchema) }) as unknown as Db<TSchema>;
}
