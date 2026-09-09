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
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/auth/login',
  '/auth/signup',
  '/api/auth/callback',
  '/api/public',
]

// Routes that require authentication (checked via middleware + server auth helpers)
const PROTECTED_ROUTES = [
  '/dashboard',
  '/admin',
  '/api/wallet',
  '/api/api-keys',
  '/api/models',
  '/api/user',
  '/api/payments',
  '/api/admin',
]

// Static asset and Next.js internal paths that should never be protected
const INTERNAL_PATHS = [
  '/_next',
  '/static',
  '/favicon',
  '/images',
  '/api/metrics',
]

// API routes that are always public (no session check needed)
const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/callback',
  '/api/auth/signout',
  '/api/payments/webhook',
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

  // Get the verified session from Supabase Auth
  // This reads the auth cookie, validates the session, and refreshes if needed
  const {
    data: { session },
    error: sessionError,
  } = await supa.auth.getSession()

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