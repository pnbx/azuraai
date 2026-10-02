/**
 * Per-user rate limiting (session-authenticated inference)
 *
 * Sliding-window counter enforced atomically via PostgreSQL RPC.
 * Separate from per-API-key rate limiting to keep limits independent.
 */

import { supabaseAdmin } from '@/supabase/admin'

export interface UserRateLimitResult {
  allowed: boolean
  currentCount: number
  limit: number
  retryAfterSeconds?: number
}

/**
 * Check and atomically increment the rate-limit counter for a user.
 *
 * @param userId        The users.id to rate-limit against
 * @param periodSeconds Window size in seconds (default 60)
 * @param maxRequests   Max requests allowed per window (default 20 for free tier)
 */
export async function checkUserRateLimit(
  userId: string,
  periodSeconds = 60,
  maxRequests = 20,
): Promise<UserRateLimitResult> {
  const { data, error } = await supabaseAdmin.rpc('check_and_increment_user_rate_limit', {
    p_user_id: userId,
    p_period_seconds: periodSeconds,
    p_max_requests: maxRequests,
  })

  if (error) {
    console.error('[UserRateLimit] RPC failed, failing open:', error.message)
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
