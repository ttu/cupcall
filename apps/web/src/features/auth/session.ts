import { cache } from 'react';
import { auth } from './auth';
import type { Actor } from '../../shared/authz';
import { assertSignedIn } from '../../shared/authz';
import { userId } from '@cup/engine';

/**
 * Returns the currently authenticated actor, or null if there is no session.
 * Maps the Auth.js session user to the domain `Actor` type used by the policy layer.
 *
 * Call this in Server Components, Server Actions, and Route Handlers — not in
 * client components (the Auth.js `auth()` helper is server-only).
 *
 * Wrapped in React.cache() to deduplicate the session fetch within a single
 * render pass when multiple server components call this in the same request.
 */
export const getCurrentActor = cache(async (): Promise<Actor | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { userId: userId(session.user.id) };
});

export async function getActorOrThrow(): Promise<Actor> {
  const actor = await getCurrentActor();
  assertSignedIn(actor);
  return actor;
}
