/**
 * Resend signup confirmation email
 *
 * POST /api/auth/resend-verification  { email }
 *
 * Uses Supabase's dedicated resend endpoint so confirmation links carry a
 * fresh one-time code. Always answers { success: true } regardless of
 * whether the address exists — never leak account existence. Client-side
 * throttling: 60s cooldown enforced in the UI (Supabase has its own).
 *
 * Public by design: requires the email + knowledge of the inbox; no
 * session is returned or created here.
 */

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { email?: string }
    const email = body.email?.trim().toLowerCase() ?? ''

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { success: false, error: 'ایمیل معتبر نیست.' },
        { status: 400 }
      )
    }

    const supa = await createSupabaseServerClient()
    const { error } = await supa.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${new URL(request.url).origin}/auth/verified` },
    })

    if (error) {
      console.error('[Auth Resend] failed:', error.message)
    }

    // Uniform answer — do not reveal whether the account exists
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
