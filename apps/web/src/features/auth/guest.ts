'use server';

import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/shared/db';
import { createGuestUser, createDbSession } from '@cup/db';
import type { UserId } from '@cup/engine';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sessionCookieName(): string {
  const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '';
  return authUrl.startsWith('https://') ? '__Secure-authjs.session-token' : 'authjs.session-token';
}

async function writeSessionCookie(sessionToken: string, expires: Date): Promise<void> {
  const name = sessionCookieName();
  const cookieStore = await cookies();
  cookieStore.set(name, sessionToken, {
    expires,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: name.startsWith('__Secure-'),
  });
}

/**
 * Creates a new user with the given display name, opens a database session,
 * writes the session cookie, and redirects. Intended for unauthenticated flows
 * (join via invite link, quick-start from home page) where no email or password
 * is required.
 */
export async function signInAsGuest(displayName: string, redirectTo: string): Promise<never> {
  const user = await createGuestUser(db, { displayName: displayName.trim() });
  return signInAsExistingGuest(user.id, redirectTo);
}

/**
 * Opens a session for a user who already exists in the DB (e.g. created just
 * before joining a pool). Writes the cookie and redirects.
 */
export async function signInAsExistingGuest(userId: UserId, redirectTo: string): Promise<never> {
  const sessionToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_MS);

  await createDbSession(db, { sessionToken, userId, expires });
  await writeSessionCookie(sessionToken, expires);

  redirect(redirectTo);
}
