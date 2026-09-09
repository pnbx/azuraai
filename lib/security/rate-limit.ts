/**
 * Per-API-key rate limiting
 *
 * Sliding-window counter enforced atomically via PostgreSQL RPC.
 * One RPC call per check — the DB handles the upsert + comparison.
 */

import { supabaseAdmin } from '@/supabase/admin'

export interface RateLimitResult {
  allowed: boolean
  currentCount: number
  limit: number
  retryAfterSeconds?: number
}

/**
 * Check and atomically increment the rate-limit counter for an API key.
 *
 * @param keyId       The api_keys.id to rate-limit against
 * @param periodSeconds  Window size in seconds (default 60)
 * @param maxRequests Max requests allowed per window
 */
export async function checkRateLimit(
  keyId: string,
  periodSeconds = 60,
  maxRequests = 60,
): Promise<RateLimitResult> {
  const { data, error } = await supabaseAdmin.rpc('check_and_increment_rate_limit', {
    p_key_id: keyId,
    p_period_seconds: periodSeconds,
    p_max_requests: maxRequests,
  })

  if (error) {
    // Fail-open: if the RPC fails, allow the request but log
    console.error('[RateLimit] RPC failed, failing open:', error.message)
    return { allowed: true, currentCount: 0, limit: maxRequests }
  }

  const row = data?.[0]
  if (!row) {
    return { allowed: true, currentCount: 0, limit: maxRequests }
  }

  return {
    allowed: row.allowed,
    currentCount: row.current_count,
    limit: row.limit_val,
    retryAfterSeconds: row.allowed ? undefined : periodSeconds,
  }
}

export interface QuotaResult {
  allowed: boolean
  usedTokens: number
  limit: number | null
  resetAt?: string
}

/**
 * Check the monthly token quota for a user.
 *
 * @param userId    The users.id to check quota for
 * @param maxTokens Maximum tokens per month (null = unlimited)
 */
export async function checkTokenQuota(
  userId: string,
  maxTokens: number | null = null,
): Promise<QuotaResult> {
  const { data, error } = await supabaseAdmin.rpc('check_token_quota', {
    p_user_id: userId,
    p_max_tokens: maxTokens,
  })

  if (error) {
    console.error('[Quota] RPC failed, failing open:', error.message)
    return { allowed: true, usedTokens: 0, limit: maxTokens }
  }

  const row = data?.[0]
  if (!row) {
    return { allowed: true, usedTokens: 0, limit: maxTokens }
  }

  // Compute month-end reset time
  const now = new Date()
  const resetAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  )

  return {
    allowed: row.allowed,
    usedTokens: Number(row.used_tokens),
    limit: row.quota_limit != null ? Number(row.quota_limit) : null,
    resetAt: resetAt.toISOString(),
  }
}
