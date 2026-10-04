/**
 * Free-tier quota enforcement for the accountless app.
 *
 * One place decides who is over their daily allowance, shared by the chat and
 * research routes so the two cannot drift apart. They already could: research
 * costs several web searches plus a long synthesis and is by far the most
 * expensive request this app makes, so a cap that only guarded chat was a cap
 * with a hole in it.
 *
 * Two counters, deliberately:
 *
 *   signed-in  APP_CHAT_DAILY_CAP       (default 30)  key = auth.uid
 *   guest      APP_CHAT_GUEST_DAILY_CAP (default 10)  key = hashed device id
 *
 * Guests get the lower number on purpose. The app has no sign-up, so a guest
 * cap is the only thing standing between a stranger and the upstream provider;
 * keeping it under the signed-in cap means creating an account is worth
 * something rather than being strictly worse.
 *
 * FAIL-OPEN, DELIBERATELY. If the RPC is missing or errors we allow the
 * request and log loudly, exactly as the routes did before. A brief database
 * blip should not lock every real user out of the app mid-demo. The cost is
 * that a permanently-missing function degrades to unlimited again — which is
 * why the error names the migration to apply.
 */

import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/supabase/admin'
import {
  DEFAULT_GUEST_PEPPER,
  isDefaultPepper,
  resolveGuestKey,
} from '@/lib/guest-identity'

/** Signed-in users per day. */
export function signedInDailyCap(): number {
  return readCap('APP_CHAT_DAILY_CAP', 30)
}

/** Guests per day. */
export function guestDailyCap(): number {
  return readCap('APP_CHAT_GUEST_DAILY_CAP', 10)
}

/**
 * A cap of 0 or a negative number is treated as "no limit configured" and
 * falls back to the default. Allowing it through would silently disable the
 * only quota this app has, which is the exact failure mode this file exists to
 * prevent — so the safe reading wins.
 */
function readCap(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

/** Best-effort client address. Vercel sets x-forwarded-for; local dev rarely does. */
export function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip') ?? req.headers.get('x-vercel-forwarded-for')
}

export type QuotaDecision =
  | { allowed: true }
  | { allowed: false; used: number; cap: number }

/**
 * Charge one message against today's allowance and report whether it fit.
 *
 * Signed-in users are metered by account, everyone else by device. The guest
 * path never trusts the client-supplied id beyond `normaliseDeviceId`, which
 * only accepts a canonical UUID — otherwise a caller could send a fresh random
 * string per request and mint an unlimited number of counters.
 */
export async function consumeDailyQuota(
  req: NextRequest,
  user: { id: string } | null,
  routeLabel: string
): Promise<QuotaDecision> {
  if (user) {
    const cap = signedInDailyCap()
    return await charge({
      rpc: 'increment_app_chat_usage',
      params: { p_user_id: user.id, p_daily_cap: cap },
      cap,
      routeLabel,
    })
  }

  const pepper = process.env.APP_GUEST_ID_PEPPER
  if (isDefaultPepper(pepper)) {
    console.warn(
      '[FreeTier] APP_GUEST_ID_PEPPER is unset — guest quota keys are unsalted. ' +
        'Guests are still metered, but set APP_GUEST_ID_PEPPER in the deploy env.'
    )
  }

  const { key, source } = resolveGuestKey({
    pepper: pepper || DEFAULT_GUEST_PEPPER,
    deviceId: req.headers.get('x-azura-device'),
    ip: clientIp(req),
    userAgent: req.headers.get('user-agent'),
  })

  if (!key) {
    // No identity at all (health check, curl with no UA on some hosts). Do not
    // charge a global bucket — that would turn one junk request into a
    // denial of service for every real guest.
    console.warn(
      '[FreeTier] request carried no usable identity; serving unmetered ' +
        `(${routeLabel}).`
    )
    return { allowed: true }
  }

  const cap = guestDailyCap()
  if (source === 'fingerprint') {
    console.warn(
      '[FreeTier] no x-azura-device header; metered by network fingerprint ' +
        `(shared behind carrier NAT). ${routeLabel}.`
    )
  }

  return await charge({
    rpc: 'increment_app_guest_chat_usage',
    params: { p_guest_id: key, p_daily_cap: cap },
    cap,
    routeLabel,
  })
}

async function charge(input: {
  rpc: string
  params: Record<string, unknown>
  cap: number
  routeLabel: string
}): Promise<QuotaDecision> {
  const { data, error } = await supabaseAdmin.rpc(input.rpc, input.params)
  const row = (Array.isArray(data) ? data[0] : data) as
    | { allowed?: boolean; used?: number; cap?: number }
    | null

  if (error) {
    console.error(
      `[${input.routeLabel}] usage RPC ${input.rpc} failed (allowing request, ` +
        `DAILY CAP NOT ENFORCED):`,
      error.code,
      error.message,
      error.code === 'PGRST202'
        ? '— apply supabase/migrations/20260929000000_app_free_gateway.sql ' +
          'and supabase/migrations/20261004000000_app_guest_chat_quota.sql'
        : ''
    )
    return { allowed: true }
  }

  if (!row?.allowed) {
    return {
      allowed: false,
      used: row?.used ?? input.cap,
      cap: row?.cap ?? input.cap,
    }
  }

  return { allowed: true }
}