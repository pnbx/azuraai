/**
 * Guest identity for the free tier — pure helpers, no I/O.
 *
 * WHY
 *   The mobile app has no accounts, so "who is this request from" has to be
 *   answered without a session. IP alone is unusable here: Iranian mobile
 *   carriers hand every subscriber behind a CGNAT the same public address, so
 *   an IP cap would let one passenger exhaust the quota for an entire
 *   province, and a VPN rotates it several times an hour. So the client mints
 *   a random UUID and keeps it in localStorage, and that — not the network
 *   address — is the quota key.
 *
 * PRIVACY
 *   The raw UUID never reaches the database. It is salted with a server-side
 *   pepper and hashed, so the stored key reveals nothing about the device and
 *   cannot be reversed. Rotating APP_GUEST_ID_PEPPER resets every guest
 *   counter and makes old rows useless.
 *
 * Server-only: this imports node:crypto. The client half lives in
 * lib/device-id.ts.
 */

import { createHash } from 'node:crypto'

/** Shape the DB sees. Hex sha256, so 64 chars — comfortably over the RPC's
 *  16-char floor, which exists only to reject empty/degenerate keys. */
export type GuestKey = string

/** Matches a canonical UUID, the exact form `crypto.randomUUID()` emits. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Validate the client-supplied device id.
 *
 * Returns the lowercased UUID, or null when it is missing or malformed.
 * Rejecting bad input matters: an unvalidated value would let one caller mint
 * unlimited distinct keys (by sending a new random string per request) and
 * walk straight past the cap.
 */
export function normaliseDeviceId(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!UUID_RE.test(trimmed)) return null
  return trimmed.toLowerCase()
}

/**
 * Hash a device id into a storable guest key.
 *
 * `pepper` is the server secret (APP_GUEST_ID_PEPPER). A fixed placeholder is
 * used when it is unset so the shape stays valid in local dev and tests — the
 * production deploy must set the real value, which `assertGuestPepper`
 * reports on.
 */
export function guestKeyFrom(pepper: string, deviceId: string): GuestKey {
  return createHash('sha256')
    .update(`${pepper}:${deviceId}`)
    .digest('hex')
}

/** True when running with the development placeholder rather than a real secret. */
export function isDefaultPepper(pepper: string | undefined): boolean {
  return !pepper || pepper === DEFAULT_GUEST_PEPPER
}

/**
 * The build shipped without APP_GUEST_ID_PEPPER.
 *
 * It still works — guests are metered — but the keys are unsalted, so anyone
 * who knows a device UUID could recompute its key. Worth a loud log line, not
 * worth failing the chat route over.
 */
export const DEFAULT_GUEST_PEPPER = 'azura-guest-dev-pepper'

/**
 * Resolve the guest key for a request, preferring the device id and falling
 * back to a coarse network fingerprint.
 *
 * The fallback covers clients too old to send the header (an APK installed
 * before this shipped). It is intentionally last-resort: CGNAT makes the
 * fingerprint shared across many real users, so it errs toward metering a few
 * people together rather than letting anyone through unmetered.
 */
export function resolveGuestKey(input: {
  pepper: string | undefined
  deviceId: string | null | undefined
  ip: string | null | undefined
  userAgent: string | null | undefined
}): { key: GuestKey | null; source: 'device' | 'fingerprint' | 'none' } {
  const pepper = input.pepper || DEFAULT_GUEST_PEPPER

  const deviceId = normaliseDeviceId(input.deviceId)
  if (deviceId) {
    return { key: guestKeyFrom(pepper, deviceId), source: 'device' }
  }

  const ip = (input.ip ?? '').trim()
  const ua = (input.userAgent ?? '').trim()
  if (ip || ua) {
    // Prefixed so a fingerprint key can never collide with a device key.
    const key = createHash('sha256')
      .update(`${pepper}:fp:${ip}|${ua}`)
      .digest('hex')
    return { key, source: 'fingerprint' }
  }

  return { key: null, source: 'none' }
}