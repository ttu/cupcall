import 'server-only';
import { createDb, type Db } from '@cup/db';
import * as schema from '@cup/db/schema';
import { getEnv } from './env';

type AppSchema = typeof schema;

/**
 * Server-only lazy Drizzle singleton backed by the app's PostgreSQL database.
 * Created on first access (not at module load time) so that the module can be
 * imported during Next.js build without requiring env vars.
 * The `server-only` guard above ensures this module is never bundled for the client.
 */
let _db: Db<AppSchema> | undefined;

function getDb(): Db<AppSchema> {
  if (!_db) {
    _db = createDb(getEnv().DATABASE_URL, schema);
  }
  return _db;
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

export { db };
export type { Db, AppSchema };
