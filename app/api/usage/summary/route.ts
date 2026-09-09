/**
 * Usage Summary API
 *
 * GET /api/usage/summary — returns the calling user's usage summary
 * (total tokens, total cost, by-model breakdown, recent requests).
 *
 * Query params:
 *   days — lookback window (default 30, max 90)
 *
 * Auth: API key or session
 */

import { NextResponse } from 'next/server'
import { requireServerUser } from '@/lib/auth/server'
import { supabaseAdmin } from '@/supabase/admin'
import { authenticateApiKey } from '@/lib/security/auth'

export async function GET(request: Request): Promise<NextResponse> {
  // Authenticate
  const authHeader = request.headers.get('Authorization')
  const apiKeyAuth = await authenticateApiKey(authHeader)

  let userId: string
  if (apiKeyAuth) {
    userId = apiKeyAuth.userId
  } else {
    try {
      const user = await requireServerUser()
      userId = user.id
    } catch {
      return NextResponse.json(
        { success: false, error: 'Unauthenticated' },
        { status: 401 },
      )
    }
  }

  const url = new URL(request.url)
  const daysParam = parseInt(url.searchParams.get('days') ?? '30', 10)
  const days = Math.min(Math.max(isNaN(daysParam) ? 30 : daysParam, 1), 90)

  const since = new Date()
  since.setDate(since.getDate() - days)

  // Aggregate totals
  const { data: aggregates, error: aggError } = await supabaseAdmin
    .from('usage_logs')
    .select('input_tokens, output_tokens, azura_customer_charge_cents, status')
    .eq('user_id', userId)
    .gte('request_ts', since.toISOString())

  if (aggError) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch usage' },
      { status: 500 },
    )
  }

  const rows = aggregates ?? []
  const totalRequests = rows.length
  const totalInputTokens = rows.reduce((s, r) => s + Number(r.input_tokens), 0)
  const totalOutputTokens = rows.reduce((s, r) => s + Number(r.output_tokens), 0)
  const totalTokens = totalInputTokens + totalOutputTokens
  const totalCost = rows.reduce((s, r) => s + Number(r.azura_customer_charge_cents), 0)
  const errorCount = rows.filter((r) => r.status !== 'succeeded').length

  // By-model breakdown
  const { data: byModelRows } = await supabaseAdmin
    .from('usage_logs')
    .select('azura_model_id, input_tokens, output_tokens, azura_customer_charge_cents')
    .eq('user_id', userId)
    .gte('request_ts', since.toISOString())

  const modelMap = new Map<string, { requests: number; tokens: number; cost: number }>()
  for (const row of byModelRows ?? []) {
    const key = row.azura_model_id
    const existing = modelMap.get(key) ?? { requests: 0, tokens: 0, cost: 0 }
    existing.requests++
    existing.tokens += Number(row.input_tokens) + Number(row.output_tokens)
    existing.cost += Number(row.azura_customer_charge_cents)
    modelMap.set(key, existing)
  }

  const byModel = [...modelMap.entries()]
    .map(([model, stats]) => ({ model, ...stats }))
    .sort((a, b) => b.cost - a.cost)

  // Recent requests
  const { data: recentRows } = await supabaseAdmin
    .from('usage_logs')
    .select('id, request_id, azura_model_id, input_tokens, output_tokens, azura_customer_charge_cents, status, request_ts, response_ms')
    .eq('user_id', userId)
    .gte('request_ts', since.toISOString())
    .order('request_ts', { ascending: false })
    .limit(20)

  const recent = (recentRows ?? []).map((r) => ({
    id: r.id,
    requestId: r.request_id,
    model: r.azura_model_id,
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    cost: Number(r.azura_customer_charge_cents),
    status: r.status,
    requestTs: r.request_ts,
    responseMs: r.response_ms,
  }))

  return NextResponse.json({
    success: true,
    summary: {
      days,
      totalRequests,
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      totalCost,
      errorCount,
      byModel,
      recent,
    },
  })
}
