/**
 * GET /api/health — Application health check
 *
 * Returns minimal readiness information without exposing infrastructure details.
 * Used by load balancers, uptime monitors, and deployment health checks.
 *
 * Response:
 *   200 — application is healthy and ready to serve requests
 *   503 — application is not ready (missing critical configuration)
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
    env: getEnvironmentLabel(),
  }

  // Verify critical environment variables are set
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]

  const missing = requiredEnvVars.filter((v) => !process.env[v])

  if (missing.length > 0) {
    return NextResponse.json(
      {
        status: 'degraded',
        error: 'Missing required environment configuration',
        // Do NOT reveal which vars are missing in production
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    )
  }

  // Check provider availability
  const hasProviderKey = !!process.env.AVALAI_API_KEY
  const providerEnabled = hasProviderKey

  return NextResponse.json({
    ...checks,
    provider: providerEnabled ? 'available' : 'unavailable',
  }, { status: 200 })
}

function getEnvironmentLabel(): string {
  if (process.env.VERCEL_ENV === 'production') return 'production'
  if (process.env.VERCEL_ENV === 'preview') return 'preview'
  if (process.env.NODE_ENV === 'production') return 'production'
  return 'development'
}
