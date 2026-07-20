import type { NextAuthConfig } from 'next-auth';

/**
 * Shared Auth.js configuration — no adapter, no Node.js-only imports.
 * Spread into the full auth.ts config to keep session strategy, pages,
 * and callbacks in one place.
 */
export const authConfig = {
  session: { strategy: 'database' },
  providers: [],
  pages: {
    signIn: '/',
    verifyRequest: '/login/verify-request',
  },
} satisfies NextAuthConfig;
