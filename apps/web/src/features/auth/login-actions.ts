'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { signIn } from './auth';
import { signInAsGuest } from './guest';
import { checkBetaCode } from './beta-code';
import { checkRateLimit, RATE_LIMITS } from '@cup/db';
import { db } from '../../shared/db';
import { logger } from '../../shared/observability/logger';

export type EmailSignInState = { error: string | null };
export type GuestSignInState = { error: string | null };

/**
 * Resolves the caller's IP from the platform-trusted `x-real-ip` header only.
 * Unlike `x-forwarded-for` — which a client can prepend arbitrary spoofed
 * entries to — `x-real-ip` is set directly by the hosting platform's edge
 * proxy from the actual TCP connection and cannot be overridden by request
 * headers the client sends. Returns null when absent (e.g. running outside
 * that proxy) so callers can skip IP-scoped checks rather than pool every
 * such request into one shared "unknown" bucket.
 */
function trustedClientIp(hdrs: Headers): string | null {
  const ip = hdrs.get('x-real-ip')?.trim();
  return ip ? ip : null;
}

export async function emailSignInAction(
  _prev: EmailSignInState,
  formData: FormData,
): Promise<EmailSignInState> {
  const email = formData.get('email');
  if (typeof email !== 'string' || email.trim() === '') return { error: null };

  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();
  const hdrs = await headers();
  const ip = trustedClientIp(hdrs);

  const emailRl = await checkRateLimit(db, {
    key: `magic_link:email:${normalizedEmail}`,
    limit: RATE_LIMITS.magicLink.limit,
    windowMs: RATE_LIMITS.magicLink.windowMs,
    now,
  });
  if (!emailRl.allowed) {
    logger.warn({ scope: 'email', outcome: 'rate_limited' }, 'auth:emailSignIn — rate limited');
    return { error: 'Too many sign-in requests. Please try again later.' };
  }

  // No trusted IP available — skip the IP-scoped check instead of sharing one
  // bucket across every caller with a missing/untrusted header.
  if (ip) {
    const ipRl = await checkRateLimit(db, {
      key: `magic_link:ip:${ip}`,
      limit: RATE_LIMITS.magicLink.limit,
      windowMs: RATE_LIMITS.magicLink.windowMs,
      now,
    });
    if (!ipRl.allowed) {
      logger.warn({ scope: 'ip', outcome: 'rate_limited' }, 'auth:emailSignIn — rate limited');
      return { error: 'Too many sign-in requests. Please try again later.' };
    }
  }

  await signIn('resend', { email: normalizedEmail, redirectTo: '/pools' });
  return { error: null }; // unreachable — signIn redirects
}

const GuestSignInFormDataSchema = z.object({
  // FormData.get() can return a File for a mismatched field; reject anything
  // that isn't a string (or absent) instead of an unsafe `as string` cast.
  betaCode: z.string().nullable(),
  name: z.string().nullable(),
});

export async function guestSignInAction(
  _prev: GuestSignInState,
  formData: FormData,
): Promise<GuestSignInState> {
  const parsed = GuestSignInFormDataSchema.safeParse({
    betaCode: formData.get('betaCode'),
    name: formData.get('name'),
  });
  if (!parsed.success) return { error: 'Invalid form submission.' };

  const codeError = checkBetaCode(parsed.data.betaCode);
  if (codeError) return { error: codeError };

  const name = parsed.data.name?.trim() ?? '';
  if (name.length < 2) return { error: 'Name must be at least 2 characters.' };

  // redirects on success — never returns normally
  return signInAsGuest(name, '/pools');
}
