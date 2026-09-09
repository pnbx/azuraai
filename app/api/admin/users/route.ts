import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { supabaseAdmin } from '@/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20))
    const search = searchParams.get('search')?.trim() ?? ''
    const offset = (page - 1) * limit

    let query = supabaseAdmin
      .from('users')
      .select('id, email, full_name, is_active, role, created_at, updated_at', { count: 'exact' })

    if (search) {
      query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`)
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)

    const { data: users, count, error } = await query

    if (error) throw error

    const userIds = (users ?? []).map((u) => u.id)

    const balances: Record<string, number> = {}
    if (userIds.length > 0) {
      const { data: balanceRows } = await supabaseAdmin
        .from('balances')
        .select('user_id, balance_cents')
        .in('user_id', userIds)

      if (balanceRows) {
        for (const b of balanceRows) {
          balances[b.user_id] = b.balance_cents ?? 0
        }
      }
    }

    return NextResponse.json({
      success: true,
      users: (users ?? []).map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        isActive: u.is_active,
        role: u.role,
        balance: balances[u.id] ?? 0,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
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
    console.error('[Admin Users] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
