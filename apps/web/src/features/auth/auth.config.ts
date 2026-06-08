import type { NextAuthConfig } from 'next-auth';

/**
 * Auth.js configuration WITHOUT the database adapter or any Node.js-only imports.
 * Safe to use in Edge Runtime (middleware).
 *
 * The full configuration with the Drizzle adapter lives in `auth.ts` and is used
 * only in the API route handler and server components.
 */
export const authConfig = {
  // No adapter here — middleware only reads the session cookie, not the DB.
  session: { strategy: 'database' },
  providers: [], // Providers are only needed in the full config (auth.ts)
  pages: {
    signIn: '/',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isSignedIn = !!auth?.user;
      const isProtectedRoute =
        nextUrl.pathname.startsWith('/settings') || nextUrl.pathname.startsWith('/pools');

      if (isProtectedRoute && !isSignedIn) {
        return Response.redirect(new URL('/', nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
