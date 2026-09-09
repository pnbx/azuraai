/**
 * Phase 10 — Security, Rate Limiting & Usage Enforcement Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'

// ─── Mock setup ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetUser = jest.fn<(...args: any[]) => any>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFrom = jest.fn<(...args: any[]) => any>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRpc = jest.fn<(...args: any[]) => any>()

jest.mock('@/lib/auth/server', () => ({
  getServerUser: (...args: unknown[]) => mockGetUser(...args),
  requireServerUser: (...args: unknown[]) => mockGetUser(...args),
}))

jest.mock('@/supabase/admin', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createQueryChain(resolveWith: unknown) {
  const chain: Record<string, unknown> = {}
  const methods = [
    'select', 'eq', 'single', 'order', 'range', 'in', 'ilike', 'or',
    'update', 'lte', 'gte', 'maybeSingle', 'limit',
  ]
  for (const m of methods) {
    chain[m] = jest.fn(() => chain)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain.then = jest.fn((resolve: any) => resolve(resolveWith)) as any
  return chain
}

function createErrorChain(errorMessage: string) {
  return createQueryChain({ data: null, error: { message: errorMessage } })
}

// Standard test IDs
const KEY_ID = '00000000-0000-0000-0000-000000000001'
const USER_ID = '00000000-0000-0000-0000-000000000002'
const MODEL_ID = '00000000-0000-0000-0000-000000000003'
const RESERVATION_ID = '00000000-0000-0000-0000-000000000004'
const REQUEST_ID = '00000000-0000-0000-0000-000000000005'

const VALID_KEY_HEADER = 'Bearer az_test-secret-key-12345'

// ─── API Key Authentication ──────────────────────────────────────────────────

describe('API Key Authentication', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('returns null for missing header', async () => {
    const { authenticateApiKey } = await import('@/lib/security/auth')
    const result = await authenticateApiKey(null)
    expect(result).toBeNull()
  })

  it('returns null for malformed header', async () => {
    const { authenticateApiKey } = await import('@/lib/security/auth')
    expect(await authenticateApiKey('Basic abc')).toBeNull()
    expect(await authenticateApiKey('Bearer')).toBeNull()
    expect(await authenticateApiKey('Bearer az_')).toBeNull()
  })

  it('returns null for non-az_ key', async () => {
    const { authenticateApiKey } = await import('@/lib/security/auth')
    expect(await authenticateApiKey('Bearer sk_other-prefix')).toBeNull()
  })

  it('returns null when key not found in database', async () => {
    mockFrom.mockReturnValueOnce(createErrorChain('not found'))

    const { authenticateApiKey } = await import('@/lib/security/auth')
    const result = await authenticateApiKey(VALID_KEY_HEADER)
    expect(result).toBeNull()
  })

  it('returns null for revoked key', async () => {
    mockFrom.mockReturnValueOnce(createQueryChain({
      data: {
        id: KEY_ID,
        user_id: USER_ID,
        scope: 'read_write',
        revoked_at: '2026-01-01T00:00:00Z',
        expires_at: null,
        users: { id: USER_ID, is_active: true },
      },
      error: null,
    }))

    const { authenticateApiKey } = await import('@/lib/security/auth')
    const result = await authenticateApiKey(VALID_KEY_HEADER)
    expect(result).toBeNull()
  })

  it('returns null for expired key', async () => {
    mockFrom.mockReturnValueOnce(createQueryChain({
      data: {
        id: KEY_ID,
        user_id: USER_ID,
        scope: 'read_write',
        revoked_at: null,
        expires_at: '2020-01-01T00:00:00Z', // past
        users: { id: USER_ID, is_active: true },
      },
      error: null,
    }))

    const { authenticateApiKey } = await import('@/lib/security/auth')
    const result = await authenticateApiKey(VALID_KEY_HEADER)
    expect(result).toBeNull()
  })

  it('returns null for inactive user', async () => {
    mockFrom.mockReturnValueOnce(createQueryChain({
      data: {
        id: KEY_ID,
        user_id: USER_ID,
        scope: 'read_write',
        revoked_at: null,
        expires_at: null,
        users: { id: USER_ID, is_active: false },
      },
      error: null,
    }))

    const { authenticateApiKey } = await import('@/lib/security/auth')
    const result = await authenticateApiKey(VALID_KEY_HEADER)
    expect(result).toBeNull()
  })

  it('returns key metadata for valid active key', async () => {
    mockFrom.mockReturnValueOnce(createQueryChain({
      data: {
        id: KEY_ID,
        user_id: USER_ID,
        scope: 'read_write',
        revoked_at: null,
        expires_at: null,
        users: { id: USER_ID, is_active: true },
      },
      error: null,
    }))

    const { authenticateApiKey } = await import('@/lib/security/auth')
    const result = await authenticateApiKey(VALID_KEY_HEADER)
    expect(result).toEqual({
      keyId: KEY_ID,
      userId: USER_ID,
      scope: 'read_write',
    })
  })
})

// ─── Rate Limiting ───────────────────────────────────────────────────────────

describe('Rate Limiting', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('allows request when under limit', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ allowed: true, current_count: 5, limit_val: 60 }],
      error: null,
    })

    const { checkRateLimit } = await import('@/lib/security/rate-limit')
    const result = await checkRateLimit(KEY_ID, 60, 60)

    expect(result.allowed).toBe(true)
    expect(result.currentCount).toBe(5)
    expect(result.limit).toBe(60)
    expect(result.retryAfterSeconds).toBeUndefined()
    expect(mockRpc).toHaveBeenCalledWith('check_and_increment_rate_limit', {
      p_key_id: KEY_ID,
      p_period_seconds: 60,
      p_max_requests: 60,
    })
  })

  it('rejects request when over limit', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ allowed: false, current_count: 61, limit_val: 60 }],
      error: null,
    })

    const { checkRateLimit } = await import('@/lib/security/rate-limit')
    const result = await checkRateLimit(KEY_ID, 60, 60)

    expect(result.allowed).toBe(false)
    expect(result.currentCount).toBe(61)
    expect(result.retryAfterSeconds).toBe(60)
  })

  it('fails open on RPC error', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'connection refused' },
    })

    const { checkRateLimit } = await import('@/lib/security/rate-limit')
    const result = await checkRateLimit(KEY_ID)

    expect(result.allowed).toBe(true)
    expect(result.currentCount).toBe(0)
  })

  it('allows request at exactly the limit', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ allowed: true, current_count: 60, limit_val: 60 }],
      error: null,
    })

    const { checkRateLimit } = await import('@/lib/security/rate-limit')
    const result = await checkRateLimit(KEY_ID, 60, 60)

    expect(result.allowed).toBe(true)
    expect(result.currentCount).toBe(60)
  })
})

// ─── Token Quota ─────────────────────────────────────────────────────────────

describe('Token Quota', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('allows when under quota', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ allowed: true, used_tokens: 50000, quota_limit: 100000000 }],
      error: null,
    })

    const { checkTokenQuota } = await import('@/lib/security/rate-limit')
    const result = await checkTokenQuota(USER_ID, 100_000_000)

    expect(result.allowed).toBe(true)
    expect(result.usedTokens).toBe(50000)
    expect(result.limit).toBe(100_000_000)
    expect(result.resetAt).toBeDefined()
  })

  it('rejects when over quota', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ allowed: false, used_tokens: 100000001, quota_limit: 100000000 }],
      error: null,
    })

    const { checkTokenQuota } = await import('@/lib/security/rate-limit')
    const result = await checkTokenQuota(USER_ID, 100_000_000)

    expect(result.allowed).toBe(false)
    expect(result.usedTokens).toBe(100000001)
  })

  it('allows unlimited when quota is null', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ allowed: true, used_tokens: 9999999, quota_limit: null }],
      error: null,
    })

    const { checkTokenQuota } = await import('@/lib/security/rate-limit')
    const result = await checkTokenQuota(USER_ID, null)

    expect(result.allowed).toBe(true)
    expect(result.limit).toBeNull()
  })

  it('fails open on RPC error', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'db timeout' },
    })

    const { checkTokenQuota } = await import('@/lib/security/rate-limit')
    const result = await checkTokenQuota(USER_ID, 100_000_000)

    expect(result.allowed).toBe(true)
  })
})

// ─── Fund Reservation ────────────────────────────────────────────────────────

describe('Fund Reservation', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('reserves funds successfully', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{
        success: true,
        reservation_id: RESERVATION_ID,
        new_balance: 9000,
      }],
      error: null,
    })

    const { reserveFunds } = await import('@/lib/security/reservation')
    const result = await reserveFunds(USER_ID, KEY_ID, REQUEST_ID, 1000)

    expect(result.success).toBe(true)
    expect(result.reservationId).toBe(RESERVATION_ID)
    expect(result.newBalance).toBe(9000)
    expect(mockRpc).toHaveBeenCalledWith('reserve_funds_for_inference', {
      p_user_id: USER_ID,
      p_key_id: KEY_ID,
      p_request_id: REQUEST_ID,
      p_reserved_amount: 1000,
    })
  })

  it('fails when insufficient balance', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ success: false, reservation_id: null, new_balance: 500 }],
      error: null,
    })

    const { reserveFunds } = await import('@/lib/security/reservation')
    const result = await reserveFunds(USER_ID, KEY_ID, REQUEST_ID, 1000)

    expect(result.success).toBe(false)
    expect(result.reservationId).toBeNull()
    expect(result.newBalance).toBe(500)
  })

  it('handles RPC error gracefully', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'lock timeout' },
    })

    const { reserveFunds } = await import('@/lib/security/reservation')
    const result = await reserveFunds(USER_ID, KEY_ID, REQUEST_ID, 1000)

    expect(result.success).toBe(false)
  })
})

// ─── Reservation Settlement ──────────────────────────────────────────────────

describe('Reservation Settlement', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('settles with surplus refund', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ success: true, refund_amount: 200 }],
      error: null,
    })

    const { settleReservation } = await import('@/lib/security/reservation')
    const result = await settleReservation(RESERVATION_ID, 800, 500, 200)

    expect(result.success).toBe(true)
    expect(result.refundAmount).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('settle_inference_reservation', {
      p_reservation_id: RESERVATION_ID,
      p_actual_cost: 800,
      p_input_tokens: 500,
      p_output_tokens: 200,
    })
  })

  it('settles with exact cost (no refund)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ success: true, refund_amount: 0 }],
      error: null,
    })

    const { settleReservation } = await import('@/lib/security/reservation')
    const result = await settleReservation(RESERVATION_ID, 1000, 500, 200)

    expect(result.success).toBe(true)
    expect(result.refundAmount).toBe(0)
  })

  it('settles with overage (debit extra)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ success: true, refund_amount: 0 }],
      error: null,
    })

    const { settleReservation } = await import('@/lib/security/reservation')
    const result = await settleReservation(RESERVATION_ID, 1200, 500, 200)

    expect(result.success).toBe(true)
  })

  it('handles settle RPC error', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'reservation not found' },
    })

    const { settleReservation } = await import('@/lib/security/reservation')
    const result = await settleReservation(RESERVATION_ID, 1000, 500, 200)

    expect(result.success).toBe(false)
  })
})

// ─── Reservation Release ─────────────────────────────────────────────────────

describe('Reservation Release', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('releases reservation on provider failure', async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null })

    const { releaseReservation } = await import('@/lib/security/reservation')
    const result = await releaseReservation(RESERVATION_ID)

    expect(result).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('release_inference_reservation', {
      p_reservation_id: RESERVATION_ID,
    })
  })

  it('returns false on release failure', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'already settled' },
    })

    const { releaseReservation } = await import('@/lib/security/reservation')
    const result = await releaseReservation(RESERVATION_ID)

    expect(result).toBe(false)
  })
})

// ─── Usage Metering ──────────────────────────────────────────────────────────

describe('Usage Metering', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('records usage successfully', async () => {
    mockRpc.mockResolvedValueOnce({ data: REQUEST_ID, error: null })

    const { recordUsage } = await import('@/lib/security/usage')
    const id = await recordUsage({
      requestId: REQUEST_ID,
      userId: USER_ID,
      provider: 'avali',
      upstreamModelId: 'gpt-4',
      azuraModelId: MODEL_ID,
      tokens: { inputTokens: 100, outputTokens: 50 },
      upstreamCost: 10,
      markup: 5,
      customerCharge: 15,
      pricingRuleVersion: 1,
      status: 'succeeded',
      responseMs: 1500,
    })

    expect(id).toBe(REQUEST_ID)
    expect(mockRpc).toHaveBeenCalledWith('insert_usage_if_needed', expect.objectContaining({
      p_request_id: REQUEST_ID,
      p_user_id: USER_ID,
      p_input_tokens: 100,
      p_output_tokens: 50,
      p_charge_cents: 15,
      p_status: 'succeeded',
      p_response_ms: 1500,
    }))
  })

  it('records failed usage', async () => {
    mockRpc.mockResolvedValueOnce({ data: REQUEST_ID, error: null })

    const { recordUsage } = await import('@/lib/security/usage')
    const id = await recordUsage({
      requestId: REQUEST_ID,
      userId: USER_ID,
      provider: 'avali',
      upstreamModelId: 'gpt-4',
      azuraModelId: MODEL_ID,
      tokens: { inputTokens: 0, outputTokens: 0 },
      upstreamCost: 0,
      markup: 0,
      customerCharge: 0,
      pricingRuleVersion: 0,
      status: 'failed',
      statusDetail: 'Provider timeout',
    })

    expect(id).toBe(REQUEST_ID)
  })

  it('returns null on RPC error', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'insert failed' },
    })

    const { recordUsage } = await import('@/lib/security/usage')
    const id = await recordUsage({
      requestId: REQUEST_ID,
      userId: USER_ID,
      provider: 'avali',
      upstreamModelId: 'gpt-4',
      azuraModelId: MODEL_ID,
      tokens: { inputTokens: 0, outputTokens: 0 },
      upstreamCost: 0,
      markup: 0,
      customerCharge: 0,
      pricingRuleVersion: 0,
      status: 'succeeded',
    })

    expect(id).toBeNull()
  })

  it('extracts token usage from various metadata shapes', async () => {
    const { extractTokenUsage } = await import('@/lib/security/usage')

    // OpenAI-style
    expect(extractTokenUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      cached_tokens: 10,
    })).toEqual({ inputTokens: 100, outputTokens: 50, cachedTokens: 10 })

    // Alternative naming
    expect(extractTokenUsage({
      input_tokens: 200,
      output_tokens: 80,
    })).toEqual({ inputTokens: 200, outputTokens: 80, cachedTokens: undefined })

    // camelCase
    expect(extractTokenUsage({
      inputTokens: 300,
      outputTokens: 120,
    })).toEqual({ inputTokens: 300, outputTokens: 120, cachedTokens: undefined })

    // undefined metadata
    expect(extractTokenUsage(undefined)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: undefined,
    })

    // Empty object
    expect(extractTokenUsage({})).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: undefined,
    })
  })
})

// ─── Cost Calculation ────────────────────────────────────────────────────────

describe('Cost Calculation', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('calculates estimated reservation cost', async () => {
    const { estimateReservationCost } = await import('@/lib/security/usage')

    const cost = estimateReservationCost(
      { inputTokenPrice: 10, outputTokenPrice: 30, requestFee: 5, ruleVersion: 1 },
      1000,
    )

    // 5 (fee) + 10 (input_price) * 1000 (tokens) = 10005
    expect(cost).toBe(10005)
  })

  it('calculates actual cost from real tokens', async () => {
    const { calculateActualCost } = await import('@/lib/security/usage')

    const cost = calculateActualCost(
      { inputTokenPrice: 10, outputTokenPrice: 30, requestFee: 5, ruleVersion: 1 },
      { inputTokens: 500, outputTokens: 200 },
    )

    // 5 (fee) + 10*500 (input) + 30*200 (output) = 5 + 5000 + 6000 = 11005
    expect(cost).toBe(11005)
  })

  it('calculates cost with zero tokens', async () => {
    const { calculateActualCost } = await import('@/lib/security/usage')

    const cost = calculateActualCost(
      { inputTokenPrice: 10, outputTokenPrice: 30, requestFee: 5, ruleVersion: 1 },
      { inputTokens: 0, outputTokens: 0 },
    )

    // Just the request fee
    expect(cost).toBe(5)
  })
})

// ─── Inference Route Security ────────────────────────────────────────────────

describe('Inference Route Security', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('rejects request with no auth', async () => {
    const { POST } = await import('@/app/api/inference/route')

    // No API key header, session auth fails
    mockFrom.mockReturnValueOnce(createErrorChain('not found')) // API key lookup fails
    mockGetUser.mockRejectedValueOnce(new Error('Unauthenticated'))

    const req = new Request('http://localhost/api/inference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'test-model', operation: 'generate' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('rejects missing model field', async () => {
    // API key auth succeeds
    mockFrom.mockReturnValueOnce(createQueryChain({
      data: {
        id: KEY_ID,
        user_id: USER_ID,
        scope: 'read_write',
        revoked_at: null,
        expires_at: null,
        users: { id: USER_ID, is_active: true },
      },
      error: null,
    }))

    const { POST } = await import('@/app/api/inference/route')

    const req = new Request('http://localhost/api/inference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': VALID_KEY_HEADER,
      },
      body: JSON.stringify({ operation: 'generate' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Model/)
  })

  it('rejects missing operation field', async () => {
    mockFrom.mockReturnValueOnce(createQueryChain({
      data: {
        id: KEY_ID, user_id: USER_ID, scope: 'read_write',
        revoked_at: null, expires_at: null,
        users: { id: USER_ID, is_active: true },
      },
      error: null,
    }))

    const { POST } = await import('@/app/api/inference/route')

    const req = new Request('http://localhost/api/inference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': VALID_KEY_HEADER,
      },
      body: JSON.stringify({ model: 'test-model' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('rejects unsupported operation', async () => {
    mockFrom.mockReturnValueOnce(createQueryChain({
      data: {
        id: KEY_ID, user_id: USER_ID, scope: 'read_write',
        revoked_at: null, expires_at: null,
        users: { id: USER_ID, is_active: true },
      },
      error: null,
    }))

    const { POST } = await import('@/app/api/inference/route')

    const req = new Request('http://localhost/api/inference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': VALID_KEY_HEADER,
      },
      body: JSON.stringify({ model: 'test-model', operation: 'invalid-op' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/not supported/)
  })
})
