/**
 * Phase 11 — Hardening Tests
 *
 * Covers fixes applied during the system-wide audit:
 *   - Inference route: model max-length, invalid parameters, dead code fix
 *   - Auth routes: malformed JSON body handling
 *   - Wallet: boundary checks for credit/debit
 *   - Cost estimation: integer-only arithmetic
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

jest.mock('@/lib/supabase', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
    },
  }),
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
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

const VALID_KEY = '00000000-0000-0000-0000-000000000001'
const USER_ID = '00000000-0000-0000-0000-000000000002'

function mockValidApiKey() {
  mockFrom.mockReturnValueOnce(createQueryChain({
    data: {
      id: VALID_KEY,
      user_id: USER_ID,
      scope: 'read_write',
      revoked_at: null,
      expires_at: null,
      users: { id: USER_ID, is_active: true },
    },
    error: null,
  }))
}

// ─── Inference Route Hardening ───────────────────────────────────────────────

describe('Phase 11: Inference Route Hardening', () => {
  beforeEach(() => { jest.resetAllMocks() })

  it('rejects model name exceeding 256 characters', async () => {
    mockValidApiKey()
    const { POST } = await import('@/app/api/inference/route')

    const longModel = 'a'.repeat(257)
    const req = new Request('http://localhost/api/inference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer az_test-secret-key-12345',
      },
      body: JSON.stringify({ model: longModel, operation: 'generate' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/256/)
  })

  it('accepts model name at exactly 256 characters', async () => {
    mockValidApiKey()
    const { POST } = await import('@/app/api/inference/route')

    const model256 = 'a'.repeat(256)
    const req = new Request('http://localhost/api/inference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer az_test-secret-key-12345',
      },
      body: JSON.stringify({ model: model256, operation: 'generate' }),
    })

    // Should NOT fail on model length — will fail later on model resolution
    // but the request passes validation
    const res = await POST(req)
    expect(res.status).not.toBe(400)
    const body = await res.json()
    expect(body.error).not.toMatch(/256/)
  })

  it('rejects parameters that are not an object', async () => {
    mockValidApiKey()
    const { POST } = await import('@/app/api/inference/route')

    const req = new Request('http://localhost/api/inference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer az_test-secret-key-12345',
      },
      body: JSON.stringify({ model: 'test', operation: 'generate', parameters: 'bad' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Parameters/)
  })

  it('rejects array as parameters', async () => {
    mockValidApiKey()
    const { POST } = await import('@/app/api/inference/route')

    const req = new Request('http://localhost/api/inference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer az_test-secret-key-12345',
      },
      body: JSON.stringify({ model: 'test', operation: 'generate', parameters: [1, 2, 3] }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('rejects invalid JSON body', async () => {
    const { POST } = await import('@/app/api/inference/route')

    const req = new Request('http://localhost/api/inference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/JSON/)
  })

  it('rejects non-object JSON body', async () => {
    const { POST } = await import('@/app/api/inference/route')

    const req = new Request('http://localhost/api/inference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify('just a string'),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

// ─── Auth Route Hardening ────────────────────────────────────────────────────

describe('Phase 11: Auth Route JSON Parsing', () => {
  beforeEach(() => { jest.resetAllMocks() })

  it('register returns 400 on malformed JSON', async () => {
    const { POST } = await import('@/app/api/auth/register/route')

    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Invalid/)
  })

  it('register returns 400 when email is missing', async () => {
    const { POST } = await import('@/app/api/auth/register/route')

    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'longpassword' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('register returns 400 when password is too short', async () => {
    const { POST } = await import('@/app/api/auth/register/route')

    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'short' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/8 characters/)
  })

  it('login returns 400 on malformed JSON', async () => {
    const { POST } = await import('@/app/api/auth/login/route')

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{{not json}}',
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Invalid/)
  })

  it('login returns 400 when email is missing', async () => {
    const { POST } = await import('@/app/api/auth/login/route')

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'testpass' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

// ─── Wallet Boundary Checks ─────────────────────────────────────────────────

describe('Phase 11: Wallet Boundary Checks', () => {
  beforeEach(() => { jest.resetAllMocks() })

  it('creditBalance rejects zero amount', async () => {
    const { creditBalance } = await import('@/lib/wallet')
    const result = await creditBalance(USER_ID, 0, null)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/positive/)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('creditBalance rejects negative amount', async () => {
    const { creditBalance } = await import('@/lib/wallet')
    const result = await creditBalance(USER_ID, -100, null)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/positive/)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('debitBalance rejects zero amount', async () => {
    const { debitBalance } = await import('@/lib/wallet')
    const result = await debitBalance(USER_ID, 0, null)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/positive/)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('debitBalance rejects negative amount', async () => {
    const { debitBalance } = await import('@/lib/wallet')
    const result = await debitBalance(USER_ID, -500, null)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/positive/)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('adjustBalance rejects zero amount', async () => {
    const { adjustBalance } = await import('@/lib/wallet')
    const result = await adjustBalance(USER_ID, 0, null)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/zero/)
  })

  it('adjustBalance routes positive to creditBalance', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { new_balance_cents: 5000, transaction_id: 'tx-1' },
      error: null,
    })

    const { adjustBalance } = await import('@/lib/wallet')
    const result = await adjustBalance(USER_ID, 500, 'ref-1')

    expect(result.success).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('credit_balance', expect.objectContaining({
      p_user_id: USER_ID,
      p_amount_cents: 500,
    }))
  })

  it('adjustBalance routes negative to debitBalance', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { new_balance_cents: 4000, transaction_id: 'tx-2' },
      error: null,
    })

    const { adjustBalance } = await import('@/lib/wallet')
    const result = await adjustBalance(USER_ID, -500, 'ref-2')

    expect(result.success).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('debit_balance', expect.objectContaining({
      p_user_id: USER_ID,
      p_amount_cents: 500,
    }))
  })
})

// ─── Cost Estimation Integer Safety ──────────────────────────────────────────

describe('Phase 11: Cost Estimation Integer Safety', () => {
  beforeEach(() => { jest.resetAllMocks() })

  it('estimateReservationCost uses integer arithmetic (no floating point)', async () => {
    const { estimateReservationCost } = await import('@/lib/security/usage')

    // Test with per-million-token values that produce integer results
    const pricing = { inputPricePerMillion: 3000, outputPricePerMillion: 7000, requestFee: 2, ruleVersion: 1 }
    const cost = estimateReservationCost(pricing, 1000)

    // 2 (fee) + ceil(3000 * 1000 / 1_000_000) = 2 + ceil(3) = 5
    expect(cost).toBe(5)
    // Verify it's an integer
    expect(Number.isInteger(cost)).toBe(true)
  })

  it('calculateActualCost produces integer results', async () => {
    const { calculateActualCost } = await import('@/lib/security/usage')

    const pricing = { inputPricePerMillion: 3000, outputPricePerMillion: 7000, requestFee: 2, ruleVersion: 1 }
    const cost = calculateActualCost(pricing, { inputTokens: 333, outputTokens: 444 })

    // 2 + round((3000*333 + 7000*444) / 1_000_000) = 2 + round(4.109) = 6
    expect(cost).toBe(6)
    expect(Number.isInteger(cost)).toBe(true)
  })

  it('estimateReservationCost with large values stays integer', async () => {
    const { estimateReservationCost } = await import('@/lib/security/usage')

    const pricing = { inputPricePerMillion: 100_000, outputPricePerMillion: 300_000, requestFee: 0, ruleVersion: 1 }
    const cost = estimateReservationCost(pricing, 1_000_000)

    // 0 + ceil(100_000 * 1_000_000 / 1_000_000) = 100_000
    expect(cost).toBe(100_000)
    expect(Number.isInteger(cost)).toBe(true)
  })
})

// ─── Inference Route Auth Integration ────────────────────────────────────────

describe('Phase 11: Inference Auth Integration', () => {
  beforeEach(() => { jest.resetAllMocks() })

  it('rejects non-az_ API key prefix', async () => {
    const { POST } = await import('@/app/api/inference/route')

    // API key lookup returns null (key not found)
    mockFrom.mockReturnValueOnce(createQueryChain({ data: null, error: { code: 'PGRST116' } }))
    // Session auth fails
    mockGetUser.mockRejectedValueOnce(new Error('Unauthenticated'))

    const req = new Request('http://localhost/api/inference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer sk_invalid-prefix',
      },
      body: JSON.stringify({ model: 'test', operation: 'generate' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('rejects Bearer token with no value after az_', async () => {
    const { POST } = await import('@/app/api/inference/route')

    mockFrom.mockReturnValueOnce(createQueryChain({ data: null, error: { code: 'PGRST116' } }))
    mockGetUser.mockRejectedValueOnce(new Error('Unauthenticated'))

    const req = new Request('http://localhost/api/inference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer az_',
      },
      body: JSON.stringify({ model: 'test', operation: 'generate' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
