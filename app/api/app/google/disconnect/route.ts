"use strict";

/**
 * POST /api/app/google/disconnect
 *
 * Removes the user's stored Google tokens.
 */

import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth/server'
import { clearGoogleTokens } from '@/lib/integrations/google'

export const runtime = 'nodejs'

export async function POST() {
  let user
  try {
    user = await getServerUser()
  } catch {
    return NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 })
  }

  await clearGoogleTokens(user.id)
  return NextResponse.json({ success: true })
}
