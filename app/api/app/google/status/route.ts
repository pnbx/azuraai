"use strict";

/**
 * GET /api/app/google/status
 *
 * Returns whether the current user has connected their Google account.
 */

import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth/server'
import {
  getGoogleConnectionInfo,
  isGoogleConfigured,
} from '@/lib/integrations/google'

export const runtime = 'nodejs'

export async function GET() {
  let user
  try {
    user = await getServerUser()
  } catch {
    return NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 })
  }

  const info = await getGoogleConnectionInfo(user.id)
  return NextResponse.json({
    success: true,
    connected: info.connected,
    googleEmail: info.googleEmail,
    serverConfigured: isGoogleConfigured(),
  })
}
