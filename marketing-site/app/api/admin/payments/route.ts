import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { supabaseAdmin } from '@/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20))
    const status = searchParams.get('status')
    const offset = (page - 1) * limit

    let query = supabaseAdmin
      .from('payment_intents')
      .select(
        'id, user_id, amount_toman, currency, provider, status, provider_payment_id, failure_reason, created_at, updated_at, succeeded_at, failed_at',
        { count: 'exact' }
      )

    if (status && ['created', 'pending', 'processing', 'succeeded', 'failed', 'cancelled'].includes(status)) {
      query = query.eq('status', status)
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)

    const { data: payments, count, error } = await query

    if (error) throw error

    return NextResponse.json({
      success: true,
      payments: (payments ?? []).map((p) => ({
        id: p.id,
        userId: p.user_id,
        amountToman: p.amount_toman,
        currency: p.currency,
        provider: p.provider,
        status: p.status,
        providerPaymentId: p.provider_payment_id,
        failureReason: p.failure_reason,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        succeededAt: p.succeeded_at,
        failedAt: p.failed_at,
      })),
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Unauthenticated') {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }
    console.error('[Admin Payments] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
