import type { Db } from '@cup/db';
import type * as schema from '@cup/db/schema';
import { updateDisplayName } from '@cup/db';
import { userId } from '@cup/engine';
import { deriveDisplayName } from './display-name';

/** DB typed against the schema tables (matches makeTestDb() and the web singleton). */
type AppDb = Db<typeof schema>;

/**
 * Updates the display name of a newly created user to a value derived from their email.
 *
 * Called from the Auth.js `events.createUser` hook. The DrizzleAdapter INSERTs the user
 * row with `displayName=''` (the DB default); this function immediately UPDATEs it to
 * a sensible default derived from the email local-part.
 *
 * Skips silently when `email` is absent (adapters may omit it for OAuth flows).
 *
 * This is the testable boundary — it accepts `db` so pglite tests can exercise the
 * exact same code path that runs in production, without booting the NextAuth handler.
 */
export async function applyDerivedDisplayName(
  db: AppDb,
  { id, email }: { id: string; email: string | null | undefined },
): Promise<void> {
  if (!email) return;
  await updateDisplayName(db, userId(id), deriveDisplayName(email));
}
