import type { EmailProviderSendVerificationRequestParams } from 'next-auth/providers/email';

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
    const { host } = new URL(url);

    await opts.sender.send({
      to,
      from: opts.from,
      subject: `Sign in to ${host}`,
      html: buildHtml(url, host),
      text: buildText(url, host),
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

function buildHtml(url: string, host: string): string {
  const safeUrl = escapeHtml(url);
  const safeHost = escapeHtml(host);
  return `
<!DOCTYPE html>
<html>
  <body>
    <p>Sign in to <strong>${safeHost}</strong></p>
    <p><a href="${safeUrl}">Click here to sign in</a></p>
    <p>If you did not request this, you can safely ignore this email.</p>
    <p>This link expires in 24 hours.</p>
  </body>
</html>`.trim();
}

function buildText(url: string, host: string): string {
  return `Sign in to ${host}\n\n${url}\n\nIf you did not request this, you can safely ignore this email.\nThis link expires in 24 hours.`;
}
