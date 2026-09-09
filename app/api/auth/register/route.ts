import { NextResponse } from 'next/server'
import { createSupabaseBrowserClient } from '@/lib/supabase'

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
  const { email, password, fullName, redirectUrl } = await request.json()

  if (!email || !password) {
    return NextResponse.json(
      { error: 'Email and password are required' },
      { status: 400 }
    )
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters' },
      { status: 400 }
    )
  }

  const supa = createSupabaseBrowserClient()
  const validatedRedirectUrl = validateRedirectUrl(redirectUrl)
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
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    session: data.session,
    user: data.user,
    needsEmailVerification: !data.session,
  })
}