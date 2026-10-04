/**
 * A stable anonymous device id for the free tier.
 *
 * The app has no accounts, so the server has nothing to meter against unless
 * the client volunteers a stable identifier. This mints one UUID, keeps it in
 * localStorage, and hands it back forever after. Deleting site data or
 * reinstalling resets the counter — acceptable for a free daily allowance,
 * and preferable to metering on an IP that a carrier or VPN shares with
 * hundreds of strangers.
 *
 * Client-only (no server imports) so it can be bundled for the browser and
 * the Capacitor WebView. The server half — hashing it before storage — lives
 * in lib/guest-identity.ts.
 */

const STORAGE_KEY = 'azura-device-id'

/**
 * Returns the device id, creating one on first call.
 *
 * Never throws: private-mode Safari and some WebViews make localStorage
 * unavailable, and a chat screen must still render. Falling back to a
 * per-session id degrades the quota to per-session rather than breaking chat.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return ''

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY)
    if (existing) return existing

    const fresh =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : fallbackUuid()
    window.localStorage.setItem(STORAGE_KEY, fresh)
    return fresh
  } catch {
    return fallbackUuid()
  }
}

/**
 * randomUUID needs a secure context. On plain http:// (a LAN dev server, or a
 * Capacitor scheme it doesn't trust) it is undefined, so assemble a v4 UUID
 * by hand from getRandomValues.
 */
function fallbackUuid(): string {
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  // Version 4, variant 1.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`
}