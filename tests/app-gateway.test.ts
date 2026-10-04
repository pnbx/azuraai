/**
 * App Free Gateway — key pool failover, SSE client parsing, route guards.
 *
 * Covers the OpenRouter key pool (cooldown/failover), inline <think>
 * extraction, error classification, and /api/app/chat request validation.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// ─── Supabase mock ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRpc = jest.fn<(...args: any[]) => any>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFrom = jest.fn<(...args: any[]) => any>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetUser = jest.fn<(...args: any[]) => any>()

jest.mock('@/supabase/admin', () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

jest.mock('@/lib/auth/server', () => ({
  getServerUser: () => mockGetUser(),
  requireServerUser: () => mockGetUser(),
}))

import {
  withPoolFailover,
  defaultIsRetryable,
  KEY_COOLDOWN_MS,
  MAX_CONSECUTIVE_FAILURES,
  type PooledKey,
} from '@/lib/gateway/keyPool'
import {
  OpenRouterError,
  extractInlineThinking,
  createThinkSplitter,
} from '@/lib/gateway/openrouterClient'

/** Chainable supabaseAdmin.from() mock builder. */
function makeChainMock(overrides: {
  single?: unknown
} = {}) {
  const api = {
    select: jest.fn(() => api),
    eq: jest.fn(() => api),
    update: jest.fn(() => api),
    single: jest.fn(() =>
      Promise.resolve(overrides.single ?? { data: { failure_count: 0 } })
    ),
  } as unknown as {
    select: jest.Mock
    eq: jest.Mock
    update: jest.Mock
    single: jest.Mock
    then: (onfulfilled: (v: unknown) => void) => Promise<void>
  }
  // Make the chain awaitable for queries ending without .single()
  api.then = (resolve: (v: unknown) => void) =>
    Promise.resolve({ data: null, error: null }).then(resolve)
  return { api, update: api.update }
}

// ─── Key pool: failover ──────────────────────────────────────────────────────

describe('keyPool failover', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  function keyRow(id: string): { data: { id: string; api_key: string } } {
    return { data: { id, api_key: `sk-or-v1-${id}` } }
  }

  it('retries on a retryable error with the next key and reports the failure', async () => {
    const keys = [keyRow('k1'), keyRow('k2')]
    let pick = 0
    mockRpc.mockImplementation(() => Promise.resolve(keys[pick++] ?? { data: null }))

    const { api, update } = makeChainMock()
    mockFrom.mockReturnValue(api)

    const attempts: string[] = []
    const outcome = await withPoolFailover(async (key: PooledKey) => {
      attempts.push(key.keyId)
      if (key.keyId === 'k1') {
        throw new OpenRouterError(429, 'rate limited')
      }
      return 'ok'
    })

    expect(attempts).toEqual(['k1', 'k2'])
    expect(outcome).toEqual({ result: 'ok', key: { keyId: 'k2', apiKey: 'sk-or-v1-k2' } })
    // Failure reported: update invoked on the openrouter_keys chain
    expect(api.update).toHaveBeenCalled()
  })

  it('returns pool_exhausted when no keys are available', async () => {
    mockRpc.mockResolvedValue({ data: null })

    const outcome = await withPoolFailover(async () => 'never')

    expect('exhausted' in outcome && outcome.exhausted).toBe(true)
  })

  it('throws immediately on non-retryable errors', async () => {
    mockRpc.mockResolvedValue(keyRow('k1'))

    await expect(
      withPoolFailover(async () => {
        throw new OpenRouterError(400, 'bad request')
      })
    ).rejects.toThrow('bad request')

    // Only one checkout: no retry burned on invalid input
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  it('classifies errors for retry decisions', () => {
    expect(defaultIsRetryable(new OpenRouterError(429, 'slow down'))).toBe(true)
    expect(defaultIsRetryable(new OpenRouterError(503, 'upstream down'))).toBe(true)
    expect(defaultIsRetryable(new OpenRouterError(401, 'bad key'))).toBe(false)
    expect(defaultIsRetryable(new OpenRouterError(400, 'bad request'))).toBe(false)
    expect(defaultIsRetryable(new Error('random'))).toBe(false)
  })

  it('exposes sensible cooldown/failure constants', () => {
    expect(KEY_COOLDOWN_MS).toBeGreaterThanOrEqual(60_000)
    expect(MAX_CONSECUTIVE_FAILURES).toBeGreaterThanOrEqual(3)
  })
})

// ─── OpenRouter client ───────────────────────────────────────────────────────

describe('openrouterClient', () => {
  it('maps statuses to typed errors', () => {
    expect(new OpenRouterError(429, 'x').type).toBe('rate_limit_exceeded')
    expect(new OpenRouterError(401, 'x').type).toBe('authentication_error')
    expect(new OpenRouterError(500, 'x').type).toBe('provider_unavailable')
    expect(new OpenRouterError(400, 'x').type).toBe('invalid_request')
  })

  it('extracts inline <think> blocks split across delta boundaries', () => {
    const content: string[] = []
    const reasoning: string[] = []
    const splitter = createThinkSplitter({
      onContent: (d) => content.push(d),
      onReasoning: (d) => reasoning.push(d),
    })

    // Open tag split in the middle, close tag split in the middle
    splitter.push('Sure! <thi')
    splitter.push('nk>internal thought here</th')
    splitter.push('ink> and the answer.')
    splitter.flush()

    expect(content.join('')).toBe('Sure!  and the answer.')
    expect(reasoning.join('')).toBe('internal thought here')
  })

  it('holds back a trailing partial tag until flushed', () => {
    const content: string[] = []
    const reasoning: string[] = []
    const splitter = createThinkSplitter({
      onContent: (d) => content.push(d),
      onReasoning: (d) => reasoning.push(d),
    })

    splitter.push('answer text <thi')
    expect(content.join('')).toBe('answer text ')
    expect(reasoning.join('')).toBe('')

    splitter.push('nk>secret plan')
    expect(content.join('')).toBe('answer text ')
    expect(reasoning.join('')).toBe('secret plan')
  })

  it('passes plain content through untouched', () => {
    const r = extractInlineThinking('just an answer', false)
    expect(r.content).toBe('just an answer')
    expect(r.reasoning).toBe('')
    expect(r.thinkOpen).toBe(false)
  })
})

// ─── /api/app/chat route guards ──────────────────────────────────────────────

describe('/api/app/chat guards', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
  })

  async function importRoute() {
    return (await import('@/app/api/app/chat/route')) as {
      POST: (req: unknown) => Promise<Response>
    }
  }

  function makeRequest(body: unknown, extraHeaders?: Record<string, string>): Request {
    return new Request('http://localhost/api/app/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-azura-client': 'app',
        ...extraHeaders,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as unknown as Request
  }

  const GUEST_DEVICE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

  it('serves guests without a session — the app has no sign-in', async () => {
    // Auth became optional: a guest is a first-class caller, so the request
    // must reach the model instead of bouncing off a 401.
    mockGetUser.mockRejectedValue(new Error('Unauthenticated'))
    const { POST } = await importRoute()

    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }] }))
    expect(res.status).toBe(200)
  })

  it('400s on malformed bodies and oversized messages', async () => {
    mockGetUser.mockResolvedValue({ id: 'u1' })
    const { POST } = await importRoute()

    const empty = await POST(makeRequest({ messages: [] }))
    expect(empty.status).toBe(400)

    const tooBig = await POST(
      makeRequest({ messages: [{ role: 'user', content: 'x'.repeat(17_000) }] })
    )
    expect(tooBig.status).toBe(400)
  })

  it('429s when the daily cap is reached', async () => {
    mockGetUser.mockResolvedValue({ id: 'u1' })
    mockRpc.mockResolvedValue({ data: [{ allowed: false, used: 30, cap: 30 }] })
    const { POST } = await importRoute()

    const res = await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hello' }] })
    )
    expect(res.status).toBe(429)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('daily_cap_reached')
  })

  // ─── Guest quota ─────────────────────────────────────────────────────────
  //
  // The per-account cap never protected the mobile app: it has no accounts, so
  // every real user was a guest and the free tier was unmetered. These lock in
  // that guests are now charged against a hashed device id, that the raw UUID
  // never leaves the server, and that signed-in callers still use the account
  // counter rather than the device one.

  it('meters a guest against the guest RPC using a hashed device id', async () => {
    mockGetUser.mockRejectedValue(new Error('Unauthenticated'))
    mockRpc.mockResolvedValue({ data: [{ allowed: true, used: 1, cap: 10 }] })
    const { POST } = await importRoute()

    const res = await POST(
      makeRequest(
        { messages: [{ role: 'user', content: 'hi' }] },
        { 'x-azura-device': GUEST_DEVICE_ID }
      )
    )
    expect(res.status).toBe(200)

    const call = mockRpc.mock.calls.find((c) => c[0] === 'increment_app_guest_chat_usage')
    expect(call).toBeDefined()

    const params = call?.[1] as { p_guest_id: string; p_daily_cap: number }
    // The stored key is a sha256, not the device UUID.
    expect(params.p_guest_id).not.toBe(GUEST_DEVICE_ID)
    expect(params.p_guest_id).toMatch(/^[0-9a-f]{64}$/)
    expect(params.p_daily_cap).toBe(10)
  })

  it('429s a guest who is over the guest cap', async () => {
    mockGetUser.mockRejectedValue(new Error('Unauthenticated'))
    mockRpc.mockResolvedValue({ data: [{ allowed: false, used: 10, cap: 10 }] })
    const { POST } = await importRoute()

    const res = await POST(
      makeRequest(
        { messages: [{ role: 'user', content: 'hi' }] },
        { 'x-azura-device': GUEST_DEVICE_ID }
      )
    )
    expect(res.status).toBe(429)
    const body = (await res.json()) as { error: string; used: number; cap: number }
    expect([body.error, body.used, body.cap]).toEqual(['daily_cap_reached', 10, 10])
  })

  it('charges a signed-in user to the account, never the device', async () => {
    mockGetUser.mockResolvedValue({ id: 'u1' })
    mockRpc.mockResolvedValue({ data: [{ allowed: true, used: 1, cap: 30 }] })
    const { POST } = await importRoute()

    const res = await POST(
      makeRequest(
        { messages: [{ role: 'user', content: 'hi' }] },
        { 'x-azura-device': GUEST_DEVICE_ID }
      )
    )
    expect(res.status).toBe(200)

    const names = mockRpc.mock.calls.map((c) => c[0])
    expect(names).toContain('increment_app_chat_usage')
    expect(names).not.toContain('increment_app_guest_chat_usage')
  })

  it('refuses to count a forged device id and falls back to the fingerprint', async () => {
    mockGetUser.mockRejectedValue(new Error('Unauthenticated'))
    mockRpc.mockResolvedValue({ data: [{ allowed: true, used: 1, cap: 10 }] })
    const { POST } = await importRoute()

    // Not a canonical UUID. If this were accepted verbatim, a caller could send
    // a fresh value per request and mint unlimited counters. A user-agent is
    // supplied so the network-fingerprint fallback has something to hash —
    // without it there is no identity at all and the route serves unmetered.
    await POST(
      makeRequest(
        { messages: [{ role: 'user', content: 'hi' }] },
        { 'x-azura-device': 'forged-counter-1', 'user-agent': 'jest-agent/1.0' }
      )
    )

    const call = mockRpc.mock.calls.find((c) => c[0] === 'increment_app_guest_chat_usage')
    expect(call).toBeDefined()
    const params = call?.[1] as { p_guest_id: string }
    expect(params.p_guest_id).not.toBe('forged-counter-1')
    expect(params.p_guest_id).toMatch(/^[0-9a-f]{64}$/)
  })

  it('still serves the request when the usage RPC is unavailable (fail-open)', async () => {
    mockGetUser.mockRejectedValue(new Error('Unauthenticated'))
    mockRpc.mockResolvedValue({ error: { code: 'PGRST202', message: 'missing' } })
    const { POST } = await importRoute()

    const res = await POST(
      makeRequest(
        { messages: [{ role: 'user', content: 'hi' }] },
        { 'x-azura-device': GUEST_DEVICE_ID }
      )
    )
    // A missing migration must not lock every real user out of the app.
    expect(res.status).toBe(200)
  })

  it('returns an SSE stream on the happy path', async () => {
    mockGetUser.mockResolvedValue({ id: 'u1' })
    mockRpc.mockResolvedValue({ data: [{ allowed: true, used: 1, cap: 30 }] })

    // Pool yields a key
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'pick_openrouter_key') {
        return Promise.resolve({ data: [{ id: 'k1', api_key: 'sk-test' }] })
      }
      return Promise.resolve({ data: [{ allowed: true, used: 1, cap: 30 }] })
    })

    // Stream client: mock fetch returning an SSE Response.
    // Chainable from() mock backs reportKeySuccess.
    const chain = makeChainMock()
    mockFrom.mockReturnValue(chain.api)

    const encoder = new TextEncoder()
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hi"}}]}',
      'data: {"choices":[{"finish_reason":"stop"}]}',
      'data: [DONE]',
      '',
    ].join('\n\n')
    const fakeFetch = jest.fn(() =>
      Promise.resolve(
        new Response(encoder.encode(sse), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      )
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global as any).fetch = fakeFetch

    const { POST } = await importRoute()
    const res = await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hello' }] })
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    const text = await res.text()
    expect(text).toContain('"type":"content"')
    expect(text).toContain('"type":"meta"')
    expect(text).toContain('Hi')
  })
})
