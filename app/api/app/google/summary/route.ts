"use strict";

/**
 * GET /api/app/google/summary
 *
 * One-call "daily brief": Gmail unread summary + today's calendar events
 * for the connected Google account.
 */

import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth/server'
import {
  getValidAccessToken,
  fetchGmailSummary,
  fetchCalendarToday,
} from '@/lib/integrations/google'

export const runtime = 'nodejs'

export async function GET() {
  let user
  try {
    user = await getServerUser()
  } catch {
    return NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 })
  }

  const accessToken = await getValidAccessToken(user.id)
  if (!accessToken) {
    return NextResponse.json(
      { success: false, error: 'not_connected' },
      { status: 400 }
    )
  }

  const [gmail, calendar] = await Promise.allSettled([
    fetchGmailSummary(accessToken),
    fetchCalendarToday(accessToken),
  ])

  return NextResponse.json({
    success: true,
    gmail: gmail.status === 'fulfilled' ? gmail.value : null,
    gmailError: gmail.status === 'rejected' ? String(gmail.reason).slice(0, 100) : null,
    calendar: calendar.status === 'fulfilled' ? calendar.value : null,
    calendarError:
      calendar.status === 'rejected' ? String(calendar.reason).slice(0, 100) : null,
  })
}
