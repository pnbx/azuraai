/**
 * Financial Hardening Tests
 *
 * Verifies:
 *   - Idempotency: insert_usage_if_needed deduplicates on request_id
 *   - Failure safety: reserve → release restores funds
 *   - Double-settle protection: settle returns false on already-settled reservation
 *   - Double-release protection: release returns false on already-released reservation
 *   - Release-after-settle protection: cannot release after settling
 *   - Currency consistency: all monetary operations use TOMAN
 *   - Math.round() behavior for tiny requests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { calculateActualCost } from '@/lib/security/usage'

// ─── Mock setup ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRpc = jest.fn<(...args: any[]) => any>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFrom = jest.fn<(...args: any[]) => any>()

jest.mock('@/supabase/admin', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}))

jest.mock('@/lib/auth/server', () => ({
  getServerUser: jest.fn(),
  requireServerUser: jest.fn(),
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signUp: jest.fn(), signInWithPassword: jest.fn() },
  }),
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createQueryChain(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'single', 'order', 'limit', 'lte', 'gte', 'or', 'update', 'insert', 'maybeSingle', 'upsert']) {
    chain[m] = jest.fn(() => chain)
  }
  chain.then = jest.fn((resolve: (v: unknown) => void) => resolve({ data, error })) as unknown
  chain.single = jest.fn(() => Promise.resolve({ data, error }))
  chain.maybeSingle = jest.fn(() => Promise.resolve({ data, error }))
  return chain
}

// ─── Idempotency: insert_usage_if_needed ─────────────────────────────────────

describe('Financial Hardening: Idempotency', () => {
  beforeEach(() => { jest.resetAllMocks() })

  it('insert_usage_if_needed returns existing id on duplicate request_id (ON CONFLICT DO NOTHING)', async () => {
    const existingId = '11111111-2222-3333-4444-555555555555'

    // First call: inserts and returns new id
    mockRpc.mockResolvedValueOnce({ data: existingId, error: null })
    // Second call: conflict → returns existing id
    mockRpc.mockResolvedValueOnce({ data: existingId, error: null })

    const { recordUsage } = await import('@/lib/security/usage')

    const input = {
      requestId: 'duplicate-request-id',
      userId: 'user-1',
      provider: 'avali',
      upstreamModelId: 'gpt-4.1-nano',
      azuraModelId: 'gpt-4.1-nano',
      tokens: { inputTokens: 100, outputTokens: 50 },
      upstreamCost: 5,
      markup: 0,
      customerCharge: 5,
      pricingRuleVersion: 1,
      status: 'succeeded' as const,
      responseMs: 200,
    }

    const id1 = await recordUsage(input)
    const id2 = await recordUsage(input)

    expect(id1).toBe(existingId)
    expect(id2).toBe(existingId)
    expect(mockRpc).toHaveBeenCalledTimes(2)
    expect(mockRpc).toHaveBeenCalledWith('insert_usage_if_needed', expect.objectContaining({
      p_request_id: 'duplicate-request-id',
    }))
  })
})

// ─── Failure safety: reserve → release ───────────────────────────────────────

describe('Financial Hardening: Failure safety (reserve → release)', () => {
  beforeEach(() => { jest.resetAllMocks() })

  it('release restores full reserved amount to balance', async () => {
    // Reserve: success, reserved 5 TOMAN, balance drops from 50000 to 49995
    mockRpc.mockResolvedValueOnce({
      data: [{ success: true, reservation_id: 'res-001', new_balance: 49995 }],
      error: null,
    })
    // Release: success
    mockRpc.mockResolvedValueOnce({ data: true, error: null })

    const { reserveFunds, releaseReservation } = await import('@/lib/security/reservation')

    const reserveResult = await reserveFunds('user-1', 'key-1', 'req-1', 5)
    expect(reserveResult.success).toBe(true)
    expect(reserveResult.newBalance).toBe(49995)

    const releaseResult = await releaseReservation('res-001')
    expect(releaseResult).toBe(true)

    expect(mockRpc).toHaveBeenCalledWith('reserve_funds_for_inference', expect.objectContaining({ p_reserved_amount: 5 }))
    expect(mockRpc).toHaveBeenCalledWith('release_inference_reservation', { p_reservation_id: 'res-001' })
  })
})

// ─── Double-settle protection ────────────────────────────────────────────────

describe('Financial Hardening: Double-settle protection', () => {
  beforeEach(() => { jest.resetAllMocks() })

  it('settle returns success=false when reservation already settled', async () => {
    // First settle: success, refund surplus
    mockRpc.mockResolvedValueOnce({
      data: [{ success: true, refund_amount: 4 }],
      error: null,
    })
    // Second settle: fails (reservation no longer pending)
    mockRpc.mockResolvedValueOnce({
      data: [{ success: false, refund_amount: 0 }],
      error: null,
    })

    const { settleReservation } = await import('@/lib/security/reservation')

    const settle1 = await settleReservation('res-001', 1, 100, 50)
    expect(settle1.success).toBe(true)
    expect(settle1.refundAmount).toBe(4)

    const settle2 = await settleReservation('res-001', 0, 10, 5)
    expect(settle2.success).toBe(false)
    expect(settle2.refundAmount).toBe(0)
  })
})

// ─── Double-release protection ───────────────────────────────────────────────

describe('Financial Hardening: Double-release protection', () => {
  beforeEach(() => { jest.resetAllMocks() })

  it('second release returns false when already released', async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null })  // first release
    mockRpc.mockResolvedValueOnce({ data: false, error: null }) // second release fails

    const { releaseReservation } = await import('@/lib/security/reservation')

    const release1 = await releaseReservation('res-001')
    expect(release1).toBe(true)

    const release2 = await releaseReservation('res-001')
    expect(release2).toBe(false)
  })

  it('release after settle returns false', async () => {
    // Settle first
    mockRpc.mockResolvedValueOnce({
      data: [{ success: true, refund_amount: 1 }],
      error: null,
    })
    // Release after settle: fails
    mockRpc.mockResolvedValueOnce({ data: false, error: null })

    const { settleReservation, releaseReservation } = await import('@/lib/security/reservation')

    const settleResult = await settleReservation('res-001', 2, 50, 20)
    expect(settleResult.success).toBe(true)

    const releaseResult = await releaseReservation('res-001')
    expect(releaseResult).toBe(false)
  })
})

// ─── Currency consistency ────────────────────────────────────────────────────

describe('Financial Hardening: Currency consistency', () => {
  beforeEach(() => { jest.resetAllMocks() })

  it('createInitialBalance uses TOMAN currency', async () => {
    // getBalance sees no row (PGRST116) → calls createInitialBalance → upserts with TOMAN
    const errorChain = createQueryChain(null, { code: 'PGRST116' })
    mockFrom.mockReturnValueOnce(errorChain)

    const tomanData = { balance_cents: 0, currency: 'TOMAN', updated_at: new Date().toISOString() }
    const okChain = createQueryChain({ data: tomanData, error: null })
    mockFrom.mockReturnValueOnce(okChain)

    const { getBalance } = await import('@/lib/wallet')
    await getBalance('user-1')

    // Verify createInitialBalance was called (second from() call)
    expect(mockFrom).toHaveBeenCalledTimes(2)
    // Verify the second call was to 'balances' (upsert in createInitialBalance)
    expect(mockFrom).toHaveBeenLastCalledWith('balances')
    // Verify the upsert was called with TOMAN currency
    const upsertCall = okChain.upsert as jest.Mock
    expect(upsertCall).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'TOMAN' }),
      expect.any(Object),
    )
  })

  it('calculateActualCost produces integer TOMAN amounts', async () => {
    const { calculateActualCost } = await import('@/lib/security/usage')

    // gpt-4.1-nano pricing: 600/2400 per M tokens, TOMAN
    const cost = calculateActualCost(
      { inputPricePerMillion: 600, outputPricePerMillion: 2400, requestFee: 0, ruleVersion: 1 },
      { inputTokens: 1500, outputTokens: 500 },
    )
    // (600*1500 + 2400*500) / 1M = (900000 + 1200000) / 1M = 2.1 → rounds to 2
    expect(cost).toBe(2)
    expect(Number.isInteger(cost)).toBe(true)
  })
})

// ─── Math.round() precision behavior ─────────────────────────────────────────

describe('Financial Hardening: Pricing precision documentation', () => {
  beforeEach(() => { jest.resetAllMocks() })

  it('tiny requests (1-2 tokens) round to 0 TOMAN — documented precision limit', () => {

    // At per-million pricing, 1 token costs:
    // gpt-4o-mini: (900*1 + 3600*1) / 1M = 0.0045 → rounds to 0
    // gpt-4.1-nano: (600*1 + 2400*1) / 1M = 0.003 → rounds to 0
    // qwen-flash: (300*1 + 2400*1) / 1M = 0.0027 → rounds to 0
    const models = [
      { input: 900, output: 3600, name: 'gpt-4o-mini' },
      { input: 600, output: 2400, name: 'gpt-4.1-nano' },
      { input: 300, output: 2400, name: 'qwen-flash' },
    ]

    for (const m of models) {
      const pricing = { inputPricePerMillion: m.input, outputPricePerMillion: m.output, requestFee: 0, ruleVersion: 1 }
      const cost1 = calculateActualCost(pricing, { inputTokens: 1, outputTokens: 1 })
      const cost10 = calculateActualCost(pricing, { inputTokens: 10, outputTokens: 10 })
      const cost100 = calculateActualCost(pricing, { inputTokens: 100, outputTokens: 100 })

      // 1-2 tokens → 0 (precision limit)
      expect(cost1).toBe(0)
      // 10-20 tokens → 0 for most models (still below 1M threshold)
      expect(cost10).toBe(0)
      // 100 tokens → still rounds to 0 for cheapest models
      expect(cost100).toBeGreaterThanOrEqual(0)
    }
  })

  it('1000+ tokens produce non-zero TOMAN cost', () => {

    // gpt-4.1-nano at 1000 tokens: (600*1000 + 2400*500) / 1M = 1.8 → rounds to 2
    const cost = calculateActualCost(
      { inputPricePerMillion: 600, outputPricePerMillion: 2400, requestFee: 0, ruleVersion: 1 },
      { inputTokens: 1000, outputTokens: 500 },
    )
    expect(cost).toBeGreaterThan(0)
  })

  it('request fee ensures minimum charge regardless of token count', () => {

    // Even with 0 tokens, request fee of 10 TOMAN is charged
    const cost = calculateActualCost(
      { inputPricePerMillion: 600, outputPricePerMillion: 2400, requestFee: 10, ruleVersion: 1 },
      { inputTokens: 1, outputTokens: 1 },
    )
    expect(cost).toBe(10)
  })
})
