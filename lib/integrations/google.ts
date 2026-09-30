"use strict";

/**
 * Google Integrations (Gmail / Calendar)
 *
 * OAuth 2.0 authorization-code flow for the app's "Connect Google" feature.
 * One-click auth from the app; tokens stored per-user in Supabase.
 *
 * Scopes requested (read-mostly, minimal):
 *  - gmail.readonly      — summarize unread mail, draft suggestions
 *  - calendar.events.readonly — "what's on today"
 *  - userinfo.email      — display which account is connected
 *
 * Setup required by the operator (one time):
 *  - Google Cloud project + OAuth client (Web application)
 *  - Authorized redirect URI: https://www.azuraai.ir/api/app/google/callback
 *  - Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *  - Until the app is verified by Google, only test users can connect.
 */

import { supabaseAdmin } from '@/supabase/admin'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
].join(' ')

export interface GoogleTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date
}

// ─── OAuth flow ──────────────────────────────────────────────────────────────

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function buildGoogleAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID as string,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string
): Promise<GoogleTokens & { googleEmail: string | null; scope: string }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`google_token_exchange_failed: ${detail.slice(0, 200)}`)
  }
  const data = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope?: string
    id_token?: string
  }

  const googleEmail = data.id_token ? extractEmailFromIdToken(data.id_token) : null

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    googleEmail,
    scope: data.scope ?? '',
  }
}

function extractEmailFromIdToken(idToken: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')
    ) as { email?: string }
    return payload.email ?? null
  } catch {
    return null
  }
}

// ─── Token storage ───────────────────────────────────────────────────────────

export async function saveGoogleTokens(
  userId: string,
  tokens: {
    accessToken: string
    refreshToken: string | null
    expiresAt: Date
    googleEmail: string | null
    scope: string
  }
): Promise<void> {
  const { error } = await supabaseAdmin.from('google_oauth_tokens').upsert({
    user_id: userId,
    google_email: tokens.googleEmail,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: tokens.expiresAt.toISOString(),
    scope: tokens.scope,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(`google_token_save_failed: ${error.message}`)
}

export async function clearGoogleTokens(userId: string): Promise<void> {
  await supabaseAdmin.from('google_oauth_tokens').delete().eq('user_id', userId)
}

export interface GoogleConnectionInfo {
  connected: boolean
  googleEmail: string | null
}

export async function getGoogleConnectionInfo(
  userId: string
): Promise<GoogleConnectionInfo> {
  const { data } = await supabaseAdmin
    .from('google_oauth_tokens')
    .select('google_email')
    .eq('user_id', userId)
    .maybeSingle()

  return { connected: Boolean(data), googleEmail: data?.google_email ?? null }
}

// ─── Valid access token (with refresh) ───────────────────────────────────────

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('google_oauth_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data?.access_token) return null

  const expiresAt = data.expires_at ? new Date(data.expires_at) : null
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 60_000

  if (!needsRefresh) return data.access_token

  if (!data.refresh_token) return data.access_token // best effort

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
      refresh_token: data.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) return null

  const refreshed = (await res.json()) as { access_token: string; expires_in: number }
  await supabaseAdmin
    .from('google_oauth_tokens')
    .update({
      access_token: refreshed.access_token,
      expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  return refreshed.access_token
}

// ─── Gmail / Calendar fetchers ───────────────────────────────────────────────

export interface GmailSummary {
  unreadCount: number
  messages: Array<{ from: string; subject: string; date: string }>
}

export async function fetchGmailSummary(accessToken: string): Promise<GmailSummary> {
  const listRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=label:UNREAD',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!listRes.ok) throw new Error('gmail_list_failed')

  const list = (await listRes.json()) as { messages?: Array<{ id: string }> }
  const ids = (list.messages ?? []).slice(0, 5)

  const messages = await Promise.all(
    ids.map(async (m) => {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) return { from: '(unknown)', subject: '(unknown)', date: '' }
      const data = (await res.json()) as {
        payload?: { headers?: Array<{ name: string; value: string }> }
      }
      const header = (name: string) =>
        data.payload?.headers?.find((h) => h.name === name)?.value ?? ''
      return { from: header('From'), subject: header('Subject'), date: header('Date') }
    })
  )

  return { unreadCount: list.messages?.length ?? 0, messages }
}

export interface CalendarToday {
  events: Array<{ summary: string; start: string; end: string }>
}

export async function fetchCalendarToday(accessToken: string): Promise<CalendarToday> {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(startOfDay)
  endOfDay.setDate(endOfDay.getDate() + 1)

  const params = new URLSearchParams({
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '10',
  })

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error('calendar_fetch_failed')

  const data = (await res.json()) as {
    items?: Array<{
      summary?: string
      start?: { dateTime?: string; date?: string }
      end?: { dateTime?: string; date?: string }
    }>
  }

  return {
    events: (data.items ?? []).map((e) => ({
      summary: e.summary ?? '(untitled)',
      start: e.start?.dateTime ?? e.start?.date ?? '',
      end: e.end?.dateTime ?? e.end?.date ?? '',
    })),
  }
}
