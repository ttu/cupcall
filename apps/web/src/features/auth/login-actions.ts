'use server';

import { headers } from 'next/headers';
import { signIn } from './auth';
import { signInAsGuest } from './guest';
import { checkBetaCode } from './beta-code';
import { checkRateLimit, RATE_LIMITS } from '@cup/db';
import { db } from '../../shared/db';
import { logger } from '../../shared/observability/logger';

export type EmailSignInState = { error: string | null };
export type GuestSignInState = { error: string | null };

export async function emailSignInAction(
  _prev: EmailSignInState,
  formData: FormData,
): Promise<EmailSignInState> {
  const email = formData.get('email');
  if (typeof email !== 'string' || email.trim() === '') return { error: null };

  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();
  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  const [emailRl, ipRl] = await Promise.all([
    checkRateLimit(db, {
      key: `magic_link:email:${normalizedEmail}`,
      limit: RATE_LIMITS.magicLink.limit,
      windowMs: RATE_LIMITS.magicLink.windowMs,
      now,
    }),
    checkRateLimit(db, {
      key: `magic_link:ip:${ip}`,
      limit: RATE_LIMITS.magicLink.limit,
      windowMs: RATE_LIMITS.magicLink.windowMs,
      now,
    }),
  ]);

  if (!emailRl.allowed) {
    logger.warn({ email: normalizedEmail }, 'auth:emailSignIn — rate limited by email');
    return { error: 'Too many sign-in requests. Please try again later.' };
  }

  if (!ipRl.allowed) {
    logger.warn({ ip }, 'auth:emailSignIn — rate limited by IP');
    return { error: 'Too many sign-in requests. Please try again later.' };
  }

  await signIn('resend', { email: normalizedEmail, redirectTo: '/pools' });
  return { error: null }; // unreachable — signIn redirects
}

export async function guestSignInAction(
  _prev: GuestSignInState,
  formData: FormData,
): Promise<GuestSignInState> {
  const codeError = checkBetaCode(formData.get('betaCode') as string | null);
  if (codeError) return { error: codeError };

  const name = (formData.get('name') as string | null)?.trim() ?? '';
  if (name.length < 2) return { error: 'Name must be at least 2 characters.' };

  // redirects on success — never returns normally
  return signInAsGuest(name, '/pools');
}
