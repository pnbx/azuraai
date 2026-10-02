import { NextResponse } from 'next/server'
import { requireAdmin, logAuditEvent } from '@/lib/auth/admin'
import { supabaseAdmin } from '@/supabase/admin'

export async function GET() {
  try {
    const user = await requireAdmin()

    const [usersResult, balancesResult, paymentsResult, usageResult, modelsResult, providersResult] =
      await Promise.all([
        supabaseAdmin.from('users').select('id', { count: 'exact', head: true }),
        supabaseAdmin.from('balances').select('balance_cents'),
        supabaseAdmin
          .from('payment_intents')
          .select('status, amount_toman')
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        supabaseAdmin
          .from('usage_logs')
          .select('input_tokens, output_tokens, azura_customer_charge_cents, status')
          .gte('request_ts', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        supabaseAdmin.from('model_catalog').select('id, enabled, status'),
        supabaseAdmin.from('providers').select('id, name'),
      ])

    const totalUsers = usersResult.count ?? 0

    const totalBalance = (balancesResult.data ?? []).reduce(
      (sum, b) => sum + (b.balance_cents ?? 0),
      0
    )

    const payments = paymentsResult.data ?? []
    const successfulPayments = payments.filter((p) => p.status === 'succeeded')
    const failedPayments = payments.filter((p) => p.status === 'failed')
    const paymentVolume = successfulPayments.reduce((sum, p) => sum + (p.amount_toman ?? 0), 0)

    const usage = usageResult.data ?? []
    const totalRequests = usage.length
    const totalTokens = usage.reduce(
      (sum, u) => sum + (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
      0
    )
    const totalCost = usage.reduce((sum, u) => sum + (u.azura_customer_charge_cents ?? 0), 0)
    const errorCount = usage.filter((u) => u.status !== 'succeeded').length

    const models = modelsResult.data ?? []
    const activeModels = models.filter((m) => m.enabled && m.status === 'active').length

    const providers = providersResult.data ?? []

    await logAuditEvent({
      actorId: user.id,
      action: 'admin.overview.view',
      targetType: 'system',
    })

    return NextResponse.json({
      success: true,
      overview: {
        users: { total: totalUsers },
        wallet: { totalBalance },
        payments: {
          total: payments.length,
          successful: successfulPayments.length,
          failed: failedPayments.length,
          volume30d: paymentVolume,
        },
        usage: {
          requests30d: totalRequests,
          tokens30d: totalTokens,
          cost30d: totalCost,
          errors30d: errorCount,
        },
        models: { total: models.length, active: activeModels },
        providers: { total: providers.length },
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Unauthenticated') {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }
    console.error('[Admin Overview] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
