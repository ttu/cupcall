import type { EmailProviderSendVerificationRequestParams } from 'next-auth/providers/email';

/**
 * Sign-in magic-link validity. Also passed as the Resend provider's `maxAge`
 * (auth.ts) so the token's real expiry and the copy below can't drift apart.
 */
export const MAGIC_LINK_MAX_AGE_SECONDS = 60 * 15;

/**
 * Injectable email-sending boundary.
 * The real implementation uses Resend; tests pass a fake.
 */
export interface EmailSender {
  send(params: {
    to: string;
    from: string;
    subject: string;
    html: string;
    text: string;
    url: string;
  }): Promise<void>;
}

interface CreateSendVerificationRequestOptions {
  from: string;
  sender: EmailSender;
}

/**
 * Factory that creates an Auth.js-compatible `sendVerificationRequest` function.
 * The actual email delivery is delegated to the injected `sender` so the logic
 * is testable without hitting the Resend API.
 */
export function createSendVerificationRequest(opts: CreateSendVerificationRequestOptions) {
  return async function sendVerificationRequest(
    params: EmailProviderSendVerificationRequestParams,
  ): Promise<void> {
    const { identifier: to, url } = params;

    await opts.sender.send({
      to,
      from: opts.from,
      subject: `Sign in to CupCall`,
      html: buildHtml(url),
      text: buildText(url),
      url,
    });
  };
}

/**
 * Production Resend sender. Constructed at runtime using the injected API key.
 */
export function createResendSender(apiKey: string): EmailSender {
  return {
    async send(params) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: params.from,
          to: params.to,
          subject: params.subject,
          html: params.html,
          text: params.text,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`Resend error (${res.status}): ${JSON.stringify(body)}`);
      }
    },
  };
}

/**
 * Escapes characters that are special in HTML to prevent injection.
 * Defensive hygiene even though `url` and `host` are Auth.js-generated values.
 */
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const EXPIRY_TEXT = `${MAGIC_LINK_MAX_AGE_SECONDS / 60} minutes`;

function buildHtml(url: string): string {
  const safeUrl = escapeHtml(url);
  return `
<!DOCTYPE html>
<html>
  <body>
    <p>Sign in to <strong>CupCall</strong></p>
    <p><a href="${safeUrl}">Click here to sign in</a></p>
    <p>This link expires in ${EXPIRY_TEXT}.</p>
    <p><strong>Did not request this?</strong> Do not click the link above — you can safely ignore this email.</p>
  </body>
</html>`.trim();
}

function buildText(url: string): string {
  return `Sign in to CupCall\n\n${url}\n\nThis link expires in ${EXPIRY_TEXT}.\n\nDid not request this? Do not click the link above — you can safely ignore this email.`;
}
