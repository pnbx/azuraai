/**
 * Phase 4 Provider Gateway API Route
 *
 * Internal/gateway API route for provider operations.
 * NOT exposed as a public inference API yet — this is for architecture testing.
 *
 * Security:
 * - Only accessible to authenticated users
 * - Provider credentials remain server-side only
 * - No arbitrary URL construction from user input
 */
import { NextResponse } from 'next/server'

/**
 * Provider gateway route — DISABLED until Phase 4 is approved.
 *
 * This route is intentionally removed from the active middleware set.
 * Authentication and inference API implementation belong to the appropriate
 * later phase.
 */
export async function GET() {
  return NextResponse.json(
    { success: false, error: 'Phase 4 not approved' },
    { status: 501 }
  )
}