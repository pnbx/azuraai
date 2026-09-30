/**
 * Middleware resilience — Supabase outage must not hang requests.
 *
 * Regression tests for the 504 MIDDLEWARE_INVOCATION_TIMEOUT incident:
 * when the Supabase project is paused/unreachable, middleware used to await
 * the session refresh forever until the platform killed the request. It must
 * now race a hard timeout and degrade to "no session".
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// ─── Mock setup ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSessionResult = jest.fn<() => Promise<any>>()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: { getSession: () => getSessionResult() },
    }),
}))

// Minimal NextRequest stand-in: middleware only reads nextUrl and headers.
function makeRequest(pathname: string): NextRequest {
  const url = `https://azuraai.ir${pathname}`
  return {
    nextUrl: new URL(url),
    url,
    headers: new Headers({ 'x-vercel-id': 'test::req' }),
  } as unknown as NextRequest
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('middleware resilience against unreachable Supabase', () => {
  it('redirects protected pages to login instead of hanging when Supabase never responds', async () => {
    // Simulates a paused Supabase project: the promise never settles.
    getSessionResult.mockReturnValue(new Promise(() => {}))

    const { middleware } = await import('@/middleware')

    const responsePromise = middleware(makeRequest('/dashboard'))

    // Advance past the 8s timeout without awaiting the hung Supabase call.
    await jest.advanceTimersByTimeAsync(8_000)
    const res = (await responsePromise) as NextResponse

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/auth/login')
  })

  it('lets public pages through (with stale cookies cleared) when Supabase never responds', async () => {
    getSessionResult.mockReturnValue(new Promise(() => {}))

    const { middleware } = await import('@/middleware')

    const responsePromise = middleware(makeRequest('/'))
    await jest.advanceTimersByTimeAsync(8_000)
    const res = (await responsePromise) as NextResponse

    expect(res.status).toBe(200)
    const accessCookie = res.cookies.get('sb-access-token')
    expect(accessCookie?.value).toBe('')
    expect(accessCookie?.maxAge).toBe(0)
  })

  it('does not wait longer than the 8s budget', async () => {
    getSessionResult.mockReturnValue(new Promise(() => {}))

    const { middleware } = await import('@/middleware')

    let settled = false
    const responsePromise = middleware(makeRequest('/api/wallet')).then((r) => {
      settled = true
      return r
    })

    await jest.advanceTimersByTimeAsync(7_000)
    expect(settled).toBe(false)

    await jest.advanceTimersByTimeAsync(1_500)
    const res = (await responsePromise) as NextResponse
    expect(settled).toBe(true)
    expect(res.status).toBe(307)
  })

  it('still authenticates normally when Supabase responds in time', async () => {
    getSessionResult.mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    })

    const { middleware } = await import('@/middleware')

    const res = (await middleware(makeRequest('/dashboard'))) as NextResponse
    // Authenticated user on /dashboard passes straight through.
    expect(res.status).toBe(200)
  })

  it('redirects authenticated users away from auth routes as before', async () => {
    getSessionResult.mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    })

    const { middleware } = await import('@/middleware')

    const res = (await middleware(
      makeRequest('/auth/login')
    )) as NextResponse
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/dashboard')
  })
})
