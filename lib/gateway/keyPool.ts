"use strict";

/**
 * OpenRouter Key Pool
 *
 * Rotates across many OpenRouter API keys so the free app chat survives
 * per-key rate limits (free models: 20 req/min and 50 req/day per key).
 *
 * Design:
 * - Keys live in Supabase (`openrouter_keys`), service-role only. They are
 *   NEVER exposed to clients or bundled into the APK.
 * - `pickOpenRouterKey()` atomically checks out a healthy key via the
 *   `pick_openrouter_key` RPC (SKIP LOCKED, daily rollover, cooldown aware).
 * - On HTTP 429 / quota errors the caller reports the failure and the key
 *   enters a cooldown; the next attempt transparently uses another key.
 */

import { supabaseAdmin } from '@/supabase/admin'

export interface PooledKey {
  keyId: string
  apiKey: string
}

/** How long a 429'd key rests before it is tried again. */
export const KEY_COOLDOWN_MS = 2 * 60 * 1000

/** After this many consecutive hard failures a key is disabled. */
export const MAX_CONSECUTIVE_FAILURES = 5

/** Hard per-key daily cap for the env fallback pool (free tier limit). */
const ENV_KEY_DAILY_CAP = 50

// ─── Env fallback pool (used when the DB table is empty/unreachable) ─────────
// Keys come from OPENROUTER_KEYS (comma-separated). Usage accounting is
// in-memory per serverless instance — best-effort, replaced by the DB pool
// once `openrouter_keys` is seeded.

interface EnvKeyState {
  apiKey: string
  usedToday: number
  day: string
  cooldownUntil: number
  disabled: boolean
}

let envKeyStates: EnvKeyState[] | null = null
let envCursor = 0

function getEnvKeyStates(): EnvKeyState[] {
  const raw = process.env.OPENROUTER_KEYS || ''
  const keys = raw
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.startsWith('sk-or-'))

  if (envKeyStates === null || envKeyStates.length !== keys.length) {
    envKeyStates = keys.map((apiKey) => ({
      apiKey,
      usedToday: 0,
      day: '',
      cooldownUntil: 0,
      disabled: false,
    }))
    envCursor = 0
  }
  return envKeyStates
}

function pickEnvKey(): PooledKey | null {
  const states = getEnvKeyStates()
  if (states.length === 0) return null

  const today = new Date().toISOString().slice(0, 10)
  const now = Date.now()

  for (let i = 0; i < states.length; i++) {
    const idx = (envCursor + i) % states.length
    const s = states[idx]
    if (s.day !== today) {
      s.day = today
      s.usedToday = 0
    }
    if (s.disabled || s.usedToday >= ENV_KEY_DAILY_CAP || s.cooldownUntil > now) {
      continue
    }
    envCursor = (idx + 1) % states.length
    s.usedToday += 1
    return { keyId: `env-${idx}`, apiKey: s.apiKey }
  }
  return null
}

function reportEnvKeyFailure(apiKey: string): void {
  const states = getEnvKeyStates()
  const s = states.find((k) => k.apiKey === apiKey)
  if (s) s.cooldownUntil = Date.now() + KEY_COOLDOWN_MS
}

/**
 * Check out a healthy key from the pool.
 * Primary source: the `openrouter_keys` DB table (atomic, tracked).
 * Fallback: OPENROUTER_KEYS env var (in-memory accounting) when the DB
 * yields nothing — e.g. before the pool table is seeded.
 * Returns null when the pool is exhausted (all keys at daily cap or cooling down).
 */
export async function pickOpenRouterKey(
  dailyLimitCap = 50,
): Promise<PooledKey | null> {
  const { data, error } = await supabaseAdmin.rpc('pick_openrouter_key', {
    p_daily_limit_cap: dailyLimitCap,
  })

  if (error) {
    console.error('[KeyPool] pick RPC failed:', error.message)
  } else {
    const row = Array.isArray(data) ? data[0] : data
    if (row?.id && row?.api_key) {
      return { keyId: String(row.id), apiKey: String(row.api_key) }
    }
    // DB pool empty — fall through to env keys
  }

  return pickEnvKey()
}

/**
 * Mark a key as failed: put it in cooldown and count the failure.
 * When failures accumulate, the key is disabled until re-enabled manually.
 */
export async function reportKeyFailure(keyId: string): Promise<void> {
  // Env-fallback keys (keyId "env-<n>") never touch the DB
  if (keyId.startsWith('env-')) {
    const states = getEnvKeyStates()
    const idx = Number(keyId.slice(4))
    if (states[idx]) reportEnvKeyFailure(states[idx].apiKey)
    return
  }

  const { data } = await supabaseAdmin
    .from('openrouter_keys')
    .select('failure_count')
    .eq('id', keyId)
    .single()

  const failures = (Number(data?.failure_count) || 0) + 1
  const disable = failures >= MAX_CONSECUTIVE_FAILURES

  const { error } = await supabaseAdmin
    .from('openrouter_keys')
    .update({
      failure_count: failures,
      cooldown_until: new Date(Date.now() + KEY_COOLDOWN_MS).toISOString(),
      enabled: disable ? false : undefined,
    })
    .eq('id', keyId)

  if (error) {
    console.error('[KeyPool] failure report failed:', error.message)
    return
  }
  if (disable) {
    console.warn(`[KeyPool] key ${keyId} disabled after ${failures} consecutive failures`)
  }
}

/**
 * Report a successful call (clears the consecutive-failure counter).
 */
export async function reportKeySuccess(keyId: string): Promise<void> {
  // Env-fallback keys have no DB row
  if (keyId.startsWith('env-')) return

  const { error } = await supabaseAdmin
    .from('openrouter_keys')
    .update({ failure_count: 0 })
    .eq('id', keyId)

  if (error) console.error('[KeyPool] success report failed:', error.message)
}

/**
 * Attempt `fn` with pool failover: picks keys until one succeeds or the
 * pool is exhausted. `isRetryable` decides which errors trigger the next key.
 */
export async function withPoolFailover<T>(
  fn: (key: PooledKey) => Promise<T>,
  isRetryable: (error: unknown) => boolean = defaultIsRetryable,
  maxAttempts = 5,
): Promise<{ result: T; key: PooledKey } | { error: unknown; exhausted: true }> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const key = await pickOpenRouterKey()
    if (!key) {
      return { error: lastError ?? new Error('pool_exhausted'), exhausted: true }
    }

    try {
      const result = await fn(key)
      await reportKeySuccess(key.keyId)
      return { result, key }
    } catch (err) {
      lastError = err
      if (isRetryable(err)) {
        await reportKeyFailure(key.keyId)
        continue
      }
      // Non-retryable (e.g. bad request): release the key unharmed.
      throw err
    }
  }

  return { error: lastError, exhausted: true }
}

/** Retryable = rate limits and transient upstream failures. */
export function defaultIsRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const type = (error as Error & { type?: string }).type
    if (type === 'rate_limit_exceeded' || type === 'provider_unavailable') return true
    if (error.message.includes('429')) return true
  }
  return false
}

/**
 * Pool health snapshot (admin diagnostics only; never returns raw keys).
 */
export async function getPoolStats(): Promise<{
  total: number
  enabled: number
  cooling: number
  usedToday: number
  capacityToday: number
}> {
  const { data, error } = await supabaseAdmin
    .from('openrouter_keys')
    .select('enabled, used_today, daily_limit, cooldown_until')

  if (error || !data) {
    return { total: 0, enabled: 0, cooling: 0, usedToday: 0, capacityToday: 0 }
  }

  const now = Date.now()
  const enabled = data.filter((k) => k.enabled)
  return {
    total: data.length,
    enabled: enabled.length,
    cooling: enabled.filter(
      (k) => k.cooldown_until && new Date(k.cooldown_until).getTime() > now
    ).length,
    usedToday: data.reduce((sum, k) => sum + (Number(k.used_today) || 0), 0),
    capacityToday: enabled.reduce(
      (sum, k) => sum + Math.min(Number(k.daily_limit) || 50, 50),
      0
    ),
  }
}
