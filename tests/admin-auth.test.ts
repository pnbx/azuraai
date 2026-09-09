/**
 * Admin Authorization & API Security Tests
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
  const methods = ['select', 'eq', 'single', 'order', 'range', 'in', 'ilike', 'or', 'update']
  for (const m of methods) {
    chain[m] = jest.fn(() => chain)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain.then = jest.fn((resolve: any) => resolve(resolveWith)) as any
  return chain
}

const ADMIN_USER = { id: 'admin-0001', email: 'admin@test.com' }
const REGULAR_USER = { id: 'user-0001', email: 'user@test.com' }

// ─── requireAdmin Tests ──────────────────────────────────────────────────────

describe('requireAdmin', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('rejects unauthenticated user', async () => {
    mockGetUser.mockRejectedValueOnce(new Error('Unauthenticated'))

    const { requireAdmin } = await import('@/lib/auth/admin')
    await expect(requireAdmin()).rejects.toThrow('Unauthenticated')
  })

  it('rejects non-admin user', async () => {
    mockGetUser.mockResolvedValueOnce(REGULAR_USER)
    mockFrom.mockReturnValueOnce(createQueryChain({ data: { role: 'user' }, error: null }))

    const { requireAdmin } = await import('@/lib/auth/admin')
    await expect(requireAdmin()).rejects.toThrow('Forbidden')
  })

  it('accepts admin user', async () => {
    mockGetUser.mockResolvedValueOnce(ADMIN_USER)
    mockFrom.mockReturnValueOnce(createQueryChain({ data: { role: 'admin' }, error: null }))

    const { requireAdmin } = await import('@/lib/auth/admin')
    const user = await requireAdmin()
    expect(user.id).toBe(ADMIN_USER.id)
  })
})

// ─── isAdmin Tests ───────────────────────────────────────────────────────────

describe('isAdmin', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('returns true for admin users', async () => {
    mockFrom.mockReturnValueOnce(createQueryChain({ data: { role: 'admin' }, error: null }))

    const { isAdmin } = await import('@/lib/auth/admin')
    const result = await isAdmin('admin-0001')
    expect(result).toBe(true)
  })

  it('returns false for regular users', async () => {
    mockFrom.mockReturnValueOnce(createQueryChain({ data: { role: 'user' }, error: null }))

    const { isAdmin } = await import('@/lib/auth/admin')
    const result = await isAdmin('user-0001')
    expect(result).toBe(false)
  })

  it('returns false on database error', async () => {
    mockFrom.mockReturnValueOnce(createQueryChain({ data: null, error: { message: 'db error' } }))

    const { isAdmin } = await import('@/lib/auth/admin')
    const result = await isAdmin('user-0001')
    expect(result).toBe(false)
  })
})

// ─── Admin API Route Security ────────────────────────────────────────────────

describe('Admin API routes', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  describe('GET /api/admin/overview', () => {
    it('returns 401 for unauthenticated request', async () => {
      mockGetUser.mockRejectedValueOnce(new Error('Unauthenticated'))

      const { GET } = await import('@/app/api/admin/overview/route')
      const res = await GET()
      const body = await res.json()

      expect(res.status).toBe(401)
      expect(body.success).toBe(false)
    })

    it('returns 403 for non-admin user', async () => {
      mockGetUser.mockResolvedValueOnce(REGULAR_USER)
      mockFrom.mockReturnValueOnce(createQueryChain({ data: { role: 'user' }, error: null }))

      const { GET } = await import('@/app/api/admin/overview/route')
      const res = await GET()
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.success).toBe(false)
    })
  })

  describe('GET /api/admin/users', () => {
    it('returns 401 for unauthenticated request', async () => {
      mockGetUser.mockRejectedValueOnce(new Error('Unauthenticated'))

      const { GET } = await import('@/app/api/admin/users/route')
      const url = new URL('http://localhost/api/admin/users')
      const req = new Request(url)
      const res = await GET(req as never)
      const body = await res.json()

      expect(res.status).toBe(401)
      expect(body.success).toBe(false)
    })

    it('returns 403 for non-admin user', async () => {
      mockGetUser.mockResolvedValueOnce(REGULAR_USER)
      mockFrom.mockReturnValueOnce(createQueryChain({ data: { role: 'user' }, error: null }))

      const { GET } = await import('@/app/api/admin/users/route')
      const url = new URL('http://localhost/api/admin/users')
      const req = new Request(url)
      const res = await GET(req as never)
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.success).toBe(false)
    })
  })

  describe('GET /api/admin/users/[id]', () => {
    it('returns 400 for invalid UUID', async () => {
      mockGetUser.mockResolvedValueOnce(ADMIN_USER)
      mockFrom.mockReturnValueOnce(createQueryChain({ data: { role: 'admin' }, error: null }))

      const { GET } = await import('@/app/api/admin/users/[id]/route')
      const res = await GET({} as never, { params: Promise.resolve({ id: 'not-a-uuid' }) })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toMatch(/Invalid/)
    })

    it('returns 404 for non-existent user', async () => {
      mockGetUser.mockResolvedValueOnce(ADMIN_USER)
      mockFrom.mockReturnValueOnce(createQueryChain({ data: { role: 'admin' }, error: null }))
      mockFrom.mockReturnValueOnce(createQueryChain({ data: null, error: { message: 'not found' } }))

      const { GET } = await import('@/app/api/admin/users/[id]/route')
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await GET({} as never, { params: Promise.resolve({ id: fakeId }) })
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.success).toBe(false)
    })
  })

  describe('PATCH /api/admin/models', () => {
    it('returns 401 for unauthenticated request', async () => {
      mockGetUser.mockRejectedValueOnce(new Error('Unauthenticated'))

      const { PATCH } = await import('@/app/api/admin/models/route')
      const req = new Request('http://localhost/api/admin/models', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: 'test', enabled: false }),
      })
      const res = await PATCH(req as never)
      const body = await res.json()

      expect(res.status).toBe(401)
      expect(body.success).toBe(false)
    })

    it('returns 400 for invalid model ID', async () => {
      mockGetUser.mockResolvedValueOnce(ADMIN_USER)
      mockFrom.mockReturnValueOnce(createQueryChain({ data: { role: 'admin' }, error: null }))

      const { PATCH } = await import('@/app/api/admin/models/route')
      const req = new Request('http://localhost/api/admin/models', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: 'not-a-uuid', enabled: false }),
      })
      const res = await PATCH(req as never)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toMatch(/Invalid/)
    })

    it('returns 400 when no valid fields provided', async () => {
      mockGetUser.mockResolvedValueOnce(ADMIN_USER)
      mockFrom.mockReturnValueOnce(createQueryChain({ data: { role: 'admin' }, error: null }))

      const { PATCH } = await import('@/app/api/admin/models/route')
      const req = new Request('http://localhost/api/admin/models', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: '00000000-0000-0000-0000-000000000000' }),
      })
      const res = await PATCH(req as never)
      const body = await res.json()

      expect(res.status).toBe(400)
    })
  })

  describe('PATCH /api/admin/providers', () => {
    it('returns 400 for non-UUID provider ID', async () => {
      mockGetUser.mockResolvedValueOnce(ADMIN_USER)
      mockFrom.mockReturnValueOnce(createQueryChain({ data: { role: 'admin' }, error: null }))

      const { PATCH } = await import('@/app/api/admin/providers/route')
      const req = new Request('http://localhost/api/admin/providers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'not-uuid', metadata: {} }),
      })
      const res = await PATCH(req as never)
      expect(res.status).toBe(400)
    })
  })
})

// ─── Financial Safety ────────────────────────────────────────────────────────

describe('Wallet adjustment', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('rejects non-positive amounts', async () => {
    mockGetUser.mockResolvedValueOnce(ADMIN_USER)
    mockFrom.mockReturnValueOnce(createQueryChain({ data: { role: 'admin' }, error: null }))
    mockFrom.mockReturnValueOnce(createQueryChain({ data: { id: 'w1', user_id: 'u1' }, error: null }))

    const { POST } = await import('@/app/api/admin/wallets/[id]/route')
    const req = new Request('http://localhost/api/admin/wallets/w1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'credit', amount: -100, reason: 'test adjustment' }),
    })
    const res = await POST(req as never, {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }),
    })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/positive integer/)
  })

  it('rejects missing reason', async () => {
    mockGetUser.mockResolvedValueOnce(ADMIN_USER)
    mockFrom.mockReturnValueOnce(createQueryChain({ data: { role: 'admin' }, error: null }))
    mockFrom.mockReturnValueOnce(createQueryChain({ data: { id: 'w1', user_id: 'u1' }, error: null }))

    const { POST } = await import('@/app/api/admin/wallets/[id]/route')
    const req = new Request('http://localhost/api/admin/wallets/w1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'credit', amount: 1000, reason: '' }),
    })
    const res = await POST(req as never, {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }),
    })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/reason/)
  })

  it('rejects invalid action type', async () => {
    mockGetUser.mockResolvedValueOnce(ADMIN_USER)
    mockFrom.mockReturnValueOnce(createQueryChain({ data: { role: 'admin' }, error: null }))
    mockFrom.mockReturnValueOnce(createQueryChain({ data: { id: 'w1', user_id: 'u1' }, error: null }))

    const { POST } = await import('@/app/api/admin/wallets/[id]/route')
    const req = new Request('http://localhost/api/admin/wallets/w1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_balance', amount: 1000, reason: 'test' }),
    })
    const res = await POST(req as never, {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }),
    })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/credit.*debit/i)
  })
})

// ─── Input Validation ────────────────────────────────────────────────────────

describe('Input validation', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('rejects invalid page parameter gracefully', async () => {
    mockGetUser.mockResolvedValueOnce(ADMIN_USER)
    mockFrom.mockReturnValueOnce(createQueryChain({ data: { role: 'admin' }, error: null }))
    mockFrom.mockReturnValueOnce(createQueryChain({ data: [], count: 0, error: null }))

    const { GET } = await import('@/app/api/admin/users/route')
    const url = new URL('http://localhost/api/admin/users?page=-5&limit=999')
    const req = new Request(url)
    const res = await GET(req as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
  })
})

// ─── Audit Logging ───────────────────────────────────────────────────────────

describe('Audit logging', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('logAuditEvent calls rpc with correct params', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null })

    const { logAuditEvent } = await import('@/lib/auth/admin')
    await logAuditEvent({
      actorId: 'admin-0001',
      action: 'admin.model.update',
      targetType: 'model',
      targetId: 'model-0001',
      result: 'success',
      metadata: { enabled: false },
    })

    expect(mockRpc).toHaveBeenCalledWith('log_audit_event', {
      p_actor_id: 'admin-0001',
      p_action: 'admin.model.update',
      p_target_type: 'model',
      p_target_id: 'model-0001',
      p_result: 'success',
      p_metadata: { enabled: false },
    })
  })

  it('logAuditEvent defaults to success result', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null })

    const { logAuditEvent } = await import('@/lib/auth/admin')
    await logAuditEvent({
      actorId: 'admin-0001',
      action: 'admin.overview.view',
      targetType: 'system',
    })

    expect(mockRpc).toHaveBeenCalledWith(
      'log_audit_event',
      expect.objectContaining({
        p_result: 'success',
        p_metadata: {},
      })
    )
  })
})
