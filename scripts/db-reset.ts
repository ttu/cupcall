/**
 * scripts/db-reset.ts — drop all tables and re-run migrations via drizzle-kit.
 * Called by scripts/db-reset.sh; not meant to be run directly.
 *
 * Imports via @cup/db so that postgres resolves from packages/db/node_modules,
 * the same way sync.ts reaches it.
 */
import { resetSchema } from '@cup/db';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Error: DATABASE_URL is not set.');
  process.exit(1);
}

await resetSchema(url);
console.log('Schema reset.');
