import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { supabaseAdmin } from '@/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50))
    const action = searchParams.get('action')
    const targetType = searchParams.get('targetType')
    const offset = (page - 1) * limit

    let query = supabaseAdmin
      .from('audit_log')
      .select('id, actor_id, action, target_type, target_id, result, metadata, created_at', {
        count: 'exact',
      })

    if (action) {
      query = query.ilike('action', `%${action}%`)
    }
    if (targetType) {
      query = query.eq('target_type', targetType)
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)

    const { data: logs, count, error } = await query

    if (error) throw error

    const actorIds = [...new Set((logs ?? []).map((l) => l.actor_id))]
    const actorEmails: Record<string, string> = {}

    if (actorIds.length > 0) {
      const { data: actors } = await supabaseAdmin
        .from('users')
        .select('id, email')
        .in('id', actorIds)

      if (actors) {
        for (const a of actors) {
          actorEmails[a.id] = a.email
        }
      }
    }

    return NextResponse.json({
      success: true,
      logs: (logs ?? []).map((l) => ({
        id: l.id,
        actorId: l.actor_id,
        actorEmail: actorEmails[l.actor_id] ?? 'Unknown',
        action: l.action,
        targetType: l.target_type,
        targetId: l.target_id,
        result: l.result,
        metadata: l.metadata,
        createdAt: l.created_at,
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
    console.error('[Admin Audit] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
