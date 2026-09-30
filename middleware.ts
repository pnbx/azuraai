/**
 * Azura Authentication Middleware
 *
 * Uses Supabase Auth SSR session handling for Next.js 16 App Router.
 * This middleware handles:
 * - Session refresh and cookie propagation
 * - Redirecting unauthenticated users to login
 * - Redirecting authenticated users away from auth routes
 * - Exempting public routes, static assets, and Next.js internals from checks
 *
 * Security:
 * - Session verification is server-side only via @supabase/ssr
 * - The user's identity comes from the verified Supabase Auth session
 * - No client-provided user_id is trusted
 * - service_role key is NEVER used in browser code
 * - Authentication helpers (getServerUser, requireServerUser) must be
 *   imported from lib/auth/server.ts in Route Handlers and Server Components
 *
 * Resilience:
 * - The Supabase session check races a hard timeout (8s). If Supabase Auth is
 *   unreachable/paused, requests no longer hang until Vercel's middleware
 *   limit (previously surfaced as 504 MIDDLEWARE_INVOCATION_TIMEOUT).
 * - Failure is treated as "no session": protected pages redirect to login,
 *   public pages keep loading, and the browser is told to drop the stale
 *   auth cookies so the dead session can't re-trigger refresh attempts.
 */

/** Max time (ms) to wait on Supabase Auth before giving up. */
const SUPABASE_TIMEOUT_MS = 8_000

/** Clears Supabase auth cookies so a dead session stops triggering refreshes. */
function clearAuthCookies(): NextResponse {
  const res = NextResponse.next()
  for (const name of ['sb-access-token', 'sb-refresh-token']) {
    res.cookies.set(name, '', { maxAge: 0, path: '/' })
  }
  return res
}

/** Races a promise against the middleware timeout. */
function withTimeout<T>(promise: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), SUPABASE_TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Public routes that don't require authentication.
// NOTE: /auth/login and /auth/signup are intentionally NOT listed here —
// they need a session check so logged-in users can be redirected to the
// dashboard (and with the timeout below they still load when Supabase is down).
const PUBLIC_ROUTES = [
  '/api/auth/callback',
  '/api/public',
]

// Routes that require authentication (checked via middleware + server auth helpers)
const PROTECTED_ROUTES = [
  '/dashboard',
  '/admin',
  '/app',
  '/api/wallet',
  '/api/api-keys',
  '/api/models',
  '/api/user',
  '/api/payments',
  '/api/admin',
  '/api/provider',
]

// Static asset and Next.js internal paths that should never be protected
const INTERNAL_PATHS = [
  '/_next',
  '/static',
  '/favicon',
  '/images',
]

// API routes that are always public (no session check needed)
const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/callback',
  '/api/auth/signout',
  '/api/payments/webhook',
  '/api/payments/callback/zarinpal',
  '/api/inference',   // self-authenticating (API key or session)
  '/api/usage',       // self-authenticating (API key or session)
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public API routes through without session check
  if (PUBLIC_API_ROUTES.includes(pathname)) {
    return NextResponse.next()
  }

  // Allow internal paths and static assets through without session check
  if (INTERNAL_PATHS.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }

  // Allow public routes through without session check
  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next()
  }

  // Create Supabase client for session handling
  // This reads the auth cookie, validates the session, and refreshes if needed
  const supa = await createSupabaseServerClient()

  // Get the verified session from Supabase Auth, bounded by a hard timeout.
  // If Supabase is unreachable (e.g. project paused), resolve as no session
  // instead of hanging until the platform kills the request with a 504.
  const sessionResult = await withTimeout(
    supa.auth.getSession() as Promise<unknown>
  )

  if (sessionResult === null) {
    console.error(
      `[Middleware] Supabase session check timed out after ${SUPABASE_TIMEOUT_MS}ms [req=${request.headers.get('x-vercel-id') ?? 'local'}]`
    )
    const res = clearAuthCookies()
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
    if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
      const redirectUrl = new URL('/auth/login', request.url)
      redirectUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(redirectUrl)
    }
    return res
  }

  const {
    data: { session },
    error: sessionError,
  } = sessionResult as {
    data: { session: unknown }
    error?: unknown
  }

  if (sessionError) {
    console.error('Supabase session error in middleware:', sessionError)
  }

  // If no valid session and trying to access protected routes, redirect to login
  if (!session && (pathname.startsWith('/dashboard') || pathname.startsWith('/admin'))) {
    const redirectUrl = new URL('/auth/login', request.url)
    return NextResponse.redirect(redirectUrl)
  }

  // If session exists and trying to access auth routes, redirect to dashboard
  if (session && (pathname === '/auth/login' || pathname === '/auth/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // For other protected routes, ensure session exists (redirect if missing)
  if (!session && PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    const redirectUrl = new URL('/auth/login', request.url)
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Session is valid - user is authenticated (middleware check passes)
  return NextResponse.next()
}

export const config = {
  // Match all routes except static assets and Next.js internals
  // This ensures authentication is checked for application routes
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
}