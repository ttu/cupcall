import pino from 'pino';

/**
 * Structured pino logger for server-side boundaries.
 * Never log secrets (tokens, full emails) — use `safeEmailDomain` for PII.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // In production Vercel logs want newline-delimited JSON; in dev, pretty-print.
  ...(process.env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true },
        },
      }
    : {}),
});

/**
 * Extracts the domain portion of an email address for safe logging.
 * Logs "@example.com" instead of the full address so no PII or identifier is
 * stored in structured logs.
 *
 * @example safeEmailDomain('alice@example.com') → '@example.com'
 */
export function safeEmailDomain(email: string): string {
  const at = email.indexOf('@');
  if (at === -1) return '[unknown-domain]';
  return email.slice(at); // "@example.com"
}
