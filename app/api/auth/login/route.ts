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
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { email, password, redirectUrl } = body as { email?: string; password?: string; redirectUrl?: string }

  if (!email || !password) {
    return NextResponse.json(
      { error: 'Email and password are required' },
      { status: 400 }
    )
  }

  const supa = createSupabaseBrowserClient()
  const { error, data } = await supa.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  // Use the validated redirectUrl from request or default to dashboard
  const redirectTo = validateRedirectUrl(redirectUrl ?? null)

  return NextResponse.json({
    success: true,
    session: data.session,
    redirectTo,
  })
}