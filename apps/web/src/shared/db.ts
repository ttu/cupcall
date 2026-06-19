import 'server-only';
import { trace } from '@opentelemetry/api';
import { createDb, type Db } from '@cup/db';
import * as schema from '@cup/db/schema';
import { getEnv } from './env';

/**
 * Drizzle logger that records each SQL statement as an event on the currently
 * active OpenTelemetry span. When no span is active (or OTel is not configured)
 * the call is a no-op. This makes every server action in Jaeger show exactly
 * which queries ran and in what order.
 */
const otelLogger = {
  logQuery(query: string) {
    trace.getActiveSpan()?.addEvent('db.query', {
      'db.statement': query.length > 1000 ? `${query.slice(0, 997)}...` : query,
    });
  },
};

type AppSchema = typeof schema;

/**
 * Server-only lazy Drizzle singleton backed by the app's PostgreSQL database.
 * Created on first access (not at module load time) so that the module can be
 * imported during Next.js build without requiring env vars.
 * The `server-only` guard above ensures this module is never bundled for the client.
 *
 * Stored on globalThis so Next.js HMR doesn't create a new connection pool on
 * every hot-reload (which exhausts Postgres max_connections in dev).
 */
const globalForDb = globalThis as unknown as { _db: Db<AppSchema> | undefined };

function getDb(): Db<AppSchema> {
  if (!globalForDb._db) {
    globalForDb._db = createDb(getEnv().DATABASE_URL, schema, { logger: otelLogger });
  }
  return globalForDb._db;
}

/**
 * Proxy that creates the real Db instance on first property access.
 * This defers both env validation and DB connection to request time.
 */
const db = new Proxy({} as Db<AppSchema>, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop);
  },
});

export { db, getDb };
export type { Db, AppSchema };
