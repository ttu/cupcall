import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_PREFIXES = ['/settings', '/pools'];

// Auth.js sets one of these depending on whether the connection is HTTPS.
const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token'];

/**
 * Edge-compatible middleware — checks for a session cookie to gate protected routes.
 * Database session tokens are random strings, not JWTs, so they cannot be verified
 * without hitting the DB. We check for existence only; actual session validation
 * happens in server components/actions via auth() from auth.ts.
 */
export function middleware(request: NextRequest) {
  const { pathname, origin } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!isProtected) return NextResponse.next();

  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (!hasSession) {
    return NextResponse.redirect(new URL('/', origin));
  }

  return NextResponse.next();
}

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
