import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { supabaseAdmin } from '@/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const { searchParams } = new URL(request.url)
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get('days') ?? '30', 10) || 30))
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const { data: logs, error } = await supabaseAdmin
      .from('usage_logs')
      .select('user_id, azura_model_id, provider, input_tokens, output_tokens, azura_customer_charge_cents, status, request_ts')

    if (error) throw error

    const recent = (logs ?? []).filter((l) => l.request_ts >= since)

    const totalRequests = recent.length
    const totalInputTokens = recent.reduce((s, l) => s + (l.input_tokens ?? 0), 0)
    const totalOutputTokens = recent.reduce((s, l) => s + (l.output_tokens ?? 0), 0)
    const totalTokens = totalInputTokens + totalOutputTokens
    const totalCost = recent.reduce((s, l) => s + (l.azura_customer_charge_cents ?? 0), 0)
    const errorCount = recent.filter((l) => l.status !== 'succeeded').length

    const byModel: Record<string, { requests: number; tokens: number; cost: number }> = {}
    for (const l of recent) {
      const key = l.azura_model_id
      if (!byModel[key]) byModel[key] = { requests: 0, tokens: 0, cost: 0 }
      byModel[key].requests++
      byModel[key].tokens += (l.input_tokens ?? 0) + (l.output_tokens ?? 0)
      byModel[key].cost += l.azura_customer_charge_cents ?? 0
    }

    const byUser: Record<string, { requests: number; tokens: number; cost: number }> = {}
    for (const l of recent) {
      const key = l.user_id
      if (!byUser[key]) byUser[key] = { requests: 0, tokens: 0, cost: 0 }
      byUser[key].requests++
      byUser[key].tokens += (l.input_tokens ?? 0) + (l.output_tokens ?? 0)
      byUser[key].cost += l.azura_customer_charge_cents ?? 0
    }

    const byDay: Record<string, { requests: number; tokens: number; cost: number }> = {}
    for (const l of recent) {
      const day = l.request_ts.slice(0, 10)
      if (!byDay[day]) byDay[day] = { requests: 0, tokens: 0, cost: 0 }
      byDay[day].requests++
      byDay[day].tokens += (l.input_tokens ?? 0) + (l.output_tokens ?? 0)
      byDay[day].cost += l.azura_customer_charge_cents ?? 0
    }

    return NextResponse.json({
      success: true,
      usage: {
        days,
        totalRequests,
        totalInputTokens,
        totalOutputTokens,
        totalTokens,
        totalCost,
        errorCount,
        byModel: Object.entries(byModel)
          .map(([model, data]) => ({ model, ...data }))
          .sort((a, b) => b.requests - a.requests),
        byUser: Object.entries(byUser)
          .map(([userId, data]) => ({ userId, ...data }))
          .sort((a, b) => b.requests - a.requests)
          .slice(0, 50),
        byDay: Object.entries(byDay)
          .map(([date, data]) => ({ date, ...data }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Unauthenticated') {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }
    console.error('[Admin Usage] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
