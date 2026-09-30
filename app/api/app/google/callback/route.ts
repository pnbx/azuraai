"use strict";

/**
 * GET /api/app/google/callback
 *
 * OAuth redirect target. Verifies state, exchanges the code, stores tokens,
 * then redirects back to the integrations page with a result flag.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { getServerUser } from '@/lib/auth/server'
import {
  exchangeGoogleCode,
  saveGoogleTokens,
} from '@/lib/integrations/google'

export const runtime = 'nodejs'

function verifyState(state: string, userId: string): boolean {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8')
    const [stateUser, ts, sig] = decoded.split('.')
    if (stateUser !== userId) return false

    // 10-minute window
    if (Math.abs(Date.now() - Number(ts)) > 10 * 60 * 1000) return false

    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    const expected = createHmac('sha256', secret)
      .update(`${stateUser}.${ts}`)
      .digest('hex')
      .slice(0, 32)
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const oauthError = req.nextUrl.searchParams.get('error')

  if (oauthError) {
    return NextResponse.redirect(`${origin}/app/integrations?google=denied`)
  }
  if (!code || !state) {
    return NextResponse.redirect(`${origin}/app/integrations?google=invalid`)
  }

  let user
  try {
    user = await getServerUser()
  } catch {
    return NextResponse.redirect(`${origin}/auth/login`)
  }

  if (!verifyState(state, user.id)) {
    return NextResponse.redirect(`${origin}/app/integrations?google=state_mismatch`)
  }

  try {
    const redirectUri = new URL('/api/app/google/callback', origin).toString()
    const tokens = await exchangeGoogleCode(code, redirectUri)
    await saveGoogleTokens(user.id, tokens)
    return NextResponse.redirect(`${origin}/app/integrations?google=connected`)
  } catch (err) {
    console.error('[GoogleOAuth] callback failed:', err)
    return NextResponse.redirect(`${origin}/app/integrations?google=exchange_failed`)
  }
}
