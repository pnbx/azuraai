import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/supabase/admin'

/**
 * POST /api/auth/register
 * Creates the account via Supabase Auth. When email confirmation is
 * enabled (new signups), no session is returned and the client routes to
 * /auth/verify-email. Existing users are unaffected — they were confirmed
 * before confirmation was required and sign in as before.
 */

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      )
    }

    const { email, password, fullName } = body as {
      email?: string
      password?: string
      fullName?: string
    }

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    const supa = await createSupabaseServerClient()
    const { data, error } = await supa.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        // PKCE email-confirmation lands here (new signups verifying email)
        emailRedirectTo: `${new URL(request.url).origin}/auth/verified`,
      },
    })

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Registration failed. Please try again.' },
        { status: 400 }
      )
    }

    // Dev mode: auto-confirm so devs can test without opening the email
    if (!error && data.user && !data.session && process.env.NODE_ENV === 'development') {
      await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
        email_confirm: true,
      })
      const { data: signInData } = await supa.auth.signInWithPassword({
        email,
        password,
      })
      if (signInData.session) {
        return NextResponse.json({
          success: true,
          needsEmailVerification: false,
        })
      }
    }

    // Session exists → auto-confirmed (verification off or dev mode).
    // No session → confirmation email is on its way; the UI sends the user
    // to /auth/verify-email with the address pre-filled.
    return NextResponse.json({
      success: true,
      needsEmailVerification: !data.session,
      email,
    })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
