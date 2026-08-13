'use server';

import { randomBytes } from 'crypto';
import { z } from 'zod';
import { getCurrentActor } from './session';
import { db } from '@/shared/db';
import {
  getUserById,
  getUserByEmail,
  upsertPendingEmailLink,
  checkRateLimit,
  RATE_LIMITS,
} from '@cup/db';
import { createResendSender, type EmailSender } from './email-provider';
import { env } from '@/shared/env';
import { logger } from '@/shared/observability/logger';

const LINK_TTL_MS = 24 * 60 * 60 * 1000;

export type LinkEmailResult = { ok: true } | { ok: false; error: string };

const SEND_FAILURE_ERROR =
  'Sending failed — try again later or use your personal login link to sign in.';

// RFC 5321 caps addresses at 254 chars. The domain part excludes '.' from the
// repeated segment so there's no ambiguous split point for the regex engine to
// backtrack over (unlike `[^\s@]+\.[^\s@]+`, which does).
const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

const emailSchema = z
  .string({ invalid_type_error: 'Email is required.' })
  .trim()
  .toLowerCase()
  .min(1, 'Email is required.')
  .max(254, 'Invalid email address.')
  .regex(EMAIL_REGEX, 'Invalid email address.');

// Exported for testing only; production path uses the default.
export async function requestEmailLinkAction(
  formData: FormData,
  sender: EmailSender = createResendSender(env.RESEND_API_KEY),
): Promise<LinkEmailResult> {
  const actor = await getCurrentActor();
  if (!actor) return { ok: false, error: 'Not authenticated.' };

  const user = await getUserById(db, actor.userId);
  if (!user) return { ok: false, error: 'User not found.' };
  if (user.email) return { ok: false, error: 'Account already has an email address.' };

  const parsed = emailSchema.safeParse(formData.get('email'));
  if (!parsed.success) {
    logger.info(
      { op: 'connectEmail', outcome: 'rejected', reason: 'invalid_format' },
      'auth:connectEmail — validation failed',
    );
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid email address.' };
  }
  const email = parsed.data;

  const now = new Date();
  const [userRl, emailRl] = await Promise.all([
    checkRateLimit(db, {
      key: `connect_email:user:${actor.userId}`,
      limit: RATE_LIMITS.magicLink.limit,
      windowMs: RATE_LIMITS.magicLink.windowMs,
      now,
    }),
    checkRateLimit(db, {
      key: `connect_email:email:${email}`,
      limit: RATE_LIMITS.magicLink.limit,
      windowMs: RATE_LIMITS.magicLink.windowMs,
      now,
    }),
  ]);
  if (!userRl.allowed || !emailRl.allowed) {
    logger.warn(
      { op: 'connectEmail', outcome: 'rate_limited' },
      'auth:connectEmail — rate limited',
    );
    return { ok: false, error: 'Too many requests. Please try again later.' };
  }

  const existing = await getUserByEmail(db, email);
  // Return ok silently — don't reveal whether an email is already registered (enumeration risk).
  if (existing) {
    logger.info(
      { op: 'connectEmail', outcome: 'accepted_no_send' },
      'auth:connectEmail — email already registered, skipping send',
    );
    return { ok: true };
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  await upsertPendingEmailLink(db, { userId: actor.userId, email, token, expiresAt });

  const baseUrl = env.AUTH_URL.replace(/\/$/, '');
  const url = `${baseUrl}/link-email/${token}`;

  await sender.send({
    to: email,
    from: 'CupCall <noreply@cupcall.app>',
    subject: 'Connect your email to CupCall',
    html: buildHtml(url),
    text: buildText(url),
    url,
  });

  logger.info({ op: 'connectEmail', outcome: 'accepted' }, 'auth:connectEmail — link sent');
  return { ok: true };
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml(url: string): string {
  const safeUrl = escapeHtml(url);
  return `<!DOCTYPE html>
<html>
  <body>
    <p>Connect your email to <strong>CupCall</strong></p>
    <p><a href="${safeUrl}">Click here to connect your email</a></p>
    <p>Open this link in the same browser where you are already signed in.</p>
    <p>This link expires in 24 hours.</p>
    <p><strong>Did not request this?</strong> Do not click the link above — you can safely ignore this email.</p>
  </body>
</html>`.trim();
}

function buildText(url: string): string {
  return `Connect your email to CupCall\n\n${url}\n\nOpen this link in the same browser where you are already signed in.\n\nThis link expires in 24 hours.\n\nDid not request this? Do not click the link above — you can safely ignore this email.`;
}

/**
 * useActionState-compatible wrapper around requestEmailLinkAction.
 * Catches unexpected sender errors (e.g. Resend API failure) and converts
 * them to a user-facing error result rather than letting the form crash.
 *
 * The third `sender` parameter is only for testing; production uses the default.
 */
export async function connectEmailFormAction(
  _prev: LinkEmailResult | null,
  formData: FormData,
  sender?: EmailSender,
): Promise<LinkEmailResult> {
  try {
    return await requestEmailLinkAction(formData, sender);
  } catch (e) {
    logger.error(
      { op: 'connectEmail', errClass: e instanceof Error ? e.name : 'unknown' },
      'auth:connectEmail — send failed',
    );
    return { ok: false, error: SEND_FAILURE_ERROR };
  }
}
