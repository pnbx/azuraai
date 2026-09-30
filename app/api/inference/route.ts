/**
 * Phase 10 Inference API — Full enforcement pipeline
 *
 * 14-step execution path:
 *   1.  Parse request body
 *   2.  Authenticate API key (or fall back to session auth)
 *   3.  Verify key is active (not revoked, not expired)
 *   4.  Verify user account is active
 *   5.  Resolve model via model_catalog
 *   6.  Resolve provider
 *   7.  Resolve authoritative pricing
 *   8.  Enforce rate limits
 *   9.  Enforce token quota
 *  10.  Reserve funds atomically
 *  11.  Call provider via gateway
 *  12.  Extract authoritative token usage from response
 *  13.  Settle reservation (refund surplus / debit overage)
 *  14.  Record usage idempotently, return response
 *
 * Auth:
 *   - Primary:   Authorization: Bearer az_xxx (API key)
 *   - Fallback:  Supabase session cookie (backward compat)
 *
 * Response codes:
 *   200 — success
 *   400 — bad request / missing fields
 *   401 — unauthenticated
 *   402 — insufficient balance
 *   403 — model not found / unavailable
 *   409 — duplicate request (idempotency)
 *   429 — rate limited / quota exceeded
 *   502 — upstream provider error
 *   500 — internal error
 */

import { NextResponse } from 'next/server'
import { requireServerUser } from '@/lib/auth/server'
import { resolveModel } from '@/lib/provider/model-catalog'
import {
  ProviderError,
  ProviderOperation,
  ProviderRequest,
} from '@/lib/provider/types'
import { executeThroughGateway } from '@/lib/gateway/gateway'
import { authenticateApiKey, touchKeyLastUsed } from '@/lib/security/auth'
import { checkRateLimit, checkTokenQuota } from '@/lib/security/rate-limit'
import { checkUserRateLimit } from '@/lib/security/user-rate-limit'
import { reserveFunds, settleReservation, releaseReservation } from '@/lib/security/reservation'
import {
  resolvePricing,
  estimateReservationCost,
  calculateActualCost,
  recordUsage,
  extractTokenUsage,
} from '@/lib/security/usage'

// ─── Constants ───────────────────────────────────────────────────────────────

const RATE_LIMIT_MAX_REQUESTS = 60
const RATE_LIMIT_PERIOD_SECONDS = 60
const MAX_TOKENS_PER_MONTH = 100_000_000 // 100M tokens/month default quota
const ESTIMATED_INPUT_TOKENS = 1000      // for pre-call reservation estimate
const MARGIN_PERCENT = 0                 // reserved = estimated * (1 + margin%)

// Free tier limits (session-authenticated, no wallet charge)
const FREE_TIER_MAX_REQUESTS = 20        // requests per minute
const FREE_TIER_RATE_LIMIT_PERIOD = 60   // seconds
const FREE_TIER_MAX_TOKENS_PER_MONTH = 1_000_000 // 1M tokens/month

const VALID_OPERATIONS = new Set<ProviderOperation>([
  'generate',
  'generate-image',
  'transcribe',
  'embed',
  'chat',
  'stream',
])

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 })
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status })
}

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  const startTime = Date.now()
  let keyId: string | null = null
  let userId: string | null = null

  // ── Step 1: Parse body ─────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return invalidRequest('Invalid JSON body')
  }

  if (!isObject(body)) {
    return invalidRequest('Request body must be an object')
  }

  if (typeof body.model !== 'string' || body.model.trim().length === 0) {
    return invalidRequest('Model is required and must be a string')
  }

  if (body.model.length > 256) {
    return invalidRequest('Model name must not exceed 256 characters')
  }

  if (typeof body.operation !== 'string' || body.operation.trim().length === 0) {
    return invalidRequest('Operation is required and must be a string')
  }

  const operation = body.operation.trim() as ProviderOperation
  if (!VALID_OPERATIONS.has(operation)) {
    return invalidRequest('Operation is not supported')
  }

  if (body.parameters !== undefined && !isObject(body.parameters)) {
    return invalidRequest('Parameters must be an object')
  }

  // ── Input size limits (DoS prevention) ──────────────────────────────────────
  const MAX_INPUT_SIZE = 100_000  // 100KB
  const MAX_PARAMS_SIZE = 10_000  // 10KB

  if (body.input !== undefined) {
    const inputStr = JSON.stringify(body.input)
    if (inputStr.length > MAX_INPUT_SIZE) {
      return invalidRequest('Input payload exceeds 100KB limit')
    }
  }

  if (body.parameters !== undefined) {
    const paramsStr = JSON.stringify(body.parameters)
    if (paramsStr.length > MAX_PARAMS_SIZE) {
      return invalidRequest('Parameters payload exceeds 10KB limit')
    }
  }

  const modelSlug = body.model.trim()
  const requestId = crypto.randomUUID()

  // ── Step 2: Authenticate ───────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization')
  const apiKeyAuth = await authenticateApiKey(authHeader)

  if (apiKeyAuth) {
    // API key auth (primary)
    keyId = apiKeyAuth.keyId
    userId = apiKeyAuth.userId
  } else {
    // Session auth fallback
    try {
      const user = await requireServerUser()
      userId = user.id
    } catch {
      console.warn(`[Inference] Auth failed: no valid session or API key [req=${requestId}]`)
      return jsonError('Unauthenticated — provide an API key or session', 401)
    }
  }

  if (!userId) {
    console.warn(`[Inference] Auth failed: no userId resolved [req=${requestId}]`)
    return jsonError('Unauthenticated', 401)
  }

  console.info(`[Inference] Request started [req=${requestId}] user=${userId} key=${keyId ?? 'session'} model=${modelSlug} op=${operation}`)

  // ── Steps 3–4: Key & user status verified by authenticateApiKey ────────────
  // (revoked_at, expires_at, is_active checks happen inside authenticateApiKey)
  // For session auth, user is already verified by requireServerUser.

  // ── Step 5: Resolve model ──────────────────────────────────────────────────
  let resolved
  try {
    resolved = await resolveModel(modelSlug)
  } catch (error) {
    return jsonError(
      error instanceof ProviderError ? error.message : 'Model resolution failed',
      403,
    )
  }

  // ── Step 6: Resolve provider (already part of resolveModel) ────────────────
  // resolved.provider and resolved.providerConfig are available.

  // ── Step 7: Resolve pricing ────────────────────────────────────────────────
  const pricing = await resolvePricing(resolved.model.id)

  // ── Step 8: Enforce rate limits ────────────────────────────────────────────
  if (keyId) {
    // API key auth: per-key rate limit
    const rateLimit = await checkRateLimit(
      keyId,
      RATE_LIMIT_PERIOD_SECONDS,
      RATE_LIMIT_MAX_REQUESTS,
    )

    if (!rateLimit.allowed) {
      console.warn(`[Inference] Rate limit exceeded (per-key) [req=${requestId}] key=${keyId}`)
      return jsonError('Rate limit exceeded', 429)
    }
  } else {
    // Session auth: per-user rate limit (free tier)
    const userRateLimit = await checkUserRateLimit(
      userId,
      FREE_TIER_RATE_LIMIT_PERIOD,
      FREE_TIER_MAX_REQUESTS,
    )

    if (!userRateLimit.allowed) {
      console.warn(`[Inference] Rate limit exceeded (free tier) [req=${requestId}] user=${userId}`)
      return jsonError('Rate limit exceeded — free tier limit', 429)
    }
  }

  // ── Step 8b: Validate operation against model capabilities ─────────────────
  if (Array.isArray(resolved.model.capabilities)) {
    if (!resolved.model.capabilities.includes(operation)) {
      console.warn(`[Inference] Unsupported operation '${operation}' for model '${modelSlug}' [req=${requestId}]`)
      return jsonError(
        `Operation '${operation}' is not supported by model '${modelSlug}'`,
        403,
      )
    }
  } else if (resolved.model.capabilities && typeof resolved.model.capabilities === 'object') {
    if (!(resolved.model.capabilities as Record<string, unknown>)[operation]) {
      console.warn(`[Inference] Unsupported operation '${operation}' for model '${modelSlug}' [req=${requestId}]`)
      return jsonError(
        `Operation '${operation}' is not supported by model '${modelSlug}'`,
        403,
      )
    }
  }

  // ── Step 9: Enforce token quota ────────────────────────────────────────────
  const quotaLimit = keyId ? MAX_TOKENS_PER_MONTH : FREE_TIER_MAX_TOKENS_PER_MONTH
  const quota = await checkTokenQuota(userId, quotaLimit)
  if (!quota.allowed) {
    console.warn(`[Inference] Token quota exceeded [req=${requestId}] user=${userId} limit=${quotaLimit}`)
    return jsonError('Monthly token quota exceeded', 429)
  }

  // ── Step 10: Reserve funds ─────────────────────────────────────────────────
  let reservationId: string | null = null

  if (pricing) {
    const estimatedCost = Math.ceil(
      estimateReservationCost(pricing, ESTIMATED_INPUT_TOKENS) * (100 + MARGIN_PERCENT) / 100,
    )

    if (keyId) {
      const reserveResult = await reserveFunds(userId, keyId, requestId, estimatedCost)

      if (!reserveResult.success) {
        return jsonError('Insufficient wallet balance', 402)
      }

      reservationId = reserveResult.reservationId
    }
  }

  // ── Step 11: Call provider ─────────────────────────────────────────────────
  const providerRequest: ProviderRequest = {
    provider: resolved.provider.config.id,
    model: resolved.model.provider_model_id,
    input: body.input ?? {},
    operation,
    parameters: body.parameters ?? {},
    userId,
    requestId,
  }

  let gatewayResponse
  try {
    gatewayResponse = await executeThroughGateway(providerRequest)
  } catch (error) {
    const isProviderError = error instanceof ProviderError
    console.error(`[Inference] Provider error [req=${requestId}] provider=${resolved.provider.config.id} error=${isProviderError ? error.message : 'Unknown'}`)

    // Record failed usage
    await recordUsage({
      requestId,
      userId,
      provider: resolved.provider.config.id,
      upstreamModelId: resolved.model.provider_model_id,
      azuraModelId: resolved.model.azura_model_id,
      tokens: { inputTokens: 0, outputTokens: 0 },
      upstreamCost: 0,
      markup: 0,
      customerCharge: 0,
      pricingRuleVersion: pricing?.ruleVersion ?? 0,
      status: 'failed',
      statusDetail: isProviderError ? error.message : 'Provider call failed',
      responseMs: Date.now() - startTime,
    })

    // Release reservation
    if (reservationId) {
      await releaseReservation(reservationId)
    }

    const status = 502
    return jsonError(
      isProviderError ? error.message : 'Upstream provider error',
      status,
    )
  }

  // ── Step 12: Extract token usage ───────────────────────────────────────────
  const tokens = extractTokenUsage(
    gatewayResponse.providerResponse.metadata as Record<string, unknown> | undefined,
  )

  // Token accounting floor: if provider reports zero tokens, apply minimum
  // This prevents provider bugs from resulting in zero-cost inference
  const MIN_INPUT_TOKENS = 1
  const MIN_OUTPUT_TOKENS = 1
  if (tokens.inputTokens === 0 && tokens.outputTokens === 0) {
    console.warn(`[Inference] Provider returned zero tokens — applying minimum floor [req=${requestId}]`)
    tokens.inputTokens = MIN_INPUT_TOKENS
    tokens.outputTokens = MIN_OUTPUT_TOKENS
  }

  // ── Step 13: Settle reservation ────────────────────────────────────────────
  if (pricing && reservationId) {
    const actualCost = calculateActualCost(pricing, tokens)
    const settleResult = await settleReservation(reservationId, actualCost, tokens.inputTokens, tokens.outputTokens)
    if (!settleResult.success) {
      console.error(`[Inference] Settlement FAILED [req=${requestId}] reservation=${reservationId} — recording unsettled usage`)
    }
  } else if (reservationId) {
    // No pricing — release the full reservation
    await releaseReservation(reservationId)
  }

  // ── Step 14: Record usage & update key ─────────────────────────────────────
  // Record usage for ALL successful requests (including free-tier) for audit trail
  const actualCost = pricing ? calculateActualCost(pricing, tokens) : 0
  await recordUsage({
    requestId,
    userId,
    provider: resolved.provider.config.id,
    upstreamModelId: resolved.model.provider_model_id,
    azuraModelId: resolved.model.azura_model_id,
    tokens,
    upstreamCost: actualCost,
    markup: 0,
    customerCharge: pricing ? actualCost : 0,
    pricingRuleVersion: pricing?.ruleVersion ?? 0,
    status: 'succeeded',
    responseMs: Date.now() - startTime,
  })

  if (keyId) {
    await touchKeyLastUsed(keyId)
  }

  console.info(`[Inference] Request completed [req=${requestId}] user=${userId} model=${modelSlug} op=${operation} status=success tokens=${tokens.inputTokens + tokens.outputTokens} ms=${Date.now() - startTime}`)

  return NextResponse.json(
    {
      success: true,
      result: gatewayResponse.providerResponse,
      model: {
        id: resolved.model.id,
        azura_model_id: resolved.model.azura_model_id,
        public_slug: resolved.model.public_slug,
        display_name: resolved.model.display_name,
        provider_id: resolved.model.provider_id,
        provider_model_id: resolved.model.provider_model_id,
        capabilities: resolved.model.capabilities,
        enabled: resolved.model.enabled,
        status: resolved.model.status,
        created_at: resolved.model.created_at,
        updated_at: resolved.model.updated_at,
      },
      usage: {
        input_tokens: tokens.inputTokens,
        output_tokens: tokens.outputTokens,
        cached_tokens: tokens.cachedTokens ?? 0,
      },
    },
    { status: 200 },
  )
}
