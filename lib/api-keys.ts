/**
 * API Key Management Utilities
 *
 * - Generates cryptographically secure random secrets.
 * - Hashes secrets with SHA-256 for storage.
 * - Never returns the raw secret after creation.
 * - Supports revocation.
 */

import { createHash, randomBytes } from 'crypto'

/**
 * Generate a high-entropy API key secret (256-bit = 32 bytes).
 * Returns the raw secret and its SHA-256 hex hash.
 */
export function generateApiKeySecret(): { secret: string; hash: string } {
  const secret = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(secret, 'utf8').digest('hex')
  return { secret, hash }
}

/**
 * Verify a presented API key secret against a stored hash.
 * @param secretIncoming The raw secret string provided by the client
 * @param storedHash The SHA-256 hex hash from the database
 * @returns true if the secret matches, false otherwise
 */
export function verifyApiKeySecret(
  secretIncoming: string,
  storedHash: string
): boolean {
  const computedHash = createHash('sha256').update(secretIncoming, 'utf8').digest('hex')
  return computedHash === storedHash
}

/**
 * Revoke an API key by setting its revoked_at timestamp.
 * This is a server-side only operation; the database row is updated
 * but the raw secret is never exposed.
 */
export interface RevokeApiKeyResult {
  success: boolean
  keyId: string
}

/**
 * Format an API key for display (shown only once after creation).
 * The prefix "az_" makes keys easily recognizable.
 */
export function formatApiKeyForDisplay(rawSecret: string): string {
  // rawSecret is already base64url encoded; we just add the prefix
  return `az_${rawSecret}`
}

const apiKeysExport = {
  generateApiKeySecret,
  verifyApiKeySecret,
  formatApiKeyForDisplay,
}

export default apiKeysExport