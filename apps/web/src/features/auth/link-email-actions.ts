'use server';

import { randomBytes } from 'crypto';
import { getCurrentActor } from './session';
import { db } from '@/shared/db';
import { getUserById, getUserByEmail, upsertPendingEmailLink } from '@cup/db';
import { createResendSender, type EmailSender } from './email-provider';
import { env } from '@/shared/env';

const LINK_TTL_MS = 24 * 60 * 60 * 1000;

export type LinkEmailResult = { ok: true } | { ok: false; error: string };

const SEND_FAILURE_ERROR =
  'Sending failed — try again later or use your personal login link to sign in.';

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

  const raw = formData.get('email');
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'Email is required.' };
  const email = raw.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Invalid email address.' };
  }

  const existing = await getUserByEmail(db, email);
  // Return ok silently — don't reveal whether an email is already registered (enumeration risk).
  if (existing) return { ok: true };

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  await upsertPendingEmailLink(db, { userId: actor.userId, email, token, expiresAt });

  const baseUrl = env.AUTH_URL.replace(/\/$/, '');
  const url = `${baseUrl}/link-email/${token}`;

  await sender.send({
    to: email,
    from: 'CupCall - Cup Prediction <noreply@cupcall.app>',
    subject: 'Connect your email to Cup Prediction',
    html: buildHtml(url),
    text: buildText(url),
    url,
  });

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
    <p>Connect your email to <strong>Cup Prediction</strong></p>
    <p><a href="${safeUrl}">Click here to connect your email</a></p>
    <p>Open this link in the same browser where you are already signed in.</p>
    <p>This link expires in 24 hours.</p>
    <p><strong>Did not request this?</strong> Do not click the link above — you can safely ignore this email.</p>
  </body>
</html>`.trim();
}

function buildText(url: string): string {
  return `Connect your email to Cup Prediction\n\n${url}\n\nOpen this link in the same browser where you are already signed in.\n\nThis link expires in 24 hours.\n\nDid not request this? Do not click the link above — you can safely ignore this email.`;
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
  } catch {
    return { ok: false, error: SEND_FAILURE_ERROR };
  }
}
