import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Validates a redirect URL to prevent open redirects and ensure safety
 * @param redirectUrl - The URL to validate
 * @returns Validated redirect URL or default to dashboard
 */
function validateRedirectUrl(redirectUrl: string | null): string {
  if (!redirectUrl) {
    return '/dashboard'
  }

  // Only allow relative paths starting with / (internal application routes)
  if (!redirectUrl.startsWith('/')) {
    return '/dashboard'
  }

  // Prevent redirect loops by not allowing auth routes to redirect to themselves
  if (redirectUrl === '/auth/login' || redirectUrl === '/auth/signup') {
    return '/dashboard'
  }

  // Basic protection against open redirects
  if (redirectUrl.includes('://') || redirectUrl.startsWith('//')) {
    return '/dashboard'
  }

  return redirectUrl
}

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

    const { email, password, fullName, redirectUrl } = body as {
      email?: string
      password?: string
      fullName?: string
      redirectUrl?: string
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
    const validatedRedirectUrl = validateRedirectUrl(redirectUrl ?? null)
    const { data, error } = await supa.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        emailRedirectTo: validatedRedirectUrl,
      },
    })

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Registration failed. Please try again.' },
        { status: 400 }
      )
    }

    // Do NOT return session tokens or full user object to the client.
    // Session cookie is set automatically by the server client if session exists.
    return NextResponse.json({
      success: true,
      needsEmailVerification: !data.session,
    })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
