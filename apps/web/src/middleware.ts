import NextAuth from 'next-auth';
import { authConfig } from './features/auth/auth.config';

/**
 * Thin Edge-compatible middleware.
 * Uses authConfig (no DB adapter, no pglite) so it runs in Edge Runtime.
 * Protected-route gating is in the `authorized` callback in auth.config.ts.
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *   - _next/static, _next/image (Next.js internals)
     *   - favicon.ico, public assets
     *   - api/auth (the Auth.js route handler — never gate that)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
