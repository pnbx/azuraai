/**
 * Supabase Auth email-confirmation callback
 *
 * GET /api/auth/callback?code=…  (PKCE flow, new signups verifying their email)
 *
 * Exchanges the one-time code for a session, then routes:
 *   success → /auth/verified        (green "email confirmed" screen)
 *   failure → /auth/verify-error    (friendly retry/resend screen)
 *
 * Public by design (the user has no session yet); safety comes from the
 * one-time PKCE code. `next` is honored only for safe internal paths.
 */

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  if (code) {
    const supa = await createSupabaseServerClient()
    const { error } = await supa.auth.exchangeCodeForSession(code)
    if (!error) {
      // Internal-path guard (same rules as login/register redirect validation)
      const safeNext =
        next && next.startsWith('/') && !next.startsWith('//') && !next.includes('://')
          ? next
          : null
      return NextResponse.redirect(`${origin}${safeNext ?? '/auth/verified'}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/verify-error`)
}
