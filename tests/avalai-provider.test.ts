/**
 * AvalAI Provider Adapter — Comprehensive Tests
 *
 * Tests the real AvalAI provider adapter with mocked fetch.
 * Covers: initialization, request format, response validation,
 * error handling, timeout, network failure, input normalization,
 * token usage extraction, and security (no internal data leakage).
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'

// ─── Mock fetch ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetch = jest.fn<(...args: any[]) => any>()
global.fetch = mockFetch as unknown as typeof fetch

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockSuccessResponse(overrides?: Partial<{
  id: string
  object: string
  created: number
  model: string
  content: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  finish_reason: string
}>) {
  const defaults = {
    id: 'chatcmpl-abc123',
    object: 'chat.completion',
    created: 1700000000,
    model: 'gpt-4o-mini',
    content: 'Hello from AvalAI!',
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
    finish_reason: 'stop',
    ...overrides,
  }

  return {
    ok: true,
    status: 200,
    json: jest.fn(() => Promise.resolve({
      id: defaults.id,
      object: defaults.object,
      created: defaults.created,
      model: defaults.model,
      choices: [{
        message: { role: 'assistant', content: defaults.content },
        finish_reason: defaults.finish_reason,
        index: 0,
      }],
      usage: {
        prompt_tokens: defaults.prompt_tokens,
        completion_tokens: defaults.completion_tokens,
        total_tokens: defaults.total_tokens,
      },
    })),
    headers: {
      get: (name: string) => name === 'avalai-request-id' ? 'req-xyz-789' : null,
    },
  } as unknown as Response
}

function mockErrorResponse(status: number, message?: string) {
  return {
    ok: false,
    status,
    json: jest.fn(() => Promise.resolve(
      message ? { error: { message, type: 'invalid_request_error', code: status } } : {}
    )),
    headers: { get: () => null },
  } as unknown as Response
}

async function createProvider(apiKey = 'test-avalai-key') {
  process.env.AVALAI_API_KEY = apiKey
  process.env.AVALAI_BASE_URL = 'https://api.avalai.ir/v1'
  const { AvalAIProvider } = await import('@/lib/provider/avaliProvider')
  return new AvalAIProvider({
    id: 'avali',
    name: 'AvalAI',
    defaultModel: 'gpt-4o-mini',
    capabilities: ['generate', 'chat', 'stream'],
    enabled: true,
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('AvalAI Provider — Initialization', () => {
  const origKey = process.env.AVALAI_API_KEY
  const origUrl = process.env.AVALAI_BASE_URL

  afterEach(() => {
    if (origKey === undefined) delete process.env.AVALAI_API_KEY
    else process.env.AVALAI_API_KEY = origKey
    if (origUrl === undefined) delete process.env.AVALAI_BASE_URL
    else process.env.AVALAI_BASE_URL = origUrl
  })

  it('enabled when API key is present', async () => {
    process.env.AVALAI_API_KEY = 'test-key'
    const { createAvalAIProvider } = await import('@/lib/provider/avaliProvider')
    const provider = createAvalAIProvider()
    expect(provider.config.enabled).toBe(true)
    expect(provider.config.id).toBe('avali')
    expect(provider.config.defaultModel).toBe('gpt-4o-mini')
  })

  it('disabled when API key is missing', async () => {
    delete process.env.AVALAI_API_KEY
    const { createAvalAIProvider } = await import('@/lib/provider/avaliProvider')
    const provider = createAvalAIProvider()
    expect(provider.config.enabled).toBe(false)
  })

  it('disabled when API key is empty string', async () => {
    process.env.AVALAI_API_KEY = ''
    const { createAvalAIProvider } = await import('@/lib/provider/avaliProvider')
    const provider = createAvalAIProvider()
    expect(provider.config.enabled).toBe(false)
  })

  it('canHandle returns true for supported operations', async () => {
    process.env.AVALAI_API_KEY = 'test-key'
    const { createAvalAIProvider } = await import('@/lib/provider/avaliProvider')
    const provider = createAvalAIProvider()
    expect(provider.canHandle('chat')).toBe(true)
    expect(provider.canHandle('generate')).toBe(true)
    expect(provider.canHandle('stream')).toBe(true)
  })

  it('canHandle returns false for unsupported operations', async () => {
    process.env.AVALAI_API_KEY = 'test-key'
    const { createAvalAIProvider } = await import('@/lib/provider/avaliProvider')
    const provider = createAvalAIProvider()
    expect(provider.canHandle('generate-image')).toBe(false)
    expect(provider.canHandle('transcribe')).toBe(false)
    expect(provider.canHandle('embed')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SUCCESSFUL REQUESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('AvalAI Provider — Successful Requests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.AVALAI_API_KEY = 'test-avalai-key'
    process.env.AVALAI_BASE_URL = 'https://api.avalai.ir/v1'
  })

  it('sends correct Authorization header', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    await provider.execute({
      provider: 'avali',
      model: 'gpt-4o-mini',
      operation: 'chat',
      input: 'Hello',
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers.Authorization).toBe('Bearer test-avalai-key')
    expect(options.headers['Content-Type']).toBe('application/json')
  })

  it('sends correct request body with string input', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    await provider.execute({
      provider: 'avali',
      model: 'gpt-4o-mini',
      operation: 'chat',
      input: 'Hello!',
    })

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body.model).toBe('gpt-4o-mini')
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello!' }])
  })

  it('sends correct request body with array input', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    await provider.execute({
      provider: 'avali',
      model: 'gpt-4o-mini',
      operation: 'chat',
      input: [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hi' },
      ],
    })

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hi' },
    ])
  })

  it('forwards parameters (temperature, max_tokens, etc.)', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    await provider.execute({
      provider: 'avali',
      model: 'gpt-4o-mini',
      operation: 'chat',
      input: 'Hello',
      parameters: { temperature: 0.7, max_tokens: 100 },
    })

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body.temperature).toBe(0.7)
    expect(body.max_tokens).toBe(100)
  })

  it('returns correct ProviderResponse shape', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse({ content: 'Test response' }))
    const provider = await createProvider()

    const result = await provider.execute({
      provider: 'avali',
      model: 'gpt-4o-mini',
      operation: 'chat',
      input: 'Hello',
    })

    expect(result.provider).toBe('avali')
    expect(result.model).toBe('gpt-4o-mini')
    expect(result.operation).toBe('chat')
    expect(result.content).toBe('Test response')
    expect(result.id).toBe('chatcmpl-abc123')
    expect(result.created).toBe(1700000000)
  })

  it('extracts token usage from response', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse({
      prompt_tokens: 25,
      completion_tokens: 50,
      total_tokens: 75,
    }))
    const provider = await createProvider()

    const result = await provider.execute({
      provider: 'avali',
      model: 'gpt-4o-mini',
      operation: 'chat',
      input: 'Hello',
    })

    expect(result.metadata).toBeDefined()
    expect(result.metadata!.prompt_tokens).toBe(25)
    expect(result.metadata!.completion_tokens).toBe(50)
    expect(result.metadata!.total_tokens).toBe(75)
  })

  it('extracts avalai-request-id header', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    const result = await provider.execute({
      provider: 'avali',
      model: 'gpt-4o-mini',
      operation: 'chat',
      input: 'Hello',
    })

    expect(result.metadata!.avalai_request_id).toBe('req-xyz-789')
  })

  it('hits correct URL endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    await provider.execute({
      provider: 'avali',
      model: 'gpt-4o-mini',
      operation: 'chat',
      input: 'Hello',
    })

    const [url] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.avalai.ir/v1/chat/completions')
  })

  it('strips trailing slashes from base URL', async () => {
    process.env.AVALAI_BASE_URL = 'https://api.avalai.ir/v1///'
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    await provider.execute({
      provider: 'avali',
      model: 'gpt-4o-mini',
      operation: 'chat',
      input: 'Hello',
    })

    const [url] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.avalai.ir/v1/chat/completions')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. INPUT NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('AvalAI Provider — Input Normalization', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.AVALAI_API_KEY = 'test-key'
    process.env.AVALAI_BASE_URL = 'https://api.avalai.ir/v1'
  })

  it('converts string input to messages array', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    await provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hello',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }])
  })

  it('passes through valid messages array', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    const messages = [
      { role: 'system', content: 'Be helpful' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'Thanks' },
    ]
    await provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: messages,
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.messages).toEqual(messages)
  })

  it('extracts messages from object with messages key', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    await provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat',
      input: { messages: [{ role: 'user', content: 'Hi' }] },
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }])
  })

  it('stringifies non-object array items as user messages', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    await provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat',
      input: [42, true, 'hello'],
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.messages).toEqual([
      { role: 'user', content: '42' },
      { role: 'user', content: 'true' },
      { role: 'user', content: 'hello' },
    ])
  })

  it('wraps object input without messages key as JSON string', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    await provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat',
      input: { key: 'value' },
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.messages).toEqual([{ role: 'user', content: '{"key":"value"}' }])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

describe('AvalAI Provider — Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.AVALAI_API_KEY = 'test-key'
    process.env.AVALAI_BASE_URL = 'https://api.avalai.ir/v1'
  })

  it('throws authentication_error on 401', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(401, 'Invalid API key'))
    const provider = await createProvider()

    await expect(provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hi',
    })).rejects.toThrow(expect.objectContaining({
      type: 'authentication_error',
      message: expect.stringContaining('Invalid API key'),
    }))
  })

  it('throws authorization_error on 403', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(403, 'Access denied'))
    const provider = await createProvider()

    await expect(provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hi',
    })).rejects.toThrow(expect.objectContaining({
      type: 'authorization_error',
    }))
  })

  it('throws not_found on 404', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(404, 'Model not found'))
    const provider = await createProvider()

    await expect(provider.execute({
      provider: 'avali', model: 'nonexistent', operation: 'chat', input: 'Hi',
    })).rejects.toThrow(expect.objectContaining({
      type: 'not_found',
    }))
  })

  it('throws rate_limit_exceeded on 429', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(429, 'Rate limit exceeded'))
    const provider = await createProvider()

    await expect(provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hi',
    })).rejects.toThrow(expect.objectContaining({
      type: 'rate_limit_exceeded',
    }))
  })

  it('throws provider_unavailable on 500', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(500, 'Internal error'))
    const provider = await createProvider()

    await expect(provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hi',
    })).rejects.toThrow(expect.objectContaining({
      type: 'provider_unavailable',
    }))
  })

  it('throws invalid_request on 400', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(400, 'Bad request'))
    const provider = await createProvider()

    await expect(provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hi',
    })).rejects.toThrow(expect.objectContaining({
      type: 'invalid_request',
    }))
  })

  it('throws provider_unavailable on network error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))
    const provider = await createProvider()

    await expect(provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hi',
    })).rejects.toThrow(expect.objectContaining({
      type: 'provider_unavailable',
      message: expect.stringContaining('network error'),
    }))
  })

  it('throws invalid_response on invalid JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: jest.fn(() => Promise.reject(new SyntaxError('Unexpected token'))),
      headers: { get: () => null },
    } as unknown as Response)
    const provider = await createProvider()

    await expect(provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hi',
    })).rejects.toThrow(expect.objectContaining({
      type: 'invalid_response',
      message: expect.stringContaining('invalid JSON'),
    }))
  })

  it('throws invalid_response on empty choices array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: jest.fn(() => Promise.resolve({ choices: [] })),
      headers: { get: () => null },
    } as unknown as Response)
    const provider = await createProvider()

    await expect(provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hi',
    })).rejects.toThrow(expect.objectContaining({
      type: 'invalid_response',
      message: expect.stringContaining('no choices'),
    }))
  })

  it('throws invalid_response on missing choices field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: jest.fn(() => Promise.resolve({ id: '123' })),
      headers: { get: () => null },
    } as unknown as Response)
    const provider = await createProvider()

    await expect(provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hi',
    })).rejects.toThrow(expect.objectContaining({
      type: 'invalid_response',
      message: expect.stringContaining('no choices'),
    }))
  })

  it('throws invalid_response on null content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: jest.fn(() => Promise.resolve({
        choices: [{ message: { role: 'assistant', content: null } }],
      })),
      headers: { get: () => null },
    } as unknown as Response)
    const provider = await createProvider()

    await expect(provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hi',
    })).rejects.toThrow(expect.objectContaining({
      type: 'invalid_response',
      message: expect.stringContaining('no content'),
    }))
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. TOKEN ACCOUNTING
// ═══════════════════════════════════════════════════════════════════════════════

describe('AvalAI Provider — Token Accounting', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.AVALAI_API_KEY = 'test-key'
    process.env.AVALAI_BASE_URL = 'https://api.avalai.ir/v1'
  })

  it('extracts prompt_tokens and completion_tokens', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse({
      prompt_tokens: 100, completion_tokens: 200, total_tokens: 300,
    }))
    const provider = await createProvider()

    const result = await provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hi',
    })

    expect(result.metadata!.prompt_tokens).toBe(100)
    expect(result.metadata!.completion_tokens).toBe(200)
    expect(result.metadata!.total_tokens).toBe(300)
  })

  it('returns zero tokens when usage is missing from response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: jest.fn(() => Promise.resolve({
        choices: [{ message: { role: 'assistant', content: 'Hello' } }],
      })),
      headers: { get: () => null },
    } as unknown as Response)
    const provider = await createProvider()

    const result = await provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hi',
    })

    expect(result.metadata!.prompt_tokens).toBe(0)
    expect(result.metadata!.completion_tokens).toBe(0)
    expect(result.metadata!.total_tokens).toBe(0)
  })

  it('handles non-numeric token values gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: jest.fn(() => Promise.resolve({
        choices: [{ message: { role: 'assistant', content: 'Hello' } }],
        usage: { prompt_tokens: 'abc', completion_tokens: null, total_tokens: undefined },
      })),
      headers: { get: () => null },
    } as unknown as Response)
    const provider = await createProvider()

    const result = await provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hi',
    })

    expect(result.metadata!.prompt_tokens).toBe(0)
    expect(result.metadata!.completion_tokens).toBe(0)
    expect(result.metadata!.total_tokens).toBe(0)
  })

  it('computes total_tokens as sum when not provided by API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: jest.fn(() => Promise.resolve({
        choices: [{ message: { role: 'assistant', content: 'Hello' } }],
        usage: { prompt_tokens: 30, completion_tokens: 70 },
      })),
      headers: { get: () => null },
    } as unknown as Response)
    const provider = await createProvider()

    const result = await provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hi',
    })

    expect(result.metadata!.prompt_tokens).toBe(30)
    expect(result.metadata!.completion_tokens).toBe(70)
    expect(result.metadata!.total_tokens).toBe(100)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SECURITY — NO INTERNAL DATA LEAKAGE
// ═══════════════════════════════════════════════════════════════════════════════

describe('AvalAI Provider — Security', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.AVALAI_API_KEY = 'test-key'
    process.env.AVALAI_BASE_URL = 'https://api.avalai.ir/v1'
  })

  it('does not send userId in request body', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    await provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat',
      input: 'Hello', userId: 'user-123',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body).not.toHaveProperty('userId')
    expect(body).not.toHaveProperty('user_id')
  })

  it('does not send requestId in request body', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    await provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat',
      input: 'Hello', requestId: 'req-456',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body).not.toHaveProperty('requestId')
    expect(body).not.toHaveProperty('request_id')
  })

  it('does not send provider field in request body', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    await provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hello',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body).not.toHaveProperty('provider')
  })

  it('does not send operation field in request body', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    await provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hello',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body).not.toHaveProperty('operation')
  })

  it('does not send any internal keys or tokens', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    await provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat', input: 'Hello',
    })

    const headers = mockFetch.mock.calls[0][1].headers
    const headerKeys = Object.keys(headers)
    // Only Content-Type and Authorization should be present
    expect(headerKeys).toEqual(['Content-Type', 'Authorization'])

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    const bodyStr = JSON.stringify(body)
    expect(bodyStr).not.toContain('SUPABASE')
    expect(bodyStr).not.toContain('service_role')
    expect(bodyStr).not.toContain('az_')
  })

  it('only sends model, messages, and user parameters', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse())
    const provider = await createProvider()

    await provider.execute({
      provider: 'avali', model: 'gpt-4o-mini', operation: 'chat',
      input: 'Hello', parameters: { temperature: 0.5 },
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    const allowedKeys = ['model', 'messages', 'temperature']
    expect(Object.keys(body).sort()).toEqual(allowedKeys.sort())
  })
})
