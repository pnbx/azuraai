import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    let user
    try {
      user = await getServerUser()
    } catch {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const days = Math.min(parseInt(searchParams.get('days') || '30', 10), 90)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const supa = await createSupabaseServerClient()

    // Fetch usage logs
    const { data: logs, error: logsError } = await supa
      .from('usage_logs')
      .select('id, upstream_model_id, azura_model_id, input_tokens, output_tokens, cached_tokens, upstream_cost_cents, markup_cents, azura_customer_charge_cents, status, response_ms, created_at')
      .eq('user_id', user.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)

    if (logsError) {
      throw new Error('Failed to fetch usage logs')
    }

    // Aggregate stats
    const totalRequests = logs.length
    const totalInputTokens = logs.reduce((sum, l) => sum + (l.input_tokens || 0), 0)
    const totalOutputTokens = logs.reduce((sum, l) => sum + (l.output_tokens || 0), 0)
    const totalTokens = totalInputTokens + totalOutputTokens
    const totalCost = logs.reduce((sum, l) => sum + (l.azura_customer_charge_cents || 0), 0)
    const errorCount = logs.filter((l) => l.status !== 'success').length
    const avgLatency = totalRequests > 0
      ? Math.round(logs.reduce((sum, l) => sum + (l.response_ms || 0), 0) / totalRequests)
      : 0

    // Daily aggregation for chart
    const dailyMap = new Map<string, { requests: number; tokens: number; cost: number }>()
    for (const log of logs) {
      const day = log.created_at.slice(0, 10)
      const existing = dailyMap.get(day) || { requests: 0, tokens: 0, cost: 0 }
      existing.requests++
      existing.tokens += (log.input_tokens || 0) + (log.output_tokens || 0)
      existing.cost += log.azura_customer_charge_cents || 0
      dailyMap.set(day, existing)
    }

    const daily = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }))

    // Model breakdown
    const modelMap = new Map<string, { requests: number; tokens: number; cost: number }>()
    for (const log of logs) {
      const model = log.azura_model_id || log.upstream_model_id || 'unknown'
      const existing = modelMap.get(model) || { requests: 0, tokens: 0, cost: 0 }
      existing.requests++
      existing.tokens += (log.input_tokens || 0) + (log.output_tokens || 0)
      existing.cost += log.azura_customer_charge_cents || 0
      modelMap.set(model, existing)
    }

    const byModel = Array.from(modelMap.entries())
      .sort(([, a], [, b]) => b.requests - a.requests)
      .map(([model, data]) => ({ model, ...data }))

    return NextResponse.json({
      success: true,
      stats: {
        totalRequests,
        totalInputTokens,
        totalOutputTokens,
        totalTokens,
        totalCost,
        errorCount,
        avgLatency,
      },
      daily,
      byModel,
    })
  } catch (error) {
    console.error('[Usage API] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
