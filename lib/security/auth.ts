/**
 * API Key authentication
 *
 * Verifies incoming API keys by hashing the presented secret with SHA-256
 * and looking up the hash in the api_keys table. Returns the key metadata
 * and associated user for downstream enforcement.
 */

import { createHash } from 'crypto'
import { supabaseAdmin } from '@/supabase/admin'

export interface ApiKeyAuth {
  keyId: string
  userId: string
  scope: string
}

/**
 * Authenticate an API key from the Authorization header.
 *
 * @param authHeader The raw Authorization header value (e.g. "Bearer az_xxx")
 * @returns Key metadata if valid, null otherwise
 */
export async function authenticateApiKey(authHeader: string | null): Promise<ApiKeyAuth | null> {
  if (!authHeader) return null

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null

  const rawSecret = parts[1]
  if (!rawSecret.startsWith('az_') || rawSecret.length <= 3) return null

  const secret = rawSecret.slice(3) // strip az_ prefix
  const keyHash = createHash('sha256').update(secret, 'utf8').digest('hex')

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .select('id, user_id, scope, revoked_at, expires_at, users!inner(id, is_active)')
    .eq('key_hash', keyHash)
    .single()

  if (error || !data) return null

  // Reject revoked keys
  if (data.revoked_at) return null

  // Reject expired keys
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null

  // Reject inactive users
  const user = data.users as unknown as { id: string; is_active: boolean }
  if (!user?.is_active) return null

  return {
    keyId: data.id,
    userId: data.user_id,
    scope: data.scope,
  }
}

/**
 * Update the last_used_at timestamp for an API key.
 * Fire-and-forget — errors are logged but not propagated.
 */
export async function touchKeyLastUsed(keyId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyId)

  if (error) {
    console.error('[Auth] Failed to update last_used_at:', error.message)
  }
}
