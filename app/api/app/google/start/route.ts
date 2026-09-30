"use strict";

/**
 * GET /api/app/google/start
 *
 * Begins the Google OAuth flow for the logged-in user. State is a signed,
 * short-lived value bound to the user id to prevent CSRF.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { getServerUser } from '@/lib/auth/server'
import { buildGoogleAuthUrl, isGoogleConfigured } from '@/lib/integrations/google'

export const runtime = 'nodejs'

function signState(userId: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  const payload = `${userId}.${Date.now()}`
  const sig = createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32)
  return Buffer.from(`${payload}.${sig}`).toString('base64url')
}

export async function GET(req: NextRequest) {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { success: false, error: 'google_not_configured' },
      { status: 501 }
    )
  }

  let user
  try {
    user = await getServerUser()
  } catch {
    return NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 })
  }

  const redirectUri = new URL('/api/app/google/callback', req.nextUrl.origin).toString()
  const authUrl = buildGoogleAuthUrl(signState(user.id), redirectUri)
  return NextResponse.redirect(authUrl)
}
