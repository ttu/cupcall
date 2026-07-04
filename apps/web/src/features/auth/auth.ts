import NextAuth from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import Resend from 'next-auth/providers/resend';
import { getDb } from '../../shared/db';
import * as schema from '@cup/db/schema';
import { getEnv } from '../../shared/env';
import { logger, safeEmailDomain } from '../../shared/observability/logger';
import { createSendVerificationRequest, createResendSender } from './email-provider';
import { applyDerivedDisplayName } from './create-user';
import { authConfig } from './auth.config';

/**
 * Full Auth.js configuration with the Drizzle adapter (Node.js / server only).
 * Uses lazy initialization so env vars and DB connections are resolved at request time,
 * not at build time.
 *
 * Spreads `authConfig` so that `session.strategy`, `pages`, and `callbacks` have a
 * single source of truth — middleware and the full handler share the same values.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const env = getEnv();
  const resendSender = createResendSender(env.RESEND_API_KEY);
  const sendVerificationRequest = createSendVerificationRequest({
    from: 'CupCall - Cup Prediction <noreply@cupcall.app>',
    sender: resendSender,
  });

  return {
    ...authConfig,
    adapter: DrizzleAdapter(getDb(), {
      usersTable: schema.users,
      accountsTable: schema.accounts,
      sessionsTable: schema.sessions,
      verificationTokensTable: schema.verificationTokens,
    }),
    providers: [
      Resend({
        from: 'CupCall - Cup Prediction <noreply@cupcall.app>',
        apiKey: env.RESEND_API_KEY,
        sendVerificationRequest,
      }),
    ],
    events: {
      /**
       * Set the display name derived from email when a new user is created.
       * The DrizzleAdapter INSERTs the user row with displayName='' (DB default);
       * `applyDerivedDisplayName` immediately UPDATEs it to a sensible default.
       *
       * Deliberate non-fatal degradation: if the UPDATE fails (e.g. transient DB
       * error), we log the error but do NOT block sign-in. The user keeps
       * displayName='' and can update it at /settings at any time.
       */
      async createUser({ user }) {
        try {
          await applyDerivedDisplayName(getDb(), { id: user.id ?? '', email: user.email });
          if (user.email) {
            logger.info(
              { domain: safeEmailDomain(user.email) },
              'auth:createUser — displayName set',
            );
          }
        } catch (err) {
          logger.error({ err }, 'auth:createUser — failed to set displayName');
        }
      },
    },
  };
});
