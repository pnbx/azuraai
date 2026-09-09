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

    const { email, password, redirectUrl } = body as { email?: string; password?: string; redirectUrl?: string }

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const supa = await createSupabaseServerClient()
    const { error } = await supa.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Session cookie is set automatically by the server client.
    // Do NOT return session tokens or full user object to the client.
    const redirectTo = validateRedirectUrl(redirectUrl ?? null)

    return NextResponse.json({
      success: true,
      redirectTo,
    })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
