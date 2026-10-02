import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { supabaseAdmin } from '@/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20))
    const offset = (page - 1) * limit

    const { data: balances, count, error } = await supabaseAdmin
      .from('balances')
      .select('id, user_id, balance_cents, currency, updated_at', { count: 'exact' })
      .order('balance_cents', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    const userIds = (balances ?? []).map((b) => b.user_id)
    const userEmails: Record<string, string> = {}

    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, email')
        .in('id', userIds)

      if (users) {
        for (const u of users) {
          userEmails[u.id] = u.email
        }
      }
    }

    return NextResponse.json({
      success: true,
      wallets: (balances ?? []).map((b) => ({
        id: b.id,
        userId: b.user_id,
        email: userEmails[b.user_id] ?? 'Unknown',
        balance: b.balance_cents,
        currency: b.currency,
        updatedAt: b.updated_at,
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
    console.error('[Admin Wallets] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
