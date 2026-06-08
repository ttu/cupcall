import { auth } from './auth';
import type { Actor } from '../../shared/authz';
import { userId } from '@cup/engine';

/**
 * Returns the currently authenticated actor, or null if there is no session.
 * Maps the Auth.js session user to the domain `Actor` type used by the policy layer.
 *
 * Call this in Server Components, Server Actions, and Route Handlers — not in
 * client components (the Auth.js `auth()` helper is server-only).
 */
export async function getCurrentActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { userId: userId(session.user.id) };
}
